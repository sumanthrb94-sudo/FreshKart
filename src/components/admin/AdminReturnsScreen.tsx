"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Search,
  AlertTriangle,
  Clock,
  Truck,
  IndianRupee,
  Image,
  Bot,
  User,
  Phone,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RETURN_REASON_LABELS,
  allowedTransitions,
  canAdminRespond,
  isSupersededEstimate,
} from "@/lib/returns";
import type { ReturnRequest, ReturnStatus, ReturnMessage } from "@/lib/returns";
import { formatCurrency, formatDate } from "@/lib/format";
import { api } from "@/lib/api";
import { useLiveReturns } from "@/lib/live-hooks";
import { useTypingActive, useTypingHeartbeat } from "@/lib/hooks";
import { Spinner } from "@/components/ui/Spinner";
import { useImageLightbox } from "@/components/ui/ImageLightbox";
import { TypingBubble } from "@/components/ui/TypingIndicator";

const STATUS_CONFIG: Record<ReturnStatus, { label: string; color: string; icon: typeof CheckCircle2; nextAction: string }> = {
  REQUESTED: { label: "Requested", color: "bg-amber-500/10 text-amber-500", icon: Clock, nextAction: "Approve" },
  APPROVED: { label: "Approved", color: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle2, nextAction: "Mark Picked Up" },
  REJECTED: { label: "Rejected", color: "bg-red-500/10 text-red-500", icon: XCircle, nextAction: "" },
  PICKED_UP: { label: "Picked Up", color: "bg-blue-500/10 text-blue-500", icon: Truck, nextAction: "Process Refund" },
  REFUNDED: { label: "Refunded", color: "bg-brand-500/10 text-brand-500", icon: IndianRupee, nextAction: "Mark Complete" },
  COMPLETED: { label: "Completed", color: "bg-brand-500/10 text-brand-500", icon: CheckCircle2, nextAction: "" },
};

/** Label for the button that moves a return INTO the given status — keyed by
 *  the transition's target, so "Process Refund" really sets REFUNDED (the old
 *  `STATUS_CONFIG[next].nextAction` labels were one step ahead of the click). */
const TRANSITION_LABELS: Partial<Record<ReturnStatus, string>> = {
  REQUESTED: "Reopen request",
  APPROVED: "Approve",
  REJECTED: "Reject",
  PICKED_UP: "Mark Picked Up",
  REFUNDED: "Process Refund",
  COMPLETED: "Mark Complete",
};

const FILTER_OPTIONS = ["all", "reopenRequested", "REQUESTED", "APPROVED", "PICKED_UP", "REFUNDED", "COMPLETED", "REJECTED"] as const;

export function AdminReturnsScreen() {
  const { data: returns, loading, error, refetch } = useLiveReturns();
  const [filter, setFilter] = useState<ReturnStatus | "all" | "reopenRequested">("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [threadVersion, setThreadVersion] = useState(0);

  const list = returns ?? [];

  const filtered = list.filter((r) => {
    if (filter === "reopenRequested" && !r.reopenRequestedAt) return false;
    if (filter !== "all" && filter !== "reopenRequested" && r.status !== filter) return false;
    if (search && !r.businessName.toLowerCase().includes(search.toLowerCase()) &&
        !r.orderNumber.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleStatusChange = async (id: string, newStatus: ReturnStatus) => {
    await api.updateReturnStatus(id, newStatus);
    await refetch();
  };

  const handleSendReply = async (returnId: string, text: string) => {
    if (!text.trim()) return;
    await api.addReturnMessage(returnId, "admin", text.trim());
    setThreadVersion((v) => v + 1);
    await refetch();
  };

  const activeReturn = detailId ? list.find((r) => r.id === detailId) || null : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-fg-subtle">{error}</p>
        </div>
      ) : !activeReturn ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Single-column layout — the status filters live inline above the
              request list (as chips) rather than in a separate left sub-column,
              so the whole width belongs to the returns the admin is working. */}
          <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
            <h1 className="text-lg font-extrabold text-fg">Returns &amp; Refunds</h1>
            <p className="text-xs text-fg-subtle">Manage customer returns and process refunds</p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
              <Search className="h-4 w-4 text-fg-subtle" />
              <input
                type="text"
                placeholder="Search by order # or business..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 flex-1 bg-transparent text-sm text-fg outline-none"
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
              {FILTER_OPTIONS.map((s) => {
                const count =
                  s === "all"
                    ? list.length
                    : s === "reopenRequested"
                      ? list.filter((r) => r.reopenRequestedAt).length
                      : list.filter((r) => r.status === s).length;
                const Icon = s === "all" || s === "reopenRequested" ? RotateCcw : STATUS_CONFIG[s].icon;
                const active = filter === s;
                const label = s === "all" ? "All" : s === "reopenRequested" ? "Review requested" : STATUS_CONFIG[s].label;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilter(s)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                      active
                        ? s === "reopenRequested"
                          ? "bg-rose-500 text-white"
                          : "bg-brand-500 text-white"
                        : "bg-raised text-fg-muted hover:bg-line hover:text-fg"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    <span
                      className={cn(
                        "min-w-[18px] rounded-full px-1 py-0.5 text-center text-[10px] font-bold leading-none",
                        active ? "bg-white/25 text-white" : "bg-surface text-fg-subtle"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <RotateCcw className="h-12 w-12 text-fg-subtle" />
                <p className="mt-3 text-base font-bold text-fg">No returns found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {filtered.map((ret) => (
                  <ReturnCard key={ret.id} ret={ret} onOpen={() => { refetch(); setDetailId(ret.id); }} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <ReturnDetail
          key={activeReturn.id + threadVersion}
          returnReq={activeReturn}
          onBack={() => setDetailId(null)}
          onStatusChange={handleStatusChange}
          onSendReply={handleSendReply}
        />
      )}
    </div>
  );
}

function ReturnCard({ ret, onOpen }: { ret: ReturnRequest; onOpen: () => void }) {
  const cfg = STATUS_CONFIG[ret.status];
  return (
    <div
      onClick={onOpen}
      className="cursor-pointer rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-raised/40"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className="text-xs font-mono text-fg-muted">{ret.id}</span>
            {ret.reopenRequestedAt && (
              <span className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-500">
                <RotateCcw className="h-3 w-3" /> Review requested
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold text-fg">{ret.businessName}</p>
          <p className="text-xs text-fg-subtle">{ret.orderNumber}</p>
        </div>
        <p className="text-lg font-extrabold text-fg">{formatCurrency(ret.totalRefund)}</p>
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs text-fg-subtle">
        <AlertTriangle className="h-3 w-3" />
        {RETURN_REASON_LABELS[ret.reason]}
        {ret.thread.length > 1 && (
          <span className="ml-2 rounded-full bg-raised px-1.5 py-0.5 text-[10px]">
            {ret.thread.length} messages
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs text-fg-subtle">
        <ChevronRight className="h-3 w-3" /> Tap to view thread
      </div>
    </div>
  );
}

function ReturnDetail({
  returnReq,
  onBack,
  onStatusChange,
  onSendReply,
}: {
  returnReq: ReturnRequest;
  onBack: () => void;
  onStatusChange: (id: string, status: ReturnStatus) => void;
  onSendReply: (id: string, text: string) => void;
}) {
  const [reply, setReply] = useState("");
  const [notes, setNotes] = useState(returnReq.adminNotes || "");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lightbox = useImageLightbox();

  const buyerIsTyping = useTypingActive(returnReq.buyerTypingAt);
  const notifyTyping = useTypingHeartbeat(() => api.setReturnTyping?.(returnReq.id, "admin"));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [returnReq.thread.length, buyerIsTyping]);

  const cfg = STATUS_CONFIG[returnReq.status];
  const transitions = allowedTransitions(returnReq.status);
  const canReply = canAdminRespond(returnReq.status);

  const handleSendReply = () => {
    if (!reply.trim()) return;
    onSendReply(returnReq.id, reply.trim());
    setReply("");
  };

  const handleSaveNotes = async () => {
    await api.updateReturnAdminNotes(returnReq.id, notes);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-fg-subtle hover:text-fg-muted">
          <ArrowLeft className="h-3.5 w-3.5" /> All returns
        </button>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-fg">{returnReq.id}</p>
            <p className="text-xs text-fg-subtle">{returnReq.orderNumber}</p>
          </div>
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${cfg.color}`}>
            <cfg.icon className="h-3 w-3" /> {cfg.label}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
          <Phone className="h-3 w-3" />
          <span>{returnReq.buyerPhone}</span>
          <span className="mx-1">|</span>
          <span>{returnReq.businessName}</span>
        </div>
        {returnReq.reopenRequestedAt && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-500">
            <RotateCcw className="h-3.5 w-3.5" />
            Buyer asked us to take another look at this rejection.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="rounded-xl border border-line bg-surface p-4 space-y-2">
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
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Items</h3>
          <div className="space-y-2">
            {returnReq.items.map((item) => (
              <div key={item.productId} className="flex items-center justify-between text-sm">
                <span className="text-fg">{item.productName}</span>
                <span className="text-fg-muted">{item.returnQty} {item.unit} &bull; {formatCurrency(item.lineRefund)}</span>
              </div>
            ))}
          </div>
        </div>

        {returnReq.images.length > 0 && (
          <div className="rounded-xl border border-line bg-surface p-4">
            <h3 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">
              <Image className="h-3.5 w-3.5" /> Photos from buyer
            </h3>
            <div className="flex flex-wrap gap-2">
              {returnReq.images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => lightbox.open(img.url, img.filename)}
                  className="h-24 w-24 overflow-hidden rounded-lg border border-line transition-opacity hover:opacity-80"
                >
                  <img src={img.url} alt={img.filename} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Internal notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            placeholder="Add internal notes..."
            rows={2}
            className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>

        {transitions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {transitions.map((nextStatus) =>
              // The reopen edge (REJECTED → REQUESTED) reads as a distinct
              // action from every forward status change — outlined instead of
              // solid, with the reopen glyph, so it doesn't look like just
              // another step in the normal approve/reject flow.
              nextStatus === "REQUESTED" ? (
                <button
                  key={nextStatus}
                  onClick={() => onStatusChange(returnReq.id, nextStatus)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-4 py-2 text-xs font-bold text-brand-500 hover:bg-brand-500/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {TRANSITION_LABELS[nextStatus] ?? nextStatus}
                </button>
              ) : (
                <button
                  key={nextStatus}
                  onClick={() => onStatusChange(returnReq.id, nextStatus)}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600"
                >
                  {TRANSITION_LABELS[nextStatus] ?? nextStatus}
                </button>
              )
            )}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-fg-subtle">Conversation Thread</h3>
          {returnReq.thread.map((msg) => (
            <AdminThreadMessage
              key={msg.id}
              message={msg}
              returnStatus={returnReq.status}
              onImageClick={lightbox.open}
            />
          ))}
          {canReply && buyerIsTyping && <TypingBubble label="Buyer is typing…" align="start" />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {lightbox.node}

      {canReply && (
        <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2">
            <input
              type="text"
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                if (e.target.value.trim()) notifyTyping();
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
              placeholder="Reply to buyer..."
              className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
            <button
              onClick={handleSendReply}
              disabled={!reply.trim()}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
                reply.trim() ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-line text-fg-subtle"
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminThreadMessage({
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
    <div className={cn("flex items-start gap-2", isBuyer ? "flex-row" : "flex-row-reverse")}>
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        isBuyer ? "bg-fg/10" : "bg-brand-500/10"
      )}>
        {isBuyer ? <User className="h-4 w-4 text-fg" /> : <Bot className="h-4 w-4 text-brand-500" />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed",
        isBuyer ? "rounded-tl-none bg-raised text-fg" : "rounded-tr-none bg-brand-500 text-white"
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
        <p className={cn("mt-1 text-[10px]", isBuyer ? "text-fg-subtle" : "text-white/60")}>
          {formatDate(message.sentAt)}
        </p>
      </div>
    </div>
  );
}
