"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  subscribeInAppNotifications,
  setNotificationUser,
  getUnreadCount,
  markInAppAsRead,
  markAllInAppAsRead,
  deleteInAppNotification,
  clearAllInAppNotifications,
  notifyOrderPacked,
  notifyOrderShipped,
  notifyOrderDelivered,
  notifyReturnApproved,
  notifyReturnRejected,
  notifyReturnRefunded,
} from "@/lib/in-app-notifications";
import type { InAppNotification } from "@/lib/in-app-notifications";
import type { Order, OrderStatus } from "@/lib/types";
import type { ReturnRequest, ReturnStatus } from "@/lib/returns";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { playOrderUpdateChime, playReturnUpdateChime } from "@/lib/buyer-alert-sounds";

interface NotificationContextValue {
  notifications: InAppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
  deleteNotification: () => {},
  clearAll: () => {},
});

/** Real-time order/return status alerts for buyers: watches their own orders
 *  and returns for admin-driven progress (packed/shipped/delivered,
 *  approved/rejected/refunded) and raises an in-app notification + chime the
 *  moment it happens — these transitions never originate from the buyer's
 *  own client, so there's no risk of double-firing against the immediate,
 *  self-triggered notifications already sent right after checkout/cancel/
 *  return-request actions elsewhere. Skips CONFIRMED/CANCELLED and REQUESTED
 *  for the same reason. */
function useBuyerStatusAlerts() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const orderStatusRef = useRef<Map<string, OrderStatus> | null>(null);
  const returnStatusRef = useRef<Map<string, ReturnStatus> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isAdmin || !user) return;
    if (typeof api.subscribeOrders !== "function") return;

    orderStatusRef.current = null;
    const unsubscribe = api.subscribeOrders(user.id, (orders: Order[]) => {
      const prev = orderStatusRef.current;
      if (!prev) {
        orderStatusRef.current = new Map(orders.map((o) => [o.id, o.status]));
        return;
      }
      for (const order of orders) {
        const prevStatus = prev.get(order.id);
        if (prevStatus === order.status) continue;
        if (order.status === "PACKED") {
          notifyOrderPacked(order.orderNumber, order.id);
          playOrderUpdateChime();
        } else if (order.status === "SHIPPED") {
          notifyOrderShipped(order.orderNumber, order.id);
          playOrderUpdateChime();
        } else if (order.status === "DELIVERED") {
          notifyOrderDelivered(order.orderNumber, order.id);
          playOrderUpdateChime();
        }
      }
      orderStatusRef.current = new Map(orders.map((o) => [o.id, o.status]));
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAdmin, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || isAdmin || !user) return;
    if (typeof api.subscribeReturns !== "function") return;

    returnStatusRef.current = null;
    const unsubscribe = api.subscribeReturns(user.id, (returns: ReturnRequest[]) => {
      const prev = returnStatusRef.current;
      if (!prev) {
        returnStatusRef.current = new Map(returns.map((r) => [r.id, r.status]));
        return;
      }
      for (const ret of returns) {
        const prevStatus = prev.get(ret.id);
        if (prevStatus === ret.status) continue;
        if (ret.status === "APPROVED") {
          notifyReturnApproved(ret.id);
          playReturnUpdateChime();
        } else if (ret.status === "REJECTED") {
          notifyReturnRejected(ret.id);
          playReturnUpdateChime();
        } else if (ret.status === "REFUNDED") {
          notifyReturnRefunded(ret.id, ret.totalRefund);
          playReturnUpdateChime();
        }
      }
      returnStatusRef.current = new Map(returns.map((r) => [r.id, r.status]));
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAdmin, user?.id]);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    return subscribeInAppNotifications(setNotifications);
  }, []);

  useEffect(() => {
    setNotificationUser(user?.id ?? null);
  }, [user?.id]);

  useBuyerStatusAlerts();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback((id: string) => {
    markInAppAsRead(id);
  }, []);

  const markAllAsRead = useCallback(() => {
    markAllInAppAsRead();
  }, []);

  const deleteNotification = useCallback((id: string) => {
    deleteInAppNotification(id);
  }, []);

  const clearAll = useCallback(() => {
    clearAllInAppNotifications();
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}
