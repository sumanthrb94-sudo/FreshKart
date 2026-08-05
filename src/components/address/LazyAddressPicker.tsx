"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * The map, loaded only when a screen actually shows one.
 *
 * AddressPicker does a top-level `import "leaflet/dist/leaflet.css"`, and it
 * was statically imported by the checkout sheet, the sign-up flow and the
 * account screen. Leaflet's JavaScript was already split out — its stylesheet
 * was not, so 10.6 KB of CSS for a map most buyers never open was on the
 * critical path of the shop screen, blocking first paint on a 4G connection.
 *
 * Importing through here keeps that CSS with the chunk that needs it.
 *
 * `ssr: false` because Leaflet touches `window` on import. The placeholder
 * reserves the map's height so opening the picker does not shove the form
 * underneath it down the page.
 */

const MapFallback = ({ className }: { className?: string }) => (
  <div
    className={`flex items-center justify-center rounded-xl border border-line bg-raised ${className ?? "h-72"}`}
  >
    <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" />
  </div>
);

export const AddressPicker = dynamic(
  () => import("./AddressPicker").then((m) => m.AddressPicker),
  { ssr: false, loading: () => <MapFallback /> }
);

export const AddressMapPreview = dynamic(
  () => import("./AddressPicker").then((m) => m.AddressMapPreview),
  { ssr: false, loading: () => <MapFallback className="h-28" /> }
);

export type { PickedAddress } from "./AddressPicker";
