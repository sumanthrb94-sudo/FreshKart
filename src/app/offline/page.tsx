import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline · Green Basket" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-brand-500 px-8 text-center text-white">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
        <WifiOff className="h-8 w-8" />
      </span>
      <div>
        <p className="text-xl font-extrabold">You&apos;re offline</p>
        <p className="mt-1 text-sm text-white/80">
          Check your connection — Green Basket will pick up right where you left off.
        </p>
      </div>
    </div>
  );
}
