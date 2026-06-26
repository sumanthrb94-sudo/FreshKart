import type { MetadataRoute } from "next";

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
