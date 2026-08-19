import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { PwaRegistrar } from "@/components/pwa/PwaRegistrar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Green Basket — Wholesale B2B · per kg",
  description:
    "B2B wholesale fresh-produce marketplace. Live B2B rates · order in bulk · pay COD or online · 1–2 day delivery.",
  applicationName: "Green Basket",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Green Basket B2B",
    startupImage: [
      {
        url: "/splash-dark.svg",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/splash-light.svg",
        media: "(prefers-color-scheme: light)",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/icon-192x192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icon-512x512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-192x192.svg", sizes: "192x192" }],
  },
  other: {
    "msapplication-TileColor": "#059669",
    "msapplication-config": "none",
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
    { media: "(prefers-color-scheme: light)", color: "#f2f2f5" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Browser page-translation (Chrome "Translate", Google Translate)
            rewrites text nodes underneath React. When React later moves or
            removes a node, the node Translate relocated is no longer where
            React expects, and native insertBefore/removeChild throw a
            NotFoundError that crashes the whole app — most visibly during
            signup, which mounts/unmounts the most dynamic UI. This guard
            makes those two calls fail soft ONLY in that mismatched-parent
            case (a genuine no-op for every non-translated session, where the
            parent always matches), so a translated page degrades instead of
            white-screening. Installed before hydration so it covers the very
            first render. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof Node !== "function" || !Node.prototype) return;
                var removeChild = Node.prototype.removeChild;
                Node.prototype.removeChild = function(child) {
                  if (child && child.parentNode !== this) return child;
                  return removeChild.apply(this, arguments);
                };
                var insertBefore = Node.prototype.insertBefore;
                Node.prototype.insertBefore = function(newNode, referenceNode) {
                  if (referenceNode && referenceNode.parentNode !== this) return newNode;
                  return insertBefore.apply(this, arguments);
                };
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
                    document.documentElement.classList.add("light");
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans text-fg antialiased">
        <AppProviders>{children}</AppProviders>
        <PwaRegistrar />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
