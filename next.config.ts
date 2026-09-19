import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
