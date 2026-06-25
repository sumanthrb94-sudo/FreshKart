"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase/client";
import { AuthProvider } from "./AuthProvider";
import { CartProvider } from "./CartProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Initialize Firebase Analytics on the client when configured (no-op otherwise).
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}
