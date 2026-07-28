"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { WipeResult } from "@/lib/api/datasource";
import { AdminShell } from "./AdminShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const CONFIRM_PHRASE = "WIPE";

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
