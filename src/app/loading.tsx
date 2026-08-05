import { FullScreenLoader } from "@/components/ui/Spinner";

/**
 * The route-level loading UI — Next renders this while a navigation's code or
 * data is still on the way.
 *
 * It used to be the BrandSplash, which is a BOOT screen: dark canvas, wordmark,
 * rotating taglines. Boot is the wrong register for a navigation. Signing into
 * the admin console showed it and then handed straight over to the console's
 * own "Loading dashboard…", so one continuous wait was drawn as two unrelated
 * loading screens in two visual languages.
 *
 * The neutral loader is the same one every screen's own gate uses, so the
 * spinner simply stays on screen and the label refines as the app learns what
 * it is waiting for.
 *
 * The boot splash is NOT lost by this: HomeGate still shows it while auth is
 * unresolved on a cold start, which is the moment it was designed for.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
      <FullScreenLoader />
    </div>
  );
}
