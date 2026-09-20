import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.BEACON_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
  // Public normalized snapshots only; PDF archives stay out of serverless functions.
  outputFileTracingIncludes: {
    "/api/demo/campus-data": ["./data/campus/research/**/*.json", "./data/campus/route-evidence.json"],
    "/api/trips/**": ["./data/campus/research/weather.json"],
  },
  outputFileTracingExcludes: {
    "/api/**": ["./data/campus/research/**/*.pdf*", "./data/campus/research/lighting/osm-*.json", "./data/campus/research/crime-????-??-source.json", "./data/campus/research/crime-source-index-*.json"],
  },
};

export default nextConfig;
