"use client";

import { useState, useEffect, useRef } from "react";
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribeToasts, dismissToast, playNotificationSound } from "@/lib/toast";
import type { Toast } from "@/lib/toast";

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

// Solid surface + a colored left border for the status accent — toasts float
// over arbitrary page content, so (unlike an in-card badge) their background
// must be fully opaque or whatever's behind them shows/blurs through.
const STYLES = {
  success: "bg-surface border-l-4 border-emerald-500 text-emerald-700",
  error: "bg-surface border-l-4 border-red-500 text-red-700",
  warning: "bg-surface border-l-4 border-amber-500 text-amber-700",
  info: "bg-surface border-l-4 border-blue-500 text-blue-700",
};

const ICON_COLORS = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

function ToastItem({ toast: t }: { toast: Toast }) {
  const Icon = ICONS[t.type];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg transition-all",
        STYLES[t.type]
      )}
      role="alert"
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_COLORS[t.type])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t.title}</p>
        {t.message && <p className="text-xs opacity-80">{t.message}</p>}
      </div>
      <button
        onClick={() => dismissToast(t.id)}
        className="shrink-0 rounded-md p-0.5 opacity-60 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    return subscribeToasts((newToasts) => {
      if (newToasts.length > prevLengthRef.current) {
        const latest = newToasts[newToasts.length - 1];
        if (latest) playNotificationSound(latest.type);
      }
      prevLengthRef.current = newToasts.length;
      setToasts(newToasts);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-3 z-[60] flex w-[calc(100vw-1.5rem)] max-w-[360px] flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
