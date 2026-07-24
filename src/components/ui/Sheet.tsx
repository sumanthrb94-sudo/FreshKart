"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on mobile (brief §3.7): full-viewport scrim, content slides up
 * with rounded top corners, max-height 88vh, scrollable body, sticky header
 * with a title + close. At the `lg` breakpoint this becomes a centered modal
 * dialog instead — rounded on all corners, capped width — matching how
 * desktop SaaS products (Stripe, Linear, Shopify admin) present the same
 * "focused task" surface a mobile bottom sheet is for, rather than a bottom
 * sheet stretched edge-to-edge across a 1440px viewport.
 */
export function Sheet({
  open,
  onClose,
  title,
  scrimClassName,
  headerAccessory,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  scrimClassName?: string;
  headerAccessory?: React.ReactNode;
  children: React.ReactNode;
  /** Desktop modal width: md (~32rem, forms) or lg (~40rem, detail views with more content). */
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center lg:left-[var(--sidebar-width)] lg:items-center lg:p-6">
      <div
        className={cn("absolute inset-0 animate-fade bg-black/40", scrimClassName)}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative mt-auto flex max-h-[88vh] w-full max-w-app animate-rise flex-col rounded-t-2xl bg-canvas shadow-xl",
          "lg:mt-0 lg:max-h-[85vh] lg:animate-pop lg:rounded-2xl",
          size === "lg" ? "lg:max-w-2xl" : "lg:max-w-lg"
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-2xl border-b border-line bg-surface px-5 py-4">
          <div className="flex items-center gap-2 text-lg font-bold text-fg">
            {title}
          </div>
          <div className="flex items-center gap-2">
            {headerAccessory}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-raised"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="fc-scroll flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
