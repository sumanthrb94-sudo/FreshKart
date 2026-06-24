"use client";

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
