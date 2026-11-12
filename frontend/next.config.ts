import type { NextConfig } from "next";

// All browser traffic goes through this origin; Next proxies API/auth/file paths to Django.
// That keeps cookies first-party and avoids CORS entirely.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  images: {
    remotePatterns: [
      new URL(`${API_URL}/media-public/**`),
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/_allauth/:path*", destination: `${API_URL}/_allauth/:path*` },
      { source: "/media-public/:path*", destination: `${API_URL}/media-public/:path*` },
    ];
  },
};

export default nextConfig;
