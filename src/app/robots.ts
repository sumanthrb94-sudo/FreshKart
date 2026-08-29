import type { MetadataRoute } from "next";

// Fully static output (no request-time data), which also lets the mobile
// static export render it at build time.
export const dynamic = "force-static";

/**
 * Keep crawlers on the public storefront and out of private / operational
 * areas (admin console, the reference API, and per-user account/order pages).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/account",
        "/orders",
        "/onboarding",
        "/order-success",
      ],
    },
  };
}
