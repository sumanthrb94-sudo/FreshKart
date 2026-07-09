"use client";

import { Sprout } from "lucide-react";
import { useEffect, useState } from "react";

/** Animated FreshKart brand splash for the home page.
 *  Shows a pulsing leaf logo with the brand name.
 */
export function BrandAnimation() {
  const [phase, setPhase] = useState<"enter" | "pulse" | "settle">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("pulse"), 600);
    const t2 = setTimeout(() => setPhase("settle"), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {/* Animated logo container */}
      <div
        className={`relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/30 transition-all duration-700 ${
          phase === "enter"
            ? "scale-0 opacity-0 rotate-[-180deg]"
            : phase === "pulse"
              ? "scale-110 opacity-100 rotate-0"
              : "scale-100 opacity-100 rotate-0"
        }`}
      >
        <Sprout
          className={`h-10 w-10 text-white transition-transform duration-500 ${
            phase === "pulse" ? "scale-110" : "scale-100"
          }`}
          strokeWidth={2}
        />
        {/* Ripple rings */}
        <span
          className={`absolute inset-0 rounded-2xl border-2 border-brand-500/30 transition-all duration-1000 ${
            phase === "pulse" ? "scale-150 opacity-0" : "scale-100 opacity-0"
          }`}
        />
        <span
          className={`absolute inset-0 rounded-2xl border-2 border-brand-500/20 transition-all duration-1000 delay-200 ${
            phase === "pulse" ? "scale-175 opacity-0" : "scale-100 opacity-0"
          }`}
        />
      </div>

      {/* Brand name */}
      <h1
        className={`mt-4 text-3xl font-extrabold tracking-tight text-fg transition-all duration-700 delay-300 ${
          phase === "enter"
            ? "translate-y-4 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        FreshKart
      </h1>

      {/* Tagline */}
      <p
        className={`mt-1 text-sm font-semibold text-fg-subtle transition-all duration-700 delay-500 ${
          phase === "enter" || phase === "pulse"
            ? "translate-y-2 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        Wholesale B2B · Fresh Produce · Per Kg
      </p>

      {/* Live indicator */}
      <div
        className={`mt-3 flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 transition-all duration-700 delay-700 ${
          phase === "settle" ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-bold text-emerald-500">Live</span>
      </div>
    </div>
  );
}
