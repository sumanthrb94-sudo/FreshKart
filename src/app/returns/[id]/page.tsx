"use client";

import { ReturnThreadScreen } from "@/components/buyer/ReturnThreadScreen";

export default function ReturnThreadPage({ params }: { params: { id: string } }) {
  return <ReturnThreadScreen id={params.id} />;
}
