"use client";

// The film v3.1's record sheet, beside the photo. The photo's fire dots lift off and fly to it,
// each landing where a season's bar stands, and the bars grow from them: the MODIS years first,
// then, on "tenfold", the VIIRS years leap (162 and 1,609, from the data). Then the ink circle
// round the leap, and "MODIS 1 km" and "VIIRS 375 m" on the two halves.

import { useMemo, useRef } from "react";
import type { Area } from "@/lib/data";
import type { DayResult } from "@/lib/dayData";
import { arrive, clamp, ease, lerp, move } from "@/lib/film/timeline";
import { PHOTO, S31, type Beats31 } from "@/lib/film/v31";
import { COLOURS } from "@/lib/tokens";
import { ResultPaper } from "../../Panel";
import Paper from "../../Paper";
import SeriesChart from "../../SeriesChart";
import { Lever } from "../../ui";
import { axisTop, chartIn, useSeasons } from "../board/Charts";
import { inked, Sheet, useDriver, useReady, useT } from "../kit";
import { daySorted, onPhoto } from "./Photo";

const noop = () => {};
const PAD = 34;
const CARD = { x: 120, y: 64, k: 2 };
const PER_BAR = 2;

function inkRing(cx: number, cy: number, rx: number, ry: number): string {
  const points: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const a = -2.2 + (i / 120) * 1.08 * 2 * Math.PI;
    const wobble = 1 + 0.035 * Math.sin(3 * a + 0.7) + 0.025 * (i / 120);
    points.push(`${(cx + rx * wobble * Math.cos(a)).toFixed(1)} ${(cy + ry * wobble * Math.sin(a)).toFixed(1)}`);
  }
  return `M${points.join(" L")}`;
}

interface Geo { x: number[]; step: number; foot: number; high: number; top: number[]; local: (px: number, py: number) => [number, number] }

export function Record31({ area, b, dayResult }: { area: Area; b: Beats31; dayResult: DayResult }) {
  const t = useT();
  const paper = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const halves = useRef<(HTMLParagraphElement | null)[]>([]);
  const divide = useRef<HTMLElement>(null);
  const ring = useRef<SVGPathElement>(null);
  const numbers = useRef<(HTMLParagraphElement | null)[]>([]);
  const flyers = useRef<(SVGCircleElement | null)[]>([]);
  const top = useRef<number | undefined>(undefined);
  const geo = useRef<Geo | null>(null);
  const r = useSeasons(area);
  const last = r.nModis - 1, first = r.nModis;
  useReady("record", true);

  // The flight: two dots from the photo for every season, each to its bar's foot.
  const P = S31[0], R = S31[1];
  const plan = useMemo(() => {
    const dots = daySorted(dayResult);
    const nV = r.rows.length - r.nModis;
    return r.rows.flatMap((_, k) => Array.from({ length: PER_BAR }, (_, j) => {
      const h = dots[(k * PER_BAR + j) * 3 % Math.max(1, dots.length)];
      const [px, py] = onPhoto(h.longitude, h.latitude);
      const from: [number, number] = [P.x + PHOTO.x + px - R.x, P.y + PHOTO.y + py - R.y];
      const leave = k < r.nModis ? lerp(b.flyModis[0], b.flyModis[1], (k * PER_BAR + j) / (r.nModis * PER_BAR - 1)) : b.flyViirs + ((k - r.nModis) / Math.max(1, nV - 1)) * 0.12;
      return { k, from, leave, land: leave + b.fly };
    }));
  }, [dayResult, r, b, P, R]);
  const landed = (k: number) => Math.max(...plan.filter((f) => f.k === k).map((f) => f.land));

  useDriver((time) => {
    const chart = chartIn(sheet.current);
    if (!chart) return;
    const c = COLOURS;
    const raw = r.rows.map((i) => ({ value: r.raw(i), itemStyle: { color: r.converted(i) ? c.lapis : c.rubric } }));
    if (top.current === undefined) {
      chart.setOption({ animation: false, yAxis: { max: null }, series: [{ id: "bars", data: raw }, { id: "band", data: [] }] });
      top.current = axisTop(chart);
      chart.setOption({ animation: false, yAxis: { max: top.current } });
      chart.getZr().flush();
      const px = (k: number, v: number) => chart.convertToPixel({ seriesId: "bars" }, [k, v]);
      const x = r.rows.map((_, k) => px(k, 0)[0]);
      // The chart's pixels on the sheet: measured once, the sheet being upright on the desk.
      const el = chart.getDom().getBoundingClientRect(), on = paper.current!.getBoundingClientRect();
      const scale = on.width / R.w;
      geo.current = {
        x, step: x[1] - x[0], foot: px(0, 0)[1], high: px(0, top.current)[1], top: raw.map((bar, k) => px(k, bar.value)[1]),
        local: (cx, cy) => [(el.left - on.left) / scale + (cx * el.width) / scale / chart.getWidth(), (el.top - on.top) / scale + (cy * el.height) / scale / chart.getHeight()],
      };
    }
    const g = geo.current!;
    // A bar grows as its dots land; the VIIRS years leap together on "tenfold".
    const grown = (k: number) => (k < r.nModis ? arrive(time, landed(k) - 0.05, 0.45) : arrive(time, b.leap + (k - r.nModis) * 0.03, 0.5));
    chart.setOption({ animation: false, yAxis: { max: top.current }, series: [{ id: "bars", data: raw.map((bar, k) => ({ ...bar, value: bar.value * grown(k) })) }, { id: "band", data: [] }] });
    chart.getZr().flush();

    plan.forEach((f, n) => {
      const el = flyers.current[n];
      if (!el) return;
      if (time < f.leave || time >= f.land + 0.12) {
        el.style.visibility = "hidden";
        return;
      }
      const p = ease(clamp((time - f.leave) / b.fly));
      const to = g.local(g.x[f.k], g.foot - 6);
      const mid: [number, number] = [(f.from[0] + to[0]) / 2, Math.min(f.from[1], to[1]) - 260];
      const q = 1 - p;
      const x = q * q * f.from[0] + 2 * q * p * mid[0] + p * p * to[0], y = q * q * f.from[1] + 2 * q * p * mid[1] + p * p * to[1];
      el.style.visibility = "";
      el.setAttribute("cx", x.toFixed(1));
      el.setAttribute("cy", y.toFixed(1));
      el.setAttribute("r", (9 + 12 * Math.sin(Math.PI * Math.min(1, p * 1.1))).toFixed(2));
      el.style.opacity = String(time > f.land ? 1 - (time - f.land) / 0.12 : 1);
    });

    const place = (element: HTMLElement | null, from: number, to: number) => {
      if (!element) return;
      element.style.left = `${g.x[from] - g.step * 0.41}px`;
      element.style.width = `${g.x[to] - g.x[from] + g.step * 0.82}px`;
    };
    place(halves.current[0], 0, last);
    place(halves.current[1], first, r.rows.length - 1);
    if (divide.current) {
      divide.current.style.left = `${(g.x[last] + g.x[first]) / 2}px`;
      divide.current.style.top = `${g.high + PAD}px`;
      divide.current.style.height = `${(g.foot - g.high) * move(time, b.leap - 0.25, 0.25)}px`;
    }
    [last, first].forEach((k, j) => {
      const element = numbers.current[j];
      if (!element) return;
      element.style.left = `${j === 0 ? g.x[k] : g.x[k] + g.step * 0.42}px`;
      element.style.transform = j === 0 ? "translateX(-50%)" : "translateX(-100%)";
      element.style.top = `${PAD + g.foot - (g.foot - g.top[k]) * grown(k) - 34}px`;
    });
    const cx = (g.x[last] + g.x[first]) / 2, ringTop = g.top[first] + PAD - 78, bottom = g.foot + PAD + 30;
    if (ring.current) {
      ring.current.setAttribute("d", inkRing(cx, (ringTop + bottom) / 2, g.step * 1.45, (bottom - ringTop) / 2));
      ring.current.style.strokeDashoffset = String(1 - move(time, b.circle, 0.6));
    }
  });

  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
  return (
    <Paper as="div" kind="sheet" seed="v31-record" className="v3-record">
      <div ref={paper} className="v31-fill" />
      <Sheet ref={sheet} className="film-seasons v3-seasons" x={CARD.x} y={CARD.y} w={780} k={CARD.k}>
        <ResultPaper letter="ه" id="v31-record-chart" title={<>Nile Delta · Seasons · {r.seasonWords}</>}
          extra={<Lever label="Which record" off="As recorded" on="On one scale" checked={false} onChange={noop} />}>
          <ul className="key board-key"><li><i className="key-modis" aria-hidden="true" />MODIS, as recorded</li><li><i className="key-viirs" aria-hidden="true" />VIIRS, as recorded</li></ul>
          <div className="film-chart">
            <SeriesChart area={area} fromYear={Number(r.from.slice(0, 4))} toYear={Number(r.to.slice(0, 4))} normal={r.normal} recorded />
            <p ref={(e) => void (halves.current[0] = e)} className="film-half is-modis" style={inked(t, b.sensors[0], 0.3)}><b>MODIS</b> 1 km</p>
            <p ref={(e) => void (halves.current[1] = e)} className="film-half is-viirs" style={inked(t, b.sensors[1], 0.3)}><b>VIIRS</b> 375 m</p>
            <i ref={divide} className="film-divide" style={t < b.leap - 0.25 ? { visibility: "hidden" } : undefined} aria-hidden="true" />
            <p ref={(e) => void (numbers.current[0] = e)} className="v3-number is-modis" style={inked(t, b.modis[1] - 0.1, 0.2)}>{fmt(r.raw(r.rows[last]))}</p>
            <p ref={(e) => void (numbers.current[1] = e)} className="v3-number is-viirs" style={inked(t, b.numbers, 0.2)}>{fmt(r.raw(r.rows[first]))}</p>
            <svg className="v3-ring" aria-hidden="true" style={t < b.circle ? { visibility: "hidden" } : undefined}>
              <path ref={ring} pathLength={1} strokeDasharray="1 1" />
            </svg>
          </div>
        </ResultPaper>
      </Sheet>
      <svg className="v31-flyers" aria-hidden="true">
        {plan.map((f, n) => <circle key={n} ref={(e) => void (flyers.current[n] = e)} className="v31-flyer" r={6} style={{ visibility: "hidden" }} />)}
      </svg>
    </Paper>
  );
}
