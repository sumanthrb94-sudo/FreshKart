import { ImageResponse } from "next/og";

const GREEN = "#059669"; // Royal emerald green (brand-500)

// Lucide "ShoppingCart" — the same mark used for the Android launcher icon,
// drawn as plain SVG paths so the icon renders without needing any embedded
// font. The two leading paths are the wheels.
const CART_PATHS = [
  "M9 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0z",
  "M20 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0z",
  "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12",
];

/**
 * Render the Green Basket app icon (white cart on royal green) as a PNG via
 * Satori/resvg — no external image tooling required. Used by the favicon,
 * apple-touch icon and the PWA manifest icons.
 */
export function brandIcon(
  size: number,
  { radiusPct = 0.22, padPct = 0.2 }: { radiusPct?: number; padPct?: number } = {}
) {
  const inner = Math.round(size * (1 - padPct * 2));
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: GREEN,
          borderRadius: Math.round(size * radiusPct),
        }}
      >
        <svg
          width={inner}
          height={inner}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {CART_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
