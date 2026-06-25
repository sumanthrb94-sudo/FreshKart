"use client";

import { cn } from "@/lib/utils";

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-brand-500 text-white"
          : "bg-surface text-fg-muted border border-line hover:border-fg-subtle"
      )}
    >
      {children}
    </button>
  );
}
