import { Suspense } from "react";
import Explore from "@/components/Explore";
import { ExploreShell } from "@/components/Shell";
import { readFacts, readIndex } from "@/lib/serverData";

// Rendered per request, so a preset link (?area=...) arrives with that area's facts in the HTML,
// readable before any script runs. The map and charts load on top.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const index = await readIndex();
  const area = typeof params.area === "string" && !params.box && !params.poly ? params.area : null;
  const facts = await readFacts(index, area);
  return (
    <Suspense fallback={<ExploreShell areas={index?.areas ?? []} facts={facts} />}>
      <Explore initialIndex={index} facts={facts} />
    </Suspense>
  );
}
