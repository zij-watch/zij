import type { NextConfig } from "next";

// Data and vendor files change only when the pipeline is rerun, so browsers and the CDN may keep
// them for an hour, and serve a stale copy for a day while they fetch the new one.
const CACHE = "public, max-age=3600, stale-while-revalidate=86400";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/data/:path*", headers: [{ key: "Cache-Control", value: CACHE }] },
      { source: "/vendor/:path*", headers: [{ key: "Cache-Control", value: CACHE }] },
      { source: "/atlas/:path*", headers: [{ key: "Cache-Control", value: CACHE }] },
    ];
  },
  // The Explore page reads the index and the area files on the server, for its first HTML.
  outputFileTracingIncludes: {
    "/": ["./public/data/index.json", "./public/data/areas/*.json"],
  },
};

export default nextConfig;
