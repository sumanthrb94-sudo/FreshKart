"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Clock, Store, Tag, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { WipeResult } from "@/lib/api/datasource";
import type { StoreOverride } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  getStoreStatus,
  effectiveOverride,
  STORE_OPEN_HOUR,
  STORE_CLOSE_HOUR,
} from "@/lib/store-hours";
import { isDailyPriceUpdatePublished } from "@/lib/time";
import { AdminShell } from "./AdminShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";

const CONFIRM_PHRASE = "WIPE";

function formatIst(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminSettingsScreen() {
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WipeResult | null>(null);

  async function handleWipe() {
    if (!api.wipeDatabase) {
      setError("Wiping the database isn't available on this backend.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.wipeDatabase();
      setResult(r);
      setConfirming(false);
      setConfirmText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wipe failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-3 p-4">
        <h1 className="text-lg font-extrabold text-fg">Settings</h1>

        <StoreControls />

        <Card className="border-red-500/30">
          <CardHeader className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden />
            <h2 className="text-sm font-bold text-fg">Danger zone</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-fg">Wipe database</p>
              <p className="mt-1 text-xs text-fg-subtle">
                Deletes every buyer account, order, return, support ticket, and
                notification — for starting a fresh round of testing. Every
                mobile number that gets deleted starts over from onboarding
                the next time it signs in.
              </p>
              <p className="mt-1 text-xs text-fg-subtle">
                <strong className="text-fg">Kept:</strong> admin accounts, the
                product catalog, prices, and coupons — the shop keeps working
                right after.
              </p>
            </div>

            {result && (
              <Alert variant="success">
                Wiped {result.deletedUsers} buyer{result.deletedUsers === 1 ? "" : "s"},{" "}
                {result.deletedOrders} order{result.deletedOrders === 1 ? "" : "s"},{" "}
                {result.deletedReturns} return{result.deletedReturns === 1 ? "" : "s"},{" "}
                {result.deletedTickets} ticket{result.deletedTickets === 1 ? "" : "s"}, and{" "}
                {result.deletedNotifications} notification
                {result.deletedNotifications === 1 ? "" : "s"}.
              </Alert>
            )}
            {error && <Alert variant="error">{error}</Alert>}

            {!confirming ? (
              <Button
                variant="danger"
                leadingIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  setConfirming(true);
                  setResult(null);
                  setError(null);
                }}
              >
                Wipe database…
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <p className="text-xs font-semibold text-fg">
                  This can&apos;t be undone. Type <code className="font-mono">{CONFIRM_PHRASE}</code> to confirm.
                </p>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-semibold uppercase tracking-wide text-fg outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                />
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    loading={busy}
                    disabled={confirmText.trim().toUpperCase() !== CONFIRM_PHRASE}
                    onClick={handleWipe}
                  >
                    Confirm wipe
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setConfirming(false);
                      setConfirmText("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}

/**
 * Day-to-day operating controls.
 *
 * The normal cycle is: prices are published after 7 AM IST, the shop trades
 * 8 AM – 9 PM, and closes itself at 9 PM. These controls exist for the two
 * cases that cycle can't express on its own — going live outside the window
 * (a demo, a late run), and taking a bad price sheet back down.
 */
function StoreControls() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const { data: storeSettings } = useAsync(
    () => (api.getStoreSettings ? api.getStoreSettings() : Promise.resolve(null)),
    [tick]
  );
  const { data: priceSettings } = useAsync(() => api.getDailyPricesSettings(), [tick]);

  const now = new Date();
  const active = effectiveOverride(storeSettings, now);
  const status = getStoreStatus(now, active);
  const pricesPublished = isDailyPriceUpdatePublished(priceSettings?.publishedAt);
  // Buyers can only order when BOTH are true — showing them separately is the
  // whole point, since "closed" and "prices not up yet" need different actions.
  const acceptingOrders = status.isOpen && pricesPublished;

  async function setOverride(next: StoreOverride) {
    if (!api.setStoreOverride || !user) return;
    setBusy(next);
    setError(null);
    try {
      await api.setStoreOverride(user.id, next);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the store status.");
    } finally {
      setBusy(null);
    }
  }

  async function togglePrices(publish: boolean) {
    if (!user) return;
    setBusy(publish ? "publish" : "unpublish");
    setError(null);
    try {
      if (publish) await api.publishDailyPrices(user.id);
      else if (api.unpublishDailyPrices) await api.unpublishDailyPrices();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the price status.");
    } finally {
      setBusy(null);
    }
  }

  const OPTIONS: { value: StoreOverride; label: string; hint: string }[] = [
    { value: "AUTO", label: "Auto", hint: `Follow ${STORE_OPEN_HOUR} AM – ${STORE_CLOSE_HOUR - 12} PM` },
    { value: "OPEN", label: "Force open", hint: "Live now, until 9 PM" },
    { value: "CLOSED", label: "Force closed", hint: "Shut regardless of time" },
  ];

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Store className="h-4 w-4 text-brand-500" aria-hidden />
        <h2 className="text-sm font-bold text-fg">Store controls</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        {/* Live status — the single line that answers "can people order?" */}
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border px-3.5 py-2.5",
            acceptingOrders ? "border-brand-500/30 bg-brand-500/10" : "border-amber-500/30 bg-amber-500/10"
          )}
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                acceptingOrders ? "animate-pulse bg-brand-500" : "bg-amber-500"
              )}
            />
            {acceptingOrders ? "Taking orders" : "Not taking orders"}
          </span>
          <span className="text-xs text-fg-subtle">
            {!status.isOpen ? "Shop closed" : !pricesPublished ? "Waiting for today's prices" : "All good"}
          </span>
        </div>

        {/* Shop open/closed */}
        <div>
          <p className="text-sm font-semibold text-fg">Shop open</p>
          <p className="mt-1 text-xs text-fg-subtle">
            The schedule says <strong className="text-fg">{status.isOnSchedule ? "open" : "closed"}</strong> right now.
            Forcing a state lapses automatically at the next 9 PM, so a test can&apos;t leave the shop trading overnight.
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={busy !== null}
                onClick={() => setOverride(o.value)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-left transition-colors disabled:opacity-50",
                  active === o.value
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-line hover:bg-raised"
                )}
              >
                <span className={cn("block text-xs font-bold", active === o.value ? "text-brand-500" : "text-fg")}>
                  {busy === o.value ? "Saving…" : o.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-fg-subtle">{o.hint}</span>
              </button>
            ))}
          </div>
          {active !== "AUTO" && storeSettings?.expiresAt && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-500">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Reverts to the schedule at {formatIst(storeSettings.expiresAt)}
            </p>
          )}
        </div>

        {/* Daily prices */}
        <div className="border-t border-line pt-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Tag className="h-4 w-4 text-fg-subtle" aria-hidden />
            Today&apos;s prices
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            {pricesPublished ? (
              <>
                Published <strong className="text-fg">{formatIst(priceSettings?.publishedAt)}</strong> — buyers can
                order for next-day delivery.
              </>
            ) : (
              <>
                Not published yet. Buyers see &quot;Gathering best prices&quot; and cannot order. Publish any time
                after the 7 AM update.
              </>
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={busy === "publish"}
              disabled={busy !== null}
              onClick={() => togglePrices(true)}
            >
              {pricesPublished ? "Re-publish now" : "Publish today's prices"}
            </Button>
            {pricesPublished && api.unpublishDailyPrices && (
              <Button
                size="sm"
                variant="outline"
                loading={busy === "unpublish"}
                disabled={busy !== null}
                onClick={() => togglePrices(false)}
              >
                Take prices down
              </Button>
            )}
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}
      </CardBody>
    </Card>
  );
}
