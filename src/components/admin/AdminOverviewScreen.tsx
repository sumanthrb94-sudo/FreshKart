"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  RotateCcw,
  ScanLine,
  ShoppingCart,
  Sparkles,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, ORDER_STATUS_META, STATUS_FLOW } from "@/lib/format";
import {
  formatIstDateLabel,
  getIstBusinessDayRange,
  getIstToday,
  isDailyPriceUpdatePublished,
} from "@/lib/time";
import { generateDailyPackingReport } from "@/lib/packing";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { AdminShell } from "./AdminShell";
import { StatCard } from "@/components/ui/StatCard";
import { DayPicker } from "@/components/ui/DayPicker";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";

const ALL_STATUSES: OrderStatus[] = [...STATUS_FLOW, "CANCELLED"];

export function AdminOverviewScreen() {
  const { user } = useAuth();
  const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } =
    useAsync(() => api.getAdminStats(), []);
  const { data: orders, loading: ordersLoading, error: ordersError, refetch: refetchOrders } =
    useAsync(() => api.listOrders(), []);
  const {
    data: settings,
    loading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useAsync(() => api.getDailyPricesSettings(), []);
  const [publishing, setPublishing] = useState(false);

  // Live counts for the nav tile badges below.
  const { data: returns } = useAsync(() => api.listReturns(), []);
  const { data: tickets } = useAsync(() => api.listSupportTickets(), []);
  const pendingReturnsCount = returns?.filter((r) => r.status === "REQUESTED").length ?? 0;
  const needsHumanCount = tickets?.filter((t) => t.needsHuman).length ?? 0;

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

  async function publishToday() {
    if (!user || publishedToday) return;
    setPublishing(true);
    try {
      await api.publishDailyPrices(user.id);
      await refetchSettings();
    } finally {
      setPublishing(false);
    }
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
                onClick={publishToday}
                loading={publishing}
                disabled={publishing || !user}
                fullWidth
              >
                Publish today&apos;s prices
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
        {/* Manage — every admin section as a tappable tile, so mobile isn't
            stuck relying on a 9-item scrolling bottom bar for navigation. */}
        <h2 className="text-xs font-bold uppercase tracking-wide text-fg-muted">Manage</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-9">
          <NavTile href="/admin/products" label="Inventory" icon={Package} tone="brand" count={stats.lowStockCount} />
          <NavTile href="/admin/prices" label="Prices" icon={Tag} tone="amber" attention={!publishedToday} />
          <NavTile href="/admin/orders" label="Orders" icon={ClipboardList} tone="blue" count={stats.ordersByStatus.PENDING} />
          <NavTile href="/admin/pos" label="POS Sale" icon={ScanLine} tone="violet" />
          <NavTile href="/admin/returns" label="Returns" icon={RotateCcw} tone="rose" count={pendingReturnsCount} />
          <NavTile href="/admin/support" label="Support" icon={MessageCircle} tone="indigo" count={needsHumanCount} />
          <NavTile href="/admin/reports" label="Reports" icon={FileText} tone="teal" />
          <NavTile href="/admin/coupons" label="Coupons" icon={BadgePercent} tone="pink" />
          <NavTile href="/admin/customers" label="Buyers" icon={Users} tone="cyan" />
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
                  onClick={publishToday}
                  loading={publishing}
                  disabled={publishedToday || publishing || !user}
                  fullWidth
                >
                  {publishedToday ? "Already published today" : "Publish today's prices"}
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
            hint="Non-cancelled"
            icon={IndianRupee}
            tone="brand"
          />
          <StatCard label="Orders" value={stats.orderCount} icon={ShoppingCart} tone="gray" />
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

type Tone = "brand" | "amber" | "blue" | "violet" | "rose" | "indigo" | "teal" | "pink" | "cyan";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-500/15 text-brand-500",
  amber: "bg-amber-500/15 text-amber-500",
  blue: "bg-blue-500/15 text-blue-500",
  violet: "bg-violet-500/15 text-violet-500",
  rose: "bg-rose-500/15 text-rose-500",
  indigo: "bg-indigo-500/15 text-indigo-500",
  teal: "bg-teal-500/15 text-teal-500",
  pink: "bg-pink-500/15 text-pink-500",
  cyan: "bg-cyan-500/15 text-cyan-500",
};

/** One tappable tile in the "Manage" grid — icon, label, and an optional
 *  live count badge (or a plain attention dot when a count doesn't apply,
 *  e.g. "prices not published yet"). */
function NavTile({
  href,
  label,
  icon: Icon,
  tone,
  count,
  attention,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  count?: number;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-center shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover active:scale-95"
    >
      <span className={cn("relative flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105", TONE_CLASSES[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
        {!!count && count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-surface">
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
