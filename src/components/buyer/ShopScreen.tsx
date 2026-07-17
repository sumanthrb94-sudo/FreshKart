"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Headphones, Search, SearchX } from "lucide-react";
import type { DeliveryDetails, Order, PaymentMethod } from "@/lib/types";
import { api } from "@/lib/api";
import { CATEGORIES } from "@/lib/mock-data";
import { formatLastPublished, isDailyPriceUpdatePublished } from "@/lib/time";
import { getStoreStatus } from "@/lib/store-hours";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerSidebar } from "@/components/layout/BuyerSidebar";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";
import { BuyerHeader } from "./BuyerHeader";
import { ShopHero } from "./ShopHero";
import { ProductListItem } from "./ProductListItem";
import { StickyCartBar } from "./StickyCartBar";
import { BuyerBottomNav } from "./BuyerBottomNav";
import { CheckoutSheet } from "./CheckoutSheet";
import { PaymentSheet } from "./PaymentSheet";
import { SuccessOverlay } from "./SuccessOverlay";

// TODO: replace with your real support number (E.164).
const SUPPORT_PHONE = "+918000000000";

export function ShopScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const { lines, subtotal, clear } = useCart();
  const { t, tCategory } = useLang();
  const { data: products, loading, error } = useAsync(() => api.listProducts(), []);
  const { data: settings, loading: settingsLoading } = useAsync(
    () => api.getDailyPricesSettings(),
    []
  );

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  // Checkout flow state machine
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ delivery: DeliveryDetails; method: PaymentMethod } | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);

  // Open checkout when arriving via the header cart badge (/?cart=1).
  useEffect(() => {
    if (params.get("cart") === "1" && lines.length > 0) {
      setCheckoutOpen(true);
      router.replace("/");
    }
  }, [params, lines.length, router]);

  const pricesPublished = isDailyPriceUpdatePublished(settings?.publishedAt);

  // Re-evaluate store open/closed status every minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const storeStatus = useMemo(() => getStoreStatus(now), [now]);
  const canOrder = pricesPublished && storeStatus.isOpen;

  const visible = useMemo(() => {
    const list = (products ?? []).filter((p) => p.active);
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      const inCat = category === "all" || p.category === category;
      const inSearch = !q || p.name.toLowerCase().includes(q) || p.origin.toLowerCase().includes(q);
      return inCat && inSearch;
    });
  }, [products, search, category]);

  const defaultDelivery: DeliveryDetails = {
    name: user?.businessName ?? user?.name ?? "",
    phone: user?.phone ?? "",
    city: user?.city ?? "",
    address: user?.address ?? "",
    pincode: user?.pincode ?? "",
    ...(user?.lat != null ? { lat: user.lat } : {}),
    ...(user?.lng != null ? { lng: user.lng } : {}),
    ...(user?.addressLabel ? { label: user.addressLabel } : {}),
  };

  function handleReview() {
    if (!user) {
      router.push("/");
      return;
    }
    setOrderError(null);
    setCheckoutOpen(true);
  }

  async function placeOrder(delivery: DeliveryDetails, method: PaymentMethod, paid: boolean) {
    if (!user) return;
    setBusy(true);
    setOrderError(null);
    try {
      const order = await api.createOrder(user.id, {
        items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        delivery,
        paymentMethod: method,
        paid,
      });
      clear();
      setCheckoutOpen(false);
      setPaymentOpen(false);
      setPlaced(order);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "Could not place order.");
      setCheckoutOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function handleContinue(delivery: DeliveryDetails, method: PaymentMethod) {
    setPending({ delivery, method });
    if (method === "ONLINE") {
      setCheckoutOpen(false);
      setPaymentOpen(true);
    } else {
      placeOrder(delivery, method, false);
    }
  }

  const greetingPrefix = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const greetingName = user?.businessName || user?.name;
  const greeting = greetingName ? `${greetingPrefix}, ${greetingName}` : "Welcome to Green Basket";
  const liveStatusLabel =
    pricesPublished && settings?.publishedAt
      ? `Live prices · ${formatLastPublished(settings.publishedAt).split(",")[0]}`
      : undefined;

  return (
    <AppShell
      header={
        <BuyerHeader
          searchSlot={
            <label className="flex items-center gap-2 rounded-full bg-raised px-3 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchProduce")}
                aria-label={t("searchProduce")}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-fg outline-none placeholder:text-fg-subtle"
              />
            </label>
          }
        />
      }
      footer={
        <>
          <StickyCartBar onReview={handleReview} disabled={!canOrder} />
          <BuyerBottomNav />
        </>
      }
      sidebar={<BuyerSidebar />}
    >
      <ShopHero
        greeting={greeting}
        itemCount={visible.length}
        liveStatusLabel={liveStatusLabel}
      />

      <div className="relative z-10 -mt-6 rounded-t-[26px] bg-canvas">
        {/* Daily price-update banner. Text sits at the 600/700 weight of each
            hue (not 100/light) so it reads on both a near-black AND a
            near-white tinted background — this app has no dark:/light:
            variant split, so the same classes render in both themes and
            need to work in both. */}
        {!settingsLoading && !pricesPublished && storeStatus.isOpen && (
          <div className="mx-4 mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-amber-600">
              <Clock className="h-4 w-4 text-amber-500" aria-hidden />
              Getting best live prices for you
            </p>
            <p className="text-xs text-amber-600/80">Orders open after 7 AM daily price update</p>
          </div>
        )}

        {/* Store closed banner — catalog hidden between 11:45 PM and 8:00 AM IST */}
        {!storeStatus.isOpen && (
          <div className="mx-4 mt-3 rounded-xl border border-brand-500/30 bg-brand-500/15 px-3 py-3 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-brand-600">
              <Clock className="h-4 w-4 text-brand-500" aria-hidden />
              Gathering best prices across Hyderabad
            </p>
            <p className="text-xs text-brand-600/80">Will be online at 8 AM everyday</p>
          </div>
        )}

        {/* Sticky category rail */}
        <div className="sticky top-0 z-20 flex items-center gap-2 bg-canvas px-4 pb-1 pt-3">
          <div className="fc-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
            <Chip active={category === "all"} onClick={() => setCategory("all")}>
              {t("all")}
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                {tCategory(c.name)}
              </Chip>
            ))}
          </div>
          {storeStatus.isOpen && !loading && !error && visible.length > 0 && (
            <span className="shrink-0 text-xs text-fg-subtle">{visible.length} items</span>
          )}
        </div>

        <div className="px-4 pb-4 lg:px-6">
          {/* Closed state */}
          {!storeStatus.isOpen ? (
            <EmptyState
              icon={Clock}
              title="Gathering best prices across Hyderabad"
              subtitle="Will be online at 8 AM everyday. Come back tomorrow!"
            />
          ) : loading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-7 w-7" />
            </div>
          ) : error ? (
            <EmptyState icon={SearchX} title={t("couldntLoad")} subtitle={error} />
          ) : visible.length === 0 ? (
            <EmptyState icon={SearchX} title={t("noItemsTitle")} subtitle={t("noItemsSub")} />
          ) : (
            <div className="product-grid mt-2">
              {visible.map((p) => (
                <ProductListItem key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subtle support button */}
      <a
        href={`tel:${SUPPORT_PHONE}`}
        aria-label={t("callSupport")}
        className={cn(
          "fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-brand-500 shadow-card border border-line transition-all hover:shadow-card-hover hover:scale-105 active:scale-95",
          lines.length > 0 ? "bottom-32" : "bottom-24"
        )}
      >
        <Headphones className="h-5 w-5" />
      </a>

      {/* Overlays */}
      <CheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        defaultDelivery={defaultDelivery}
        busy={busy}
        error={orderError}
        disabled={!canOrder}
        onContinue={handleContinue}
      />
      <PaymentSheet
        open={paymentOpen}
        amount={subtotal}
        onClose={() => {
          setPaymentOpen(false);
          setCheckoutOpen(true);
        }}
        onPaid={() => pending && placeOrder(pending.delivery, pending.method, true)}
      />
      {busy && !checkoutOpen && !paymentOpen && (
        <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-app items-center justify-center bg-canvas lg:left-[var(--sidebar-width)] lg:mx-0 lg:max-w-none">
          <FullScreenLoader label="Placing order…" />
        </div>
      )}
      {placed && (
        <SuccessOverlay
          order={placed}
          onPlaceAnother={() => setPlaced(null)}
          onViewOrders={() => router.push("/orders")}
        />
      )}
    </AppShell>
  );
}
