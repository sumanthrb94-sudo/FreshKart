"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Globe, Phone, Search, SearchX } from "lucide-react";
import type { DeliveryDetails, Order, PaymentMethod } from "@/lib/types";
import { api } from "@/lib/api";
import { CATEGORIES } from "@/lib/mock-data";
import { isDailyPriceUpdatePublished } from "@/lib/time";
import { getStoreStatus } from "@/lib/store-hours";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { useLang, LANGS } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerSidebar } from "@/components/layout/BuyerSidebar";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";
import { BuyerHeader } from "./BuyerHeader";
import { PromoBanner } from "./PromoBanner";
import { ProductListItem } from "./ProductListItem";
import { StickyCartBar } from "./StickyCartBar";
import { BuyerBottomNav } from "./BuyerBottomNav";
import { CheckoutSheet } from "./CheckoutSheet";
import { PaymentSheet } from "./PaymentSheet";
import { SuccessOverlay } from "./SuccessOverlay";

// TODO: replace with your real support number (E.164). "Call support" opens the
// phone's dialer with this number prefilled.
const SUPPORT_PHONE = "+918000000000";

export function ShopScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const { lines, subtotal, clear } = useCart();
  const { t, tCategory, lang, setLang } = useLang();
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

  // Re-evaluate store open/closed status every minute so the catalog hides
  // automatically after 11:45 PM IST and reappears at 8:00 AM IST.
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
    // Conditional so we never write `undefined` (Firestore rejects it).
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

  return (
    <AppShell
      header={<BuyerHeader />}
      footer={
        <>
          <StickyCartBar onReview={handleReview} disabled={!canOrder} />
          <BuyerBottomNav />
        </>
      }
      sidebar={<BuyerSidebar />}
    >
      {/* Sticky language + search + category rail */}
      <div className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur">
        {/* Daily price-update banner */}
        {!settingsLoading && !pricesPublished && storeStatus.isOpen && (
          <div className="mb-3 -mt-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-amber-100">
              <Clock className="h-4 w-4 text-amber-400" aria-hidden />
              Getting best live prices for you
            </p>
            <p className="text-xs text-amber-200/80">Orders open after 7 AM daily price update</p>
          </div>
        )}

        {/* Store closed banner — catalog hidden between 11:45 PM and 8:00 AM IST */}
        {!storeStatus.isOpen && (
          <div className="mb-3 -mt-1 rounded-lg border border-brand-500/30 bg-brand-500/15 px-3 py-3 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-brand-100">
              <Clock className="h-4 w-4 text-brand-400" aria-hidden />
              Gathering best prices across Hyderabad
            </p>
            <p className="text-xs text-brand-200/80">Will be online at 8 AM everyday</p>
          </div>
        )}

        {/* Language scroller — scroll & tap to switch */}
        <div className="fc-scroll -mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4">
          <Globe className="h-4 w-4 shrink-0 text-brand-500" />
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold transition-colors",
                lang === l.code
                  ? "bg-brand-500 text-white shadow-sm"
                  : "border border-line bg-surface text-fg-muted hover:border-brand-500/30"
              )}
            >
              {l.native}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            flavor="field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchProduce")}
            className="pl-9"
            aria-label={t("searchProduce")}
          />
        </div>
        <div className="fc-scroll -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            {t("all")}
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {tCategory(c.name)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="p-4">
        <PromoBanner />

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : error ? (
          <EmptyState icon={SearchX} title={t("couldntLoad")} subtitle={error} />
        ) : !storeStatus.isOpen ? (
          <EmptyState
            icon={Clock}
            title="Gathering best prices across Hyderabad"
            subtitle="Will be online at 8 AM everyday. Come back tomorrow!"
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={SearchX} title={t("noItemsTitle")} subtitle={t("noItemsSub")} />
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((p) => (
              <ProductListItem key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>

      {/* Call support — floating 3D dialer button (opens the phone dialer) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-app lg:left-[var(--sidebar-width)] lg:right-0 lg:mx-0 lg:max-w-none">
        <a
          href={`tel:${SUPPORT_PHONE}`}
          aria-label={t("callSupport")}
          className={cn(
            "animate-float pointer-events-auto absolute right-4 flex items-center gap-2 rounded-full bg-gradient-to-b from-brand-400 to-brand-600 px-4 py-3 text-sm font-extrabold text-white shadow-[0_8px_0_-2px_#a81824,0_16px_26px_-8px_rgba(0,0,0,.5)] transition-all active:translate-y-1 active:shadow-[0_4px_0_-2px_#a81824,0_8px_16px_-8px_rgba(0,0,0,.4)] motion-reduce:animate-none",
            lines.length > 0 ? "bottom-40" : "bottom-24"
          )}
        >
          <Phone className="h-5 w-5" />
          {t("callSupport")}
        </a>
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
        <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-app items-center justify-center bg-canvas/95 backdrop-blur lg:left-[var(--sidebar-width)] lg:mx-0 lg:max-w-none">
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
