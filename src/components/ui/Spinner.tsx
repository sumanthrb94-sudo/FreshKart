import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-5 w-5 animate-spin text-brand-500", className)}
      aria-label="Loading"
    />
  );
}

/** Full-screen centered spinner with an optional label (brief §4.17). */
export function FullScreenLoader({
  label = "Loading…",
  overlay = false,
}: {
  label?: string;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 py-24",
        overlay && "absolute inset-0 z-50 bg-canvas"
      )}
    >
      <Spinner className="h-7 w-7" />
      <p className="text-sm font-medium text-gray-500">{label}</p>
    </div>
  );
}
