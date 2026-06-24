import { Suspense } from "react";
import { OrderTrackingScreen } from "@/components/buyer/OrderTrackingScreen";
import { AppShell } from "@/components/layout/AppShell";
import { FullScreenLoader } from "@/components/ui/Spinner";

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  return (
    <Suspense
      fallback={
        <AppShell>
          <FullScreenLoader />
        </AppShell>
      }
    >
      <OrderTrackingScreen id={params.id} />
    </Suspense>
  );
}
