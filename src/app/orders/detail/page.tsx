"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OrderTrackingScreen } from "@/components/buyer/OrderTrackingScreen";
import { AppShell } from "@/components/layout/AppShell";
import { FullScreenLoader } from "@/components/ui/Spinner";

// Query-string twin of `/orders/[id]`, for the mobile static export where a
// dynamic segment cannot be prerendered. See `@/lib/order-route`.
function OrderDetail() {
  const id = useSearchParams().get("id");

  if (!id) {
    return (
      <AppShell>
        <FullScreenLoader />
      </AppShell>
    );
  }

  return <OrderTrackingScreen id={id} />;
}

export default function OrderDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <FullScreenLoader />
        </AppShell>
      }
    >
      <OrderDetail />
    </Suspense>
  );
}
