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
import { api } from "@/lib/api";
import { useAsync, useRequireAuth } from "@/lib/hooks";
import { createReturnRequest, RETURN_REASON_LABELS } from "@/lib/returns";
import type { ReturnReason, ReturnImage } from "@/lib/returns";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "@/components/buyer/BuyerHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

export function ReturnRequestScreen({ orderId }: { orderId: string }) {
  const { ready } = useRequireAuth({ callbackUrl: `/orders/${orderId}/return` });
  const router = useRouter();
  const { data: order, loading } = useAsync(() => api.getOrder(orderId), [orderId]);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason>("OTHER");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<ReturnImage[]>([]);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      const newImage: ReturnImage = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url,
        filename: file.name,
        uploadedAt: new Date().toISOString(),
      };
      setImages((prev) => [...prev, newImage]);
    });
    e.target.value = "";
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

      const returnReq = createReturnRequest({
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

      const existing = JSON.parse(localStorage.getItem("freshkart_returns") || "[]");
      existing.push(returnReq);
      localStorage.setItem("freshkart_returns", JSON.stringify(existing));

      // Increment coupon usage if applicable
      toast.success("Return request submitted!", `Refund of ${formatCurrency(returnReq.totalRefund)} will be processed in 3-5 days`);

      setReturnId(returnReq.id);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [order, returnQty, reason, notes, images, hasAnyReturn, validateQuantities]);

  if (!ready || loading) {
    return (
      <AppShell header={<BuyerHeader />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell header={<BuyerHeader />}>
        <div className="flex h-full items-center justify-center">
          <p className="text-fg-muted">Order not found</p>
        </div>
      </AppShell>
    );
  }

  if (submitted) {
    return (
      <AppShell header={<BuyerHeader />}>
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
    <AppShell header={<BuyerHeader />}>
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
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-surface text-fg-subtle hover:bg-raised"
              >
                <Camera className="h-5 w-5" />
                <span className="text-[10px] font-medium">Add photo</span>
              </button>
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
          disabled={!hasAnyReturn || submitting}
          onClick={handleSubmit}
        >
          Submit Return Request
        </Button>

        <p className="text-center text-xs text-fg-subtle">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          Refunds are processed within 3-5 business days after pickup
        </p>
      </div>
    </AppShell>
  );
}
