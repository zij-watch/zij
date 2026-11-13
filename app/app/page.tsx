import { Suspense } from "react";
import Explore from "@/components/Explore";

export default function Page() {
  return (
    <Suspense fallback={<main className="explore" />}>
      <Explore />
    </Suspense>
  );
}
