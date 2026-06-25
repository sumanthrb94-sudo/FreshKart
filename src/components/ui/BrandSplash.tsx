"use client";

import { useEffect, useState } from "react";

type Seg = { t: string; em?: boolean };

// Zomato-style witty loading lines — gray with a couple of words emphasized.
const TAGLINES: Seg[][] = [
  [{ t: "Big " }, { t: "goals need", em: true }, { t: " small snack breaks." }],
  [{ t: "Stacking the " }, { t: "freshest crates", em: true }, { t: " for you…" }],
  [{ t: "Locking in " }, { t: "today's best", em: true }, { t: " mandi rates." }],
  [{ t: "Good produce " }, { t: "is worth", em: true }, { t: " the wait." }],
  [{ t: "Picking the " }, { t: "crispiest greens", em: true }, { t: " in town…" }],
];

/**
 * Full-screen brand splash in Zomato's exact palette: a near-black canvas, a
 * coral-red ring spinner and a rotating, witty food tagline. Used for the app
 * boot loader and route transitions.
 */
export function BrandSplash() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % TAGLINES.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-[100dvh] justify-center bg-ink-950">
      <div className="relative flex h-[100dvh] w-full max-w-app flex-col items-center justify-center px-10 text-center">
        {/* Rotating tagline */}
        <p key={i} className="animate-fade text-lg font-medium leading-snug text-gray-500">
          {TAGLINES[i].map((s, idx) => (
            <span key={idx} className={s.em ? "font-bold text-gray-100" : undefined}>
              {s.t}
            </span>
          ))}
        </p>

        {/* Coral-red ring spinner */}
        <div className="mt-7 h-11 w-11 animate-spin rounded-full border-[3px] border-brand-500/20 border-t-brand-500" />

        {/* Subtle wordmark */}
        <div className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-1">
          <p className="text-sm font-extrabold tracking-tight text-gray-200">
            Fresh<span className="text-brand-500">Kart</span>
          </p>
          <p className="text-2xs font-medium text-gray-600">Wholesale B2B · per kg</p>
        </div>
      </div>
    </div>
  );
}
