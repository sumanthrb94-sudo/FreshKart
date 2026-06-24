import { cn } from "@/lib/utils";
import { ORDER_STATUS_META } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

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
        "bg-gray-100 text-gray-700",
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
