"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  IndianRupee,
  Image,
  Bot,
  User,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { RETURN_REASON_LABELS, canBuyerMessage, isSupersededEstimate } from "@/lib/returns";
import type { ReturnRequest, ReturnMessage, ReturnStatus } from "@/lib/returns";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "@/components/buyer/BuyerHeader";
import { BuyerBottomNav } from "@/components/buyer/BuyerBottomNav";
import { BuyerSidebar } from "@/components/layout/BuyerSidebar";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { useImageLightbox } from "@/components/ui/ImageLightbox";

const STATUS_CONFIG: Record<ReturnStatus, { label: string; color: string; icon: typeof Clock }> = {
  REQUESTED: { label: "Requested", color: "text-amber-500 bg-amber-500/10", icon: Clock },
  APPROVED: { label: "Approved", color: "text-emerald-500 bg-emerald-500/10", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", color: "text-red-500 bg-red-500/10", icon: XCircle },
  PICKED_UP: { label: "Picked Up", color: "text-blue-500 bg-blue-500/10", icon: Truck },
  REFUNDED: { label: "Refunded", color: "text-brand-500 bg-brand-500/10", icon: IndianRupee },
  COMPLETED: { label: "Completed", color: "text-brand-500 bg-brand-500/10", icon: CheckCircle2 },
};



export function ReturnThreadScreen({ id }: { id: string }) {
  const router = useRouter();
  const { data: returnReq, loading, error, refetch } = useAsync(() => api.getReturn(id), [id]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lightbox = useImageLightbox();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [returnReq?.thread.length]);

  const handleSend = async () => {
    if (!reply.trim() || !returnReq) return;
    setSending(true);
    try {
      await api.addReturnMessage(id, "buyer", reply.trim());
      setReply("");
      await refetch();
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <AppShell header={<BuyerHeader />} footer={<BuyerBottomNav />} sidebar={<BuyerSidebar />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  if (error || !returnReq) {
    // Never surface a raw backend error (e.g. Firestore's "Missing or
    // insufficient permissions.") — a stale notification link, an old
    // session's deep link, or a return that belongs to a different account
    // all end up here, and none of that is meaningful to the buyer.
    return (
      <AppShell header={<BuyerHeader />} footer={<BuyerBottomNav />} sidebar={<BuyerSidebar />}>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-fg-muted">This return request could not be found.</p>
          <Button variant="outline" onClick={() => router.push("/returns")}>
            Back to Returns
          </Button>
        </div>
      </AppShell>
    );
  }

  const statusCfg = STATUS_CONFIG[returnReq.status];
  const canMessage = canBuyerMessage(returnReq.status);

  return (
    <AppShell header={<BuyerHeader />} footer={<BuyerBottomNav />} sidebar={<BuyerSidebar />}>
      <div className="flex h-[calc(100dvh-56px)] flex-col">
        <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-xs font-semibold text-fg-subtle hover:text-fg-muted">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="mt-2 flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-fg">{returnReq.id}</p>
              <p className="text-xs text-fg-subtle">{returnReq.orderNumber}</p>
            </div>
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusCfg.color}`}>
              <statusCfg.icon className="h-3 w-3" /> {statusCfg.label}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <Card>
            <CardBody className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-subtle">Refund amount</span>
                <span className="text-lg font-extrabold text-accent">{formatCurrency(returnReq.totalRefund)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-subtle">Reason</span>
                <span className="text-xs font-medium text-fg">{RETURN_REASON_LABELS[returnReq.reason]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-subtle">Requested</span>
                <span className="text-xs text-fg-muted">{formatDate(returnReq.requestedAt)}</span>
              </div>
              {returnReq.adminNotes && (
                <div className="mt-2 rounded-lg bg-raised p-2">
                  <p className="text-xs font-semibold text-fg-subtle">Admin note</p>
                  <p className="mt-0.5 text-xs text-fg">{returnReq.adminNotes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Items being returned</h3>
              <div className="space-y-2">
                {returnReq.items.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between text-sm">
                    <span className="text-fg">{item.productName}</span>
                    <span className="text-fg-muted">{item.returnQty} {item.unit} &bull; {formatCurrency(item.lineRefund)}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {returnReq.images.length > 0 && (
            <Card>
              <CardBody className="p-4">
                <h3 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">
                  <Image className="h-3.5 w-3.5" /> Uploaded photos
                </h3>
                <div className="flex flex-wrap gap-2">
                  {returnReq.images.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => lightbox.open(img.url, img.filename)}
                      className="h-20 w-20 overflow-hidden rounded-lg border border-line"
                    >
                      <img src={img.url} alt={img.filename} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          <div className="space-y-3">
            <h3 className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">
              <Shield className="h-3.5 w-3.5" /> Conversation
            </h3>
            {returnReq.thread.map((msg) => (
              <ThreadMessage
                key={msg.id}
                message={msg}
                returnStatus={returnReq.status}
                onImageClick={lightbox.open}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {canMessage && (
          <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !sending && handleSend()}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!reply.trim() || sending}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
                  reply.trim() && !sending ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-line text-fg-subtle"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {lightbox.node}
    </AppShell>
  );
}

function ThreadMessage({
  message,
  returnStatus,
  onImageClick,
}: {
  message: ReturnMessage;
  returnStatus: ReturnStatus;
  onImageClick: (src: string, alt?: string) => void;
}) {
  const isSystem = message.sender === "system";
  const isBuyer = message.sender === "buyer";

  if (isSystem) {
    const superseded = isSupersededEstimate(message, returnStatus);
    return (
      <div className="flex justify-center">
        <div
          className={cn(
            "max-w-[90%] rounded-lg bg-raised px-3 py-1.5 text-center text-xs text-fg-subtle",
            superseded && "line-through opacity-50"
          )}
        >
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-2", isBuyer ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        isBuyer ? "bg-fg/10" : "bg-brand-500/10"
      )}>
        {isBuyer ? <User className="h-4 w-4 text-fg" /> : <Bot className="h-4 w-4 text-brand-500" />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed",
        isBuyer ? "rounded-tr-none bg-brand-500 text-white" : "rounded-tl-none bg-raised text-fg"
      )}>
        <p>{message.text}</p>
        {message.images && message.images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onImageClick(img.url, img.filename)}
                className="h-16 w-16 overflow-hidden rounded-lg"
              >
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <p className={cn("mt-1 text-[10px]", isBuyer ? "text-white/60" : "text-fg-subtle")}>
          {formatDate(message.sentAt)}
        </p>
      </div>
    </div>
  );
}
