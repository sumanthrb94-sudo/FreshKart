import { NextRequest } from "next/server";
import { repository } from "@/lib/server/repository";
import { handle } from "@/lib/server/http";

export { dynamic } from "@/lib/server/http";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(() => repository.updateOrderStatus(params.id, "CANCELLED"));
}
