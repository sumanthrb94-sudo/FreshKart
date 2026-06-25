"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Package, Pencil } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "./BuyerHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { Sheet } from "@/components/ui/Sheet";
import { AddressPicker, type PickedAddress } from "@/components/address/AddressPicker";

export function AccountScreen() {
  const { ready } = useRequireAuth({ callbackUrl: "/account" });
  const { user, updateProfile } = useAuth();

  const [form, setForm] = useState({
    name: user?.name ?? "",
    businessName: user?.businessName ?? "",
    phone: user?.phone ?? "",
    gstin: user?.gstin ?? "",
    address: user?.address ?? "",
    city: user?.city ?? "",
    pincode: user?.pincode ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await updateProfile(form);
      setStatus({ ok: true, msg: "Profile updated." });
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAddress(addr: PickedAddress) {
    setSavingAddr(true);
    setStatus(null);
    try {
      await updateProfile({
        address: addr.address,
        city: addr.city,
        pincode: addr.pincode,
        lat: addr.lat,
        lng: addr.lng,
        addressLabel: addr.label,
      });
      setForm((f) => ({ ...f, address: addr.address, city: addr.city, pincode: addr.pincode }));
      setAddrOpen(false);
      setStatus({ ok: true, msg: "Address updated." });
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Could not save address." });
    } finally {
      setSavingAddr(false);
    }
  }

  if (!ready || !user) {
    return (
      <AppShell header={<BuyerHeader />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  return (
    <AppShell header={<BuyerHeader />}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Your account</h1>
          <Badge className="bg-brand-100 text-brand-800">{user.role}</Badge>
        </div>

        {/* Delivery address — map-based */}
        <Card>
          <CardBody className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <MapPin className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900">Delivery address</p>
                {user.addressLabel && (
                  <Badge className="bg-brand-100 text-brand-800">{user.addressLabel}</Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-600">
                {user.address || "No address saved yet."}
              </p>
              {(user.city || user.pincode) && (
                <p className="text-xs text-gray-400">
                  {[user.city, user.pincode].filter(Boolean).join(" — ")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAddrOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              {user.address ? "Edit" : "Add"}
            </button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-gray-900">Profile details</h2>
          </CardHeader>
          <CardBody>
            <form className="flex flex-col gap-3" onSubmit={handleSave}>
              <Field label="Email">
                <Input value={user.email} disabled />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full name">
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="Business name">
                  <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </Field>
                <Field label="GSTIN">
                  <Input value={form.gstin} onChange={(e) => set("gstin", e.target.value)} placeholder="29ABCDE1234A1Z9" />
                </Field>
              </div>
              <Field label="Address">
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
                </Field>
                <Field label="Pincode">
                  <Input inputMode="numeric" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
                </Field>
              </div>

              {status && (
                <Alert variant={status.ok ? "success" : "error"}>{status.msg}</Alert>
              )}

              <Button type="submit" size="lg" fullWidth loading={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Link href="/orders">
          <Button variant="outline" size="lg" fullWidth leadingIcon={<Package className="h-4 w-4" />}>
            Your orders
          </Button>
        </Link>

        <Sheet
          open={addrOpen}
          onClose={() => setAddrOpen(false)}
          title={
            <span className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-brand-500" /> Edit delivery address
            </span>
          }
        >
          <div className="p-4">
            <AddressPicker
              initial={{
                address: user.address,
                city: user.city,
                pincode: user.pincode,
                lat: user.lat,
                lng: user.lng,
                label: user.addressLabel,
              }}
              busy={savingAddr}
              confirmLabel="Save address"
              mapClassName="h-64"
              onConfirm={handleSaveAddress}
            />
          </div>
        </Sheet>
      </div>
    </AppShell>
  );
}
