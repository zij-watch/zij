import { Suspense } from "react";
import Downloads from "@/components/Downloads";
import { AreaLinks } from "@/components/Shell";
import { readIndex } from "@/lib/serverData";

export const metadata = { title: "Zij: downloads" };

/** What the server sends before scripts run: what the page offers, and the areas as links. */
async function DownloadsShell() {
  const index = await readIndex();
  return (
    <main className="page">
      <div className="page-inner">
        <p className="eyebrow">Downloads</p>
        <h1>Take the numbers with you</h1>
        <p>
          For any area and dates: the harmonized series as CSV (weekly and monthly), the calendar as PNG and SVG, and the fire
          detections themselves as a hotspots CSV, credited to NASA FIRMS.
        </p>
        <p role="status" className="note">Loading the download tools…</p>
        <p>Choose an area:</p>
        <AreaLinks areas={index?.areas ?? []} base="/downloads" />
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<DownloadsShell />}>
      <Downloads />
    </Suspense>
  );
}
