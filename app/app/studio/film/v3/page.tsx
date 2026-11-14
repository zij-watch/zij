import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Cut from "@/components/film/v3/Cut";
import type { Findings } from "@/components/film/v3/Finale";
import type { Trials } from "@/components/film/v3/Machine";
import { parseSrt } from "@/lib/film/srt";
import { PRESET } from "@/lib/film/timeline";
import { V3_QUERY, type Timing } from "@/lib/film/v3";
import { readMethod } from "@/lib/serverData";
import "../film.css";
import "../v2/board.css";
import "./v3.css";

// The demo film, final cut (v3): six shots keyed to the voice-over. See docs/event/FILM.md.
export const metadata: Metadata = { title: "Zij: studio film, final cut", robots: { index: false } };

const text = (path: string) => readFile(path, "utf-8").catch(() => "");
const APP = process.cwd();
const DOCS = join(/* turbopackIgnore: true */ APP, "..", "docs", "event");
const LANDING = join(/* turbopackIgnore: true */ APP, "public", "landing.html");
const FINDINGS = join(/* turbopackIgnore: true */ APP, "public", "data", "findings.json");

interface Model { scheme: string; model: string; season_err_abs_pct: number }

/** Every number the film writes, from the data files: method.json and findings.json. */
async function numbers(): Promise<{ trials: Trials; findings: Findings } | null> {
  const method = (await readMethod()) as { models?: { all_areas: Model[] } } | null;
  const error = (model: string) => method?.models?.all_areas.find((r) => r.model === model && r.scheme === "LOYO")?.season_err_abs_pct;
  const raw = error("raw"), factor = error("M0"), zij = error("M4");
  const found = JSON.parse((await text(FINDINGS)) || "null") as {
    ban?: { ban_year: number; comparisons: { change: { pct: number } }[] };
    since_2018?: { recent_years: [number, number]; areas: { area: string; change: { pct: number } }[] };
  } | null;
  const ban = found?.ban?.comparisons[0]?.change.pct;
  const since = found?.since_2018?.areas.find((a) => a.area === PRESET)?.change.pct;
  if (raw === undefined || factor === undefined || zij === undefined || ban === undefined || since === undefined || !found?.ban || !found.since_2018) return null;
  return {
    trials: { raw: Math.round(raw), factor: Math.round(factor), zij: Math.round(zij) },
    findings: { ban: Math.round(ban), banYear: found.ban.ban_year, since: Math.round(since), sinceYear: found.since_2018.recent_years[0] },
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (!params.poly || !params.day) {
    const rest = Object.entries(params).filter(([key, value]) => key !== "poly" && key !== "day" && typeof value === "string").map(([key, value]) => `&${key}=${encodeURIComponent(value as string)}`);
    redirect(`/studio/film/v3?${V3_QUERY}${rest.join("")}`);
  }
  // The captions and the words' times are read at every request, so a new voice needs no new build.
  const [srt, timing, landing, read] = await Promise.all([text(join(DOCS, "zij-demo30.en.srt")), text(join(DOCS, "zij-demo30-v3-timing.json")), text(LANDING), numbers()]);
  const seal = landing.match(/<svg class="seal-written"[\s\S]*?<\/svg>/)?.[0] ?? "";
  if (!read || !timing) return <main className="film"><p className="film-problem" role="alert">The film cannot read its numbers or its timing.</p></main>;
  return (
    <Suspense fallback={<main className="film" />}>
      <Cut cues={parseSrt(srt)} seal={seal} timing={JSON.parse(timing) as Timing} trials={read.trials} findings={read.findings} />
    </Suspense>
  );
}
