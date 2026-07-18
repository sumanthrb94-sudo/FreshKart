"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  X,
  Minus,
  Plus,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { api, ApiError, backendKind } from "@/lib/api";
import { useAsync, useRequireAuth } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import { RETURN_REASON_LABELS } from "@/lib/returns";
import type { ReturnReason, ReturnImage } from "@/lib/returns";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase/client";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "@/components/buyer/BuyerHeader";
import { BuyerBottomNav } from "@/components/buyer/BuyerBottomNav";
import { BuyerSidebar } from "@/components/layout/BuyerSidebar";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { notifyReturnRequested } from "@/lib/in-app-notifications";

const MAX_PHOTOS = 4;
const MAX_INPUT_SIZE = 15 * 1024 * 1024; // reject absurd files before decoding
const MAX_DIMENSION = 1280; // longest edge after downscale
const JPEG_QUALITY = 0.8;

/** Downscale + re-encode a photo so it's cheap to store and fast to load.
 *  Phone camera shots are 5–10 MB; the admin only needs enough to judge
 *  produce damage. Falls back to the original file when the browser can't
 *  decode it (e.g. exotic formats) — Storage rules still cap size at 5 MB. */
async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
        "image/jpeg",
        JPEG_QUALITY
      )
    );
  } catch {
    if (file.size >= 5 * 1024 * 1024) {
      throw new ApiError("Could not process this image. Please use a photo under 5 MB.");
    }
    return file;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}

/** Persist a return photo somewhere the ADMIN can actually load it from:
 *  Firebase Storage in production (a real https download URL), a data URL in
 *  demo mode. Never a blob: object URL — those are pointers into this tab's
 *  memory and die the moment anyone else (or a reload) tries to view them. */
async function persistReturnPhoto(file: File, buyerId: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ApiError("Please select an image file.");
  }
  if (file.size > MAX_INPUT_SIZE) {
    throw new ApiError("Image is too large. Please use a photo under 15 MB.");
  }
  const blob = await compressPhoto(file);
  if (backendKind === "firebase") {
    const path = `returns/${buyerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const storageRef = ref(getFirebaseStorage(), path);
    await uploadBytes(storageRef, blob, { contentType: blob.type || "image/jpeg" });
    return getDownloadURL(storageRef);
  }
  return blobToDataUrl(blob);
}

export function ReturnRequestScreen({ orderId }: { orderId: string }) {
  const { ready, user } = useRequireAuth({ callbackUrl: `/orders/${orderId}/return` });
  const router = useRouter();
  const { data: order, loading } = useAsync(() => api.getOrder(orderId), [orderId]);
  const { data: returns } = useAsync(() => api.listReturns(user?.id), [user?.id]);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason>("OTHER");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<ReturnImage[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [returnId, setReturnId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // STRICT VALIDATION: return qty cannot exceed ordered qty
  const handleQtyChange = (productId: string, delta: number, maxQty: number) => {
    setReturnQty((prev) => {
      const current = prev[productId] || 0;
      const next = current + delta;
      if (next < 0) return prev; // Can't go below 0
      if (next > maxQty) {
        toast.warning("Maximum quantity reached", `You ordered ${maxQty} ${order?.items.find(i => i.productId === productId)?.unit || "kg"}. Cannot return more than ordered.`);
        return { ...prev, [productId]: maxQty };
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Snapshot before resetting the input — e.target.files is a LIVE FileList
    // that empties the moment value is cleared.
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !user) return;
    const room = MAX_PHOTOS - images.length;
    if (room <= 0) {
      toast.warning("Photo limit reached", `You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const batch = files.slice(0, room);
    setUploadingCount((c) => c + batch.length);
    for (const file of batch) {
      try {
        const url = await persistReturnPhoto(file, user.id);
        setImages((prev) => [
          ...prev,
          {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url,
            filename: file.name,
            uploadedAt: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not upload photo.";
        toast.error("Photo upload failed", message);
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const totalRefund = order?.items.reduce((sum, item) => {
    const qty = returnQty[item.productId] || 0;
    return sum + qty * item.price;
  }, 0) || 0;

  const hasAnyReturn = Object.values(returnQty).some((q) => q > 0);

  // Validate all return quantities against ordered quantities before submit
  const validateQuantities = useCallback((): boolean => {
    if (!order) return false;
    for (const item of order.items) {
      const rq = returnQty[item.productId] || 0;
      if (rq > item.qty) {
        toast.error("Invalid quantity", `Cannot return ${rq} ${item.unit} of ${item.name}. You only ordered ${item.qty} ${item.unit}.`);
        return false;
      }
    }
    return true;
  }, [order, returnQty]);

  const handleSubmit = useCallback(async () => {
    if (!order || !hasAnyReturn) return;

    // STRICT: Validate return qty <= ordered qty
    if (!validateQuantities()) return;

    setSubmitting(true);
    try {
      const returnItems = order.items
        .map((item) => ({
          productId: item.productId,
          productName: item.name,
          originalQty: item.qty,
          returnQty: Math.min(returnQty[item.productId] || 0, item.qty), // Clamp to ordered qty
          unitPrice: item.price,
          unit: item.unit,
        }))
        .filter((item) => item.returnQty > 0);

      const returnReq = await api.createReturn({
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: order.buyerId,
        businessName: order.businessName,
        buyerPhone: order.delivery.phone,
        items: returnItems,
        reason,
        notes,
        images,
      });

      notifyReturnRequested(order.orderNumber, returnReq.id, returnReq.totalRefund);

      setReturnId(returnReq.id);
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit return request.";
      toast.error("Return failed", message);
    } finally {
      setSubmitting(false);
    }
  }, [order, returnQty, reason, notes, images, hasAnyReturn, validateQuantities]);

  if (!ready || loading) {
    return (
      <AppShell header={<BuyerHeader />} footer={<BuyerBottomNav />} sidebar={<BuyerSidebar />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell header={<BuyerHeader />} footer={<BuyerBottomNav />} sidebar={<BuyerSidebar />}>
        <div className="flex h-full items-center justify-center">
          <p className="text-fg-muted">Order not found</p>
        </div>
      </AppShell>
    );
  }

  const existingReturn = returns?.find((r) => r.orderId === order.id);
  const deliveredAt = order.deliveredAt || order.updatedAt;
  const hoursSinceDelivery = (Date.now() - new Date(deliveredAt).getTime()) / 36e5;

  if (existingReturn) {
    return (
      <AppShell header={<BuyerHeader />} sidebar={<BuyerSidebar />}>
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <h2 className="text-lg font-bold text-fg">Return already requested</h2>
          <p className="mt-2 text-sm text-fg-muted">
            A return request already exists for this order.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Button onClick={() => router.push(`/returns/${existingReturn.id}`)}>
              View Return
            </Button>
            <Button variant="outline" onClick={() => router.push("/orders")}>
              Back to Orders
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (order.status !== "DELIVERED" || hoursSinceDelivery > 4) {
    return (
      <AppShell header={<BuyerHeader />} sidebar={<BuyerSidebar />}>
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <h2 className="text-lg font-bold text-fg">Return window closed</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Returns can only be requested within 4 hours of delivery.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => router.push("/orders")}>
            Back to Orders
          </Button>
        </div>
      </AppShell>
    );
  }

  if (submitted) {
    return (
      <AppShell header={<BuyerHeader />} footer={<BuyerBottomNav />} sidebar={<BuyerSidebar />}>
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-fg">Return Request Submitted</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Your return request <span className="font-mono font-bold">{returnId}</span> has been created.
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Refund amount: <span className="font-bold text-fg">{formatCurrency(totalRefund)}</span>
          </p>
          <p className="mt-4 text-xs text-fg-subtle">
            Our team will review and respond within 24 hours. You can track the status in the Returns section.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Button onClick={() => router.push(`/returns/${returnId}`)}>
              View Return Thread
            </Button>
            <Button variant="outline" onClick={() => router.push("/orders")}>
              Back to Orders
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={<BuyerHeader />} footer={<BuyerBottomNav />} sidebar={<BuyerSidebar />}>
      <div className="flex flex-col gap-3 p-4">
        <button onClick={() => router.back()} className="flex w-fit items-center gap-1 text-xs font-semibold text-fg-subtle hover:text-fg-muted">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to order
        </button>

        <div>
          <h1 className="text-lg font-extrabold text-fg">Request Return</h1>
          <p className="text-xs text-fg-subtle">{order.orderNumber} &bull; {order.businessName}</p>
        </div>

        {/* Qty validation info */}
        <div className="rounded-lg bg-blue-500/5 px-3 py-2 text-xs text-blue-600">
          You can return up to the quantity you ordered for each item.
        </div>

        {/* Items to return */}
        <Card>
          <CardBody className="p-4">
            <h2 className="mb-3 text-sm font-bold text-fg">Select items to return</h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.productId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">{item.name}</p>
                    <p className="text-xs text-fg-subtle">
                      Ordered: {item.qty} {item.unit} &bull; {formatCurrency(item.price)}/{item.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQtyChange(item.productId, -1, item.qty)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-fg">
                      {returnQty[item.productId] || 0}
                    </span>
                    <button
                      onClick={() => handleQtyChange(item.productId, 1, item.qty)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Reason */}
        <Card>
          <CardBody className="p-4">
            <h2 className="mb-3 text-sm font-bold text-fg">Return reason</h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(RETURN_REASON_LABELS) as [ReturnReason, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setReason(key)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-left ${
                    reason === key
                      ? "border-brand-500 bg-brand-500/10 text-brand-500"
                      : "border-line bg-surface text-fg-muted hover:bg-raised"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Notes */}
        <Card>
          <CardBody className="p-4">
            <h2 className="mb-2 text-sm font-bold text-fg">Additional notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the issue in detail..."
              rows={3}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-brand-500"
            />
          </CardBody>
        </Card>

        {/* Image Upload */}
        <Card>
          <CardBody className="p-4">
            <h2 className="mb-2 text-sm font-bold text-fg">Upload photos</h2>
            <p className="mb-3 text-xs text-fg-subtle">Photos help us verify the issue faster</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <div key={img.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-line">
                  <img src={img.url} alt={img.filename} className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeImage(img.id)}
                    aria-label={`Remove ${img.filename}`}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {Array.from({ length: uploadingCount }).map((_, i) => (
                <div
                  key={`uploading-${i}`}
                  className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-line bg-surface"
                >
                  <Spinner className="h-5 w-5" />
                </div>
              ))}
              {images.length + uploadingCount < MAX_PHOTOS && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-surface text-fg-subtle hover:bg-raised"
                >
                  <Camera className="h-5 w-5" />
                  <span className="text-[10px] font-medium">Add photo</span>
                </button>
              )}
            </div>
          </CardBody>
        </Card>

        {hasAnyReturn && (
          <Card>
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-fg">Refund estimate</span>
                <span className="text-lg font-extrabold text-accent">{formatCurrency(totalRefund)}</span>
              </div>
            </CardBody>
          </Card>
        )}

        <Button
          fullWidth
          loading={submitting}
          disabled={!hasAnyReturn || submitting || uploadingCount > 0}
          onClick={handleSubmit}
        >
          {uploadingCount > 0 ? "Uploading photos…" : "Submit Return Request"}
        </Button>

        <p className="text-center text-xs text-fg-subtle">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          Refunds are processed within 3-5 business days after pickup
        </p>
      </div>
    </AppShell>
  );
}
