"use client";

/** Shared Web Audio chime engine for background alert sounds (new order, new
 *  return, cancellation, etc).
 *
 *  Browsers start every `new AudioContext()` in a "suspended" state until
 *  the page has seen a user gesture, and silently produce no sound while
 *  suspended — no error, the oscillators just never become audible. Alerts
 *  triggered by a background Firestore listener (not a click) can fire
 *  before any gesture has happened, so a fresh context per chime call can
 *  end up permanently mute for that tab. Keeping ONE context alive for the
 *  whole tab and re-attempting `resume()` on every play call (plus once on
 *  the tab's very first pointerdown/keydown) means a chime that was
 *  swallowed on page load starts working the moment the admin/buyer clicks
 *  anywhere. */

let sharedCtx: AudioContext | null = null;
let unlockRegistered = false;

function AudioCtxCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

function getAlertAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedCtx) {
    const Ctor = AudioCtxCtor();
    if (!Ctor) return null;
    sharedCtx = new Ctor();
  }
  if (sharedCtx.state === "suspended") {
    sharedCtx.resume().catch(() => {});
    if (!unlockRegistered) {
      unlockRegistered = true;
      const unlock = () => sharedCtx?.resume().catch(() => {});
      window.addEventListener("pointerdown", unlock, { passive: true });
      window.addEventListener("keydown", unlock);
    }
  }
  return sharedCtx;
}

export interface ChimeNote {
  freq: number;
  /** Seconds after the chime starts that this note begins. */
  startOffset: number;
  /** Note length in seconds. */
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

/** Play a short sequence of tones. Safe to call from anywhere (including a
 *  background listener callback with no user gesture) — it just may not be
 *  audible until the tab has been interacted with once, same as any other
 *  autoplay-gated audio. */
export function playChime(notes: ChimeNote[]) {
  try {
    const ctx = getAlertAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    notes.forEach(({ freq, startOffset, duration, type = "sine", gain = 0.12 }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      g.gain.setValueAtTime(gain, now + startOffset);
      g.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    });
  } catch {
    // Audio not supported — silently ignore
  }
}
