"use client";

import type { GameData } from "@/lib/diary/game";
import { TEST_CHAPTERS } from "./chapters";
import Game from "./Game";

/** The engine's test at /studio/diary?engine. It keeps no progress. */
export default function EngineTest({ data }: { data: GameData }) {
  return <Game data={data} chapters={TEST_CHAPTERS} keep={false} />;
}
