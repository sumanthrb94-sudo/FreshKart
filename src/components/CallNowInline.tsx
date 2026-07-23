"use client";

import { Phone } from "lucide-react";

/** Call Now - Inline version for Orders section
 *  Compact horizontal banner for embedding in pages.
 */
export function CallNowInline() {
  return (
    <a
      href="tel:+917416620691"
      className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 transition-colors hover:bg-emerald-500/10"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Phone className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-fg">Need help with your order?</p>
        <p className="text-xs text-fg-subtle">Call us: +91 74166 20691</p>
      </div>
      <span className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold text-white">
        Call Now
      </span>
    </a>
  );
}

/** Small compact call button for nav/header areas */
export function CallNowCompact() {
  return (
    <a
      href="tel:+917416620691"
      className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600"
    >
      <Phone className="h-3 w-3" />
      <span>Call</span>
    </a>
  );
}
