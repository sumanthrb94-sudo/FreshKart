"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  ShoppingBag,
  Package,
  Truck,
  CheckCircle2,
  Ban,
  RotateCcw,
  XCircle,
  IndianRupee,
  Tag,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/components/providers/NotificationProvider";
import type { InAppNotification, InAppNotificationType } from "@/lib/in-app-notifications";

const TYPE_ICONS: Record<InAppNotificationType, typeof ShoppingBag> = {
  order_confirmed: ShoppingBag,
  order_packed: Package,
  order_delivered: CheckCircle2,
  order_cancelled: Ban,
  return_requested: RotateCcw,
  return_approved: RotateCcw,
  return_rejected: XCircle,
  return_refunded: IndianRupee,
  coupon_applied: Tag,
  payment_reminder: AlertTriangle,
};

const TYPE_COLORS: Record<InAppNotificationType, string> = {
  order_confirmed: "bg-amber-500/10 text-amber-500",
  order_packed: "bg-blue-500/10 text-blue-500",
  order_delivered: "bg-emerald-500/10 text-emerald-500",
  order_cancelled: "bg-red-500/10 text-red-500",
  return_requested: "bg-amber-500/10 text-amber-500",
  return_approved: "bg-emerald-500/10 text-emerald-500",
  return_rejected: "bg-red-500/10 text-red-500",
  return_refunded: "bg-brand-500/10 text-brand-500",
  coupon_applied: "bg-accent/10 text-accent",
  payment_reminder: "bg-amber-500/10 text-amber-500",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationItem({
  notif,
  onRead,
  onDelete,
}: {
  notif: InAppNotification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const Icon = TYPE_ICONS[notif.type];
  const colorClass = TYPE_COLORS[notif.type];

  return (
    <div
      className={cn(
        "group relative flex gap-3 rounded-xl border p-3 transition-colors",
        notif.read
          ? "border-line bg-surface opacity-70"
          : "border-brand-500/20 bg-brand-500/5"
      )}
    >
      {/* Icon */}
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", colorClass)}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => {
          if (!notif.read) onRead(notif.id);
          if (notif.actionUrl) router.push(notif.actionUrl);
        }}
      >
        <p className={cn("text-sm", notif.read ? "font-medium text-fg-muted" : "font-bold text-fg")}>
          {notif.title}
        </p>
        <p className="mt-0.5 text-xs text-fg-subtle line-clamp-2">{notif.message}</p>
        <p className="mt-1 text-[10px] text-fg-subtle">{timeAgo(notif.createdAt)}</p>
      </button>

      {/* Unread dot */}
      {!notif.read && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
      )}

      {/* Delete button (visible on hover) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(notif.id);
        }}
        className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        drawerRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  return (
    <>
      {/* Bell button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors",
          open
            ? "bg-brand-500/10 text-brand-500"
            : "bg-raised text-fg-muted hover:bg-line hover:text-fg"
        )}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-surface">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/30" onClick={() => setOpen(false)} />
      )}

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed right-0 top-0 z-[61] flex h-full w-full max-w-[380px] flex-col border-l border-line bg-surface shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-fg">Notifications</h2>
            <p className="text-xs text-fg-subtle">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-500/10"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-fg-subtle hover:bg-raised"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Bell className="h-12 w-12 text-fg-subtle" />
              <p className="mt-3 text-sm font-bold text-fg">No notifications yet</p>
              <p className="text-xs text-fg-subtle">
                We will notify you about order updates here.
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notif={notif}
                onRead={markAsRead}
                onDelete={deleteNotification}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t border-line px-4 py-3">
            <button
              type="button"
              onClick={clearAll}
              className="w-full rounded-lg border border-line py-2 text-xs font-semibold text-fg-subtle hover:bg-raised"
            >
              Clear all notifications
            </button>
          </div>
        )}
      </div>
    </>
  );
}
