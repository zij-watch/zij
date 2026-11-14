import type { Metadata } from "next";
import Diary from "@/components/diary/Diary";
import { readDiaryData } from "@/lib/diary/load";
import "./diary.css";
import "./game.css";
import "./levels.css";

// Roro's Fire Diary: a short game that shows how Zij works, in five chapters, on the real record
// of the Nile Delta. Its words are in lib/diary/script.ts, its numbers come from the data files.
export const metadata: Metadata = {
  title: "Zij: Roro's Fire Diary",
  description: "A short game: spot, sort, count, translate and compare the fires of the Nile Delta, with Roro the hoopoe and two satellites.",
};

export default async function Page() {
  return <Diary data={await readDiaryData()} />;
}
