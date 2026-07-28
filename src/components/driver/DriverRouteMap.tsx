"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { Crosshair, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { payableTotal } from "@/lib/delivery-adjustment";
import {
  formatKm,
  radiusOf,
  visitTotal,
  type RunVisit,
  type ServiceArea,
} from "@/lib/service-area";
import { cn } from "@/lib/utils";

/** Roughly how far a pincode's deliveries spread from its centre. Only used
 *  to shade the served area — nothing depends on it being exact. */
const PINCODE_RADIUS_M = 1600;

/**
 * The run, drawn on a map: the hub, the numbered stops in the order they
 * should be worked, and the pincodes we serve shaded underneath.
 *
 * Leaflet is imperative and Next renders on the server, so the map is
 * created once inside an effect after a dynamic import (same approach as the
 * buyer's AddressPicker), and the markers live in a layer group that is torn
 * down and rebuilt whenever the run changes.
 */
export function DriverRouteMap({
  area,
  visits,
  selectedKey,
  onSelect,
  className,
}: {
  area: ServiceArea;
  /** One pin per door — several orders to the same shop share a marker. */
  visits: RunVisit[];
  selectedKey?: string | null;
  onSelect: (visitKey: string) => void;
  className?: string;
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayer = useRef<LayerGroup | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const markersById = useRef<Record<string, Marker>>({});
  // onSelect is rebuilt on every parent render; hold it in a ref so the
  // marker-drawing effect doesn't tear the whole layer down each time.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- create the map once ---
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current || mapRef.current) return;
      const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView(
        [area.hub.lat, area.hub.lng],
        12
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxNativeZoom: 19,
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      mapRef.current = map;
      routeLayer.current = L.layerGroup().addTo(map);

      // The map often mounts inside a tab that was just switched on, so its
      // container can still be mid-layout. Re-measure once, debounced.
      const scheduleInvalidate = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (!cancelled) map.invalidateSize({ animate: false });
        }, 120);
      };
      scheduleInvalidate();
      if (typeof ResizeObserver !== "undefined" && mapEl.current) {
        ro = new ResizeObserver(scheduleInvalidate);
        ro.observe(mapEl.current);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      mapRef.current?.remove();
      mapRef.current = null;
      routeLayer.current = null;
      markersById.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- draw the service area, the hub, the route line and the stops ---
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      const layer = routeLayer.current;
      if (cancelled || !map || !layer) return;

      layer.clearLayers();
      markersById.current = {};

      // The radius we committed to, so a stop sitting outside it is obvious
      // at a glance rather than something you work out from the odometer.
      L.circle([area.hub.lat, area.hub.lng], {
        radius: radiusOf(area) * 1000,
        color: "#64748b",
        weight: 1,
        dashArray: "5 7",
        fill: false,
      })
        .bindTooltip(`${radiusOf(area)} km from ${area.hub.name}`, { direction: "top" })
        .addTo(layer);

      // Served pincodes, shaded underneath everything else.
      for (const p of area.pincodes) {
        L.circle([p.lat, p.lng], {
          radius: PINCODE_RADIUS_M,
          color: "#10b981",
          weight: 1,
          fillColor: "#10b981",
          fillOpacity: 0.07,
        })
          .bindTooltip(`${p.code} · ${p.area}`, { direction: "top" })
          .addTo(layer);
      }

      // The hub the run starts from.
      L.marker([area.hub.lat, area.hub.lng], {
        icon: L.divIcon({
          className: "",
          html: `<span style="display:flex;height:26px;width:26px;align-items:center;justify-content:center;border-radius:8px;background:#0f172a;color:#fff;font-size:11px;font-weight:800;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">H</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        keyboard: false,
      })
        .bindTooltip(area.hub.name, { direction: "top" })
        .addTo(layer);

      // The line the driver actually follows, hub first.
      const path: [number, number][] = [[area.hub.lat, area.hub.lng]];
      for (const v of visits) if (v.point) path.push([v.point.lat, v.point.lng]);
      if (path.length > 1) {
        L.polyline(path, {
          color: "#2563eb",
          weight: 3,
          opacity: 0.75,
          dashArray: "6 6",
        }).addTo(layer);
      }

      // Numbered stops — one per door, with a badge when several orders are
      // being dropped there.
      for (const visit of visits) {
        if (!visit.point) continue;
        const approx = visit.precision === "PINCODE";
        const bg = !visit.served || visit.beyondRadius ? "#f59e0b" : approx ? "#0ea5e9" : "#2563eb";
        const count = visit.orders.length;
        const badge =
          count > 1
            ? `<span style="position:absolute;top:-6px;right:-6px;display:flex;height:18px;min-width:18px;align-items:center;justify-content:center;border-radius:9999px;background:#0f172a;color:#fff;font-size:10px;font-weight:800;border:2px solid #fff;padding:0 3px">${count}</span>`
            : "";
        const marker = L.marker([visit.point.lat, visit.point.lng], {
          icon: L.divIcon({
            className: "",
            html: `<span style="position:relative;display:flex;height:30px;width:30px;align-items:center;justify-content:center;border-radius:9999px;background:${bg};color:#fff;font-size:13px;font-weight:800;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)">${visit.seq}${badge}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          title: `${visit.seq}. ${visit.businessName}`,
        }).addTo(layer);

        marker.bindPopup(
          `<div style="min-width:170px">
             <div style="font-weight:800;font-size:13px">${escapeHtml(visit.businessName)}</div>
             <div style="font-size:11px;opacity:.75;margin-top:2px">${escapeHtml(visit.address)}${
               visit.pincode ? ` — ${escapeHtml(visit.pincode)}` : ""
             }</div>
             <div style="font-size:12px;font-weight:700;margin-top:4px">${escapeHtml(
               formatCurrency(visitTotal(visit))
             )}${count > 1 ? ` · ${count} orders` : ""} · ${escapeHtml(formatKm(visit.legKm))} ${
               visit.seq === 1 ? "from the hub" : "from previous"
             }</div>
             ${approx ? '<div style="font-size:11px;color:#0369a1;margin-top:3px">Pincode centre — exact door not pinned</div>' : ""}
             ${!visit.served ? '<div style="font-size:11px;color:#b45309;margin-top:3px">Outside our delivery pincodes</div>' : ""}
             ${
               visit.beyondRadius
                 ? `<div style="font-size:11px;color:#b45309;margin-top:3px">${escapeHtml(
                     formatKm(visit.hubKm)
                   )} out — beyond our ${radiusOf(area)} km radius</div>`
                 : ""
             }
           </div>`
        );
        marker.on("click", () => selectRef.current(visit.key));
        markersById.current[visit.key] = marker;
      }

      // Frame the whole run.
      const framed = path.length > 1 ? L.latLngBounds(path) : null;
      if (framed) map.fitBounds(framed, { padding: [40, 40], maxZoom: 15 });
      else map.setView([area.hub.lat, area.hub.lng], 12);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, area, visits]);

  // --- follow the selected stop ---
  useEffect(() => {
    if (!selectedKey) return;
    const marker = markersById.current[selectedKey];
    const map = mapRef.current;
    if (!marker || !map) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
    marker.openPopup();
  }, [selectedKey]);

  const locateMe = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        const { latitude, longitude } = pos.coords;
        const L = await import("leaflet");
        if (meMarker.current) {
          meMarker.current.setLatLng([latitude, longitude]);
        } else {
          meMarker.current = L.marker([latitude, longitude], {
            icon: L.divIcon({
              className: "",
              html: `<span style="display:block;height:16px;width:16px;border-radius:9999px;background:#059669;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></span>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
          }).addTo(map);
        }
        map.setView([latitude, longitude], 15);
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Check location permission.");
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line", className)}>
      <div ref={mapEl} className="h-full w-full" data-testid="driver-route-map" />

      <button
        type="button"
        onClick={locateMe}
        aria-label="Show my location"
        className="absolute bottom-3 right-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-card"
      >
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
      </button>

      {error && (
        <p className="absolute inset-x-3 bottom-3 z-[1000] rounded-lg bg-red-500/90 px-3 py-1.5 text-2xs font-semibold text-white">
          {error}
        </p>
      )}
    </div>
  );
}

/** Popups take raw HTML, so anything from an order has to be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
