"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { ShopScreen } from "@/components/buyer/ShopScreen";
import { BrandSplash } from "@/components/ui/BrandSplash";

/**
 * The "/" experience. Auth is resolved IN PLACE so the URL stays "/" — no
 * bounce to /onboarding: while the session settles we show a loader, a
 * signed-out visitor gets the sign-in / onboarding flow right here, and a
 * signed-in user gets the shop.
 */
export function HomeGate() {
  const { user, loading } = useAuth();

  if (loading) return <BrandSplash />;

  return user ? <ShopScreen /> : <OnboardingScreen />;
}
