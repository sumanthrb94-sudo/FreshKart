import { NextRequest } from "next/server";
import { repository } from "@/lib/server/repository";
import { handle } from "@/lib/server/http";

export { dynamic } from "@/lib/server/http";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const updates = Array.isArray(body?.updates) ? body.updates : [];
  return handle(() => repository.updateProductPrices(updates));
}
