import type { NextConfig } from "next";

// Security headers. /embed pages are framed on partner sites (src/proxy.ts sets their
// frame-ancestors), so the frame rule skips them; everything else stays same-origin.
const common = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // the viewer reads device orientation for look-around; nothing else is needed
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
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
