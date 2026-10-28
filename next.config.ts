import type { NextConfig } from "next";

// Client-side Supabase calls allow static hosting (Cloudflare Pages, etc.).
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
};

export default nextConfig;
