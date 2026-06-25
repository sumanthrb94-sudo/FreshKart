"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase/client";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "./AuthProvider";
import { CartProvider } from "./CartProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Initialize Firebase Analytics on the client when configured (no-op otherwise).
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
