import type { NextConfig } from "next";

// Data and vendor files change only when the pipeline is rerun, so browsers and the CDN may keep
// them for an hour, and serve a stale copy for a day while they fetch the new one.
const CACHE = "public, max-age=3600, stale-while-revalidate=86400";

// Explore lived at "/" until the landing page took it. Every old link keeps working: a request for
// "/" that carries any of Explore's parameters goes to /explore with its whole query string.
const EXPLORE_PARAMS = ["area", "box", "poly", "day", "days", "from", "to", "view", "month", "year", "basemap", "hide", "panel", "timeline", "mode", "tour", "seasons"];

// The build's id, sent as a version with every /data/ request (lib/version.ts).
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? `t${Date.now().toString(36)}`).slice(0, 12);

// The demo film (NASA Space Apps 2026).
const DEMO = "https://www.youtube.com/watch?v=XABi7qeNZwA";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  // "/" is the landing page: a plain HTML file made by scripts/build-landing.mjs.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/landing.html" }], afterFiles: [], fallback: [] };
  },
  async redirects() {
    return [
      ...EXPLORE_PARAMS.map((key) => ({ source: "/", has: [{ type: "query" as const, key }], destination: "/explore", permanent: false })),
      // The 30-second demo film on YouTube, with its captions switched on: /demo in English, /demo/ar in Arabic.
      { source: "/demo", destination: `${DEMO}&cc_load_policy=1&cc_lang_pref=en&hl=en`, permanent: false },
      { source: "/demo/ar", destination: `${DEMO}&cc_load_policy=1&cc_lang_pref=ar&hl=ar`, permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/data/:path*", headers: [{ key: "Cache-Control", value: CACHE }] },
      { source: "/vendor/:path*", headers: [{ key: "Cache-Control", value: CACHE }] },
      { source: "/atlas/:path*", headers: [{ key: "Cache-Control", value: CACHE }] },
      { source: "/landing/:path*", headers: [{ key: "Cache-Control", value: CACHE }] },
    ];
  },
  // The Explore page reads the index and the area files on the server, for its first HTML.
  outputFileTracingIncludes: {
    "/explore": ["./public/data/index.json", "./public/data/areas/*.json"],
    // The review pages of Hudhud's Fire Diary read the same files on request (lib/diary/load.ts).
    "/studio/diary": ["./public/data/areas/*.json", "./public/data/method.json", "./public/data/findings.json", "./public/data/basemap/countries.json"],
  },
};

export default nextConfig;
