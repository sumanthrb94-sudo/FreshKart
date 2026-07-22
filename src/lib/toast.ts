/** Persistent Toast Notification System for Green Basket
 *  Provides non-blocking toast messages across the entire app.
 *  Supports success, error, warning, info types with auto-dismiss.
 */

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration: number; // ms, 0 = persistent
  createdAt: number;
}

let listeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

export function subscribeToasts(callback: (toasts: Toast[]) => void) {
  listeners.push(callback);
  callback([...toasts]);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function getToasts(): Toast[] {
  return [...toasts];
}

export function showToast(
  type: ToastType,
  title: string,
  message: string,
  duration = 4000
): Toast {
  const toast: Toast = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    title,
    message,
    duration,
    createdAt: Date.now(),
  };
  toasts = [...toasts, toast];
  notify();

  if (duration > 0) {
    setTimeout(() => dismissToast(toast.id), duration);
  }
  return toast;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function dismissAllToasts() {
  toasts = [];
  notify();
}

// Convenience methods
export const toast = {
  success: (title: string, message: string, duration?: number) =>
    showToast("success", title, message, duration),
  error: (title: string, message: string, duration?: number) =>
    showToast("error", title, message, duration),
  warning: (title: string, message: string, duration?: number) =>
    showToast("warning", title, message, duration),
  info: (title: string, message: string, duration?: number) =>
    showToast("info", title, message, duration),
};

// Play notification sound
export function playNotificationSound(type: ToastType = "info") {
  // Lazy import avoids pulling the Web Audio module into every bundle that
  // only needs the toast queue itself (server components, tests, etc).
  import("@/lib/audio-chime").then(({ playChime }) => {
    const frequencies: Record<ToastType, number> = {
      success: 523, // C5
      error: 200,   // Low
      warning: 400, // Mid
      info: 660,    // E5
    };
    playChime([{ freq: frequencies[type] || 523, startOffset: 0, duration: 0.3, gain: 0.15 }]);
  }).catch(() => {});
}
