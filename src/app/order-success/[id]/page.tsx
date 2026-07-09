"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { OrderSuccessAdScreen } from "@/components/buyer/OrderSuccessAdScreen";

export default function OrderSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("on") || "ORD-UNKNOWN";
  const total = Number(searchParams.get("total") || "0");

  return (
    <OrderSuccessAdScreen
      orderId={id}
      orderNumber={orderNumber}
      total={total}
    />
  );
}
