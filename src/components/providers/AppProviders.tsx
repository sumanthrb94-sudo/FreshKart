"use client";

import { AuthProvider } from "./AuthProvider";
import { CartProvider } from "./CartProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}
