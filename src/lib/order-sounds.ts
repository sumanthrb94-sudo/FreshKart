"use client";

import { useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

/** Admin Order Notification Sound System
 *  Polls for new orders and plays a sound when a new order arrives.
 *  Uses Web Audio API for a pleasant chime (no external files needed).
 */

let lastOrderCount = 0;
let isPlaying = false;

/** Play a pleasant notification chime using Web Audio API */
function playOrderChime() {
  if (isPlaying) return;
  isPlaying = true;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // First note - pleasant major third chord
    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
    const now = ctx.currentTime;

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.05 + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + i * 0.1);

      osc.start(now);
      osc.stop(now + 1);
    });

    // Second arpeggio note
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = "sine";
    osc2.frequency.value = 1046.5; // C6
    gain2.gain.setValueAtTime(0, now + 0.2);
    gain2.gain.linearRampToValueAtTime(0.08, now + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.9);

    setTimeout(() => {
      isPlaying = false;
      ctx.close().catch(() => {});
    }, 1200);
  } catch {
    isPlaying = false;
  }
}

/** Hook to monitor new orders and play sound */
export function useOrderNotificationSound(enabled: boolean = true, intervalMs: number = 15000) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkForNewOrders = useCallback(async () => {
    if (!enabled) return;
    try {
      // Use api.listOrders() - the correct DataSource method
      const orders = await api.listOrders();
      const currentCount = orders.length;
      if (lastOrderCount > 0 && currentCount > lastOrderCount) {
        const newCount = currentCount - lastOrderCount;
        playOrderChime();
        // Show toast via global toast system
        import("@/lib/toast").then(({ toast }) => {
          toast.success(
            newCount === 1 ? "New Order!" : `${newCount} New Orders!`,
            "Tap to view orders",
            5000
          );
        }).catch(() => {});
      }
      lastOrderCount = currentCount;
    } catch {
      // Silently fail - don't break UI on network errors
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Initial count
    api.listOrders().then((orders) => {
      lastOrderCount = orders.length;
    }).catch(() => {});

    intervalRef.current = setInterval(checkForNewOrders, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, intervalMs, checkForNewOrders]);
}

/** Manual trigger to play the order sound (for testing) */
export function playOrderSound() {
  playOrderChime();
}
