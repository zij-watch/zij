"use client";

import type { GameData } from "@/lib/diary/game";
import { CHAPTERS, TEST_CHAPTERS } from "./chapters";
import Game from "./Game";

/** The engine's test at /studio/diary?engine. It keeps no progress. */
export default function EngineTest({ data }: { data: GameData }) {
  return <Game data={data} chapters={TEST_CHAPTERS} keep={false} />;
}

/** The game from any chapter, for review at /studio/diary?play=N. It keeps no progress. */
export function PlayFrom({ data, at }: { data: GameData; at: number }) {
  return <Game data={data} chapters={CHAPTERS} keep={false} startAt={Math.min(CHAPTERS.length - 1, Math.max(0, at))} />;
}
