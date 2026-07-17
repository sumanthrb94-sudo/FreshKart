"use client";

import Link from "next/link";
import { AlertTriangle, Headphones, Package } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useRequireAuth } from "@/lib/hooks";
import { useLang } from "@/lib/i18n";
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

// TODO: replace with your real support number (E.164).
const SUPPORT_PHONE = "+918000000000";

export function OrdersScreen() {
  const { t } = useLang();
  const { ready, user } = useRequireAuth({ callbackUrl: "/orders" });
  const { data: orders, loading, error, refetch } = useAsync(
    () => (user ? api.listOrders(user.id) : Promise.resolve([])),
    [user?.id]
  );

  if (!ready) {
    return (
      <AppShell header={<BuyerHeader showWordmark />} sidebar={<BuyerSidebar />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  return (
    <AppShell
      header={<BuyerHeader showWordmark />}
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

      {/* Subtle support button — left side, since the AI chat bubble already
          occupies bottom-right on every non-home screen. Same bottom-20 /
          md:bottom-8 offsets as AiChatAgent's button so the two sit at
          exactly the same height, mirrored left/right. */}
      <a
        href={`tel:${SUPPORT_PHONE}`}
        aria-label={t("callSupport")}
        className="fixed bottom-20 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-brand-500 shadow-card transition-all hover:scale-105 hover:shadow-card-hover active:scale-95 md:bottom-8"
      >
        <Headphones className="h-5 w-5" />
      </a>
    </AppShell>
  );
}
