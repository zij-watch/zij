"use client";

// How far a visitor has come in Hudhud's Fire Diary: the chapter reached, the stars each level kept
// and the seals pressed. Kept in memory and in localStorage through lib/remember.ts, whose every read
// and write is guarded, so the game plays the same in a private window, only without resuming.

import { recall, remember } from "@/lib/remember";

export type SealId = "honest" | "detective" | "keeper";
export type Progress = { chapter: number; stars: number[]; seals: SealId[] };

const KEY = "zij.diary.v1";
export const CHAPTERS = 7; // opening, five levels, ending
export const fresh = (): Progress => ({ chapter: 0, stars: [0, 0, 0, 0, 0], seals: [] });

export function loadProgress(): Progress {
  const p = recall<Partial<Progress> | null>(KEY, null);
  if (!p || typeof p.chapter !== "number" || !Array.isArray(p.stars)) return fresh();
  return {
    chapter: Math.min(CHAPTERS - 1, Math.max(0, Math.floor(p.chapter))),
    stars: [0, 1, 2, 3, 4].map((i) => Math.min(3, Math.max(0, Number(p.stars?.[i]) || 0))),
    seals: (p.seals ?? []).filter((s): s is SealId => s === "honest" || s === "detective" || s === "keeper"),
  };
}

export function saveProgress(p: Progress): void {
  remember(KEY, p);
}

export function clearProgress(): void {
  remember(KEY, undefined);
}

/** Stars a level keeps: three, one dimmed for each mistake or hint, never fewer than one. */
export const starsFor = (mistakes: number) => Math.max(1, 3 - mistakes);
