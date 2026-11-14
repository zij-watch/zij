"use client";

import type { GameData } from "@/lib/diary/game";
import { CHAPTERS } from "./chapters";
import Game from "./Game";

/** Hudhud's Fire Diary, the whole game, at /diary. */
export default function Diary({ data }: { data: GameData }) {
  return <Game data={data} chapters={CHAPTERS} />;
}
