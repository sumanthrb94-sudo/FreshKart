import { AppShell } from "@/components/layout/AppShell";
import { FullScreenLoader } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <AppShell>
      <FullScreenLoader label="Loading your shop…" />
    </AppShell>
  );
}
