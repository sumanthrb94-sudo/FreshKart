import { brandIcon } from "@/lib/brand-icon";

// PWA manifest icons. One handler serves every size/purpose the manifest needs:
//   /icons/192  /icons/512  /icons/maskable
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ variant: string }> }
) {
  const { variant } = await params;
  switch (variant) {
    case "192":
      return brandIcon(192);
    case "512":
      return brandIcon(512);
    case "maskable":
      // Full-bleed red with extra padding for Android's maskable safe zone.
      return brandIcon(512, { radiusPct: 0, padPct: 0.26 });
    default:
      return new Response("Not found", { status: 404 });
  }
}
