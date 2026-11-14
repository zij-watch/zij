"use client";

// A paper's title, written on the paper as its heading, in Cormorant Garamond and ink: inked in left
// to right as the camera arrives (the paper's story start) and left on the paper. It is TITLE_PX
// tall on screen when the paper is in focus, whatever the sheet's own scale.

import { STORY, TITLE_INK, TITLE_PX, TITLES } from "@/lib/film/board";
import { inked, useT } from "../kit";

export function PaperTitle({ n, scale = 1 }: { n: number; scale?: number }) {
  const t = useT();
  return (
    <h2 className="board-title" style={{ fontSize: `${(TITLE_PX / scale).toFixed(3)}px` }}>
      <span style={inked(t, STORY[n], TITLE_INK)}>{TITLES[n]}</span>
    </h2>
  );
}
