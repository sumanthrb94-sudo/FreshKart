import { cn } from "@/lib/utils";

/** Three animated dots — the universal "someone is composing" glyph (iMessage,
 *  WhatsApp, Slack). Shared by every chat surface so the motion is identical
 *  everywhere: bot "thinking", a human admin typing, or a buyer typing. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-1", className)}>
      <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "0ms" }} />
      <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "150ms" }} />
      <span className="h-2 w-2 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

/** Full "<label> is typing…" chat bubble — the avatar + rounded bubble shell
 *  matches the message bubbles either side of it in the thread, so it reads
 *  as a natural in-progress message rather than a separate status line. */
export function TypingBubble({
  label,
  align = "start",
  className,
}: {
  /** e.g. "Support is typing…" / "Buyer is typing…" */
  label: string;
  /** Which side of the thread this bubble sits on — mirrors the sender's
   *  message alignment so it appears exactly where their next message will. */
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        align === "end" ? "flex-row-reverse" : "flex-row",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2",
          align === "end" ? "rounded-tr-none bg-brand-500/15" : "rounded-tl-none bg-raised"
        )}
      >
        <TypingDots />
        <span className="text-[11px] font-medium text-fg-subtle">{label}</span>
      </div>
    </div>
  );
}
