"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase/client";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "./AuthProvider";
import { CartProvider } from "./CartProvider";
import { ThemeProvider } from "./ThemeProvider";
import { OrderTrackerProvider } from "./OrderTrackerProvider";
import { NotificationProvider } from "./NotificationProvider";
import { AiChatAgent } from "@/components/AiChatAgent";
import { ToastContainer } from "@/components/ToastContainer";
import { OrderTracker } from "@/components/OrderTracker";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <OrderTrackerProvider>
              <NotificationProvider>
                {children}
                <AiChatAgent />
                <ToastContainer />
                <OrderTracker />
              </NotificationProvider>
            </OrderTrackerProvider>
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
