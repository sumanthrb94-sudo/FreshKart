"use client";

/** Buyer-side order/return status-update chimes — Web Audio API, no external
 *  files needed. Distinct from the admin new-order/new-return tones in
 *  AdminShell.tsx so the two roles don't sound identical. */

function getAudioCtx(): AudioContext | null {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioCtx ? new AudioCtx() : null;
}

/** Order status update: bright two-note ping (E5 → B5). */
export function playOrderUpdateChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [659.25, 987.77].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.12, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.35);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // Audio not supported — silently ignore
  }
}

/** Return status update: softer single tone (G5). */
export function playReturnUpdateChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(783.99, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // Audio not supported — silently ignore
  }
}
