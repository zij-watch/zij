import type { Metadata } from "next";
import ArtKit from "@/components/diary/ArtKit";
import EngineTest from "@/components/diary/EngineTest";
import ScriptSheet from "@/components/diary/ScriptSheet";
import { readDiaryData, readDiaryNumbers } from "@/lib/diary/load";
import "../../diary/diary.css";
import "../../diary/game.css";
import "./studio-diary.css";

// Hudhud's Fire Diary, for review. Not linked from the site.
//   /studio/diary          the art kit: every drawing with its states, in Night and Folio
//   /studio/diary?script   every line of the game with its word count
//   /studio/diary?engine   the engine's test: each piece of it used once
export const metadata: Metadata = { title: "Zij: studio, Hudhud's Fire Diary", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if ("script" in query) return <ScriptSheet numbers={await readDiaryNumbers()} />;
  if ("engine" in query) return <EngineTest data={await readDiaryData()} />;
  return <ArtKit data={await readDiaryData()} />;
}
