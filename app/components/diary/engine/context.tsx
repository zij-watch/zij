"use client";

// What a level can ask of the game: its words, the data, Hudhud's note and poses, a hint (which
// costs a star), a cheer, and the end of the level. Provided by components/diary/Game.tsx.

import { createContext, useContext } from "react";
import type { GameData } from "@/lib/diary/game";
import type { SealId } from "@/lib/diary/progress";

export type Who = "hudhud" | "modis" | "viirs";
export type Pose = { crest: boolean; tilt: boolean; fly: boolean; stone: boolean };

export type GameApi = {
  data: GameData;
  /** every word the game shows, by its id in lib/diary/script.ts */
  L: Record<string, string>;
  /** reduced motion: everything already in place */
  still: boolean;
  /** show one or two lines in the marginal note, with their speakers */
  say: (ids: string | string[]) => void;
  /** put the note away */
  quiet: () => void;
  /** an erratum: Hudhud tilts his head, the hint appears and a star dims */
  hint: (id: string) => void;
  /** a mistake that needs no words of its own */
  slip: () => void;
  /** pleased: the crest rises and he takes a short step */
  cheer: () => void;
  pose: (p: Partial<Pose>) => void;
  /** the level is done: its stars and its note for grown-ups */
  finish: () => void;
  seal: (id: SealId) => void;
  /** wait, or not at all under reduced motion */
  wait: (ms: number) => Promise<void>;
};

export const GameContext = createContext<GameApi | null>(null);

export function useGame(): GameApi {
  const g = useContext(GameContext);
  if (!g) throw new Error("useGame outside the game");
  return g;
}
