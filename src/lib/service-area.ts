import type { Order } from "@/lib/types";

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
  /** e.g. "Bowenpally Market" — shown as the start of the run. */
  name: string;
  lat: number;
  lng: number;
  pincode?: string;
}

export interface ServiceArea {
  hub: ServiceHub;
  pincodes: ServicePincode[];
  updatedAt?: string;
  updatedBy?: string;
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
  hub: { name: "Bowenpally Market", lat: 17.4756, lng: 78.4744, pincode: "500011" },
  pincodes: [
    { code: "500003", area: "Secunderabad", lat: 17.4399, lng: 78.4983 },
    { code: "500016", area: "Begumpet", lat: 17.4435, lng: 78.4645 },
    { code: "500018", area: "Sanathnagar", lat: 17.456, lng: 78.434 },
    { code: "500029", area: "Himayatnagar", lat: 17.401, lng: 78.487 },
    { code: "500033", area: "Banjara Hills", lat: 17.4126, lng: 78.438 },
    { code: "500034", area: "Somajiguda", lat: 17.4239, lng: 78.4483 },
    { code: "500072", area: "Kukatpally", lat: 17.4849, lng: 78.4138 },
    { code: "500081", area: "Gachibowli", lat: 17.4483, lng: 78.3915 },
    { code: "500084", area: "Kondapur", lat: 17.463, lng: 78.364 },
    { code: "500049", area: "Nizampet", lat: 17.51, lng: 78.39 },
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
  /** False when the address sits outside the pincodes we serve. */
  served: boolean;
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
  const located: { order: Order; point: GeoPoint; precision: StopPrecision }[] = [];
  const unlocated: Order[] = [];

  for (const order of orders) {
    const { point, precision } = locateOrder(order, area);
    if (point) located.push({ order, point, precision });
    else unlocated.push(order);
  }

  const stops: RunStop[] = [];
  const remaining = [...located];
  let cursor: GeoPoint = { lat: area.hub.lat, lng: area.hub.lng };
  let cumulative = 0;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestKm = haversineKm(cursor, remaining[0].point);
    for (let i = 1; i < remaining.length; i++) {
      const km = haversineKm(cursor, remaining[i].point);
      if (km < bestKm) {
        bestKm = km;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    cumulative += bestKm;
    stops.push({
      order: next.order,
      seq: stops.length + 1,
      point: next.point,
      precision: next.precision,
      legKm: bestKm,
      cumulativeKm: cumulative,
      served: isServedPincode(area, next.order.delivery.pincode),
    });
    cursor = next.point;
  }

  for (const order of unlocated) {
    stops.push({
      order,
      seq: stops.length + 1,
      point: null,
      precision: "NONE",
      legKm: null,
      cumulativeKm: null,
      served: isServedPincode(area, order.delivery.pincode),
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
}

export function summarizeRun(stops: RunStop[]): RunSummary {
  const mapped = stops.filter((s) => s.point !== null);
  return {
    stops: stops.length,
    totalKm: mapped.length ? (mapped[mapped.length - 1].cumulativeKm ?? 0) : 0,
    mapped: mapped.length,
    unmapped: stops.length - mapped.length,
    outsideArea: stops.filter((s) => !s.served).length,
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
