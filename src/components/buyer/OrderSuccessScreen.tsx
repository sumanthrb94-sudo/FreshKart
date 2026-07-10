"use client";

import Link from "next/link";
import { CheckCircle2, MapPin, Package, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCurrency, PAYMENT_LABELS } from "@/lib/format";
import { useAsync, useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "./BuyerHeader";
import { BuyerSidebar } from "@/components/layout/BuyerSidebar";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { PackageX } from "lucide-react";

export function OrderSuccessScreen({ id }: { id: string }) {
  const { ready } = useRequireAuth({ callbackUrl: `/order-success/${id}` });
  const { data: order, loading } = useAsync(() => api.getOrder(id), [id]);

  if (!ready || loading) {
    return (
      <AppShell header={<BuyerHeader />} sidebar={<BuyerSidebar />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell header={<BuyerHeader />} sidebar={<BuyerSidebar />}>
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={PackageX}
            title="Order not found"
            action={
              <Link href="/">
                <Button size="lg">Back to shop</Button>
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  const paymentLine =
    order.paymentStatus === "PAID" ? "✓ Paid online" : PAYMENT_LABELS[order.paymentMethod];

  return (
    <AppShell header={<BuyerHeader />} sidebar={<BuyerSidebar />}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
        {/* Hero */}
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <div className="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-brand-500/15">
            <CheckCircle2 className="h-9 w-9 text-brand-500" />
          </div>
          <h1 className="text-xl font-bold text-fg">Order placed!</h1>
          <p className="max-w-xs text-sm text-fg-muted">
            Thanks — your order is confirmed and being prepared.
          </p>
          <span className="rounded-full bg-raised px-3 py-1 text-xs font-semibold text-fg-muted">
            {order.orderNumber}
          </span>
        </div>

        {/* ETA strip */}
        <div className="flex items-center gap-3 rounded-xl bg-brand-500 px-4 py-3 text-white">
          <Truck className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Arriving in 1–2 days</p>
            <p className="text-xs text-white/85">
              We&apos;ll notify you when it&apos;s out for delivery.
            </p>
          </div>
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Package className="h-4 w-4 text-brand-500" /> Order summary
            </h2>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-2">
              {order.items.map((item) => (
                <li key={item.productId} className="flex items-center justify-between text-sm">
                  <span className="text-fg-muted">
                    {item.name} <span className="text-fg-subtle">× {item.qty} {item.unit}</span>
                  </span>
                  <span className="font-semibold text-fg">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="my-3 border-t border-dashed border-line" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Subtotal</span>
              <span className="font-semibold text-fg">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-fg-muted">Delivery</span>
              <span className={cn("font-semibold", order.deliveryFee === 0 ? "text-brand-500" : "text-fg")}>
                {order.deliveryFee === 0 ? "FREE" : formatCurrency(order.deliveryFee)}
              </span>
            </div>
            <div className="my-3 border-t border-dashed border-line" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-fg">Total paid</span>
              <span className="text-base font-extrabold text-fg">
                {formatCurrency(order.total)}
              </span>
            </div>
            <p className="mt-1 text-xs text-fg-subtle">{paymentLine}</p>
          </CardBody>
        </Card>

        {/* Delivering to */}
        <Card>
          <CardBody className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
            <div className="text-sm">
              <p className="font-semibold text-fg">Delivering to</p>
              <p className="text-fg-muted">{order.delivery.name}</p>
              <p className="text-fg-muted">
                {order.delivery.address}, {order.delivery.city} — {order.delivery.pincode}
              </p>
              <p className="text-fg-muted">{order.delivery.phone}</p>
            </div>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-2 pb-2">
          <Link href={`/orders/${order.id}`}>
            <Button size="lg" fullWidth className="bg-brand-600 hover:bg-brand-700">
              Track order
            </Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="outline" fullWidth>
              Continue shopping
            </Button>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
