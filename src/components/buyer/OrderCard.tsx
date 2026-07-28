"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Order } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { OrderStatusBadge } from "@/components/ui/Badge";

export function OrderCard({ order }: { order: Order }) {
  const shown = order.items.slice(0, 4);
  const extra = order.items.length - shown.length;
  const totalUnits = order.items.reduce((s, i) => s + i.qty, 0);

  return (
    <Link
      href={`/orders/${order.id}`}
      className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg-muted">
          {order.orderNumber}
        </span>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {shown.map((item) => (
          <ProductThumb
            key={item.productId}
            name={item.name}
            imageUrl={item.imageUrl}
            size={44}
          />
        ))}
        {extra > 0 && (
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-raised text-xs font-bold text-fg-subtle">
            +{extra}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-fg-subtle">
          {formatDate(order.createdAt)} · {order.items.length}{" "}
          {order.items.length === 1 ? "item" : "items"}
        </span>
        <span className="flex items-center gap-0.5 text-sm font-bold text-fg">
          {formatCurrency(order.total)}
          <ChevronRight className="h-4 w-4 text-fg-subtle" />
        </span>
      </div>
    </Link>
  );
}
