"use client";

import { playChime } from "@/lib/audio-chime";

/** Buyer-side order/return status-update chimes. Distinct from the admin
 *  new-order/new-return/cancellation tones in AdminShell.tsx so the two
 *  roles don't sound identical. */

/** Order status update: bright two-note ping (E5 → B5). */
export function playOrderUpdateChime() {
  playChime([
    { freq: 659.25, startOffset: 0, duration: 0.35 },
    { freq: 987.77, startOffset: 0.1, duration: 0.35 },
  ]);
}

/** Return status update: softer single tone (G5). */
export function playReturnUpdateChime() {
  playChime([{ freq: 783.99, startOffset: 0, duration: 0.5 }]);
}
