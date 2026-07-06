"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase/client";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "./AuthProvider";
import { CartProvider } from "./CartProvider";
import { ThemeProvider } from "./ThemeProvider";
import { AiChatAgent } from "@/components/AiChatAgent";
import { ToastContainer } from "@/components/ToastContainer";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            {children}
            <AiChatAgent />
            <ToastContainer />
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
