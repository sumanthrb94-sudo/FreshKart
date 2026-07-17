"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Bot, User, Sparkles, LogOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/lib/api";
import { generateAIResponse } from "@/lib/ai-chat";
import type { ChatSession } from "@/lib/ai-chat";
import { TALK_TO_HUMAN, canBuyerMessage } from "@/lib/support-tickets";
import type { SupportTicket, TicketMessage } from "@/lib/support-tickets";

export function AiChatAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const contextRef = useRef<ChatSession["context"]>("general");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { isAuthenticated, isAdmin, user } = useAuth();

  // Close chat when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!isOpen) return;
      const target = e.target as HTMLElement;
      // Don't close if clicking the chat button itself
      if (target.closest("[data-chat-button]")) return;
      // Close if clicking outside the panel
      if (panelRef.current && !panelRef.current.contains(target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    // isOpen is also a dependency: reopening the panel with an unchanged
    // thread (no new messages since it was last open) wouldn't otherwise
    // re-run this — the panel would render still scrolled to wherever it
    // was left, or its unmount/remount default (top), instead of the
    // latest message.
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [ticket?.thread.length, typing, isOpen]);

  useEffect(() => {
    if (isOpen && ticket) inputRef.current?.focus();
  }, [isOpen, ticket]);

  const loadTicket = useCallback(async () => {
    if (!user) return;
    setTicketLoading(true);
    setTicketError(null);
    try {
      const t = await api.getOrCreateSupportTicket({
        buyerId: user.id,
        businessName: user.businessName || user.name,
        buyerPhone: user.phone,
        buyerName: user.name,
      });
      setTicket(t);
    } catch (e) {
      setTicketError(e instanceof Error ? e.message : "Couldn't load chat. Please try again.");
    } finally {
      setTicketLoading(false);
    }
  }, [user]);

  const handleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        // Opening: refresh so any admin reply sent while the panel was
        // closed shows up, instead of only refetching on first load.
        if (ticket) {
          setTicketLoading(true);
          api.getSupportTicket(ticket.id)
            .then((fresh) => {
              if (fresh) setTicket(fresh);
            })
            .catch((e) => {
              setTicketError(e instanceof Error ? e.message : "Couldn't refresh chat.");
            })
            .finally(() => setTicketLoading(false));
        } else if (!ticketLoading) {
          loadTicket();
        }
      }
      return next;
    });
  };

  const handleSend = async () => {
    if (!input.trim() || !ticket) return;
    const userText = input.trim();
    setInput("");
    setTicketError(null);

    try {
      if (userText === TALK_TO_HUMAN) {
        setTyping(true);
        const updated = await api.addSupportTicketMessage(ticket.id, "buyer", userText);
        const escalated = await api.escalateSupportTicket(updated.id);
        setTicket(escalated);
        return;
      }

      setTyping(true);
      const afterBuyer = await api.addSupportTicketMessage(ticket.id, "buyer", userText);
      setTicket(afterBuyer);

      const lower = userText.toLowerCase();
      if (lower.includes("return") || lower.includes("refund")) contextRef.current = "returns";
      else if (lower.includes("order") || lower.includes("track")) contextRef.current = "order_help";
      else if (lower.includes("price") || lower.includes("cost")) contextRef.current = "pricing";

      const { text, suggestions } = generateAIResponse(userText, contextRef.current);
      const afterAssistant = await new Promise<SupportTicket>((resolve, reject) => {
        setTimeout(() => {
          api.addSupportTicketMessage(afterBuyer.id, "assistant", text, suggestions).then(resolve, reject);
        }, 500);
      });
      setTicket(afterAssistant);
    } catch (e) {
      setTicketError(e instanceof Error ? e.message : "Message didn't send. Please try again.");
    } finally {
      setTyping(false);
    }
  };

  const handleQuickAction = async (query: string) => {
    if (!ticket) return;
    setTicketError(null);
    try {
      if (query === TALK_TO_HUMAN) {
        setTyping(true);
        const afterBuyer = await api.addSupportTicketMessage(ticket.id, "buyer", query);
        const escalated = await api.escalateSupportTicket(afterBuyer.id);
        setTicket(escalated);
        return;
      }
      setTyping(true);
      const afterBuyer = await api.addSupportTicketMessage(ticket.id, "buyer", query);
      setTicket(afterBuyer);
      const { text, suggestions } = generateAIResponse(query, contextRef.current);
      const afterAssistant = await new Promise<SupportTicket>((resolve, reject) => {
        setTimeout(() => {
          api.addSupportTicketMessage(afterBuyer.id, "assistant", text, suggestions).then(resolve, reject);
        }, 400);
      });
      setTicket(afterAssistant);
    } catch (e) {
      setTicketError(e instanceof Error ? e.message : "Message didn't send. Please try again.");
    } finally {
      setTyping(false);
    }
  };

  const handleEndChat = async () => {
    if (!ticket) return;
    try {
      const closed = await api.closeSupportTicket(ticket.id);
      setTicket(closed);
    } catch (e) {
      setTicketError(e instanceof Error ? e.message : "Couldn't end the chat. Please try again.");
    }
  };

  const handleStartNew = () => {
    setTicket(null);
    loadTicket();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Only show chat for authenticated buyers. Hide for:
  // - Guests (not logged in)
  // - Admins
  // - Login page (double safety)
  // - Admin pages (double safety)
  const isLoginPage = pathname === "/" || pathname === "";
  const isAdminPage = pathname?.startsWith("/admin");
  const shouldShowChat = isAuthenticated && !isAdmin && !isLoginPage && !isAdminPage;

  if (!shouldShowChat) return null;

  const canReply = ticket ? canBuyerMessage(ticket.status) : false;
  const lastMessage = ticket?.thread[ticket.thread.length - 1];

  return (
    <>
      {/* Floating Chat Button - always shows MessageCircle */}
      <button
        data-chat-button
        onClick={handleOpen}
        className={cn(
          "fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300 md:bottom-8 hover:scale-105",
          isOpen
            ? "bg-brand-600 text-white"
            : "bg-brand-500 text-white hover:bg-brand-600"
        )}
        aria-label="Open chat"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed bottom-36 right-4 z-50 flex h-[480px] w-[calc(100vw-2rem)] max-w-[360px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl md:bottom-24"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-line bg-brand-500 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Green Basket Assistant</p>
              <p className="flex items-center gap-1 text-[10px] text-white/80">
                <Sparkles className="h-3 w-3" /> AI Powered
              </p>
            </div>
            {ticket && canReply && (
              <button
                onClick={handleEndChat}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
                title="End chat"
                aria-label="End chat"
              >
                <LogOut className="h-3.5 w-3.5 text-white" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
              title="Close chat"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {ticketLoading && !ticket && (
              <div className="flex h-full items-center justify-center">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            {!ticketLoading && !ticket && ticketError && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm font-semibold text-fg">Couldn&apos;t load chat</p>
                <p className="max-w-[240px] text-xs text-fg-subtle">{ticketError}</p>
                <button
                  onClick={loadTicket}
                  className="mt-1 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
                >
                  Try again
                </button>
              </div>
            )}

            {ticket?.thread.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}

            {typing && (
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10">
                  <Bot className="h-3.5 w-3.5 text-brand-500" />
                </div>
                <div className="rounded-xl rounded-tl-none bg-raised px-3 py-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            {!typing && canReply && lastMessage?.sender === "assistant" && lastMessage.suggestions && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {lastMessage.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleQuickAction(suggestion)}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-brand-500/10 hover:text-brand-500 hover:border-brand-500/30"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input / closed state */}
          {ticket && !canReply ? (
            <div className="border-t border-line bg-surface px-3 py-3 text-center">
              <p className="text-xs text-fg-subtle">This conversation has ended.</p>
              <button
                onClick={handleStartNew}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Start a new conversation
              </button>
            </div>
          ) : (
            <div className="border-t border-line bg-surface px-3 py-2">
              {ticket && ticketError && (
                <p className="mb-1.5 text-center text-[11px] font-medium text-red-500">{ticketError}</p>
              )}
              <div className="flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about orders, returns..."
                  disabled={!ticket}
                  className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || typing || !ticket}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all",
                    input.trim() && !typing && ticket
                      ? "bg-brand-500 text-white hover:bg-brand-600"
                      : "bg-line text-fg-subtle"
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-center text-[9px] text-fg-subtle">
                Powered by Green Basket AI
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ChatBubble({ message }: { message: TicketMessage }) {
  const isUser = message.sender === "buyer";
  const isSystem = message.sender === "system";
  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-lg bg-raised px-3 py-1.5 text-center text-xs text-fg-subtle">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex items-start gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        isUser ? "bg-fg/10" : "bg-brand-500/10"
      )}>
        {isUser ? <User className="h-3.5 w-3.5 text-fg" /> : <Bot className="h-3.5 w-3.5 text-brand-500" />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed",
        isUser ? "rounded-tr-none bg-brand-500 text-white" : "rounded-tl-none bg-raised text-fg"
      )}>
        {message.text}
      </div>
    </div>
  );
}
