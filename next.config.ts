import type { NextConfig } from "next";

// Security headers. /embed pages are framed on partner sites (src/proxy.ts sets their
// frame-ancestors), so the frame rule skips them; everything else stays same-origin.
const common = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // the viewer reads device orientation for look-around; nothing else is needed
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  // Content Security Policy, REPORT ONLY (step 1 of 3, see the site-hardening skill's csp.md).
  // Next's hydration uses inline scripts, so script-src keeps 'unsafe-inline' until the app
  // moves to nonces; everything else is strict and the reports at /api/csp-report say what to
  // add. Tiles: OpenStreetMap, OpenTopoMap, Esri. Data: the Supabase project and the public
  // avalanche, USGS and OpenBeta APIs. Enforce (rename the header) once the reports go quiet.
  { key: "Content-Security-Policy-Report-Only", value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https:",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    "report-uri https://portal.unakin.com/api/csp-report?site=panogram",   // one table for every site's reports
  ].join("; ") },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: common },
      { source: "/((?!embed).*)", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
