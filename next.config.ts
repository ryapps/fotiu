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
};

export default nextConfig;
