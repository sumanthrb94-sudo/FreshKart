"use client";

import { useEffect } from "react";
import { LazyMotion, domMax } from "motion/react";
import { initAnalytics } from "@/lib/firebase/client";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "./AuthProvider";
import { CartProvider } from "./CartProvider";
import { ThemeProvider } from "./ThemeProvider";
import { OrderTrackerProvider } from "./OrderTrackerProvider";
import { NotificationProvider } from "./NotificationProvider";
import { ToastContainer } from "@/components/ToastContainer";
import { OrderTracker } from "@/components/OrderTracker";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    // One feature bundle for the whole app, fetched AFTER first paint, with
    // every component using `m.*` rather than `motion.*`. See
    // lib/motion-features.ts — bundling it eagerly cost +41 KB on the shop
    // screen's first load, charged to a buyer on mobile data before they had
    // seen a price. `strict` makes any accidental `motion.*` import — which
    // would drag the whole engine back in — a build-time error.
    <LazyMotion features={domMax} strict>
    <AuthProvider>
      <ThemeProvider>
        <LanguageProvider>
          <CartProvider>
            <OrderTrackerProvider>
              <NotificationProvider>
                {children}
                <ToastContainer />
                <OrderTracker />
              </NotificationProvider>
            </OrderTrackerProvider>
          </CartProvider>
        </LanguageProvider>
      </ThemeProvider>
    </AuthProvider>
    </LazyMotion>
  );
}
