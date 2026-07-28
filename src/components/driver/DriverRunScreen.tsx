"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronLeft,
  Clock,
  IndianRupee,
  List,
  LogOut,
  Map as MapIcon,
  MapPin,
  Navigation,
  Phone,
  Truck,
  X,
} from "lucide-react";
import type { AdjustmentLine, Order } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAsync } from "@/lib/hooks";
import {
  buildAdjustmentLine,
  driverApprovalLimit,
  isCollectable,
  payableTotal,
  totalRefundOf,
} from "@/lib/delivery-adjustment";
import {
  DEFAULT_SERVICE_AREA,
  formatKm,
  navigationUrl,
  radiusOf,
  sequenceRun,
  summarizeRun,
  type RunStop,
  type ServiceArea,
} from "@/lib/service-area";
import { DriverRouteMap } from "./DriverRouteMap";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader, Spinner } from "@/components/ui/Spinner";

/** Downscale a camera photo before it ever leaves the handset. Drivers are
 *  routinely on weak mandi-area signal, and a raw phone photo is several MB —
 *  enough to stall the one upload that has to succeed while a customer
 *  waits. ~1000px JPEG keeps the evidence legible at a fraction of the size. */
async function compressPhoto(file: File, maxEdge = 1000, quality = 0.7): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export function DriverRunScreen() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "DRIVER")) router.replace("/driver-login");
  }, [authLoading, user, router]);

  // Live, not fetched-once: the office's approve/reject has to land on the
  // handset while the driver is still at the door, and a stop added to the
  // run mid-morning should just appear.
  const [liveOrders, setLiveOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    if (api.subscribeDriverOrders) {
      const stop = api.subscribeDriverOrders(user.id, (next) => {
        setLiveOrders(next);
        setLoading(false);
      });
      return stop;
    }
    // Backend without a real-time channel — one-shot, refreshed by `tick`.
    let live = true;
    (api.listDriverOrders ? api.listDriverOrders(user.id) : Promise.resolve([] as Order[]))
      .then((next) => {
        if (!live) return;
        setLiveOrders(next);
        setLoading(false);
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [user, tick]);
  const orders = liveOrders;

  const { data: savedArea } = useAsync(
    () => (api.getServiceArea ? api.getServiceArea() : Promise.resolve(null)),
    []
  );
  // Until an admin has saved a real area we still need a hub to measure from,
  // so the starter area stands in rather than leaving the run unsequenced.
  const area: ServiceArea = savedArea ?? DEFAULT_SERVICE_AREA;

  const stops = useMemo(() => sequenceRun(orders ?? [], area), [orders, area]);
  const summary = useMemo(() => summarizeRun(stops), [stops]);

  if (authLoading || !user) return <FullScreenLoader label="Loading your run…" />;

  const open = (orders ?? []).find((o) => o.id === openId) ?? null;
  const openStop = open ? stops.find((s) => s.order.id === open.id) ?? null : null;
  const selected = stops.find((s) => s.order.id === selectedId) ?? null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-surface px-4 py-3">
        {open ? (
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-raised"
            aria-label="Back to my run"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-white">
            <Truck className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-extrabold text-fg">
            {open ? open.businessName : "My run"}
          </p>
          <p className="truncate text-2xs text-fg-subtle">
            {open
              ? `${openStop ? `Stop ${openStop.seq} · ` : ""}${open.orderNumber}`
              : `${user.name} · ${summary.stops} stops · ${formatKm(summary.totalKm)}`}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.replace("/driver-login");
            }}
            aria-label="Log out"
            className="flex h-9 w-9 items-center justify-center rounded-full text-fg-subtle hover:bg-raised"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </header>

      <main className="flex-1 p-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : open ? (
          <DeliveryStop
            order={open}
            stop={openStop}
            onDone={() => {
              setOpenId(null);
              refresh();
            }}
            onChanged={refresh}
          />
        ) : (orders ?? []).length === 0 ? (
          <EmptyState
            icon={Check}
            title="Nothing left to deliver"
            subtitle="Every stop on your run is done. Nice work!"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* The run is sequenced nearest-first from the hub, so working
                straight down this list is the shortest sensible route. */}
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs text-fg-subtle">
                From {area.hub.name} · {radiusOf(area)} km
                {summary.beyondRadius > 0 && ` · ${summary.beyondRadius} past it`}
                {summary.unmapped > 0 && ` · ${summary.unmapped} not on the map`}
              </p>
              <div className="flex shrink-0 rounded-lg border border-line bg-surface p-0.5">
                <TabButton active={view === "list"} onClick={() => setView("list")} icon={List}>
                  Route
                </TabButton>
                <TabButton active={view === "map"} onClick={() => setView("map")} icon={MapIcon}>
                  Map
                </TabButton>
              </div>
            </div>

            {view === "map" ? (
              <>
                <DriverRouteMap
                  area={area}
                  stops={stops}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  className="h-[52vh]"
                />
                {selected ? (
                  <div className="rounded-xl border border-line bg-surface p-3">
                    <p className="text-sm font-bold text-fg">
                      {selected.seq}. {selected.order.businessName}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {selected.order.delivery.address}, {selected.order.delivery.city}
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <Button size="sm" onClick={() => setOpenId(selected.order.id)}>
                        Open stop
                      </Button>
                      <NavigateButton stop={selected} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-fg-subtle">
                    Tap a numbered pin to see that stop. Blue pins are exact addresses, light blue
                    are pincode centres, and amber means outside our pincodes or past the{" "}
                    {radiusOf(area)} km ring.
                  </p>
                )}
              </>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {stops.map((stop) => (
                  <li key={stop.order.id}>
                    <div className="flex items-stretch gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(stop.order.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left shadow-card transition-shadow hover:shadow-card-hover"
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white",
                            !stop.served || stop.beyondRadius
                              ? "bg-amber-500"
                              : stop.precision === "PINCODE"
                                ? "bg-sky-500"
                                : "bg-blue-600"
                          )}
                        >
                          {stop.seq}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-fg">
                            {stop.order.businessName}
                          </span>
                          <span className="block truncate text-xs text-fg-subtle">
                            {stop.order.delivery.address}, {stop.order.delivery.city}
                          </span>
                          <span className="mt-0.5 block truncate text-2xs font-semibold text-fg-subtle">
                            {stop.order.delivery.pincode || "no pincode"}
                            {stop.legKm !== null &&
                              ` · ${formatKm(stop.legKm)} ${stop.seq === 1 ? "from the hub" : "from previous"}`}
                          </span>
                          {/* Warnings get their own line — on a narrow phone
                              they were the first thing an ellipsis ate. */}
                          {(!stop.served || stop.beyondRadius || stop.precision !== "PIN") && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {!stop.served && <StopFlag tone="amber">outside our area</StopFlag>}
                              {stop.beyondRadius && (
                                <StopFlag tone="amber">
                                  {formatKm(stop.hubKm)} out · past {radiusOf(area)} km
                                </StopFlag>
                              )}
                              {stop.precision === "PINCODE" && (
                                <StopFlag tone="sky">approx. location</StopFlag>
                              )}
                              {stop.precision === "NONE" && (
                                <StopFlag tone="amber">not on the map</StopFlag>
                              )}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-extrabold text-fg">
                            {formatCurrency(payableTotal(stop.order))}
                          </span>
                          <span className="block text-2xs font-semibold text-fg-subtle">
                            {stop.order.items.length} item
                            {stop.order.items.length === 1 ? "" : "s"}
                          </span>
                        </span>
                      </button>
                      <a
                        href={navigationUrl(stop)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Navigate to ${stop.order.businessName}`}
                        className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-brand-500 shadow-card"
                      >
                        <Navigation className="h-4 w-4" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StopFlag({ tone, children }: { tone: "amber" | "sky"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-2xs font-bold",
        tone === "amber" ? "bg-amber-500/15 text-amber-600" : "bg-sky-500/15 text-sky-600"
      )}
    >
      {children}
    </span>
  );
}

/** Hand the stop to the phone's maps app — drivers already trust it for
 *  traffic and one-ways, and it keeps working with the screen locked. */
function NavigateButton({ stop }: { stop: RunStop }) {
  return (
    <a
      href={navigationUrl(stop)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-sm font-bold text-brand-500"
    >
      <Navigation className="h-4 w-4" aria-hidden />
      Navigate
    </a>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof List;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
        active ? "bg-brand-500 text-white" : "text-fg-muted hover:bg-raised"
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </button>
  );
}

/** One stop: show the goods, let the buyer refuse what they don't want, then
 *  collect the adjusted amount and close the delivery. */
function DeliveryStop({
  order,
  stop,
  onDone,
  onChanged,
}: {
  order: Order;
  stop: RunStop | null;
  onDone: () => void;
  onChanged: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const adj = order.adjustment;
  const lines: AdjustmentLine[] = useMemo(
    () =>
      order.items
        .map((i) => buildAdjustmentLine(i, qty[i.productId] ?? 0))
        .filter((l) => l.rejectedQty > 0),
    [order.items, qty]
  );
  const refund = totalRefundOf(lines);
  const limit = driverApprovalLimit(order.total);
  const needsApproval = refund > limit;
  const payable = payableTotal(order);
  const collectable = isCollectable(order);

  async function submitRejection() {
    if (!api.createDeliveryAdjustment) return;
    if (!lines.length) {
      setError("Mark how much of each item the buyer refused.");
      return;
    }
    if (!reason.trim()) {
      setError("Add a short reason — it's what the office reviews.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createDeliveryAdjustment(order.id, { lines, reason, photos });
      setRejecting(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record the rejection.");
    } finally {
      setBusy(false);
    }
  }

  async function collectAndDeliver() {
    setBusy(true);
    setError(null);
    try {
      await api.setOrderPaid(order.id, true);
      await api.updateOrderStatus(order.id, "DELIVERED");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't complete the delivery.");
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const shots = await Promise.all(Array.from(files).slice(0, 4).map((f) => compressPhoto(f)));
    setPhotos((p) => [...p, ...shots].slice(0, 4));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Where and who */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="flex items-start gap-2 text-sm text-fg">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
          <span>
            {order.delivery.address}, {order.delivery.city} — {order.delivery.pincode}
          </span>
        </p>
        {stop?.precision === "PINCODE" && (
          <p className="mt-1.5 text-2xs font-semibold text-sky-600">
            Map pin is the pincode centre — call before the last turn.
          </p>
        )}
        {stop && !stop.served && (
          <p className="mt-1.5 text-2xs font-semibold text-amber-600">
            This pincode isn&apos;t in our delivery area — flag it to the office.
          </p>
        )}
        {stop?.beyondRadius && (
          <p className="mt-1.5 text-2xs font-semibold text-amber-600">
            {formatKm(stop.hubKm)} from the hub — past the delivery radius.
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <a
            href={`tel:${order.delivery.phone}`}
            className="flex items-center gap-2 text-sm font-semibold text-brand-500"
          >
            <Phone className="h-4 w-4" aria-hidden />
            {order.delivery.phone}
          </a>
          {stop && <NavigateButton stop={stop} />}
        </div>
      </div>

      {/* Goods */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-subtle">
            Goods — buyer checks before paying
          </p>
        </div>
        <ul className="divide-y divide-line">
          {order.items.map((i) => {
            const refused = adj?.lines.find((l) => l.productId === i.productId)?.rejectedQty ?? 0;
            return (
              <li key={i.productId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{i.name}</p>
                  <p className="text-xs text-fg-subtle">
                    {i.qty} {i.unit} × {formatCurrency(i.price)}
                    {refused > 0 && (
                      <span className="ml-1 font-bold text-amber-500">
                        · {refused} {i.unit} refused
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-fg">{formatCurrency(i.lineTotal)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Existing adjustment */}
      {adj && (
        <div
          className={cn(
            "rounded-xl border p-3",
            adj.status === "PENDING"
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-brand-500/30 bg-brand-500/10"
          )}
        >
          <p className="flex items-center gap-2 text-sm font-bold text-fg">
            {adj.status === "PENDING" ? (
              <Clock className="h-4 w-4 text-amber-500" aria-hidden />
            ) : (
              <Check className="h-4 w-4 text-brand-500" aria-hidden />
            )}
            {adj.status === "PENDING"
              ? "Waiting for office approval"
              : `${formatCurrency(adj.totalRefund)} taken off the bill`}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">{adj.reason}</p>
          {adj.status === "PENDING" && (
            <p className="mt-1.5 text-xs font-semibold text-amber-600">
              Don&apos;t collect payment yet — the office is reviewing your photos.
            </p>
          )}
          {adj.status === "REJECTED" && (
            <p className="mt-1.5 text-xs text-fg-subtle">
              Office says the goods were fine. Bring them back — the buyer still isn&apos;t charged
              for them.
            </p>
          )}
        </div>
      )}

      {/* Reject flow */}
      {!adj && !rejecting && (
        <Button variant="outline" onClick={() => setRejecting(true)} leadingIcon={<X className="h-4 w-4" />}>
          Buyer refused something
        </Button>
      )}

      {rejecting && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-bold text-fg">What did they refuse?</p>
          {order.items.map((i) => (
            <div key={i.productId} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{i.name}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={i.qty}
                  inputMode="decimal"
                  aria-label={`${i.name} refused quantity`}
                  value={qty[i.productId] ?? ""}
                  onChange={(e) =>
                    setQty((q) => ({ ...q, [i.productId]: Number(e.target.value) || 0 }))
                  }
                  className="h-9 w-20 rounded-lg border border-line bg-surface px-2 text-right text-sm font-bold text-fg outline-none focus:border-amber-500"
                  placeholder="0"
                />
                <span className="w-6 text-xs text-fg-subtle">{i.unit}</span>
              </div>
            </div>
          ))}

          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason — e.g. tomatoes crushed"
            aria-label="Reason"
            className="h-11 rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-amber-500"
          />

          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => addPhotos(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              leadingIcon={<Camera className="h-4 w-4" />}
            >
              {photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"}` : "Add photo"}
            </Button>
            {photos.length > 0 && (
              <div className="mt-2 flex gap-2">
                {photos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt={`Evidence ${i + 1}`}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          {refund > 0 && (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold",
                needsApproval ? "text-amber-600" : "text-brand-600"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {needsApproval
                ? `${formatCurrency(refund)} is over your ${formatCurrency(limit)} limit — the office must approve before you collect.`
                : `${formatCurrency(refund)} is within your ${formatCurrency(limit)} limit — settles straight away.`}
            </p>
          )}

          <div className="flex gap-2">
            <Button loading={busy} onClick={submitRejection}>
              Record rejection
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {/* Collect */}
      <div className="sticky bottom-0 mt-1 rounded-xl border border-line bg-surface p-3 shadow-cart-bar">
        <div className="flex items-center justify-between">
          <span className="text-sm text-fg-muted">Collect now</span>
          <span className="text-xl font-extrabold text-fg">{formatCurrency(payable)}</span>
        </div>
        {adj && adj.status !== "PENDING" && (
          <p className="mt-0.5 text-right text-xs text-fg-subtle">
            {formatCurrency(order.total)} less {formatCurrency(adj.totalRefund)} refused
          </p>
        )}
        <Button
          className="mt-2.5"
          fullWidth
          size="lg"
          loading={busy}
          disabled={!collectable}
          onClick={collectAndDeliver}
          leadingIcon={<IndianRupee className="h-4 w-4" />}
        >
          {collectable
            ? `Collect ${formatCurrency(payable)} & mark delivered`
            : "Waiting for office approval"}
        </Button>
      </div>
    </div>
  );
}
