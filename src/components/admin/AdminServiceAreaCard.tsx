"use client";

import { useEffect, useState } from "react";
import { Crosshair, MapPin, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  DEFAULT_SERVICE_AREA,
  formatKm,
  haversineKm,
  normalizePincode,
  type ServiceArea,
  type ServicePincode,
} from "@/lib/service-area";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Where we deliver: the hub a run starts from and the pincodes we serve.
 *
 * This is the one place the delivery footprint is defined — the driver's map
 * and route sequence are drawn straight from it, so adding a pincode here is
 * how the business expands into a new locality, with no deploy.
 *
 * Each pincode is located through OpenStreetMap's public geocoder (the same
 * one the buyer address picker uses — no key, no billing). The centre it
 * returns is what places the stop on the map when a buyer never dropped an
 * exact pin.
 */
export function AdminServiceAreaCard() {
  const { user } = useAuth();
  const [area, setArea] = useState<ServiceArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const saved = api.getServiceArea ? await api.getServiceArea() : null;
        if (live) setArea(saved ?? DEFAULT_SERVICE_AREA);
      } catch {
        if (live) setArea(DEFAULT_SERVICE_AREA);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  function edit(next: ServiceArea) {
    setArea(next);
    setDirty(true);
    setNote(null);
  }

  /** Look a pincode up and add it with its real centre. */
  async function addPincode() {
    if (!area) return;
    const pin = normalizePincode(code);
    if (!pin) {
      setError("Enter a full 6-digit pincode.");
      return;
    }
    if (area.pincodes.some((p) => p.code === pin)) {
      setError(`${pin} is already in the list.`);
      return;
    }
    setLocating(true);
    setError(null);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&country=India&postalcode=${pin}&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const hits = (await r.json()) as { lat: string; lon: string; display_name?: string }[];
      if (!hits?.length) {
        setError(`Couldn't find ${pin} on the map. Check the pincode and try again.`);
        return;
      }
      const hit = hits[0];
      const entry: ServicePincode = {
        code: pin,
        area: (hit.display_name ?? pin).split(",")[0]?.trim() || pin,
        lat: Number(hit.lat),
        lng: Number(hit.lon),
      };
      edit({ ...area, pincodes: [...area.pincodes, entry].sort((a, b) => a.code.localeCompare(b.code)) });
      setCode("");
    } catch {
      setError("Lookup failed — check the connection and try again.");
    } finally {
      setLocating(false);
    }
  }

  function removePincode(pin: string) {
    if (!area) return;
    edit({ ...area, pincodes: area.pincodes.filter((p) => p.code !== pin) });
  }

  /** Put the hub where the admin is standing — i.e. at the warehouse. */
  function hubFromGps() {
    if (!area || typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        edit({
          ...area,
          hub: { ...area.hub, lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Check location permission.");
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  async function save() {
    if (!area || !api.saveServiceArea || !user) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveServiceArea(user.id, area);
      setArea(saved);
      setDirty(false);
      setNote(`Saved — ${saved.pincodes.length} pincodes served.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the delivery area.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-fg-subtle" aria-hidden />
        <h2 className="text-sm font-bold text-fg">Delivery area</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {loading || !area ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <>
            <p className="text-xs text-fg-subtle">
              The driver&apos;s map and stop order come from this. Runs start at the hub and take
              the nearest stop next.
            </p>

            {/* Hub */}
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-raised p-3">
              <label className="text-2xs font-bold uppercase tracking-wide text-fg-subtle" htmlFor="hub-name">
                Hub
              </label>
              <input
                id="hub-name"
                value={area.hub.name}
                onChange={(e) => edit({ ...area, hub: { ...area.hub, name: e.target.value } })}
                placeholder="e.g. Bowenpally Market"
                className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-brand-500"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs text-fg-subtle">
                  {area.hub.lat.toFixed(5)}, {area.hub.lng.toFixed(5)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locating}
                  onClick={hubFromGps}
                  leadingIcon={<Crosshair className="h-4 w-4" />}
                >
                  Set to my location
                </Button>
              </div>
            </div>

            {/* Add a pincode */}
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Add pincode, e.g. 500033"
                inputMode="numeric"
                aria-label="Pincode to add"
                className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-brand-500"
              />
              <Button
                loading={locating}
                disabled={saving}
                onClick={addPincode}
                leadingIcon={<Plus className="h-4 w-4" />}
              >
                Add
              </Button>
            </div>

            {/* Served list */}
            {area.pincodes.length === 0 ? (
              <p className="text-xs text-fg-subtle">
                No pincodes yet — every stop will fall back to the written address.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {area.pincodes.map((p) => (
                  <li key={p.code} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">
                        {p.code} · {p.area}
                      </p>
                      <p className="text-2xs text-fg-subtle">
                        {formatKm(haversineKm(area.hub, p))} from the hub
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePincode(p.code)}
                      aria-label={`Remove ${p.code}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-raised hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && <Alert variant="error">{error}</Alert>}
            {note && <Alert variant="success">{note}</Alert>}

            <Button
              fullWidth
              loading={saving}
              disabled={!dirty}
              onClick={save}
              leadingIcon={<Save className="h-4 w-4" />}
            >
              {dirty ? "Save delivery area" : "Saved"}
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
