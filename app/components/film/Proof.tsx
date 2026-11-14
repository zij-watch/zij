"use client";

// Scene 3: the proof. The validation chart is the repository's own picture
// (docs/assets/validation-light.svg, drawn from method.json by scripts/readme_assets.py), put on a
// sheet as it is. For each frame the film sets how long its bars are, up to their real length, and
// a counter runs from the error of raw MODIS to the error after Zij: both numbers are read from
// method.json on the server (app/studio/film/page.tsx).

import { useRef } from "react";
import { arrive, lerp, move, SLIDE, T } from "@/lib/film/timeline";
import Paper from "../Paper";
import { ruledIn, Sheet, shown, useDriver, useT } from "./kit";

export interface ProofNumbers { raw: number; zij: number; areas: number; train: [number, number] }

export default function Proof({ svg, numbers }: { svg: string; numbers: ProofNumbers }) {
  const t = useT();
  const chart = useRef<HTMLDivElement>(null);

  useDriver((time) => {
    const root = chart.current?.querySelector("svg");
    if (!root || time < T.proofRule || time >= T.mapIn + SLIDE) return;
    // Every bar starts at the chart's zero line (x = 330) and is 13 high; the number beside it follows.
    const bars = [...root.querySelectorAll<SVGRectElement>('rect[height="13.0"]')];
    bars.forEach((bar, n) => {
      const full = Number(bar.dataset.full ?? bar.getAttribute("width"));
      bar.dataset.full = String(full);
      const row = Math.floor(n / 2), second = n % 2;
      const k = move(time, T.proofBars + row * T.proofEvery + second * 0.08, T.proofFor);
      bar.setAttribute("width", (full * k).toFixed(2));
      const label = bar.nextElementSibling as SVGTextElement | null;
      if (label?.tagName === "text") label.style.opacity = k >= 1 ? "1" : "0";
    });
  });

  const run = move(t, T.counter, T.counterFor);
  const value = Math.round(lerp(numbers.raw, numbers.zij, run));
  const card = arrive(t, T.proofCard);
  return (
    <div className="film-group" style={{ ...shown(t, T.proofRule, T.mapIn + SLIDE), ...ruledIn(t, T.proofRule) }}>
      <Sheet x={96} y={100} w={1010} k={1.22}>
        <Paper as="div" kind="sheet" seed="film-proof" className="film-proof">
          <div ref={chart} dangerouslySetInnerHTML={{ __html: svg }} />
        </Paper>
      </Sheet>
      <Sheet x={1372} y={196} w={300} k={1.5} rot={1.2} style={{ ...shown(t, T.proofCard), opacity: Math.min(1, card * 4), transformOrigin: "50% 50%" }} dy={(1 - card) * -26}>
        <Paper as="div" kind="card" seed="film-counter" className="film-counter">
          <p className="eyebrow">Error of a season total</p>
          <p className="film-figure">{String(value).split("").map((digit, k) => <i key={k}>{digit}</i>)}%</p>
          <p className="film-counter-note">
            from raw MODIS read as VIIRS to after Zij, over {numbers.areas} test areas, each year predicted without being used to fit
          </p>
        </Paper>
      </Sheet>
    </div>
  );
}
