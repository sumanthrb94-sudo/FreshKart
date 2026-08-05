"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Search, SearchX } from "lucide-react";
import type { DeliveryDetails, Order, PaymentMethod } from "@/lib/types";
import { api } from "@/lib/api";
import { CATEGORIES } from "@/lib/mock-data";
import { formatLastPublished, isDailyPriceUpdatePublished } from "@/lib/time";
import { getStoreStatus, effectiveOverride, STORE_CLOSE_HOUR } from "@/lib/store-hours";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { useLang } from "@/lib/i18n";
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
// Deferred: nobody sees checkout until they have a cart and tap it, and it is
// the heaviest thing on this screen — the address map, the coupon field, the
// payment block and the animated sheet all hang off it. Keeping it out of the
// first load is what pays for Motion elsewhere.
const CheckoutSheet = dynamic(() => import("./CheckoutSheet").then((m) => m.CheckoutSheet), {
  ssr: false,
});
import { SuccessOverlay } from "./SuccessOverlay";

export function ShopScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const { lines, clear } = useCart();
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
  const [busy, setBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
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
  // An admin can force the shop live (or shut) outside the 8 AM - 9 PM
  // window; the override lapses at the next 9 PM on its own.
  const { data: storeSettings } = useAsync(
    () => (api.getStoreSettings ? api.getStoreSettings() : Promise.resolve(null)),
    []
  );
  const storeStatus = useMemo(
    () => getStoreStatus(now, effectiveOverride(storeSettings, now)),
    [now, storeSettings]
  );
  const canOrder = pricesPublished && storeStatus.isOpen;
  // Between the 9 PM close and midnight the shop shut *today*; before 8 AM it
  // simply hasn't opened yet. Same closed state, very different message.
  const justClosedForToday = useMemo(() => {
    if (storeStatus.isOpen) return false;
    const istHour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        hour12: false,
      }).format(now)
    );
    return istHour >= STORE_CLOSE_HOUR;
  }, [storeStatus.isOpen, now]);

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
    if (!user) {
      // Never fail silently here. A dead button teaches the buyer to press it
      // again, which is exactly how one order becomes two.
      setOrderError("Your session dropped for a moment. Tap Place order again.");
      setCheckoutOpen(true);
      return;
    }
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
      setPlaced(order);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "Could not place order.");
      setCheckoutOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function handleContinue(delivery: DeliveryDetails, method: PaymentMethod) {
    placeOrder(delivery, method, false);
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
            <label className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5">
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
        {/* Daily price-update banner. Full-bleed strip flush against the hero's
            curve, rounded to match the sheet's own top corners (rather than
            clipping the sheet with overflow-hidden, which broke the sticky
            category rail below) so it reads as a continuation of the hero
            rather than a separate floating card. Text sits at the 600/700
            weight of each hue (not 100/light) so it reads on both a
            near-black AND a near-white tinted background — this app has no
            dark:/light: variant split, so the same classes render in both
            themes and need to work in both. */}
        {!settingsLoading && !pricesPublished && storeStatus.isOpen && (
          <div className="rounded-t-[26px] bg-amber-500/10 px-4 py-2.5 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-amber-600">
              <Clock className="h-4 w-4 text-amber-500" aria-hidden />
              Getting best live prices for you
            </p>
            <p className="text-xs text-amber-600/80">Orders open once today&apos;s rates are in</p>
          </div>
        )}

        {/* Closed banner. After the 9 PM cart close a shopkeeper needs to know
            their order missed today's van, not a generic "come back later" —
            so the evening and the small hours say different things. */}
        {!storeStatus.isOpen && (
          <div className="rounded-t-[26px] bg-brand-500/15 px-4 py-3 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-brand-600">
              <Clock className="h-4 w-4 text-brand-500" aria-hidden />
              {justClosedForToday ? "Cart closed for today" : "Gathering best prices across Hyderabad"}
            </p>
            <p className="text-xs text-brand-600/80">
              {justClosedForToday
                ? "Orders reopen at 8 AM tomorrow, for the next day's delivery"
                : "Will be online at 8 AM everyday"}
            </p>
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
              title={justClosedForToday ? "Cart closed for today" : "Gathering best prices across Hyderabad"}
              subtitle={
                justClosedForToday
                  ? "The 9 PM cut-off has passed and today's van is loaded. Orders reopen at 8 AM for tomorrow's delivery."
                  : "Will be online at 8 AM everyday. Come back tomorrow!"
              }
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
      {busy && !checkoutOpen && (
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
