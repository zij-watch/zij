import type { Metadata } from "next";
import { Suspense } from "react";
import StudioMap from "@/components/StudioMap";

// The map alone, full screen, for the video. Driven by the URL: see docs/event/STUDIO.md.
export const metadata: Metadata = { title: "Zij: studio map", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<main className="studio" />}>
      <StudioMap />
    </Suspense>
  );
}
