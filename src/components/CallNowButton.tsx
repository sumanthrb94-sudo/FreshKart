"use client";

import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface CallNowButtonProps {
  phone?: string;
  label?: string;
  variant?: "fab" | "inline" | "banner";
  className?: string;
}

const DEFAULT_PHONE = "9800000000";

/** Click-to-call customer service button.
 *  Works on mobile (opens dialer) and desktop (opens calling app).
 */
export function CallNowButton({
  phone = DEFAULT_PHONE,
  label = "Call Now",
  variant = "fab",
  className,
}: CallNowButtonProps) {
  const telUrl = `tel:+91${phone}`;

  if (variant === "fab") {
    return (
      <a
        href={telUrl}
        className={cn(
          "fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-110 active:scale-95",
          className
        )}
        aria-label={`Call customer service at ${phone}`}
      >
        <Phone className="h-6 w-6" strokeWidth={2.5} />
      </a>
    );
  }

  if (variant === "banner") {
    return (
      <a
        href={telUrl}
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-600",
          className
        )}
      >
        <Phone className="h-4 w-4" strokeWidth={2.5} />
        {label} — {phone}
      </a>
    );
  }

  // inline
  return (
    <a
      href={telUrl}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-500 transition-colors hover:bg-emerald-500/20",
        className
      )}
    >
      <Phone className="h-3 w-3" strokeWidth={2.5} />
      {label}
    </a>
  );
}
