import { brandIcon } from "@/lib/brand-icon";

// iOS "Add to Home Screen" icon (iOS applies its own rounded mask).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return brandIcon(180, { radiusPct: 0, padPct: 0.14 });
}
