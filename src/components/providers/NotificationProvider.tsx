"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  subscribeInAppNotifications,
  getUnreadCount,
  markInAppAsRead,
  markAllInAppAsRead,
  deleteInAppNotification,
  clearAllInAppNotifications,
} from "@/lib/in-app-notifications";
import type { InAppNotification } from "@/lib/in-app-notifications";

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

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  useEffect(() => {
    return subscribeInAppNotifications(setNotifications);
  }, []);

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
