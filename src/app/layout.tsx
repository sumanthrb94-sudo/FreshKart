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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
                    document.documentElement.classList.add("light");
                  }
                } catch (e) {}

                // Browser Translation Resilience Shield:
                // Prevents Google Translate / Chrome on Android from crashing React with
                // "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
                try {
                  if (typeof Node !== "undefined" && Node.prototype) {
                    var originalInsertBefore = Node.prototype.insertBefore;
                    Node.prototype.insertBefore = function(newNode, referenceNode) {
                      if (referenceNode && referenceNode.parentNode !== this) {
                        var ancestor = referenceNode.parentNode;
                        while (ancestor && ancestor.parentNode !== this) {
                          ancestor = ancestor.parentNode;
                        }
                        if (ancestor && ancestor.parentNode === this) {
                          return originalInsertBefore.call(this, newNode, ancestor);
                        }
                        return this.appendChild(newNode);
                      }
                      return originalInsertBefore.call(this, newNode, referenceNode);
                    };

                    var originalRemoveChild = Node.prototype.removeChild;
                    Node.prototype.removeChild = function(child) {
                      if (child && child.parentNode !== this) {
                        if (child.parentNode) {
                          return child.parentNode.removeChild(child);
                        }
                        return child;
                      }
                      return originalRemoveChild.call(this, child);
                    };

                    var originalReplaceChild = Node.prototype.replaceChild;
                    Node.prototype.replaceChild = function(newChild, oldChild) {
                      if (oldChild && oldChild.parentNode !== this) {
                        var ancestor = oldChild.parentNode;
                        while (ancestor && ancestor.parentNode !== this) {
                          ancestor = ancestor.parentNode;
                        }
                        if (ancestor && ancestor.parentNode === this) {
                          return originalReplaceChild.call(this, newChild, ancestor);
                        }
                        return this.appendChild(newChild);
                      }
                      return originalReplaceChild.call(this, newChild, oldChild);
                    };
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
