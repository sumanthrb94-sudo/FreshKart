/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------
// Content Security Policy.
// The browser talks to Firebase (Auth + Firestore), OpenStreetMap (map tiles +
// Nominatim geocoding) and loads produce imagery from Unsplash / Google avatars
// directly, so each of those origins must be allow-listed below. Vercel
// Speed Insights / Web Analytics endpoints are included too.
//
// NOTE: 'unsafe-inline' is required for scripts because Next.js injects an
// inline hydration bootstrap and we are not using a nonce (that needs
// middleware). Styles need it for Leaflet's injected inline styles. If you
// later add nonce-based middleware you can drop 'unsafe-inline' from script-src.
// After deploying, verify three flows: Google login, the address map, and
// product images — if any break, the blocked origin shows in the console.
// ---------------------------------------------------------------------------
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.gstatic.com https://*.googletagmanager.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.googleusercontent.com https://*.tile.openstreetmap.org https://*.gstatic.com https://*.google-analytics.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://apis.google.com https://nominatim.openstreetmap.org https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "frame-src 'self' https://*.firebaseapp.com https://apis.google.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Applied to every route. These harden the app against clickjacking, MIME
// sniffing, protocol downgrade and referrer leakage.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Geolocation is used by the address picker ("use my location"); everything
    // else is denied.
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework/version in responses.
  poweredByHeader: false,
  images: {
    // Allow remote produce imagery (Unsplash) used by the seed catalog.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        // Security headers on every response.
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // The service worker must always be revalidated so clients pick up new
        // versions immediately instead of running a stale cached worker.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
