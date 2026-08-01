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
  const { user, loading, firebaseSignedIn } = useAuth();

  if (loading) return <BrandSplash />;

  // Signed in at the auth layer, but the profile hasn't arrived — keep
  // waiting rather than offering to sign in. Showing the sign-in screen to
  // somebody who never signed out is the whole bug this guards against; the
  // subscription is still retrying underneath.
  if (!user && firebaseSignedIn) return <BrandSplash />;

  return user ? <ShopScreen /> : <OnboardingScreen />;
}
