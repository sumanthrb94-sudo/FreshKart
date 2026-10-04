"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retriedRef = useRef(false);

  useEffect(() => {
    // If the crash was triggered by external DOM mutation (Google Translate / extensions
    // altering text nodes or wrapping them in <font>), auto-recover immediately once.
    const msg = error.message || "";
    const isDomMismatch =
      msg.includes("insertBefore") ||
      msg.includes("removeChild") ||
      msg.includes("replaceChild") ||
      msg.includes("not a child of this node");

    if (isDomMismatch && !retriedRef.current) {
      retriedRef.current = true;
      reset();
    }
  }, [error, reset]);
  return (
    <AppShell>
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={AlertTriangle}
          title="Something went wrong"
          subtitle={error.message || "An unexpected error occurred. Please try again."}
          action={
            <Button size="lg" onClick={reset}>
              Try again
            </Button>
          }
        />
      </div>
    </AppShell>
  );
}
