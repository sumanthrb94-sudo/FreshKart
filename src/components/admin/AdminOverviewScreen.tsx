"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  IndianRupee,
  MessageCircle,
  Package,
  Pin,
  RotateCcw,
  ScanLine,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Customer, Order, OrderStatus, Product } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, ORDER_STATUS_META, STATUS_FLOW } from "@/lib/format";
import {
  formatIstDateLabel,
  getIstBusinessDayRange,
  getIstDateString,
  getIstToday,
  isDailyPriceUpdatePublished,
} from "@/lib/time";
import { generateDailyPackingReport } from "@/lib/packing";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { AdminShell } from "./AdminShell";
import { useLiveOrders, useLiveReturns, useLiveNeedsHumanCount } from "@/lib/admin-alerts-store";
import { StatCard } from "@/components/ui/StatCard";
import { DayPicker } from "@/components/ui/DayPicker";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";

const ALL_STATUSES: OrderStatus[] = [...STATUS_FLOW, "CANCELLED"];

type Tone = "brand" | "amber" | "blue" | "violet" | "rose" | "indigo" | "teal" | "pink" | "cyan";

type ManageTileDef = { href: string; label: string; icon: LucideIcon; tone: Tone };

// Static tile metadata for the "Manage" grid — order here is the unpinned
// default; live counts/attention dots are looked up per-href at render time.
const MANAGE_TILES: ManageTileDef[] = [
  { href: "/admin/products", label: "Inventory", icon: Package, tone: "brand" },
  { href: "/admin/prices", label: "Prices", icon: Tag, tone: "amber" },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, tone: "blue" },
  { href: "/admin/pos", label: "POS Sale", icon: ScanLine, tone: "violet" },
  { href: "/admin/returns", label: "Returns", icon: RotateCcw, tone: "rose" },
  { href: "/admin/support", label: "Support", icon: MessageCircle, tone: "indigo" },
  { href: "/admin/reports", label: "Reports", icon: FileText, tone: "teal" },
  { href: "/admin/coupons", label: "Coupons", icon: BadgePercent, tone: "pink" },
  { href: "/admin/customers", label: "Buyers", icon: Users, tone: "cyan" },
];

const PINNED_TILES_KEY = "admin-pinned-tiles";

type SearchResult = {
  kind: "order" | "product" | "customer";
  id: string;
  title: string;
  subtitle: string;
};

/** Matches up to 5 results per kind against order #/buyer, product name, and buyer name/business/phone. */
function searchAll(
  query: string,
  orders: Order[] | null,
  products: Product[] | null,
  customers: Customer[] | null
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const orderMatches: SearchResult[] = (orders ?? [])
    .filter((o) => o.orderNumber.toLowerCase().includes(q) || o.businessName.toLowerCase().includes(q))
    .slice(0, 5)
    .map((o) => ({
      kind: "order",
      id: o.id,
      title: o.orderNumber,
      subtitle: `${o.businessName} · ${formatCurrency(o.total)}`,
    }));

  const productMatches: SearchResult[] = (products ?? [])
    .filter((p) => p.name.toLowerCase().includes(q))
    .slice(0, 5)
    .map((p) => ({
      kind: "product",
      id: p.id,
      title: p.name,
      subtitle: `${formatCurrency(p.price)} / ${p.unit}`,
    }));

  const customerMatches: SearchResult[] = (customers ?? [])
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.businessName?.toLowerCase().includes(q) ||
        c.phone.includes(q)
    )
    .slice(0, 5)
    .map((c) => ({
      kind: "customer",
      id: c.id,
      title: c.name,
      subtitle: c.businessName ?? c.phone,
    }));

  return [...orderMatches, ...productMatches, ...customerMatches];
}

export function AdminOverviewScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } =
    useAsync(() => api.getAdminStats(), []);
  const { data: orders, loading: ordersLoading, error: ordersError, refetch: refetchOrders } =
    useAsync(() => api.listOrders(), []);
  const { data: products } = useAsync(() => api.listProducts(), []);
  const { data: customers } = useAsync(() => api.listCustomers(), []);
  const {
    data: settings,
    loading: settingsLoading,
    error: settingsError,
  } = useAsync(() => api.getDailyPricesSettings(), []);

  // Live counts for the nav tile badges below — the SAME module-singleton
  // subscriptions the header badges use (src/lib/admin-alerts-store.ts), so
  // both stay in sync in real time off of exactly one Firestore listener
  // each; a second independent listener here would double-fire the chime.
  const { confirmedOrders } = useLiveOrders();
  const { pendingCount: pendingReturnsCount } = useLiveReturns();
  const needsHumanCount = useLiveNeedsHumanCount();
  const newOrdersCount = confirmedOrders.length;

  // Last-7-days trend lines for the Revenue / Orders stat cards.
  const last7 = useMemo(() => {
    const days: string[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(getIstDateString(d));
    }
    const revenueByDay = new Map(days.map((d) => [d, 0]));
    const ordersByDay = new Map(days.map((d) => [d, 0]));
    (orders ?? []).forEach((o) => {
      const day = getIstDateString(new Date(o.createdAt));
      if (!ordersByDay.has(day)) return;
      ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1);
      if (o.status !== "CANCELLED") {
        revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + o.total);
      }
    });
    return {
      revenue: days.map((d) => revenueByDay.get(d) ?? 0),
      orders: days.map((d) => ordersByDay.get(d) ?? 0),
    };
  }, [orders]);

  // Dashboard search — jump straight to a matching order/product/buyer
  // instead of hunting through the tile grid first.
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchResults = useMemo(() => searchAll(search, orders, products, customers), [search, orders, products, customers]);
  const showSearchResults = searchFocused && search.trim().length > 0;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goToSearchResult(result: SearchResult) {
    setSearch("");
    setSearchFocused(false);
    if (result.kind === "order") router.push(`/admin/orders?open=${result.id}`);
    else if (result.kind === "product") router.push(`/admin/products?open=${result.id}`);
    else router.push(`/admin/customers?highlight=${result.id}`);
  }

  // Pinned "Manage" tiles — persisted locally so admins who mostly live in
  // 2-3 sections can float them to the front of the grid.
  const [pinned, setPinned] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PINNED_TILES_KEY);
      if (raw) setPinned(JSON.parse(raw));
    } catch {
      // Ignore malformed/unavailable localStorage — falls back to unpinned order.
    }
  }, []);
  function togglePin(href: string) {
    setPinned((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      try {
        window.localStorage.setItem(PINNED_TILES_KEY, JSON.stringify(next));
      } catch {
        // Ignore write failures (private browsing, storage disabled, etc).
      }
      return next;
    });
  }
  const orderedTiles = useMemo(
    () => [...MANAGE_TILES].sort((a, b) => Number(pinned.includes(b.href)) - Number(pinned.includes(a.href))),
    [pinned]
  );

  // Day totals — scoped to one IST business day, fetched with a date-range
  // query rather than the all-time scan the stats below still do.
  const [day, setDay] = useState(() => getIstToday());
  const { startIso, endIso } = useMemo(() => getIstBusinessDayRange(day), [day]);
  const {
    data: dayOrders,
    loading: dayLoading,
    error: dayError,
  } = useAsync(() => api.listOrdersByRange(startIso, endIso), [startIso, endIso]);
  const dayReport = useMemo(
    () => (dayOrders ? generateDailyPackingReport(dayOrders, day) : null),
    [dayOrders, day]
  );

  if (statsLoading || ordersLoading) {
    return (
      <AdminShell>
        <FullScreenLoader label="Loading dashboard…" />
      </AdminShell>
    );
  }

  // Surface the error (e.g. Firestore "insufficient permissions" when the
  // account isn't an admin) instead of hanging on the loader forever.
  const loadError = statsError || ordersError;
  if (loadError || !stats) {
    return (
      <AdminShell>
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the dashboard"
          subtitle={loadError ?? "Your account may not have admin access yet."}
          action={
            <Button
              size="lg"
              onClick={() => {
                refetchStats();
                refetchOrders();
              }}
            >
              Try again
            </Button>
          }
        />
      </AdminShell>
    );
  }

  const lowStock = stats.lowStockCount > 0;
  const recentOrders = orders ? orders.slice(0, 5) : [];
  const publishedToday = isDailyPriceUpdatePublished(settings?.publishedAt);

  // Live count/attention badge per tile href — kept out of MANAGE_TILES since
  // those values depend on data that only exists once the loaders above resolve.
  const loadedStats = stats;
  function tileMeta(href: string): { count?: number; attention?: boolean } {
    switch (href) {
      case "/admin/products":
        return { count: loadedStats.lowStockCount };
      case "/admin/prices":
        return { attention: !publishedToday };
      case "/admin/orders":
        return { count: newOrdersCount };
      case "/admin/returns":
        return { count: pendingReturnsCount };
      case "/admin/support":
        return { count: needsHumanCount };
      default:
        return {};
    }
  }

  // Publishing now happens on the dedicated price screen (review-and-confirm),
  // so the dashboard's publish affordances just take the admin there rather
  // than publishing in one silent click.
  function goToPriceUpdate() {
    router.push("/admin/prices");
  }

  const needsPublishGate = !settingsLoading && !settingsError && !publishedToday;

  return (
    <AdminShell>
      {/* Publish gate: block the admin dashboard until today's prices are published */}
      {needsPublishGate && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
              <Sparkles className="h-8 w-8 text-brand-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-fg">Publish today&apos;s prices</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              The store can&apos;t go live until today&apos;s prices are published.
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              Buyers will see &quot;Gathering best prices across Hyderabad&quot; until you publish.
            </p>

            <div className="mt-5 flex flex-col gap-3">
              <Button
                size="lg"
                onClick={goToPriceUpdate}
                disabled={!user}
                fullWidth
              >
                Review &amp; publish today&apos;s prices
              </Button>
            </div>

            <div className="mt-4 rounded-lg bg-raised p-3">
              <p className="text-xs text-fg-subtle">
                <strong className="text-fg">Store opens at 8:00 AM IST</strong>
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                Daily price update window: 7:00 AM IST
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {/* Dashboard search — jump straight to an order, product, or buyer. */}
        <div ref={searchBoxRef} className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder="Search orders, products, buyers…"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-9 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>

          {showSearchResults && (
            <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
              {searchResults.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-fg-subtle">No matches for &quot;{search}&quot;</p>
              ) : (
                searchResults.map((r) => (
                  <button
                    key={`${r.kind}-${r.id}`}
                    type="button"
                    onClick={() => goToSearchResult(r)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-raised"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-fg-muted">
                      {r.kind === "order" && <ClipboardList className="h-4 w-4" aria-hidden />}
                      {r.kind === "product" && <Package className="h-4 w-4" aria-hidden />}
                      {r.kind === "customer" && <Users className="h-4 w-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{r.title}</span>
                      <span className="block truncate text-xs text-fg-subtle">{r.subtitle}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Manage — every admin section as a tappable tile, so mobile isn't
            stuck relying on a 9-item scrolling bottom bar for navigation.
            Pinned tiles float first — tap the pin to favorite a section. */}
        <h2 className="text-xs font-bold uppercase tracking-wide text-fg-muted">Manage</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-9">
          {orderedTiles.map((t) => (
            <NavTile
              key={t.href}
              href={t.href}
              label={t.label}
              icon={t.icon}
              tone={t.tone}
              pinned={pinned.includes(t.href)}
              onTogglePin={() => togglePin(t.href)}
              {...tileMeta(t.href)}
            />
          ))}
        </div>

        {/* Daily price gate */}
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Sparkles className="h-4 w-4 text-brand-400" aria-hidden />
              Daily prices
            </h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-fg-subtle">
                <Spinner className="h-4 w-4" /> Checking price status…
              </div>
            ) : settingsError ? (
              <Alert variant="error">{settingsError}</Alert>
            ) : (
              <>
                <div className="flex items-start gap-2 text-sm text-fg">
                  {publishedToday ? (
                    <>
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden />
                      <span>
                        Published today at{" "}
                        {new Date(settings!.publishedAt).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                      <span>Waiting for today&apos;s price update</span>
                    </>
                  )}
                </div>
                <Button
                  onClick={goToPriceUpdate}
                  disabled={publishedToday || !user}
                  fullWidth
                >
                  {publishedToday ? "Already published today" : "Review & publish today's prices"}
                </Button>
              </>
            )}
          </CardBody>
        </Card>

        {/* Day totals */}
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
              <ClipboardList className="h-4 w-4 text-brand-400" aria-hidden />
              Day totals
            </h2>
            <Link
              href="/admin/reports"
              className="text-xs font-semibold text-brand-400 hover:underline"
            >
              Packing report
            </Link>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <DayPicker value={day} onChange={setDay} />

            {day === getIstToday() && !settingsLoading && !settingsError && !publishedToday && (
              <p className="text-xs text-fg-subtle">
                Today&apos;s prices aren&apos;t published yet — orders open after you publish.
              </p>
            )}

            {dayError ? (
              <Alert variant="error">{dayError}</Alert>
            ) : dayLoading || !dayReport ? (
              <div className="flex items-center gap-2 py-4 text-sm text-fg-subtle">
                <Spinner className="h-4 w-4" /> Loading {formatIstDateLabel(day)}…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard
                  label="Orders"
                  value={dayReport.totals.orderCount}
                  hint={
                    dayReport.totals.cancelledOrderCount > 0
                      ? `${dayReport.totals.cancelledOrderCount} cancelled`
                      : formatIstDateLabel(day)
                  }
                  icon={ShoppingCart}
                  tone="brand"
                />
                <StatCard
                  label="Items to pack"
                  value={`${dayReport.totals.totalKg} kg`}
                  hint={`${dayReport.totals.totalPieces} pieces`}
                  icon={Package}
                  tone="brand"
                />
                <StatCard
                  label="Revenue"
                  value={formatCurrency(dayReport.totals.revenue)}
                  hint={
                    dayReport.totals.refundedAmount > 0
                      ? `${formatCurrency(dayReport.totals.refundedAmount)} refunded`
                      : "Non-cancelled"
                  }
                  icon={IndianRupee}
                  tone="gray"
                />
                <StatCard
                  label="Customers"
                  value={dayReport.totals.customerCount}
                  hint={`${dayReport.slips.length} ${dayReport.slips.length === 1 ? "drop" : "drops"}`}
                  icon={Users}
                  tone="gray"
                />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Stats */}
        <h2 className="mt-1 text-xs font-bold uppercase tracking-wide text-fg-muted">All time</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Revenue"
            value={formatCurrency(stats.revenue)}
            hint="Non-cancelled · 7d trend"
            icon={IndianRupee}
            tone="brand"
            sparkline={last7.revenue}
          />
          <StatCard
            label="Orders"
            value={stats.orderCount}
            hint="Last 7 days"
            icon={ShoppingCart}
            tone="gray"
            sparkline={last7.orders}
          />
          <StatCard
            label="Pending"
            value={stats.ordersByStatus.PENDING}
            hint="Awaiting action"
            icon={Clock}
            tone="gray"
          />
          <StatCard label="Customers" value={stats.customerCount} icon={Users} tone="gray" />
          <StatCard
            label="Products"
            value={stats.productCount}
            hint={`${stats.activeProductCount} active`}
            icon={Package}
            tone="gray"
          />
          <StatCard
            label="Low stock"
            value={stats.lowStockCount}
            hint={lowStock ? "Needs restock" : "All healthy"}
            icon={lowStock ? AlertTriangle : CheckCircle2}
            tone={lowStock ? "red" : "gray"}
          />
        </div>

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
          {/* Low-stock alert */}
          {lowStock ? (
            <Link
              href="/admin/products"
              className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-3 transition-colors hover:bg-red-500/20"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-400">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm font-bold text-fg">
                  {stats.lowStockCount} {stats.lowStockCount === 1 ? "item" : "items"} need restock
                </span>
                <span className="block text-xs text-fg-muted">Tap to review low-stock products</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-red-400">Review</span>
            </Link>
          ) : (
            <Card className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm font-bold text-fg">All stock healthy</span>
                <span className="block text-xs text-fg-muted">No products need restock right now</span>
              </span>
            </Card>
          )}

          {/* Recent orders */}
          <Card className={cn(!lowStock && "lg:col-span-2")}>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-fg">Recent orders</h2>
              <Link
                href="/admin/orders"
                className="text-xs font-semibold text-brand-400 hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {recentOrders.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-fg-subtle">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recentOrders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-fg-muted">
                          {o.orderNumber}
                        </p>
                        <p className="truncate text-xs text-fg-subtle">
                          {o.businessName} · {formatDate(o.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-bold text-fg">{formatCurrency(o.total)}</span>
                        <OrderStatusBadge status={o.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Orders by status */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-fg">Orders by status</h2>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((s) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ORDER_STATUS_META[s].badge}`}
              >
                {ORDER_STATUS_META[s].label}: {stats.ordersByStatus[s]}
              </span>
            ))}
          </CardBody>
        </Card>

      </div>
    </AdminShell>
  );
}

// Icon badge: a soft gradient from a lighter to a slightly deeper tint of
// the same hue, for a bit more depth than a flat translucent fill.
const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-gradient-to-br from-brand-500/20 to-brand-500/5 text-brand-500",
  amber: "bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-500",
  blue: "bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-500",
  violet: "bg-gradient-to-br from-violet-500/20 to-violet-500/5 text-violet-500",
  rose: "bg-gradient-to-br from-rose-500/20 to-rose-500/5 text-rose-500",
  indigo: "bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 text-indigo-500",
  teal: "bg-gradient-to-br from-teal-500/20 to-teal-500/5 text-teal-500",
  pink: "bg-gradient-to-br from-pink-500/20 to-pink-500/5 text-pink-500",
  cyan: "bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 text-cyan-500",
};

// Whole-tile wash: a very faint hint of the tone bleeding down from the top
// edge, so each tile reads as "its own color" at a glance, not just its icon.
const TONE_TILE_WASH: Record<Tone, string> = {
  brand: "from-brand-500/[0.07]",
  amber: "from-amber-500/[0.07]",
  blue: "from-blue-500/[0.07]",
  violet: "from-violet-500/[0.07]",
  rose: "from-rose-500/[0.07]",
  indigo: "from-indigo-500/[0.07]",
  teal: "from-teal-500/[0.07]",
  pink: "from-pink-500/[0.07]",
  cyan: "from-cyan-500/[0.07]",
};

/** One tappable tile in the "Manage" grid — icon, label, an optional live
 *  count badge (or a plain attention dot when a count doesn't apply, e.g.
 *  "prices not published yet"), and a pin toggle to favorite the section. */
function NavTile({
  href,
  label,
  icon: Icon,
  tone,
  count,
  attention,
  pinned,
  onTogglePin,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  count?: number;
  attention?: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  // Flash the whole tile — not just the corner badge, which is easy to miss
  // at a glance — for a beat when its count goes UP (a new order/return/
  // ticket just landed live). Only fires on a genuine increase after mount,
  // never for the initial render of an already-nonzero backlog.
  const prevCountRef = useRef(count ?? 0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const prev = prevCountRef.current;
    const next = count ?? 0;
    prevCountRef.current = next;
    if (next > prev) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [count]);

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border bg-surface bg-gradient-to-b to-transparent p-3 text-center shadow-card transition-all duration-700 hover:-translate-y-0.5 hover:shadow-card-hover active:scale-95",
        flash ? "border-brand-500 ring-2 ring-brand-500/30" : "border-line",
        TONE_TILE_WASH[tone]
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin();
        }}
        aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
        aria-pressed={pinned}
        className={cn(
          "absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full transition-opacity",
          pinned
            ? "bg-brand-500/15 text-brand-500 opacity-100"
            : "text-fg-subtle opacity-0 hover:bg-raised group-hover:opacity-100 group-focus-within:opacity-100"
        )}
      >
        <Pin className="h-3 w-3" aria-hidden fill={pinned ? "currentColor" : "none"} />
      </button>
      <span className={cn("relative flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105", TONE_CLASSES[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
        {!!count && count > 0 && (
          // Keying on the count remounts the badge on every change, replaying
          // the pop-in animation — a live visual cue for the number itself
          // updating (new order/return/ticket landed), not just its initial
          // appearance.
          <span
            key={count}
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] animate-pop items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-surface"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
        {attention && !count && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-surface" />
        )}
      </span>
      <span className="text-xs font-bold leading-tight text-fg">{label}</span>
    </Link>
  );
}
