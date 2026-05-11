import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  // Voorkomt dat de site in een iframe op een andere site geladen wordt (clickjacking-bescherming)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Browser dwingt declared content-type af, voorkomt MIME-sniffing aanvallen
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Stuur Referer-header alleen binnen onze eigen origin
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser-features die we niet gebruiken (privacy + bescherming)
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
  // Forceer HTTPS voor 1 jaar (HSTS) inclusief subdomeinen
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Beperk welke origins mogen embedden (XS-protection legacy)
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep dev and production artifacts separate so `next build` cannot
  // invalidate a running `next dev` process (chunk mismatch like 331.js).
  distDir: isDev ? ".next-dev" : ".next-build",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
