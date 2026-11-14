import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { ProofNumbers } from "@/components/film/Proof";
import Cut from "@/components/film/v3/Cut";
import type { Trial } from "@/components/film/v3/RecordSheet";
import { parseSrt } from "@/lib/film/srt";
import { PRESET } from "@/lib/film/timeline";
import { TRIALS, V3_QUERY } from "@/lib/film/v3";
import { readMethod } from "@/lib/serverData";
import "../film.css";
import "../v2/board.css";
import "./v3.css";

// The demo film, third version: three surfaces in close shots. See docs/event/FILM.md.
export const metadata: Metadata = { title: "Zij: studio film, three surfaces", robots: { index: false } };

const text = (path: string) => readFile(path, "utf-8").catch(() => "");
const APP = process.cwd();
const CAPTIONS = join(/* turbopackIgnore: true */ APP, "..", "docs", "event", "zij-demo30.en.srt");
const LANDING = join(/* turbopackIgnore: true */ APP, "public", "landing.html");

interface Model { scheme: string; model: string; season_err_abs_pct: number }
interface Method {
  models?: { all_areas: Model[]; research_areas: number; train_years: [number, number] };
  areas?: { id: string; validation?: Record<string, { LOYO?: { season_err_abs_pct: number } }> }[];
}

/** Every number the record sheet writes, from method.json: each model's error leaving one year out, and the Nile Delta's own. */
async function numbers(): Promise<{ proof: ProofNumbers; trials: Trial[]; areaError: number } | null> {
  const method = (await readMethod()) as Method | null;
  const error = (model: string) => method?.models?.all_areas.find((r) => r.model === model && r.scheme === "LOYO")?.season_err_abs_pct;
  const trials = TRIALS.map(({ model, label }) => ({ label, value: error(model) }));
  const own = method?.areas?.find((a) => a.id === PRESET)?.validation?.M4?.LOYO?.season_err_abs_pct;
  if (!method?.models || trials.some((r) => r.value === undefined) || own === undefined) return null;
  const pct = trials.map((r) => ({ label: r.label, pct: Math.round(r.value as number) }));
  return {
    proof: { raw: pct[0].pct, zij: pct[pct.length - 1].pct, areas: method.models.research_areas, train: method.models.train_years },
    trials: pct,
    areaError: Math.round(own),
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (!params.poly || !params.day) {
    const rest = Object.entries(params).filter(([key, value]) => key !== "poly" && key !== "day" && typeof value === "string").map(([key, value]) => `&${key}=${encodeURIComponent(value as string)}`);
    redirect(`/studio/film/v3?${V3_QUERY}${rest.join("")}`);
  }
  const [srt, landing, read] = await Promise.all([text(CAPTIONS), text(LANDING), numbers()]);
  const seal = landing.match(/<svg class="seal-written"[\s\S]*?<\/svg>/)?.[0] ?? "";
  return (
    <Suspense fallback={<main className="film" />}>
      <Cut cues={parseSrt(srt)} seal={seal} proof={read?.proof ?? null} trials={read?.trials ?? []} areaError={read?.areaError ?? NaN} />
    </Suspense>
  );
}
