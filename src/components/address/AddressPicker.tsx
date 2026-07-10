"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Circle, Map as LeafletMap } from "leaflet";
import { Crosshair, Loader2, MapPin, Minus, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickedAddress {
  /** Full formatted address (house line + locality). */
  address: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  /** Home / Work / Other */
  label?: string;
}

// Fallback center if we have no saved pin and the user denies location.
const DEFAULT_CENTER = { lat: 17.385, lng: 78.4867 }; // Hyderabad
const LABELS = ["Home", "Work", "Other"];

/**
 * Swiggy/Zepto-style address picker: an OpenStreetMap (Leaflet) map with a
 * fixed centre pin — pan the map under the pin to position it. "Use my location"
 * jumps to the device's GPS fix; a search box geocodes a place name. The pin's
 * coordinates are reverse-geocoded into a real address as you move. No API key.
 */
export function AddressPicker({
  initial,
  busy,
  confirmLabel = "Confirm location",
  mapClassName = "h-72",
  onConfirm,
}: {
  initial?: Partial<PickedAddress> | null;
  busy?: boolean;
  confirmLabel?: string;
  mapClassName?: string;
  onConfirm: (addr: PickedAddress) => void;
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const circleRef = useRef<Circle | null>(null);

  const [center, setCenter] = useState({
    lat: initial?.lat ?? DEFAULT_CENTER.lat,
    lng: initial?.lng ?? DEFAULT_CENTER.lng,
  });
  const [addr, setAddr] = useState({
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    pincode: initial?.pincode ?? "",
  });
  const [houseLine, setHouseLine] = useState("");
  const [label, setLabel] = useState(initial?.label ?? "Home");
  const [search, setSearch] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setGeoLoading(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const d = await r.json();
      const a = d.address ?? {};
      setAddr({
        address: d.display_name ?? "",
        city: a.city || a.town || a.village || a.suburb || a.county || "",
        pincode: a.postcode || "",
      });
    } catch {
      /* keep the previous address on a transient failure */
    } finally {
      setGeoLoading(false);
    }
  }, []);

  // Initialize the Leaflet map once (client-only; dynamic import avoids SSR).
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current || mapRef.current) return;
      const map = L.map(mapEl.current, {
        zoomControl: false,
        attributionControl: true,
        maxZoom: 21,
      }).setView([center.lat, center.lng], 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        // OSM serves tiles up to z19; Leaflet up-scales them past that so the
        // user can keep zooming in and drop the pin to ~1 m precision.
        maxNativeZoom: 19,
        maxZoom: 21,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      map.on("moveend", () => {
        const c = map.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
        if (geoTimer.current) clearTimeout(geoTimer.current);
        geoTimer.current = setTimeout(() => reverseGeocode(c.lat, c.lng), 500);
      });
      mapRef.current = map;
      // Sheets animate in, so the container can be mid-resize when the map
      // mounts — re-measure on a few ticks AND whenever it actually resizes,
      // else Leaflet paints into a stale/zero-size box and the tiles come up
      // gray (the "map not loading when changing address" bug).
      [60, 250, 500, 900].forEach((t) =>
        timers.push(setTimeout(() => map.invalidateSize(), t))
      );
      if (typeof ResizeObserver !== "undefined" && mapEl.current) {
        ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(mapEl.current);
      }
      if (!initial?.address) reverseGeocode(center.lat, center.lng);
      // Fresh capture (no saved pin) → grab the device's GPS location now.
      if (initial?.lat == null) captureLocation();
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      timers.forEach(clearTimeout);
      if (geoTimer.current) clearTimeout(geoTimer.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function captureLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        const { latitude, longitude, accuracy: acc } = pos.coords;
        setAccuracy(acc);
        const map = mapRef.current;
        if (!map) return;
        // Zoom proportionally to how tight the GPS fix is — a sub-30 m fix
        // jumps right in so the pin can be nudged to the exact doorstep.
        map.setView([latitude, longitude], acc <= 30 ? 20 : acc <= 100 ? 18 : 16);
        // Draw / refresh the GPS accuracy circle so the user sees how precise
        // the fix is (high-accuracy GPS is typically well within 100 m).
        const L = await import("leaflet");
        if (circleRef.current) {
          circleRef.current.setLatLng([latitude, longitude]).setRadius(acc);
        } else {
          circleRef.current = L.circle([latitude, longitude], {
            radius: acc,
            color: "#059669",
            weight: 1,
            fillColor: "#059669",
            fillOpacity: 0.12,
          }).addTo(map);
        }
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location — allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setError(null);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          search
        )}&limit=1&countrycodes=in`,
        { headers: { "Accept-Language": "en" } }
      );
      const d = await r.json();
      if (d[0]) mapRef.current?.setView([parseFloat(d[0].lat), parseFloat(d[0].lon)], 17);
      else setError("No match — try a nearby landmark or area.");
    } catch {
      setError("Search failed — check your connection.");
    }
  }

  function handleConfirm() {
    if (!addr.address) {
      setError("Move the map to position the pin on your address.");
      return;
    }
    const full = houseLine.trim() ? `${houseLine.trim()}, ${addr.address}` : addr.address;
    onConfirm({
      address: full,
      city: addr.city,
      pincode: addr.pincode,
      lat: center.lat,
      lng: center.lng,
      label,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <form onSubmit={runSearch} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search area, street, landmark…"
          className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />
      </form>

      {/* Map with fixed centre pin + locate button */}
      <div className={cn("relative overflow-hidden rounded-xl border border-line", mapClassName)}>
        <div ref={mapEl} className="h-full w-full" />
        {/* Fixed pin — tip sits at the exact map centre */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full">
          <MapPin className="h-11 w-11 fill-brand-500 text-white drop-shadow-lg" strokeWidth={2} />
        </div>
        {/* Exact-coordinate target — pulsing halo + dot marking the precise point */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2">
          <span className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-brand-500/30" />
          <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-700 ring-2 ring-white" />
        </div>
        {accuracy != null && (
          <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-full bg-canvas/90 px-2.5 py-1 text-2xs font-bold text-brand-300 shadow">
            GPS · accurate to ~{Math.round(accuracy)} m
          </div>
        )}
        {/* Zoom controls — tap to zoom; pinch also works */}
        <div className="absolute right-3 top-3 z-[1000] flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-md">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
            className="flex h-9 w-9 items-center justify-center text-fg-muted transition-colors hover:bg-brand-500/15 active:bg-brand-500/20"
          >
            <Plus className="h-5 w-5" />
          </button>
          <span className="h-px bg-line" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
            className="flex h-9 w-9 items-center justify-center text-fg-muted transition-colors hover:bg-brand-500/15 active:bg-brand-500/20"
          >
            <Minus className="h-5 w-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={captureLocation}
          className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-xs font-bold text-brand-300 shadow-md transition-colors hover:bg-brand-500/15"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          {locating ? "Locating…" : "Use my location"}
        </button>
      </div>

      {/* Live address read-out */}
      <div className="rounded-xl border border-line bg-raised p-3">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Delivering to
            </p>
            {geoLoading ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-fg-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding address…
              </p>
            ) : (
              <p className="mt-0.5 text-sm font-medium text-fg">
                {addr.address || "Move the map to set your location"}
              </p>
            )}
            <p className="mt-1 text-2xs text-fg-subtle">
              📍 {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
            </p>
          </div>
        </div>
      </div>

      {/* House / flat / landmark */}
      <input
        value={houseLine}
        onChange={(e) => setHouseLine(e.target.value)}
        placeholder="Flat / House no. / Building / Landmark"
        className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      />

      {/* Label */}
      <div className="flex gap-2">
        {LABELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLabel(l)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              label === l
                ? "bg-brand-500 text-white"
                : "border border-line bg-surface text-fg-muted hover:bg-raised"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        disabled={busy || geoLoading || !addr.address}
        onClick={handleConfirm}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Saving…" : confirmLabel}
      </button>
    </div>
  );
}

/** Small non-interactive map showing a saved pin — used for the checkout /
 *  account "this is where we'll deliver" confirmation. */
export function AddressMapPreview({
  lat,
  lng,
  className = "h-28",
}: {
  lat: number;
  lng: number;
  className?: string;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !el.current) return;
      if (!mapRef.current) {
        const map = L.map(el.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          touchZoom: false,
          keyboard: false,
          boxZoom: false,
        }).setView([lat, lng], 16);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
        // Re-measure across the sheet's open animation so tiles aren't gray.
        [80, 300, 600].forEach((t) =>
          setTimeout(() => {
            if (mapRef.current === map) map.invalidateSize();
          }, t)
        );
      } else {
        mapRef.current.setView([lat, lng], 16);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    []
  );

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line", className)}>
      <div ref={el} className="h-full w-full" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
        <MapPin className="h-8 w-8 fill-brand-500 text-white drop-shadow-lg" strokeWidth={2} />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-700 ring-2 ring-white" />
    </div>
  );
}
