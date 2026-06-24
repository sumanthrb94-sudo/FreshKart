"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SearchX } from "lucide-react";
import type { DeliveryDetails, Order, PaymentMethod } from "@/lib/types";
import { api } from "@/lib/api";
import { CATEGORIES } from "@/lib/mock-data";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { AppShell } from "@/components/layout/AppShell";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";
import { BuyerHeader } from "./BuyerHeader";
import { PromoBanner } from "./PromoBanner";
import { ProductListItem } from "./ProductListItem";
import { StickyCartBar } from "./StickyCartBar";
import { CheckoutSheet } from "./CheckoutSheet";
import { PaymentSheet } from "./PaymentSheet";
import { SuccessOverlay } from "./SuccessOverlay";

export function ShopScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { lines, subtotal, clear } = useCart();
  const { data: products, loading, error } = useAsync(() => api.listProducts(), []);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  // Checkout flow state machine
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ delivery: DeliveryDetails; method: PaymentMethod } | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);

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
  };

  function handleReview() {
    if (!user) {
      router.push("/login?callbackUrl=/");
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
      footer={<StickyCartBar onReview={handleReview} />}
    >
      {/* Sticky search + category rail */}
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            flavor="field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search produce…"
            className="pl-9"
            aria-label="Search produce"
          />
        </div>
        <div className="fc-scroll -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <PromoBanner />

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : error ? (
          <EmptyState icon={SearchX} title="Couldn't load the shop" subtitle={error} />
        ) : visible.length === 0 ? (
          <EmptyState icon={SearchX} title="No items found." subtitle="Try a different search or category." />
        ) : (
          visible.map((p) => <ProductListItem key={p.id} product={p} />)
        )}
      </div>

      {/* Overlays */}
      <CheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        defaultDelivery={defaultDelivery}
        busy={busy}
        error={orderError}
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
        <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-app items-center justify-center bg-white/80 backdrop-blur">
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
