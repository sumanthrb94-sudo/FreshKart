"use client";

import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "./BuyerHeader";
import { OrderCard } from "./OrderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";

export function OrdersScreen() {
  const { ready, user } = useRequireAuth({ callbackUrl: "/orders" });
  const { data: orders, loading } = useAsync(
    () => (user ? api.listOrders(user.id) : Promise.resolve([])),
    [user?.id]
  );

  if (!ready) {
    return (
      <AppShell header={<BuyerHeader />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  return (
    <AppShell header={<BuyerHeader />}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Your orders</h1>
          <Link
            href="/"
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to shop
          </Link>
        </div>

        {loading ? (
          <FullScreenLoader />
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
      </div>
    </AppShell>
  );
}
