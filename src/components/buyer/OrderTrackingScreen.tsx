"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  ArrowLeft,
  MapPin,
  Wallet,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  canBuyerCancel,
  formatCurrency,
  formatDate,
  PAYMENT_LONG,
} from "@/lib/format";
import { useAsync, useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "./BuyerHeader";
import { BuyerSidebar } from "@/components/layout/BuyerSidebar";
import { OrderTimeline } from "./OrderTimeline";
import { InvoiceDownloader } from "@/components/InvoiceDownloader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { PackageX } from "lucide-react";

export function OrderTrackingScreen({ id }: { id: string }) {
  const { ready, user } = useRequireAuth({ callbackUrl: `/orders/${id}` });
  const params = useSearchParams();
  const justPlaced = params.get("placed") === "1";
  const { data: order, loading, refetch } = useAsync(() => api.getOrder(id), [id]);
  const { data: returns } = useAsync(() => api.listReturns(user?.id), [user?.id]);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.cancelOrder(id);
      toast.success("Order cancelled", "Your order has been cancelled and stock released.");
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not cancel order. Please try again.";
      toast.error("Cancel failed", message);
    } finally {
      setCancelling(false);
    }
  }

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
            subtitle="We could not find that order."
            action={
              <Link href="/orders">
                <Button size="lg">Your orders</Button>
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  const isDelivered = order.status === "DELIVERED";
  const existingReturn = returns?.find((r) => r.orderId === order.id);
  const deliveredAt = order.deliveredAt || order.updatedAt;
  const hoursSinceDelivery = (Date.now() - new Date(deliveredAt).getTime()) / 36e5;
  const canReturn = isDelivered && !existingReturn && hoursSinceDelivery <= 4;

  return (
    <AppShell header={<BuyerHeader />} sidebar={<BuyerSidebar />}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
        <Link
          href="/orders"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-fg-subtle hover:text-fg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All orders
        </Link>

        {justPlaced && <Alert variant="success">Order placed successfully!</Alert>}

        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-fg">
              {order.orderNumber}
            </p>
            <p className="text-xs text-fg-subtle">
              Placed {formatDate(order.createdAt)}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Invoice Download */}
        <InvoiceDownloader order={order} fullWidth />

        {/* Return Request Button - only for delivered orders within the 4-hour window and without an existing return */}
        {canReturn && (
          <Link href={`/orders/${order.id}/return`}>
            <Button variant="outline" fullWidth leadingIcon={<RotateCcw className="h-4 w-4" />}>
              Request Return / Refund
            </Button>
          </Link>
        )}
        {isDelivered && existingReturn && (
          <Link href={`/returns/${existingReturn.id}`}>
            <Button variant="outline" fullWidth leadingIcon={<RotateCcw className="h-4 w-4" />}>
              View return request
            </Button>
          </Link>
        )}
        {isDelivered && !existingReturn && hoursSinceDelivery > 4 && (
          <div className="rounded-lg border border-line bg-surface px-3 py-2 text-center text-xs text-fg-subtle">
            Return window closed ({Math.floor(hoursSinceDelivery)} hours since delivery)
          </div>
        )}

        {/* Tracking */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-fg">Tracking</h2>
          </CardHeader>
          <CardBody>
            <OrderTimeline status={order.status} />
          </CardBody>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-fg">
              Items ({order.items.length})
            </h2>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3 px-5 py-3">
                  <ProductThumb name={item.name} imageUrl={item.imageUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{item.name}</p>
                    <p className="text-xs text-fg-subtle">
                      {formatCurrency(item.price)}/{item.unit} x {item.qty}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-fg">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3">
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
              <div className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2">
                <span className="text-sm font-bold text-fg">Total</span>
                <span className="text-base font-extrabold text-fg">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Delivery */}
        <Card>
          <CardBody className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
            <div className="text-sm">
              <p className="font-semibold text-fg">{order.delivery.name}</p>
              <p className="text-fg-muted">
                {order.delivery.address}, {order.delivery.city} - {order.delivery.pincode}
              </p>
              <p className="text-fg-muted">{order.delivery.phone}</p>
            </div>
          </CardBody>
        </Card>

        {/* Payment */}
        <Card>
          <CardBody className="flex items-center gap-3">
            <Wallet className="h-4 w-4 shrink-0 text-brand-500" />
            <div className="text-sm">
              <p className="font-semibold text-fg">
                {PAYMENT_LONG[order.paymentMethod]}
              </p>
              <p className="text-xs text-fg-subtle">
                {order.paymentStatus === "PAID" ? "Paid" : "Payment due"}
              </p>
            </div>
          </CardBody>
        </Card>

        {order.notes && (
          <Card>
            <CardBody>
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Notes</p>
              <p className="mt-1 text-sm text-fg-muted">{order.notes}</p>
            </CardBody>
          </Card>
        )}

        {canBuyerCancel(order.status) && (
          <Button variant="outline" fullWidth loading={cancelling} onClick={handleCancel} className="text-red-600">
            Cancel order
          </Button>
        )}

        <Link href="/" className="pb-2">
          <Button variant="ghost" fullWidth>
            Back to shop
          </Button>
        </Link>
      </div>
    </AppShell>
  );
}
