"use client";

import { use } from "react";
import { ReturnThreadScreen } from "@/components/buyer/ReturnThreadScreen";

export default function ReturnThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ReturnThreadScreen id={id} />;
}
