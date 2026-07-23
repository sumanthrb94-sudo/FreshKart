"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Send,
  Search,
  MessageCircle,
  Phone,
  Bot,
  User,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAdminRespond } from "@/lib/support-tickets";
import type { SupportTicket, TicketStatus, TicketMessage } from "@/lib/support-tickets";
import { formatDate } from "@/lib/format";
import { api } from "@/lib/api";
import { useLiveSupportTickets } from "@/lib/live-hooks";
import { Spinner } from "@/components/ui/Spinner";

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: typeof Clock }> = {
  OPEN: { label: "Open", color: "bg-amber-500/10 text-amber-500", icon: Clock },
  CLOSED: { label: "Closed", color: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle2 },
};

export function AdminSupportTicketsScreen() {
  const { data: tickets, loading, error, refetch } = useLiveSupportTickets();
  const [filter, setFilter] = useState<TicketStatus | "needsHuman" | "all">("needsHuman");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = tickets ?? [];

  const filtered = list.filter((t) => {
    if (filter === "needsHuman" && !t.needsHuman) return false;
    if (filter !== "all" && filter !== "needsHuman" && t.status !== filter) return false;
    if (search && !t.businessName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleClose = async (id: string) => {
    await api.closeSupportTicket(id);
    await refetch();
  };

  const handleReopen = async (id: string) => {
    await api.reopenSupportTicket(id);
    await refetch();
  };

  const handleSendReply = async (ticketId: string, text: string) => {
    if (!text.trim()) return;
    await api.addSupportTicketMessage(ticketId, "admin", text.trim());
    await refetch();
  };

  const activeTicket = detailId ? list.find((t) => t.id === detailId) || null : null;
  const needsHumanCount = list.filter((t) => t.needsHuman).length;

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
      ) : !activeTicket ? (
        <>
          <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
            <h1 className="text-lg font-extrabold text-fg">Support Chats</h1>
            <p className="text-xs text-fg-subtle">Buyer AI-chat conversations escalated to a human</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
              <Search className="h-4 w-4 text-fg-subtle" />
              <input
                type="text"
                placeholder="Search by business name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 flex-1 bg-transparent text-sm text-fg outline-none"
              />
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {([
                ["needsHuman", `Needs reply (${needsHumanCount})`],
                ["all", `All (${list.length})`],
                ["OPEN", `Open (${list.filter((t) => t.status === "OPEN").length})`],
                ["CLOSED", `Closed (${list.filter((t) => t.status === "CLOSED").length})`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    filter === key ? "bg-brand-500 text-white" : "bg-raised text-fg-subtle hover:bg-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <MessageCircle className="h-12 w-12 text-fg-subtle" />
                <p className="mt-3 text-base font-bold text-fg">No conversations found</p>
              </div>
            ) : (
              filtered.map((t) => (
                <TicketCard key={t.id} ticket={t} onOpen={() => { refetch(); setDetailId(t.id); }} />
              ))
            )}
          </div>
        </>
      ) : (
        <TicketDetail
          key={activeTicket.id}
          ticket={activeTicket}
          onBack={() => setDetailId(null)}
          onClose={handleClose}
          onReopen={handleReopen}
          onSendReply={handleSendReply}
        />
      )}
    </div>
  );
}

function TicketCard({ ticket, onOpen }: { ticket: SupportTicket; onOpen: () => void }) {
  const cfg = STATUS_CONFIG[ticket.status];
  return (
    <div
      onClick={onOpen}
      className="cursor-pointer rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-raised/40"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
            {ticket.needsHuman && (
              <span className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-500">
                <AlertTriangle className="h-3 w-3" /> Needs reply
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold text-fg">{ticket.businessName}</p>
          <p className="text-xs text-fg-subtle">{ticket.buyerPhone}</p>
        </div>
        <span className="rounded-full bg-raised px-1.5 py-0.5 text-[10px] text-fg-subtle">
          {ticket.thread.length} messages
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs text-fg-subtle">
        <ChevronRight className="h-3 w-3" /> Tap to view thread
      </div>
    </div>
  );
}

function TicketDetail({
  ticket,
  onBack,
  onClose,
  onReopen,
  onSendReply,
}: {
  ticket: SupportTicket;
  onBack: () => void;
  onClose: (id: string) => void;
  onReopen: (id: string) => void;
  onSendReply: (id: string, text: string) => void;
}) {
  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket.thread.length]);

  const cfg = STATUS_CONFIG[ticket.status];
  const canReply = canAdminRespond(ticket.status);

  const handleSendReply = () => {
    if (!reply.trim()) return;
    onSendReply(ticket.id, reply.trim());
    setReply("");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-fg-subtle hover:text-fg-muted">
          <ArrowLeft className="h-3.5 w-3.5" /> All chats
        </button>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-fg">{ticket.businessName}</p>
            <p className="flex items-center gap-1 text-xs text-fg-subtle">
              <Phone className="h-3 w-3" /> {ticket.buyerPhone}
            </p>
          </div>
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${cfg.color}`}>
            <cfg.icon className="h-3 w-3" /> {cfg.label}
          </span>
        </div>
        {canReply ? (
          <button
            onClick={() => onClose(ticket.id)}
            className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-fg-muted hover:bg-raised"
          >
            End conversation
          </button>
        ) : (
          <button
            onClick={() => onReopen(ticket.id)}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-500 hover:bg-brand-500/20"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reopen conversation
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {ticket.thread.map((msg) => (
          <AdminThreadMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {canReply && (
        <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
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

function AdminThreadMessage({ message }: { message: TicketMessage }) {
  if (message.sender === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-lg bg-raised px-3 py-1.5 text-center text-xs text-fg-subtle">
          {message.text}
        </div>
      </div>
    );
  }

  const isBuyer = message.sender === "buyer";
  const isAdminSender = message.sender === "admin";

  return (
    <div className={cn("flex items-start gap-2", isBuyer ? "flex-row" : "flex-row-reverse")}>
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        isBuyer ? "bg-fg/10" : isAdminSender ? "bg-emerald-500/10" : "bg-brand-500/10"
      )}>
        {isBuyer ? <User className="h-4 w-4 text-fg" /> : <Bot className={cn("h-4 w-4", isAdminSender ? "text-emerald-500" : "text-brand-500")} />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed",
        isBuyer ? "rounded-tl-none bg-raised text-fg" : "rounded-tr-none bg-brand-500 text-white"
      )}>
        <p>{message.text}</p>
        <p className={cn("mt-1 text-[10px]", isBuyer ? "text-fg-subtle" : "text-white/60")}>
          {formatDate(message.sentAt)}
        </p>
      </div>
    </div>
  );
}
