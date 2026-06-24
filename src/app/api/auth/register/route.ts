import { NextRequest } from "next/server";
import { repository } from "@/lib/server/repository";
import { handle } from "@/lib/server/http";

export { dynamic } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  const body = await req.json();
  return handle(() => repository.register(body));
}
