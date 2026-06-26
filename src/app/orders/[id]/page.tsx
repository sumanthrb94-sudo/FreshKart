import { Suspense } from "react";
import { OrderTrackingScreen } from "@/components/buyer/OrderTrackingScreen";
import { AppShell } from "@/components/layout/AppShell";
import { FullScreenLoader } from "@/components/ui/Spinner";

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <AppShell>
          <FullScreenLoader />
        </AppShell>
      }
    >
      <OrderTrackingScreen id={id} />
    </Suspense>
  );
}
