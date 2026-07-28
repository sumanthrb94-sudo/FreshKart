"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIstDateLabel, getIstToday, shiftIstDate } from "@/lib/time";

/**
 * IST day selector for the daily reports.
 *
 * A native `<input type="date">` rather than a calendar library: it renders the
 * OS date picker on the phones and tablets the packing staff actually use,
 * clamps to `max` for free, and keeps the app's five runtime dependencies
 * intact. Same idiom as the coupon validity fields.
 */
export function DayPicker({
  value,
  onChange,
  max = getIstToday(),
  className,
}: {
  /** IST date key, "YYYY-MM-DD". */
  value: string;
  onChange: (istDate: string) => void;
  /** Defaults to today — orders can't exist in the future. */
  max?: string;
  className?: string;
}) {
  const today = getIstToday();
  const yesterday = shiftIstDate(today, -1);
  const atMax = value >= max;

  const caption =
    value === today ? "Today" : value === yesterday ? "Yesterday" : formatIstDateLabel(value);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
        <button
          type="button"
          onClick={() => onChange(shiftIstDate(value, -1))}
          aria-label="Previous day"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-raised hover:text-fg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        <label className="flex cursor-pointer items-center gap-1.5 px-1">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-brand-400" aria-hidden />
          <input
            type="date"
            value={value}
            max={max}
            onChange={(e) => {
              // Clearing the field yields "" — ignore rather than crash the range math.
              if (e.target.value) onChange(e.target.value);
            }}
            aria-label="Report date"
            className="bg-transparent text-xs font-bold text-fg outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => onChange(shiftIstDate(value, 1))}
          disabled={atMax}
          aria-label="Next day"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <Preset label="Today" active={value === today} onClick={() => onChange(today)} />
        <Preset label="Yesterday" active={value === yesterday} onClick={() => onChange(yesterday)} />
      </div>

      <span className="text-xs font-medium text-fg-subtle">{caption}</span>
    </div>
  );
}

function Preset({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
        active
          ? "bg-brand-500 text-white"
          : "bg-raised text-fg-subtle hover:bg-surface hover:text-fg"
      )}
    >
      {label}
    </button>
  );
}
