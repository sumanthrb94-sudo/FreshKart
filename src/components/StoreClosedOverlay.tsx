"use client";

import { Clock, Phone } from "lucide-react";
import { getStoreStatus, formatRemainingMinutes } from "@/lib/store-hours";
import { CallNowButton } from "./CallNowButton";

/** Overlay shown when the store is closed (before 8AM or after 11:45PM IST).
 *  Blocks ordering but shows catalog for browsing.
 */
export function StoreClosedOverlay() {
  const status = getStoreStatus();

  if (status.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm px-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
          <Clock className="h-8 w-8 text-brand-500" />
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-fg">Store Closed</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          We open at 8:00 AM IST
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Opens in {formatRemainingMinutes(status.minutesUntilOpen)}
        </p>

        <div className="mt-4 rounded-lg bg-raised p-3">
          <p className="text-xs text-fg-subtle">
            <strong className="text-fg">Store Hours</strong>
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Mon – Sat: 8:00 AM – 11:45 PM IST
          </p>
          <p className="text-sm text-fg-muted">
            Price update: 7:00 AM IST
          </p>
        </div>

        <div className="mt-4">
          <CallNowButton variant="banner" label="Call for urgent orders" />
        </div>

        <p className="mt-3 text-2xs text-fg-subtle">
          You can still browse the catalogue. Ordering resumes at 8 AM.
        </p>
      </div>
    </div>
  );
}
