import { redirect } from "next/navigation";

// The sign-in / onboarding flow now lives in place at "/" (see HomeGate), so
// the URL never shows /onboarding. Keep this path as a permanent redirect for
// old links and bookmarks.
export default function OnboardingPage() {
  redirect("/");
}
