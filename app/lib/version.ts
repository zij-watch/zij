// Every request for a file under /data/ carries the build's id as a version (?v=...).
// The files are cached for an hour and may be served stale for a day, so without it a new deploy
// could run against yesterday's data. With it, new code always asks for its own data.
// The id is set at build time in next.config.ts (the commit on Vercel, the build time elsewhere).

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/** The URL with the build's version, for /data/ files; any other URL is returned as it is. */
export function versioned(url: string): string {
  if (!url.startsWith("/data/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${BUILD_ID}`;
}
