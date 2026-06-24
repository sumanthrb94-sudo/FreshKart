import { NextRequest } from "next/server";
import { repository } from "@/lib/server/repository";
import { handle } from "@/lib/server/http";

export { dynamic } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  const buyerId = req.nextUrl.searchParams.get("buyerId") ?? undefined;
  return handle(() => repository.listOrders(buyerId));
}

export async function POST(req: NextRequest) {
  const { buyerId, ...input } = await req.json();
  return handle(() => repository.createOrder(buyerId, input));
}
