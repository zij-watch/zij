import { Suspense } from "react";
import Downloads from "@/components/Downloads";

export const metadata = { title: "Zij: downloads" };

export default function Page() {
  return (
    <Suspense fallback={<main className="page" data-theme="folio" />}>
      <Downloads />
    </Suspense>
  );
}
