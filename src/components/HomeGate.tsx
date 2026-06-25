"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { ShopScreen } from "@/components/buyer/ShopScreen";
import { AppShell } from "@/components/layout/AppShell";
import { FullScreenLoader } from "@/components/ui/Spinner";

/**
 * The "/" experience. Auth is resolved IN PLACE so the URL stays "/" — no
 * bounce to /onboarding: while the session settles we show a loader, a
 * signed-out visitor gets the sign-in / onboarding flow right here, and a
 * signed-in user gets the shop.
 */
export function HomeGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AppShell>
        <FullScreenLoader />
      </AppShell>
    );
  }

  return user ? <ShopScreen /> : <OnboardingScreen />;
}
