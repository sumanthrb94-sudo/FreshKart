"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { ShopScreen } from "@/components/buyer/ShopScreen";
import { BrandSplash } from "@/components/ui/BrandSplash";
import { authGateView } from "@/lib/auth-gate";

/**
 * The "/" experience. Auth is resolved IN PLACE so the URL stays "/" — no
 * bounce to /onboarding: while the session settles we show a loader, a
 * signed-out visitor gets the sign-in / onboarding flow right here, and a
 * signed-in user gets the shop.
 */
export function HomeGate() {
  const { user, loading, profileStalled, retryProfile } = useAuth();

  // See lib/auth-gate.ts for why this is a table and not a chain of guards.
  // In short: an account signed in with no profile is a REAL state, not a
  // pending one, and must reach onboarding rather than a splash.
  switch (authGateView({ loading, profileStalled, hasProfile: !!user })) {
    case "loading":
      return <BrandSplash />;
    case "stalled":
      return <BrandSplash stalled onRetry={retryProfile} />;
    case "onboarding":
      return <OnboardingScreen />;
    case "app":
      return <ShopScreen />;
  }
}
