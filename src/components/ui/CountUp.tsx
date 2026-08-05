"use client";

import { useEffect, useRef } from "react";

/**
 * A number that counts up to its value.
 *
 * This is the one thing in the app that CSS genuinely cannot do. Transitions
 * and keyframes interpolate style properties; nothing interpolates the text
 * INSIDE an element. anime.js animates plain JavaScript objects, so the value
 * is tweened and written to the node on each frame — no React state, so no
 * re-render per frame either.
 *
 * Used where a number is the point of the screen: the total on the order
 * confirmation, and the admin's daily figures. Deliberately not used on prices
 * in the catalogue — a shop owner comparing rates needs the number to be
 * readable instantly, not to arrive.
 *
 * Loaded on demand. anime.js is worth about 15 KB and only two screens use it,
 * so it has no business in the shop screen's bundle. Until it arrives the
 * final value is already rendered, so the number is correct from the first
 * paint and simply does not animate on a slow connection — which is the right
 * failure, since the value matters and the motion does not.
 */
export function CountUp({
  value,
  /** Rendered around the number, e.g. "Rs. " and "". */
  prefix = "",
  suffix = "",
  durationMs = 900,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const format = (n: number) => `${prefix}${Math.round(n).toLocaleString("en-IN")}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") return;

    // Honour the OS setting: land on the final number without the climb.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = format(value);
      return;
    }

    let cancelled = false;
    let scope: { revert: () => void } | null = null;

    import("animejs")
      .then(({ animate, createScope }) => {
        if (cancelled || !ref.current) return;
        // createScope + revert is anime's React contract: everything started
        // inside is torn down together, so a fast re-render or an unmount
        // mid-count cannot leave a timer writing to a detached node.
        scope = createScope({ root: ref }).add(() => {
          const counter = { n: 0 };
          animate(counter, {
            n: value,
            duration: durationMs,
            ease: "outExpo",
            onUpdate: () => {
              if (ref.current) ref.current.textContent = format(counter.n);
            },
          });
        }) as unknown as { revert: () => void };
      })
      .catch(() => {
        // anime failed to load — the value is already on screen. Nothing to do.
      });

    return () => {
      cancelled = true;
      scope?.revert();
      // `el` captured at effect time — reading ref.current in cleanup would
      // see whatever the node is by then, which may be a different one.
      el.textContent = format(value);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prefix, suffix, durationMs]);

  // Server-rendered and pre-hydration content is the FINAL value, not zero, so
  // the figure is never wrong and never missing.
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
