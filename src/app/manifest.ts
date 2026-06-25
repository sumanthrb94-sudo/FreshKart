import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes FreshKart installable as a standalone app
 * ("Add to Home screen" / "Install app") in Chrome and Android. Next serves
 * this at /manifest.webmanifest and injects the <link> automatically.
 *
 * `shortcuts` turn the header's Cart / Orders / Account actions into
 * long-press launcher shortcuts on the installed app icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FreshKart — Wholesale B2B",
    short_name: "FreshKart",
    description:
      "B2B wholesale fresh-produce marketplace. Live rates · order in bulk · pay COD, credit or online.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#e23744",
    categories: ["shopping", "food-and-drink", "business"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Your Cart",
        short_name: "Cart",
        url: "/?cart=1",
        icons: [{ src: "/icons/192", sizes: "192x192" }],
      },
      {
        name: "Your Orders",
        short_name: "Orders",
        url: "/orders",
        icons: [{ src: "/icons/192", sizes: "192x192" }],
      },
      {
        name: "Your Account",
        short_name: "Account",
        url: "/account",
        icons: [{ src: "/icons/192", sizes: "192x192" }],
      },
    ],
  };
}
