import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Board from "@/components/film/board/Board";
import type { ProofNumbers } from "@/components/film/Proof";
import { parseSrt } from "@/lib/film/srt";
import { FILM_QUERY } from "@/lib/film/timeline";
import { readMethod } from "@/lib/serverData";
import "../film.css";
import "./board.css";

// The demo film, second version: one camera take across a board. See docs/event/FILM.md.
export const metadata: Metadata = { title: "Zij: studio film, the board", robots: { index: false } };

// The same three files the first version reads, from the repository the app runs in.
const text = (path: string) => readFile(path, "utf-8").catch(() => "");
const APP = process.cwd();
const CAPTIONS = join(/* turbopackIgnore: true */ APP, "..", "docs", "event", "zij-demo30-v2.en.srt");
const VALIDATION = join(/* turbopackIgnore: true */ APP, "..", "docs", "assets", "validation-light.svg");
const LANDING = join(/* turbopackIgnore: true */ APP, "public", "landing.html");

interface Model { scheme: string; model: string; season_err_abs_pct: number }

/** The counter's two ends, from the exported validation: raw MODIS and the model in use, each leaving one year out. */
async function proofNumbers(): Promise<ProofNumbers | null> {
  const method = (await readMethod()) as { models?: { all_areas: Model[]; research_areas: number; train_years: [number, number] } } | null;
  const error = (model: string) => method?.models?.all_areas.find((r) => r.model === model && r.scheme === "LOYO")?.season_err_abs_pct;
  const raw = error("raw"), zij = error("M4");
  if (!method?.models || raw === undefined || zij === undefined) return null;
  return { raw: Math.round(raw), zij: Math.round(zij), areas: method.models.research_areas, train: method.models.train_years };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (!params.poly || !params.day) {
    const rest = Object.entries(params).filter(([key, value]) => key !== "poly" && key !== "day" && typeof value === "string").map(([key, value]) => `&${key}=${encodeURIComponent(value as string)}`);
    redirect(`/studio/film/v2?${FILM_QUERY}${rest.join("")}`);
  }
  const [srt, validation, landing, proof] = await Promise.all([text(CAPTIONS), text(VALIDATION), text(LANDING), proofNumbers()]);
  const seal = landing.match(/<svg class="seal-written"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const chart = validation.slice(Math.max(0, validation.indexOf("<svg")));
  return (
    <Suspense fallback={<main className="film" />}>
      <Board cues={parseSrt(srt)} validation={chart} seal={seal} proof={proof} />
    </Suspense>
  );
}
