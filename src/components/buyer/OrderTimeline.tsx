import { Check, XCircle } from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { STATUS_FLOW, TRACKING_STAGES } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-bold text-red-700">Order cancelled</p>
          <p className="text-xs text-red-600">Stock was released.</p>
        </div>
      </div>
    );
  }

  const currentIndex = STATUS_FLOW.indexOf(status);

  return (
    <ol className="relative">
      {TRACKING_STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const last = i === TRACKING_STAGES.length - 1;
        return (
          <li key={stage.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                  done && "bg-brand-500 text-white",
                  current && "bg-brand-500 text-white ring-4 ring-brand-500/20",
                  !done && !current && "border-2 border-line bg-surface"
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      current ? "bg-white" : "bg-raised"
                    )}
                  />
                )}
              </span>
              {!last && (
                <span
                  className={cn(
                    "w-0.5 flex-1",
                    i < currentIndex ? "bg-brand-500" : "bg-line"
                  )}
                  style={{ minHeight: 28 }}
                />
              )}
            </div>
            <div className={cn("pb-6", last && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-bold",
                  done || current ? "text-fg" : "text-fg-subtle"
                )}
              >
                {stage.label}
              </p>
              <p
                className={cn(
                  "text-xs",
                  done || current ? "text-fg-subtle" : "text-fg-subtle"
                )}
              >
                {stage.note}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
