import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { PwaRegistrar } from "@/components/pwa/PwaRegistrar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FreshKart — Wholesale B2B · per kg",
  description:
    "B2B wholesale fresh-produce marketplace. Live B2B rates · order in bulk · pay COD, credit or online · 1–2 day delivery.",
  applicationName: "FreshKart",
  // Installable-app (PWA) metadata.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FreshKart",
  },
};

export const viewport: Viewport = {
  themeColor: "#e23744",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem("freshkart-theme");
                  if (theme === "light") {
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
      </body>
    </html>
  );
}
