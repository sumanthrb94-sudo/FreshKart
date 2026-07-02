"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Phone, Bot, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createChatSession,
  processUserMessage,
  QUICK_ACTIONS,
} from "@/lib/ai-chat";
import type { ChatSession, ChatMessage } from "@/lib/ai-chat";

export function AiChatAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<ChatSession>(createChatSession);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages, typing]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

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

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 md:bottom-8",
          isOpen
            ? "bg-fg text-surface rotate-90 scale-90"
            : "bg-brand-500 text-white hover:bg-brand-600 hover:scale-105"
        )}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
      {isOpen && (
        <div className="fixed bottom-36 right-4 z-50 flex h-[500px] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl md:bottom-24">
          <div className="flex items-center gap-3 border-b border-line bg-brand-500 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">FreshKart Assistant</p>
              <p className="flex items-center gap-1 text-[11px] text-white/80">
                <Sparkles className="h-3 w-3" /> AI Powered
              </p>
            </div>
            <a
              href="tel:+919876543210"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
              title="Call support"
            >
              <Phone className="h-4 w-4 text-white" />
            </a>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {session.messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            {typing && (
              <div className="flex items-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/10">
                  <Bot className="h-4 w-4 text-brand-500" />
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
                      className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-brand-500/10 hover:text-brand-500 hover:border-brand-500/30"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            <div ref={messagesEndRef} />
          </div>
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
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
                  input.trim() && !typing
                    ? "bg-brand-500 text-white hover:bg-brand-600"
                    : "bg-line text-fg-subtle"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-fg-subtle">
              Powered by FreshKart AI &bull; For urgent help, tap the phone icon
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
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-fg/10" : "bg-brand-500/10"
        )}
      >
        {isUser ? <User className="h-4 w-4 text-fg" /> : <Bot className="h-4 w-4 text-brand-500" />}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-tr-none bg-brand-500 text-white"
            : "rounded-tl-none bg-raised text-fg"
        )}
      >
        {message.text}
      </div>
    </div>
  );
}
