"use client";

import { use } from "react";
import { ReturnRequestScreen } from "@/components/buyer/ReturnRequestScreen";

export default function ReturnRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ReturnRequestScreen orderId={id} />;
}
