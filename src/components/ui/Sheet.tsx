"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet (brief §3.7): full-viewport scrim, content slides up with
 * rounded top corners, max-height 88vh, scrollable body, sticky header with a
 * title + close. Content is constrained to the app column width.
 */
export function Sheet({
  open,
  onClose,
  title,
  scrimClassName,
  headerAccessory,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  scrimClassName?: string;
  headerAccessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center">
      <div
        className={cn("absolute inset-0 animate-fade bg-black/40", scrimClassName)}
        onClick={onClose}
        aria-hidden
      />
      <div className="relative mt-auto flex max-h-[88vh] w-full max-w-app animate-rise flex-col rounded-t-2xl bg-gray-50 shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-2xl border-b border-gray-100 bg-white px-5 py-4">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-900">
            {title}
          </div>
          <div className="flex items-center gap-2">
            {headerAccessory}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
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
