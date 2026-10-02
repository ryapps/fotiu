import type { NextConfig } from "next";
import "./src/lib/env";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.sandbox.midtrans.com",
        pathname: "/v2/qris/**",
      },
      {
        protocol: "https",
        hostname: "api.sandbox.midtrans.com",
        pathname: "/v4/qris/**",
      },
      {
        protocol: "https",
        hostname: "api.midtrans.com",
        pathname: "/v2/qris/**",
      },
      {
        protocol: "https",
        hostname: "api.midtrans.com",
        pathname: "/v4/qris/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
