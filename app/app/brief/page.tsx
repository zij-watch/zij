import type { Metadata } from "next";
import { Suspense } from "react";
import Brief from "@/components/Brief";

// The season brief: one printable page for an area (?area=, ?box= or ?poly=).
export const metadata: Metadata = { title: "Zij: season brief" };

export default function Page() {
  return (
    <Suspense fallback={<main className="brief"><article className="brief-page paper"><p role="status">Loading the brief…</p></article></main>}>
      <Brief />
    </Suspense>
  );
}
