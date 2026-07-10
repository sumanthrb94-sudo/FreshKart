import { NextResponse } from "next/server";

export { dynamic } from "@/lib/server/http";

export function GET() {
  return NextResponse.json({ status: "ok", service: "green-basket-reference-api" });
}
