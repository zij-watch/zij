"use client";

// The order of Hudhud's Fire Diary: the opening, the five levels and the ending, each with its scene.
import type { ChapterDef } from "./Game";
import Compare from "./levels/Compare";
import Count from "./levels/Count";
import Ending from "./levels/Ending";
import Opening from "./levels/Opening";
import Sort from "./levels/Sort";
import Spot from "./levels/Spot";
import Translate from "./levels/Translate";
import { TestDesk, TestSky } from "./levels/Test";

export const CHAPTERS: ChapterDef[] = [
  { level: 0, scene: "sky", id: "opening", Level: Opening },
  { level: 1, scene: "sky", id: "spot", Level: Spot },
  { level: 2, scene: "sky", id: "sort", Level: Sort },
  { level: 3, scene: "sky", id: "count", Level: Count },
  { level: 4, scene: "desk", id: "translate", Level: Translate },
  { level: 5, scene: "desk", id: "compare", Level: Compare },
  { level: 6, scene: "sky", id: "ending", Level: Ending },
];

/** The engine's test, for /studio/diary?engine: two chapters that use each piece once. */
export const TEST_CHAPTERS: ChapterDef[] = [
  { level: 1, scene: "sky", id: "spot", Level: TestSky },
  { level: 4, scene: "desk", id: "translate", Level: TestDesk },
];
