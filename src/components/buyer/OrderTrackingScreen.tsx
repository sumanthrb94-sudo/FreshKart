"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, MapPin, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import {
  canBuyerCancel,
  formatCurrency,
  formatDate,
  PAYMENT_LONG,
} from "@/lib/format";
import { useAsync, useRequireAuth } from "@/lib/hooks";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "./BuyerHeader";
import { OrderTimeline } from "./OrderTimeline";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullScreenLoader } from "@/components/ui/Spinner";
import { PackageX } from "lucide-react";

export function OrderTrackingScreen({ id }: { id: string }) {
  const { ready } = useRequireAuth({ callbackUrl: `/orders/${id}` });
  const params = useSearchParams();
  const justPlaced = params.get("placed") === "1";
  const { data: order, loading, refetch } = useAsync(() => api.getOrder(id), [id]);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.cancelOrder(id);
      refetch();
    } finally {
      setCancelling(false);
    }
  }

  if (!ready || loading) {
    return (
      <AppShell header={<BuyerHeader />}>
        <FullScreenLoader />
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell header={<BuyerHeader />}>
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={PackageX}
            title="Order not found"
            subtitle="We couldn't find that order."
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

  return (
    <AppShell header={<BuyerHeader />}>
      <div className="flex flex-col gap-3 p-4">
        <Link
          href="/orders"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All orders
        </Link>

        {justPlaced && <Alert variant="success">Order placed successfully!</Alert>}

        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm font-bold text-gray-900">
              {order.orderNumber}
            </p>
            <p className="text-xs text-gray-400">
              Placed {formatDate(order.createdAt)}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Tracking */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-gray-900">Tracking</h2>
          </CardHeader>
          <CardBody>
            <OrderTimeline status={order.status} />
          </CardBody>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-gray-900">
              Items ({order.items.length})
            </h2>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-gray-100">
              {order.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3 px-5 py-3">
                  <ProductThumb name={item.name} imageUrl={item.imageUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(item.price)}/{item.unit} × {item.qty}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-gray-900">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <span className="text-sm font-bold text-gray-900">Total</span>
              <span className="text-base font-extrabold text-gray-900">
                {formatCurrency(order.total)}
              </span>
            </div>
          </CardBody>
        </Card>

        {/* Delivery */}
        <Card>
          <CardBody className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
            <div className="text-sm">
              <p className="font-semibold text-gray-900">{order.delivery.name}</p>
              <p className="text-gray-500">
                {order.delivery.address}, {order.delivery.city} — {order.delivery.pincode}
              </p>
              <p className="text-gray-500">{order.delivery.phone}</p>
            </div>
          </CardBody>
        </Card>

        {/* Payment */}
        <Card>
          <CardBody className="flex items-center gap-3">
            <Wallet className="h-4 w-4 shrink-0 text-brand-500" />
            <div className="text-sm">
              <p className="font-semibold text-gray-900">
                {PAYMENT_LONG[order.paymentMethod]}
              </p>
              <p className="text-xs text-gray-400">
                {order.paymentStatus === "PAID" ? "Paid" : "Payment due"}
              </p>
            </div>
          </CardBody>
        </Card>

        {order.notes && (
          <Card>
            <CardBody>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
              <p className="mt-1 text-sm text-gray-600">{order.notes}</p>
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
