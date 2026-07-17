"use client";

import Link from "next/link";
import { AlertTriangle, Package } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "./BuyerHeader";
import { BuyerBottomNav } from "./BuyerBottomNav";
import { BuyerSidebar } from "@/components/layout/BuyerSidebar";
import { PageHero } from "./PageHero";
import { OrderCard } from "./OrderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { CallNowInline } from "@/components/CallNowInline";

export function OrdersScreen() {
  const { ready, user } = useRequireAuth({ callbackUrl: "/orders" });
  const { data: orders, loading, error, refetch } = useAsync(
    () => (user ? api.listOrders(user.id) : Promise.resolve([])),
    [user?.id]
  );

  if (!ready) {
    return (
      <AppShell header={<BuyerHeader />} sidebar={<BuyerSidebar />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  return (
    <AppShell
      header={<BuyerHeader />}
      footer={<BuyerBottomNav />}
      sidebar={<BuyerSidebar />}
    >
      <PageHero title="Your orders" backHref="/" backLabel="Back to shop" />
      <div className="relative z-10 -mt-6 rounded-t-[26px] bg-canvas">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
          {loading ? (
            <FullScreenLoader />
          ) : error ? (
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load your orders"
              subtitle={error}
              action={
                <Button size="lg" onClick={refetch}>
                  Try again
                </Button>
              }
            />
          ) : !orders || orders.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No orders yet"
              subtitle="When you place an order, you can track it right here."
              action={
                <Link href="/">
                  <Button size="lg" leadingIcon={<Package className="h-4 w-4" />}>
                    Browse produce
                  </Button>
                </Link>
              }
            />
          ) : (
            orders.map((o) => <OrderCard key={o.id} order={o} />)
          )}

          {/* Call Now support banner - placed in orders section */}
          <CallNowInline />
        </div>
      </div>
    </AppShell>
  );
}
