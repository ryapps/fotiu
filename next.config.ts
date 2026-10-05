import type { NextConfig } from "next";
import "./src/lib/env";
import { publicFramePolicy } from "./src/lib/frame-policy";

const portfolioFramePolicy = publicFramePolicy(
  process.env.PORTFOLIO_EMBED_ORIGINS,
);

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
          { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
      // Keep legacy frame protection on authentication and transactional routes.
      ...[
        "/admin/:path*",
        "/dashboard/:path*",
        "/login",
        "/api/:path*",
        "/packages/:slug/book",
      ].map((source) => ({
        source,
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      })),
      // Only read-only public pages can appear in the Webtiver portfolio iframe.
      ...["/", "/gallery", "/packages", "/packages/:slug"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: portfolioFramePolicy },
        ],
      })),
    ];
  },
};

export default nextConfig;
