import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";

type Tone = "brand" | "accent" | "red" | "gray";

const TONES: Record<Tone, string> = {
  brand: "bg-brand-500/15 text-brand-400",
  accent: "bg-accent-500/15 text-accent-400",
  red: "bg-red-500/15 text-red-400",
  gray: "bg-raised text-fg-muted",
};

const SPARKLINE_STROKE: Record<Tone, string> = {
  brand: "stroke-brand-500",
  accent: "stroke-accent-500",
  red: "stroke-red-500",
  gray: "stroke-fg-subtle",
};

const SPARKLINE_FILL: Record<Tone, string> = {
  brand: "fill-brand-500/10",
  accent: "fill-accent-500/10",
  red: "fill-red-500/10",
  gray: "fill-fg-subtle/10",
};

/** Tiny inline trend line — pass e.g. the last 7 days of a value. Renders
 *  nothing for fewer than 2 points (nothing to draw a trend between). */
function Sparkline({ data, tone }: { data: number[]; tone: Tone }) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `0,${h} ${points} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-7 w-full">
      <polygon points={area} className={SPARKLINE_FILL[tone]} />
      <polyline
        points={points}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={SPARKLINE_STROKE[tone]}
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  sparkline,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  /** Optional trend data (oldest → newest), e.g. last 7 days. */
  sparkline?: number[];
}) {
  return (
    <Card className="overflow-hidden bg-gradient-to-br from-transparent to-raised/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold text-fg">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            TONES[tone]
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      {sparkline && <Sparkline data={sparkline} tone={tone} />}
    </Card>
  );
}
