import { cn } from "@/lib/utils";
import { ORDER_STATUS_META } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import type { ReturnStatus } from "@/lib/returns";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        "bg-raised text-fg-muted",
        className
      )}
    >
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        meta.badge
      )}
    >
      {meta.label}
    </span>
  );
}

/** Buyer-facing badge for an order that has an open/closed return. Once a
 *  return exists, the order's own "Delivered" status is no longer the most
 *  useful thing to show the buyer — where their return stands is. */
const RETURN_STATUS_META: Record<ReturnStatus, { label: string; badge: string }> = {
  REQUESTED: { label: "Return Requested", badge: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Return Approved", badge: "bg-emerald-100 text-emerald-800" },
  PICKED_UP: { label: "Return Picked Up", badge: "bg-blue-100 text-blue-800" },
  REFUNDED: { label: "Refunded", badge: "bg-brand-100 text-brand-800" },
  COMPLETED: { label: "Return Completed", badge: "bg-brand-100 text-brand-800" },
  REJECTED: { label: "Return Rejected", badge: "bg-red-100 text-red-700" },
};

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  const meta = RETURN_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        meta.badge
      )}
    >
      {meta.label}
    </span>
  );
}
