"use client";

// The order of Hudhud's Fire Diary: the opening, the five levels and the ending, each with its scene.
import type { ChapterDef } from "./Game";
import { TestDesk, TestSky } from "./levels/Test";

/** The engine's test, for /studio/diary?engine: two chapters that use each piece once. */
export const TEST_CHAPTERS: ChapterDef[] = [
  { level: 1, scene: "sky", id: "spot", Level: TestSky },
  { level: 4, scene: "desk", id: "translate", Level: TestDesk },
];
