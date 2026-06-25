"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
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
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current || mapRef.current) return;
      const map = L.map(mapEl.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([center.lat, center.lng], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      map.on("moveend", () => {
        const c = map.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
        if (geoTimer.current) clearTimeout(geoTimer.current);
        geoTimer.current = setTimeout(() => reverseGeocode(c.lat, c.lng), 500);
      });
      mapRef.current = map;
      // The container may have animated in (e.g. a sheet) — re-measure.
      setTimeout(() => map.invalidateSize(), 200);
      if (!initial?.address) reverseGeocode(center.lat, center.lng);
    })();
    return () => {
      cancelled = true;
      if (geoTimer.current) clearTimeout(geoTimer.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17);
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location — allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search area, street, landmark…"
          className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </form>

      {/* Map with fixed centre pin + locate button */}
      <div className={cn("relative overflow-hidden rounded-xl border border-gray-200", mapClassName)}>
        <div ref={mapEl} className="h-full w-full" />
        {/* Fixed pin — tip sits at the map centre */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full">
          <MapPin className="h-9 w-9 fill-brand-500 text-brand-700 drop-shadow-md" strokeWidth={1.5} />
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-brand-700 shadow-md transition-colors hover:bg-brand-50"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          {locating ? "Locating…" : "Use my location"}
        </button>
      </div>

      {/* Live address read-out */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Delivering to
            </p>
            {geoLoading ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding address…
              </p>
            ) : (
              <p className="mt-0.5 text-sm font-medium text-gray-800">
                {addr.address || "Move the map to set your location"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* House / flat / landmark */}
      <input
        value={houseLine}
        onChange={(e) => setHouseLine(e.target.value)}
        placeholder="Flat / House no. / Building / Landmark"
        className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
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
