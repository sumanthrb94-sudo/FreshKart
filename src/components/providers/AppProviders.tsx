"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase/client";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "./AuthProvider";
import { CartProvider } from "./CartProvider";
import { AiChatAgent } from "@/components/AiChatAgent";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          {children}
          <AiChatAgent />
        </CartProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
