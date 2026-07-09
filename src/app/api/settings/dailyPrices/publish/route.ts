import { NextRequest } from "next/server";
import { repository } from "@/lib/server/repository";
import { handle } from "@/lib/server/http";

export { dynamic } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  const { publishedBy } = await req.json();
  return handle(() => repository.publishDailyPrices(publishedBy as string));
}
