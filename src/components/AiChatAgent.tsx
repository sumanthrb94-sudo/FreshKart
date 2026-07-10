"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Bot, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { createChatSession, processUserMessage } from "@/lib/ai-chat";
import type { ChatSession, ChatMessage } from "@/lib/ai-chat";

export function AiChatAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<ChatSession>(createChatSession);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages, typing]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Personalize welcome message with user's name when authenticated
  useEffect(() => {
    if (user?.name && session.messages.length === 1 && session.messages[0].role === "assistant") {
      const welcomeMsg = session.messages[0];
      if (!welcomeMsg.text.includes(user.name)) {
        setSession((prev) => ({
          ...prev,
          messages: [
            {
              ...welcomeMsg,
              text: `Hello ${user.name}! I am Green Basket Assistant. I can help you with orders, returns, delivery, payments, and store policies. What can I help you with today?`,
            },
          ],
        }));
      }
    }
  }, [user?.name]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const { updatedSession } = processUserMessage(session, userText);
      setSession(updatedSession);
      setTyping(false);
    }, 600);
  };

  const handleQuickAction = (query: string) => {
    setTyping(true);
    setTimeout(() => {
      const { updatedSession } = processUserMessage(session, query);
      setSession(updatedSession);
      setTyping(false);
    }, 400);
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

  return (
    <>
      {/* Floating Chat Button - always shows MessageCircle */}
      <button
        data-chat-button
        onClick={() => setIsOpen(!isOpen)}
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
          {/* Header - single close button in top-right */}
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
            {session.messages.map((msg) => (
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

            {!typing && session.messages.length > 0 &&
              session.messages[session.messages.length - 1].role === "assistant" &&
              session.messages[session.messages.length - 1].suggestions && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {session.messages[session.messages.length - 1].suggestions!.map((suggestion) => (
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

          {/* Input */}
          <div className="border-t border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about orders, returns..."
                className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || typing}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all",
                  input.trim() && !typing
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
        </div>
      )}
    </>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  if (isSystem) return null;
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
