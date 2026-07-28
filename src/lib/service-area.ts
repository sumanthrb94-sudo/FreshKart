import type { Order } from "@/lib/types";
import { payableTotal } from "./delivery-adjustment";

/**
 * Where we deliver, and in what order a driver should work a run.
 *
 * Two separate jobs live here:
 *
 *  1. The service area — the hub the van leaves from and the pincodes we
 *     actually serve. Admin-managed and stored in Firestore, because it
 *     changes as the business expands and must not need a deploy.
 *  2. Turning a bag of orders into a *route* — a numbered sequence a driver
 *     can follow down the page, nearest stop first from the hub.
 *
 * Everything here is pure and offline: no routing API, no keys, no network.
 * Distances are straight-line, which is the right trade for a city run —
 * road distance would order stops almost identically at these scales while
 * costing an API call per pair.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** One pincode we deliver to, with the centre used to place it on the map. */
export interface ServicePincode {
  /** 6-digit Indian PIN. */
  code: string;
  /** Human name for the locality — what the driver actually recognises. */
  area: string;
  lat: number;
  lng: number;
}

export interface ServiceHub {
  /** e.g. "KGM Fresh, Upperpally" — shown as the start of the run. */
  name: string;
  lat: number;
  lng: number;
  pincode?: string;
}

export interface ServiceArea {
  hub: ServiceHub;
  /**
   * How far from the hub we are willing to run. Stops beyond it still get
   * routed — the van is already loaded and the buyer is already waiting —
   * but they are flagged, so a creeping delivery footprint is visible on the
   * day it starts creeping rather than a month later in the fuel bill.
   * Optional: areas saved before this existed fall back to the default.
   */
  radiusKm?: number;
  pincodes: ServicePincode[];
  updatedAt?: string;
  updatedBy?: string;
}

/** Used when an area has no radius of its own. */
export const DEFAULT_RADIUS_KM = 15;

export function radiusOf(area: ServiceArea): number {
  return area.radiusKm && area.radiusKm > 0 ? area.radiusKm : DEFAULT_RADIUS_KM;
}

/**
 * Starter service area, used until an admin saves a real one.
 *
 * The centres are approximate locality centroids — good enough to draw a
 * map and sequence a run, and every one of them is replaced with a true
 * centroid the moment an admin re-locates it from the delivery-area editor.
 * Treat this as a first-run placeholder, not as the definition of where we
 * deliver.
 */
export const DEFAULT_SERVICE_AREA: ServiceArea = {
  hub: {
    name: "KGM Fresh, Upperpally",
    // Placed from the postal address (Yerraboda, Upperpally, 500048), so it
    // is accurate to a kilometre or two, not to the gate. Standing at the
    // store, "Set to my location" in the admin delivery-area card fixes it
    // exactly — everything downstream measures from this point.
    lat: 17.3436,
    lng: 78.4237,
    pincode: "500048",
  },
  radiusKm: DEFAULT_RADIUS_KM,
  // Approximate locality centres for the pincodes within reach of the hub.
  // Re-adding any of them from the admin card replaces the guess with the
  // geocoder's real centroid.
  pincodes: [
    { code: "500005", area: "Charminar", lat: 17.3616, lng: 78.4747 },
    { code: "500008", area: "Langar Houz", lat: 17.383, lng: 78.403 },
    { code: "500028", area: "Mehdipatnam", lat: 17.393, lng: 78.434 },
    { code: "500030", area: "Rajendranagar", lat: 17.322, lng: 78.403 },
    { code: "500032", area: "Gachibowli", lat: 17.44, lng: 78.3489 },
    { code: "500033", area: "Banjara Hills", lat: 17.4126, lng: 78.438 },
    { code: "500034", area: "Somajiguda", lat: 17.4239, lng: 78.4483 },
    { code: "500048", area: "Upperpally", lat: 17.3436, lng: 78.4237 },
    { code: "500064", area: "Bahadurpura", lat: 17.353, lng: 78.447 },
    { code: "500073", area: "Manikonda", lat: 17.405, lng: 78.372 },
    { code: "500079", area: "Dilsukhnagar", lat: 17.3687, lng: 78.5247 },
    { code: "500089", area: "Narsingi", lat: 17.403, lng: 78.354 },
  ],
};

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Straight-line distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Normalise whatever was typed into a bare 6-digit PIN, or null. */
export function normalizePincode(value: string | undefined | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 6 ? digits : null;
}

export function findServicePincode(area: ServiceArea, pincode?: string): ServicePincode | null {
  const code = normalizePincode(pincode);
  if (!code) return null;
  return area.pincodes.find((p) => p.code === code) ?? null;
}

/** True when this address is inside the area we have committed to serve. */
export function isServedPincode(area: ServiceArea, pincode?: string): boolean {
  return findServicePincode(area, pincode) !== null;
}

/**
 * How we know where a stop is.
 *  PIN     — the buyer dropped an exact pin with the map picker.
 *  PINCODE — we only know the locality centre, so the marker is approximate.
 *  NONE    — no coordinates at all; the driver has to go by the address text.
 */
export type StopPrecision = "PIN" | "PINCODE" | "NONE";

export interface StopLocation {
  point: GeoPoint | null;
  precision: StopPrecision;
}

/** Best available coordinates for an order, exact pin first. */
export function locateOrder(order: Order, area: ServiceArea): StopLocation {
  const { lat, lng } = order.delivery;
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { point: { lat, lng }, precision: "PIN" };
  }
  const pin = findServicePincode(area, order.delivery.pincode);
  if (pin) return { point: { lat: pin.lat, lng: pin.lng }, precision: "PINCODE" };
  return { point: null, precision: "NONE" };
}

/**
 * One address the van actually stops at, and everything being dropped there.
 *
 * A shop that ordered three times during the day is ONE visit, not three.
 * Routing per order sent the driver knocking on the same door three times,
 * doing three inspections and taking three payments — roughly eight wasted
 * minutes per extra order, every one of them in front of a waiting customer.
 */
export interface RunVisit {
  /** buyerId + address + pincode — the same fingerprint the packing slips use. */
  key: string;
  businessName: string;
  address: string;
  city: string;
  pincode: string;
  phone: string;
  /** Every order for this address on this run, oldest first. */
  orders: Order[];
  /** 1-based position in the run. */
  seq: number;
  point: GeoPoint | null;
  precision: StopPrecision;
  legKm: number | null;
  cumulativeKm: number | null;
  hubKm: number | null;
  beyondRadius: boolean;
  served: boolean;
}

export interface RunStop {
  order: Order;
  /** 1-based position in the run. */
  seq: number;
  point: GeoPoint | null;
  precision: StopPrecision;
  /** Distance from the previous stop (from the hub for the first one). */
  legKm: number | null;
  /** Distance covered by the time this stop is reached. */
  cumulativeKm: number | null;
  /** Straight-line distance from the hub — what the radius is measured on. */
  hubKm: number | null;
  /** True when the stop is further from the hub than we said we'd go. */
  beyondRadius: boolean;
  /** False when the address sits outside the pincodes we serve. */
  served: boolean;
}

/** Two orders share a stop when they go to the same door. */
export function visitKey(order: Order): string {
  const norm = (v: string | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${order.buyerId}::${norm(order.delivery.address)}::${norm(order.delivery.pincode)}`;
}

/**
 * Plan the run as a sequence of VISITS — one per address — nearest-first
 * from the hub.
 *
 * The ordering is the classic greedy nearest-neighbour tour. It is not the
 * shortest possible route, but a driver can *predict* it: the next stop is
 * always the nearest one left. A route nobody can predict gets ignored, and
 * an ignored route is worse than none.
 *
 * Addresses we cannot place on the map keep their original order and go
 * last, so a stop with no pin never silently disappears from the run.
 */
export function planRun(orders: Order[], area: ServiceArea): RunVisit[] {
  const groups = new Map<string, Order[]>();
  for (const order of orders) {
    const key = visitKey(order);
    const existing = groups.get(key);
    if (existing) existing.push(order);
    else groups.set(key, [order]);
  }

  interface Candidate {
    key: string;
    orders: Order[];
    point: GeoPoint | null;
    precision: StopPrecision;
  }
  const located: Candidate[] = [];
  const unlocated: Candidate[] = [];
  for (const [key, group] of groups) {
    group.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    // One exact pin among the group is enough to place the whole visit.
    const best = group
      .map((o) => locateOrder(o, area))
      .sort((a, b) => precisionRank(a.precision) - precisionRank(b.precision))[0];
    const candidate: Candidate = { key, orders: group, point: best.point, precision: best.precision };
    if (best.point) located.push(candidate);
    else unlocated.push(candidate);
  }

  const hub: GeoPoint = { lat: area.hub.lat, lng: area.hub.lng };
  const radius = radiusOf(area);
  const visits: RunVisit[] = [];
  const remaining = [...located];
  let cursor = hub;
  let cumulative = 0;

  const build = (c: Candidate, legKm: number | null): RunVisit => {
    const head = c.orders[0];
    const hubKm = c.point ? haversineKm(hub, c.point) : null;
    return {
      key: c.key,
      businessName: head.businessName,
      address: head.delivery.address,
      city: head.delivery.city,
      pincode: head.delivery.pincode,
      phone: head.delivery.phone,
      orders: c.orders,
      seq: visits.length + 1,
      point: c.point,
      precision: c.precision,
      legKm,
      cumulativeKm: legKm === null ? null : cumulative,
      hubKm,
      beyondRadius: hubKm !== null && hubKm > radius,
      served: isServedPincode(area, head.delivery.pincode),
    };
  };

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestKm = haversineKm(cursor, remaining[0].point!);
    for (let i = 1; i < remaining.length; i++) {
      const km = haversineKm(cursor, remaining[i].point!);
      if (km < bestKm) {
        bestKm = km;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    cumulative += bestKm;
    visits.push(build(next, bestKm));
    cursor = next.point!;
  }
  for (const c of unlocated) visits.push(build(c, null));

  return visits;
}

function precisionRank(p: StopPrecision): number {
  return p === "PIN" ? 0 : p === "PINCODE" ? 1 : 2;
}

/** Total payable across a visit — what the driver collects at that door. */
export function visitTotal(visit: RunVisit): number {
  return visit.orders.reduce((sum, o) => sum + payableTotal(o), 0);
}

/**
 * Order the stops nearest-first: start at the hub, then repeatedly take the
 * closest stop not yet visited.
 *
 * This is the classic greedy nearest-neighbour tour. It is not the shortest
 * possible route — no cheap algorithm is — but it beats an arbitrary order
 * decisively, it is stable, and above all a driver can *predict* it: the
 * next stop is always the nearest one left. A route nobody can predict gets
 * ignored, and an ignored route is worse than none.
 *
 * Stops we cannot place on the map keep their original order and go last,
 * so an address with no pin never silently disappears from the run.
 */
export function sequenceRun(orders: Order[], area: ServiceArea): RunStop[] {
  // Derived from planRun so the numbered list, the map and the per-order view
  // can never disagree about the route. Orders sharing a door are adjacent
  // with a zero-length leg between them.
  const stops: RunStop[] = [];
  for (const visit of planRun(orders, area)) {
    visit.orders.forEach((order, i) => {
      stops.push({
        order,
        seq: stops.length + 1,
        point: visit.point,
        precision: visit.precision,
        legKm: visit.legKm === null ? null : i === 0 ? visit.legKm : 0,
        cumulativeKm: visit.cumulativeKm,
        hubKm: visit.hubKm,
        beyondRadius: visit.beyondRadius,
        served: visit.served,
      });
    });
  }
  return stops;
}

export interface RunSummary {
  stops: number;
  /** Hub → every stop in sequence. Excludes the trip back. */
  totalKm: number;
  mapped: number;
  unmapped: number;
  /** Stops whose pincode is outside the service area. */
  outsideArea: number;
  /** Stops further from the hub than the agreed radius. */
  beyondRadius: number;
}

export function summarizeRun(stops: RunStop[]): RunSummary {
  const mapped = stops.filter((s) => s.point !== null);
  return {
    stops: stops.length,
    totalKm: mapped.length ? (mapped[mapped.length - 1].cumulativeKm ?? 0) : 0,
    mapped: mapped.length,
    unmapped: stops.length - mapped.length,
    outsideArea: stops.filter((s) => !s.served).length,
    beyondRadius: stops.filter((s) => s.beyondRadius).length,
  };
}

/** Bounding box that fits the hub and every mapped stop, for the map view. */
export function runBounds(area: ServiceArea, stops: RunStop[]): [GeoPoint, GeoPoint] | null {
  const points = [{ lat: area.hub.lat, lng: area.hub.lng }, ...stops.flatMap((s) => (s.point ? [s.point] : []))];
  if (points.length < 2) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [
    { lat: Math.min(...lats), lng: Math.min(...lngs) },
    { lat: Math.max(...lats), lng: Math.max(...lngs) },
  ];
}

/**
 * Hand off to the phone's maps app for turn-by-turn. We deliberately do not
 * build navigation ourselves — the driver already trusts Google Maps for
 * traffic and one-ways, and it works with the screen locked.
 */
export function navigationUrl(stop: { point: GeoPoint | null; order: Order }): string {
  if (stop.point) {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.point.lat},${stop.point.lng}`;
  }
  const { address, city, pincode } = stop.order.delivery;
  const query = encodeURIComponent([address, city, pincode].filter(Boolean).join(", "));
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

/** "1.2 km" / "850 m" — short enough for a list row. */
export function formatKm(km: number | null): string {
  if (km === null) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
