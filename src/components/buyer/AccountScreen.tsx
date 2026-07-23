"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe, LogOut, MapPin, Package, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRequireAuth } from "@/lib/hooks";
import { useLang, LANGS } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "./BuyerHeader";
import { BuyerBottomNav } from "./BuyerBottomNav";
import { BuyerSidebar } from "@/components/layout/BuyerSidebar";
import { PageHero } from "./PageHero";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { Sheet } from "@/components/ui/Sheet";
import { AddressPicker, type PickedAddress } from "@/components/address/AddressPicker";
import {
  sanitizePhoneDigits,
  isValidPhoneDigits,
  sanitizePincodeDigits,
  isValidPincodeDigits,
} from "@/lib/format";

export function AccountScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth({ callbackUrl: "/account" });
  const { user, updateProfile, logout } = useAuth();
  const { lang, setLang } = useLang();

  const [form, setForm] = useState({
    name: user?.name ?? "",
    businessName: user?.businessName ?? "",
    phone: user?.phone ?? "",
    gstin: user?.gstin ?? "",
    address: user?.address ?? "",
    city: user?.city ?? "",
    pincode: user?.pincode ?? "",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);

  function startEditing() {
    if (!user) return;
    setForm({
      name: user.name ?? "",
      businessName: user.businessName ?? "",
      phone: user.phone ?? "",
      gstin: user.gstin ?? "",
      address: user.address ?? "",
      city: user.city ?? "",
      pincode: user.pincode ?? "",
    });
    setIsEditing(true);
    setStatus(null);
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.phone && !isValidPhoneDigits(form.phone)) {
      setStatus({ ok: false, msg: "Enter a valid 10-digit phone number." });
      return;
    }
    if (form.pincode && !isValidPincodeDigits(form.pincode)) {
      setStatus({ ok: false, msg: "Enter a valid 6-digit pincode." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await updateProfile(form);
      setStatus({ ok: true, msg: "Profile updated." });
      setIsEditing(false);
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/");
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
      <AppShell header={<BuyerHeader showWordmark />} sidebar={<BuyerSidebar />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  return (
    <AppShell
      header={<BuyerHeader showWordmark />}
      footer={<BuyerBottomNav />}
      sidebar={<BuyerSidebar />}
    >
      <PageHero
        title="Your account"
        subtitle={user.businessName || user.name || undefined}
        right={<Badge className="bg-white/15 text-white">{user.role}</Badge>}
      />
      <div className="relative z-10 -mt-6 rounded-t-[26px] bg-canvas">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
        {/* Language preference */}
        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
              <Globe className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-fg">Language</p>
              <div className="fc-scroll -mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code)}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold transition-colors",
                      lang === l.code
                        ? "bg-brand-500 text-white shadow-sm"
                        : "border border-line bg-surface text-fg-muted hover:border-brand-500/30"
                    )}
                  >
                    {l.native}
                  </button>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Delivery address — map-based */}
        <Card>
          <CardBody className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
              <MapPin className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-fg">Delivery address</p>
                {user.addressLabel && (
                  <Badge className="bg-brand-500/20 text-brand-300">{user.addressLabel}</Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-fg-muted">
                {user.address || "No address saved yet."}
              </p>
              {(user.city || user.pincode) && (
                <p className="text-xs text-fg-subtle">
                  {[user.city, user.pincode].filter(Boolean).join(" — ")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAddrOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-fg-muted hover:bg-raised"
            >
              <Pencil className="h-3.5 w-3.5" />
              {user.address ? "Edit" : "Add"}
            </button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-fg">Profile details</h2>
            {!isEditing && (
              <button
                type="button"
                onClick={startEditing}
                className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-fg-muted hover:bg-raised"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
          </CardHeader>
          <CardBody>
            {isEditing ? (
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
                    <Input
                      inputMode="tel"
                      value={form.phone}
                      onChange={(e) => set("phone", sanitizePhoneDigits(e.target.value))}
                    />
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
                    <Input
                      inputMode="numeric"
                      value={form.pincode}
                      onChange={(e) => set("pincode", sanitizePincodeDigits(e.target.value))}
                    />
                  </Field>
                </div>

                {status && (
                  <Alert variant={status.ok ? "success" : "error"}>{status.msg}</Alert>
                )}

                <div className="flex flex-col gap-2">
                  <Button type="submit" size="lg" fullWidth loading={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    fullWidth
                    onClick={() => setIsEditing(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-fg-subtle">Full name</p>
                  <p className="font-semibold text-fg">{user.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-subtle">Business name</p>
                  <p className="font-semibold text-fg">{user.businessName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-subtle">Phone</p>
                  <p className="font-semibold text-fg">{user.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-subtle">GSTIN</p>
                  <p className="font-semibold text-fg">{user.gstin || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-fg-subtle">Address</p>
                  <p className="font-semibold text-fg">{user.address || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-subtle">City</p>
                  <p className="font-semibold text-fg">{user.city || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-subtle">Pincode</p>
                  <p className="font-semibold text-fg">{user.pincode || "—"}</p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Link href="/orders">
          <Button variant="outline" size="lg" fullWidth leadingIcon={<Package className="h-4 w-4" />}>
            Your orders
          </Button>
        </Link>

        <Button
          variant="danger"
          size="lg"
          fullWidth
          leadingIcon={<LogOut className="h-4 w-4" />}
          onClick={handleLogout}
        >
          Log out
        </Button>
      </div>
      </div>

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
    </AppShell>
  );
}
