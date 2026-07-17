"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Same drift language as the sign-in hero (OnboardingScreen's FLOATERS +
// globals.css's driftX/driftY keyframes) — a smaller, quieter set so it
// reads as ambient texture behind the greeting rather than competing with it.
const FLOATERS = [
  { e: "🍅", size: "text-xl", dx: "8s", dy: "6s", ox: "0s", oy: "-2s" },
  { e: "🥕", size: "text-lg", dx: "7s", dy: "9s", ox: "-3s", oy: "-1s" },
  { e: "🫑", size: "text-lg", dx: "9s", dy: "7s", ox: "-5s", oy: "-4s" },
];

/**
 * Gradient greeting hero for the shop screen — the sign-in screen's
 * treatment (brand gradient, drifting produce, rounded sheet beneath)
 * carried into the home screen, resolving into the catalog below it.
 */
export function ShopHero({
  greeting,
  itemCount,
  search,
  onSearchChange,
  searchPlaceholder,
  liveStatusLabel,
}: {
  greeting: string;
  itemCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /** e.g. "Live prices · 7:02 AM" once published; omitted while pending. */
  liveStatusLabel?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-b-[28px] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-5 pb-14 pt-4 text-white lg:rounded-b-3xl lg:px-8">
      {/* Decorative orbs, matching the sign-in hero */}
      <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -left-10 top-20 h-36 w-36 rounded-full bg-brand-300/20 blur-2xl" />

      {FLOATERS.map((f, i) => (
        <span
          key={i}
          className={cn("pointer-events-none absolute opacity-40 drop-shadow motion-reduce:hidden", f.size)}
          style={{
            left: `${18 + i * 28}%`,
            top: `${8 + (i % 2) * 10}%`,
            animationName: "driftX, driftY",
            animationDuration: `${f.dx}, ${f.dy}`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            animationDelay: `${f.ox}, ${f.oy}`,
          }}
        >
          {f.e}
        </span>
      ))}

      {liveStatusLabel && (
        <div className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-2 pr-3 text-[11px] font-bold uppercase tracking-wide">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-400" />
          {liveStatusLabel}
        </div>
      )}

      <h1 className="relative z-10 mt-3 text-[26px] font-extrabold leading-tight tracking-tight [text-wrap:balance]">
        {greeting}
      </h1>
      <p className="relative z-10 mt-1 max-w-[30ch] text-sm text-white/80">
        {itemCount > 0 ? `${itemCount} items in season today. ` : ""}
        Fresh wholesale produce delivered to your business.
      </p>

      <label className="relative z-10 mt-4 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-3 shadow-lg">
        <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>

      <div className="fc-scroll relative z-10 mt-3.5 flex gap-2 overflow-x-auto pb-0.5">
        <StatChip>🚚 Free delivery over ₹3,000</StatChip>
        <StatChip>⏱ Next-day delivery</StatChip>
        <StatChip>🌾 Mandi-direct pricing</StatChip>
      </div>
    </div>
  );
}

function StatChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold">
      {children}
    </span>
  );
}
