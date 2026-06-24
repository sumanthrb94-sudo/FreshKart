import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

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
};

export const viewport: Viewport = {
  themeColor: "#16bd5f",
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
      <body className="font-sans text-gray-900 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
