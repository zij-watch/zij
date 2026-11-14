"use client";

// L3 and L4 of the third film (lib/film/v3.ts): the machine, drawn in the app's tokens in the style
// of a zij's instruments and an astrolabe. The pale MODIS seasons of 2001 to 2011 feed in on the
// left; four stages light up in turn, each with its label and a small picture of what it does; out
// on the right come the converted seasons, which meet the real VIIRS seasons of 2012 on with no
// step. Then the dial sweeps from raw MODIS's error to Zij's, and the margins glow.
// Every bar, point and number is the Nile Delta's, from its exported file and method.json.

import { useMemo } from "react";
import type { Area } from "@/lib/data";
import { arrive, clamp, ease, lerp, move } from "@/lib/film/timeline";
import type { Beats } from "@/lib/film/v3";
import Paper from "../../Paper";
import { useT } from "../kit";

export interface Trials { raw: number; factor: number; zij: number }

const F = 742; // the rail, and the foot of every bar
const Y = (v: number) => F - v * 0.2; // 2,500 is 500 px
const C = { x: 650, y: 482 }; // the machine's middle
const R = 240;
const SUB = 148, SUB_R = 54; // the four stages' windows: their distance from the middle, their radius
const OUT = { x0: 1066, x1: 1762 };
const LABELS = ["Real fires", "One grid", "Each satellite", "Learn"];
const DIAL = { r: 70, from: 150, sweep: 240, max: 80 }; // degrees, clockwise from +x; 0% to 80%

const polar = (r: number, deg: number, c = C): [number, number] => [c.x + r * Math.cos((deg * Math.PI) / 180), c.y + r * Math.sin((deg * Math.PI) / 180)];
const pt = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

/** A stage's window: lit from its beat, glowing for a moment, then steady. */
function lit(t: number, at: number) {
  const on = move(t, at, 0.25);
  const glow = t < at ? 0 : Math.exp(-(t - at) / 0.6);
  return { on, glow };
}

export function Machine({ area, b, trials }: { area: Area; b: Beats; trials: Trials }) {
  const t = useT();
  const s = area.seasons;
  const rows = useMemo(() => s.year.map((year, i) => ({ year, i, converted: s.source[i] !== "VIIRS" })), [s]);
  const modis = rows.filter((r) => r.converted);
  const step = (OUT.x1 - OUT.x0) / rows.length;
  const outX = (k: number) => OUT.x0 + step * (k + 0.5);

  // The training points: each season of 2012 to 2020 as both satellites saw it, on log scales.
  const learn = useMemo(() => {
    const pts = rows.filter((r) => r.year >= 2012 && r.year <= 2020 && s.modis[r.i] && s.viirs[r.i]).map((r) => [Math.log(s.modis[r.i] as number), Math.log(s.viirs[r.i] as number)]);
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    const fx = (x: number) => -36 + (72 * (x - x0)) / (x1 - x0), fy = (y: number) => 30 - (60 * (y - y0)) / (y1 - y0);
    return { pts: pts.map(([x, y]) => [fx(x), fy(y)]), line: [[fx(x0), fy(my + slope * (x0 - mx))], [fx(x1), fy(my + slope * (x1 - mx))]] };
  }, [rows, s]);

  const centres = [-135, -45, 45, 135].map((a) => polar(SUB, a));
  const stage = b.stages.map((at) => lit(t, at));
  const on = move(t, b.machine - 0.2, 0.4);
  const turn = 6 * Math.max(0, t - b.machine) + 2 * t; // the rete turns slowly, faster once the machine runs
  const dialK = ease(clamp((t - b.dial[0]) / (b.dial[1] - b.dial[0])));
  const errorNow = lerp(trials.raw, trials.zij, dialK);
  const needle = DIAL.from + (DIAL.sweep * Math.min(DIAL.max, errorNow)) / DIAL.max;
  const margin = t < b.margin ? 0 : 0.45 + 0.5 * Math.exp(-(t - b.margin) / 0.5);
  const feedFor = (b.feed[1] - b.feed[0]) / modis.length;
  const outFor = (b.out[1] - b.out[0]) / modis.length;
  const small = move(t, b.smallText, 0.4);

  return (
    <Paper as="div" kind="sheet" seed="v3-machine" className="v3-machine">
      <svg className="v3-machine-svg" width={1800} height={1000} viewBox="0 0 1800 1000" aria-hidden="true">
        <defs>
          <radialGradient id="v3-brass" cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="color-mix(in srgb, var(--flame) 45%, var(--brass))" />
            <stop offset="0.55" stopColor="var(--brass)" />
            <stop offset="1" stopColor="color-mix(in srgb, var(--brass) 55%, var(--shadow))" />
          </radialGradient>
        </defs>

        {/* The rail the record runs along. */}
        <line x1={52} x2={1772} y1={F} y2={F} className="v3-rail" />

        {/* In: the pale MODIS seasons, 2001 to 2011, as recorded; each runs into the machine. */}
        <text x={64} y={F + 36} className="v3-input">NASA FIRMS · MODIS + VIIRS</text>
        {modis.map((r, k) => {
          const x = 70 + k * 25, go = move(t, b.feed[0] + k * feedFor, Math.max(0.2, feedFor * 3));
          const v = s.modis[r.i] as number;
          return (
            <g key={r.year}>
              <rect x={x} y={Y(v)} width={18} height={F - Y(v)} className="v3-ghost" />
              <rect x={x + go * (C.x - R - x + 10)} y={Y(v)} width={18} height={F - Y(v)} className="v3-in" opacity={0.55 * (1 - go)} />
            </g>
          );
        })}

        {/* The machine. */}
        <g className="v3-body" opacity={0.55 + 0.45 * on}>
          <circle cx={C.x} cy={C.y} r={R} fill="url(#v3-brass)" className="v3-rim" />
          <circle cx={C.x} cy={C.y} r={R - 26} className="v3-plate" />
          {Array.from({ length: 72 }, (_, k) => {
            const a = k * 5, long = k % 6 === 0;
            return <line key={k} x1={polar(R - 26, a)[0]} y1={polar(R - 26, a)[1]} x2={polar(R - (long ? 4 : 12), a)[0]} y2={polar(R - (long ? 4 : 12), a)[1]} className="v3-tick" />;
          })}
          {/* The rete: open arcs and a pointer, turning slowly. */}
          <g transform={`rotate(${turn.toFixed(2)} ${C.x} ${C.y})`} className="v3-rete">
            <circle cx={C.x} cy={C.y} r={112} />
            <circle cx={C.x + 30} cy={C.y - 18} r={176} strokeDasharray="6 10" />
            <path d={`M${pt(polar(206, -90))} L${pt(polar(100, -96))} L${pt(polar(100, -84))} Z`} className="v3-pointer" />
            {[0, 60, 120, 180, 240, 300].map((a) => <circle key={a} cx={polar(188, a + 30)[0]} cy={polar(188, a + 30)[1]} r={5} className="v3-star" />)}
          </g>

          {/* The four stages. */}
          {centres.map((c, k) => (
            <g key={k} opacity={0.4 + 0.6 * stage[k].on}>
              <circle cx={c[0]} cy={c[1]} r={SUB_R + 10} className="v3-glow" opacity={stage[k].glow} />
              <circle cx={c[0]} cy={c[1]} r={SUB_R} className="v3-window" />
              <g transform={`translate(${c[0]} ${c[1]})`}>{stagePicture(k, t, b.stages[k], learn)}</g>
            </g>
          ))}

          {/* The dial: the error of a season total, leaving one year out. */}
          <circle cx={C.x} cy={C.y} r={DIAL.r + 8} className="v3-dial-back" />
          {Array.from({ length: 9 }, (_, k) => {
            const a = DIAL.from + (DIAL.sweep * k) / 8;
            return <line key={k} x1={polar(DIAL.r - 12, a)[0]} y1={polar(DIAL.r - 12, a)[1]} x2={polar(DIAL.r, a)[0]} y2={polar(DIAL.r, a)[1]} className="v3-tick" />;
          })}
          <line x1={C.x} y1={C.y} x2={polar(DIAL.r - 6, needle)[0]} y2={polar(DIAL.r - 6, needle)[1]} className="v3-needle" />
          <circle cx={C.x} cy={C.y} r={6} className="v3-hub" />
          <text x={C.x} y={C.y + 48} className="v3-dial-value">{Math.round(errorNow)}%</text>
        </g>

        {/* The stages' names. */}
        {LABELS.map((label, k) => {
          const [x, y] = polar(R + 34, [-135, -45, 45, 135][k]);
          return <text key={label} x={x} y={y + 10} className="v3-stage" textAnchor={k === 0 || k === 3 ? "end" : "start"} opacity={0.3 + 0.7 * stage[k].on}>{label}</text>;
        })}

        <text x={C.x} y={128} className="v3-trials" textAnchor="middle" opacity={small} style={{ clipPath: small < 1 ? `inset(0 ${(100 * (1 - small)).toFixed(2)}% 0 0)` : undefined }}>
          Raw MODIS {trials.raw}% · fixed factor {trials.factor}% · Zij {trials.zij}%
        </text>

        {/* Out: the converted seasons, then the real VIIRS ones from 2012, on one scale. */}
        {[1000, 2000].map((v) => (
          <g key={v}>
            <line x1={OUT.x0} x2={OUT.x1} y1={Y(v)} y2={Y(v)} className="v3-grid" />
            <text x={OUT.x0 - 8} y={Y(v) + 7} className="v3-small" textAnchor="end">{v.toLocaleString("en-US")}</text>
          </g>
        ))}
        {rows.map((r, k) => {
          const x = outX(k) - 9.5;
          if (!r.converted) {
            const v = s.viirs[r.i] as number;
            return <rect key={r.year} x={x} y={Y(v)} width={19} height={F - Y(v)} className="v3-viirs" />;
          }
          const grow = arrive(t, b.out[0] + k * outFor, 0.45);
          const v = s.value[r.i], lo = s.lo[r.i] as number, hi = s.hi[r.i] as number;
          return (
            <g key={r.year}>
              <rect x={x - 4} y={Y(hi)} width={27} height={Y(lo) - Y(hi)} className="v3-band" opacity={margin * grow} />
              <rect x={x} y={F - (F - Y(v)) * grow} width={19} height={(F - Y(v)) * grow} className="v3-converted" />
              <line x1={x + 9.5} x2={x + 9.5} y1={Y(hi)} y2={Y(lo)} className="v3-whisker" opacity={margin > 0 ? 1 : 0} />
            </g>
          );
        })}
        {rows.filter((r) => r.year % 5 === 1).map((r) => <text key={r.year} x={outX(rows.indexOf(r))} y={F + 30} className="v3-small" textAnchor="middle">{r.year}</text>)}
      </svg>
    </Paper>
  );
}

/** What each stage does, small, inside its window (60 px round). */
function stagePicture(k: number, t: number, at: number, learn: { pts: number[][]; line: number[][] }) {
  const p = clamp((t - at) / 0.9);
  if (k === 0) {
    // Real fires: the detections stay; a cluster of gas flares (always burning, in the same place) blinks out.
    const fires: [number, number][] = [[-30, -12], [-12, 18], [8, -26], [22, 10], [-2, 2], [30, -6]];
    const flares: [number, number][] = [[14, 30], [20, 34], [9, 36]];
    const blink = t < at ? 1 : p < 0.6 ? (Math.sin(p * 30) > 0 ? 1 : 0.25) : Math.max(0, 1 - (p - 0.6) / 0.25);
    return (
      <>
        {fires.map(([x, y], j) => <circle key={j} cx={x} cy={y} r={4.5} className="v3-fire" />)}
        {flares.map(([x, y], j) => <circle key={`f${j}`} cx={x} cy={y} r={3.5} className="v3-flare" opacity={blink} />)}
      </>
    );
  }
  if (k === 1) {
    // One grid: scattered pixels snap into 0.1-degree cells.
    const from: [number, number][] = [[-31, -20], [-17, 9], [-4, -29], [11, -9], [26, 17], [-23, 27], [4, 22], [29, -24]];
    const snap = ease(clamp((p - 0.15) / 0.5));
    const cell = 20, grid = move(t, at, 0.3);
    return (
      <>
        {[-1, 0, 1].map((g) => <g key={g} opacity={grid}><line x1={g * cell} x2={g * cell} y1={-44} y2={44} className="v3-cell" /><line y1={g * cell} y2={g * cell} x1={-44} x2={44} className="v3-cell" /></g>)}
        {from.map(([x, y], j) => {
          const cx = (Math.floor(x / cell) + 0.5) * cell, cy = (Math.floor(y / cell) + 0.5) * cell;
          const size = lerp(6, 12, snap);
          return <rect key={j} x={lerp(x, cx, snap) - size / 2} y={lerp(y, cy, snap) - size / 2} width={size} height={size} className="v3-pixel" opacity={lerp(1, 0.75, snap)} />;
        })}
      </>
    );
  }
  if (k === 2) {
    // Each satellite: two dials, one per satellite, averaged into one.
    const a = -125, c = -35, mean = (a + c) / 2, m = ease(clamp((p - 0.1) / 0.55));
    const hand = (deg: number, cls: string, o = 1) => <line x1={0} y1={0} x2={44 * Math.cos((deg * Math.PI) / 180)} y2={44 * Math.sin((deg * Math.PI) / 180)} className={cls} opacity={o} />;
    return (
      <>
        <path d="M-44 0 A44 44 0 0 1 44 0" className="v3-cell" />
        {hand(lerp(a, mean, m), "v3-hand is-terra", 1 - 0.7 * m)}
        {hand(lerp(c, mean, m), "v3-hand is-aqua", 1 - 0.7 * m)}
        {m > 0.95 && hand(mean, "v3-hand")}
        <circle r={4} className="v3-hub" />
      </>
    );
  }
  // Learn: the seasons of 2012 to 2020 as both satellites saw them, and the line fitted through them.
  const draw = ease(clamp((p - 0.2) / 0.6));
  const [[x0, y0], [x1, y1]] = learn.line;
  return (
    <>
      {learn.pts.map(([x, y], j) => <circle key={j} cx={x} cy={y} r={3.6} className="v3-point" opacity={Math.min(1, Math.max(0, p * 9 - j * 0.6))} />)}
      <line x1={x0} y1={y0} x2={lerp(x0, x1, draw)} y2={lerp(y0, y1, draw)} className="v3-fit" opacity={draw > 0 ? 1 : 0} />
    </>
  );
}
