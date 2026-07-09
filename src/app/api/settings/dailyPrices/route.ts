import { NextRequest } from "next/server";
import { repository } from "@/lib/server/repository";
import { handle } from "@/lib/server/http";

export { dynamic } from "@/lib/server/http";

export async function GET(_req: NextRequest) {
  return handle(() => repository.getDailyPricesSettings());
}
