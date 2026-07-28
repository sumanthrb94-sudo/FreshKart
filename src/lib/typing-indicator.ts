/**
 * "X is typing…" presence for the return/support chat threads — the same
 * self-expiring heartbeat pattern industrial chat systems (Slack, WhatsApp
 * Web, Intercom) use instead of an explicit start/stop signal:
 *
 *   - The typer's client writes a fresh timestamp to `<sender>TypingAt` at
 *     most once every TYPING_HEARTBEAT_MS while they're actively composing.
 *   - Any reader treats the signal as "typing" only while that timestamp is
 *     younger than TYPING_TTL_MS, re-checked on a tick — never via an
 *     explicit "stopped typing" write.
 *
 * This is deliberately more robust than a stop/clear write: a closed tab, a
 * crashed browser, or a dropped network request all still self-heal within
 * one TTL window, because there is nothing to fail to send. A stuck "is
 * typing…" forever is a much worse bug than one that lingers 3 extra seconds.
 */

/** How long a "typing" heartbeat is considered fresh before it's treated as
 *  stale (no snapshot ever tells us the other side explicitly stopped). */
export const TYPING_TTL_MS = 4000;

/** Minimum gap between heartbeat writes while a user is actively typing —
 *  throttles keystroke-driven writes down to one every ~2s. */
export const TYPING_HEARTBEAT_MS = 2000;

/** True while `lastTypingAt` (an ISO timestamp) is fresher than TYPING_TTL_MS.
 *  `now` is injectable for tests; callers re-evaluate this on a tick since
 *  staleness changes with the clock, not just on a new value arriving. */
export function isTypingActive(lastTypingAt: string | undefined | null, now: number = Date.now()): boolean {
  if (!lastTypingAt) return false;
  const ts = new Date(lastTypingAt).getTime();
  if (Number.isNaN(ts)) return false;
  const age = now - ts;
  // Symmetric tolerance: a slightly-ahead clock on the typer's device (common
  // across two different phones/laptops) shouldn't make a genuinely fresh
  // heartbeat read as stale. A timestamp further in the future than one full
  // TTL window is almost certainly bad data, not skew — treat it as inactive
  // rather than let it pin the indicator on indefinitely.
  return age < TYPING_TTL_MS && age > -TYPING_TTL_MS;
}
