"use client";

import { ReturnRequestScreen } from "@/components/buyer/ReturnRequestScreen";

export default function ReturnRequestPage({ params }: { params: { id: string } }) {
  return <ReturnRequestScreen orderId={params.id} />;
}
