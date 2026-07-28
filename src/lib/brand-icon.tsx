import { ImageResponse } from "next/og";

const GREEN = "#059669"; // Royal emerald green (brand-500)

// Lucide "Sprout" — the same mark used in the app header, drawn as plain SVG
// paths so the icon renders without needing any embedded font.
const SPROUT_PATHS = [
  "M7 20h10",
  "M10 20c5.5-2.5.8-6.4 3-10",
  "M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z",
  "M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z",
];

/**
 * Render the Green Basket app icon (white sprout on royal green) as a PNG via
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
          {SPROUT_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
