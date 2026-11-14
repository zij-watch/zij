import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Film from "@/components/film/Film";
import type { ProofNumbers } from "@/components/film/Proof";
import { parseSrt } from "@/lib/film/srt";
import { FILM_QUERY } from "@/lib/film/timeline";
import { readMethod } from "@/lib/serverData";
import "./film.css";

// The demo film, drawn from the real app one frame at a time: see docs/event/FILM.md.
export const metadata: Metadata = { title: "Zij: studio film", robots: { index: false } };

// Three files are read as they are, from the repository the app runs in. Where one is missing
// (a deployment without docs/), its part of the film is left empty and the page still loads.
const text = (path: string) => readFile(path, "utf-8").catch(() => "");
const APP = process.cwd();
const CAPTIONS = join(/* turbopackIgnore: true */ APP, "..", "docs", "event", "zij-demo30-v2.en.srt");
const VALIDATION = join(/* turbopackIgnore: true */ APP, "..", "docs", "assets", "validation-light.svg");
const LANDING = join(/* turbopackIgnore: true */ APP, "public", "landing.html");

interface Model { scheme: string; model: string; season_err_abs_pct: number }

/** The two ends of the counter, from the exported validation: raw MODIS and the model in use, each leaving one year out. */
async function proofNumbers(): Promise<ProofNumbers | null> {
  const method = (await readMethod()) as { models?: { all_areas: Model[]; research_areas: number; train_years: [number, number] } } | null;
  const error = (model: string) => method?.models?.all_areas.find((r) => r.model === model && r.scheme === "LOYO")?.season_err_abs_pct;
  const raw = error("raw"), zij = error("M4");
  if (!method?.models || raw === undefined || zij === undefined) return null;
  return { raw: Math.round(raw), zij: Math.round(zij), areas: method.models.research_areas, train: method.models.train_years };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // The film's area and day are in the address, like every view of the app.
  if (!params.poly || !params.day) {
    const rest = Object.entries(params).filter(([key, value]) => key !== "poly" && key !== "day" && typeof value === "string").map(([key, value]) => `&${key}=${encodeURIComponent(value as string)}`);
    redirect(`/studio/film?${FILM_QUERY}${rest.join("")}`);
  }
  const [srt, validation, landing, proof] = await Promise.all([
    text(CAPTIONS), // the captions, parsed, never typed again
    text(VALIDATION), // the validation chart, as the repository draws it
    text(LANDING), // the Seal and its brush strokes, as the landing page has them
    proofNumbers(),
  ]);
  const seal = landing.match(/<svg class="seal-written"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const chart = validation.slice(Math.max(0, validation.indexOf("<svg")));
  return (
    <Suspense fallback={<main className="film" />}>
      <Film cues={parseSrt(srt)} validation={chart} seal={seal} proof={proof} />
    </Suspense>
  );
}
