"use client";

// Papers 1, 2 and 3 of the board (docs/event/FILM.md): the record as recorded, the record on one
// scale with its calendar, and the proof. The charts are the app's own (SeriesChart, Calendar,
// ResultPaper, Lever) and the repository's validation picture, fed the exported files. Each paper's
// story runs from its own start (STORY, when the camera is 70% of the way to it); before that the
// paper lies on the board as it was left, or as it will begin.

import * as echarts from "echarts/core";
import { useMemo, useRef } from "react";
import type { Area } from "@/lib/data";
import { BEATS, STORY } from "@/lib/film/board";
import { arrive, clamp, lerp, move } from "@/lib/film/timeline";
import { MONTHS_SHORT, monthSpan } from "@/lib/format";
import { COLOURS } from "@/lib/tokens";
import Calendar from "../../Calendar";
import { ResultPaper } from "../../Panel";
import Paper from "../../Paper";
import SeriesChart from "../../SeriesChart";
import { Lever, UnitTerm } from "../../ui";
import { inked, Sheet, useDriver, useReady, useT } from "../kit";
import type { ProofNumbers } from "../Proof";
import { PaperTitle } from "./Title";

const noop = () => {};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const mixHex = (a: string, b: string, k: number) => {
  const x = rgb(a), y = rgb(b);
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], k))).join(",")})`;
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length === 0 ? NaN : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
type AxisModel = { axis: { scale: { getExtent: () => [number, number] } } };
/** The top of the value axis as the chart has just drawn it. */
export const axisTop = (chart: echarts.ECharts) =>
  (chart as unknown as { getModel: () => { getComponent: (type: string, index: number) => AxisModel } }).getModel().getComponent("yAxis", 0).axis.scale.getExtent()[1];
export const chartIn = (holder: HTMLElement | null) => {
  const element = holder?.querySelector<HTMLElement>(".chart");
  return element ? echarts.getInstanceByDom(element) : undefined;
};

/** The Nile Delta's seasons, as the chart reads them. */
export function useSeasons(area: Area) {
  return useMemo(() => {
    const s = area.seasons;
    const [b0, b1] = area.climatology.baseline_years;
    const rows = s.year.map((_, i) => i);
    const converted = (i: number) => s.source[i] !== "VIIRS";
    const season = area.fit.season;
    const [from, to] = monthSpan(area);
    return {
      s, b0, b1, rows, converted, from, to,
      raw: (i: number) => (converted(i) ? s.modis[i] : s.viirs[i]) ?? 0,
      nModis: rows.filter(converted).length,
      modisYears: rows.filter(converted).map((i) => s.year[i]),
      viirsYears: rows.filter((i) => !converted(i)).map((i) => s.year[i]),
      normal: median(s.value.filter((_, i) => s.year[i] >= b0 && s.year[i] <= b1)),
      seasonWords: season.length ? `${MONTHS_SHORT[season[0] - 1]}–${MONTHS_SHORT[season[season.length - 1] - 1]}` : "",
    };
  }, [area]);
}

// ---------------------------------------------------------------- 1. the jump

export function JumpPaper({ area }: { area: Area }) {
  const t = useT();
  const s = STORY[1], B = BEATS.jump;
  const sheet = useRef<HTMLDivElement>(null);
  const modisMark = useRef<HTMLParagraphElement>(null);
  const viirsMark = useRef<HTMLParagraphElement>(null);
  const divide = useRef<HTMLElement>(null);
  const top = useRef<number | undefined>(undefined);
  const r = useSeasons(area);
  useReady("jump", true);

  useDriver((time) => {
    const chart = chartIn(sheet.current);
    if (!chart) return;
    const c = COLOURS;
    const bars = r.rows.map((i) => ({ value: r.raw(i), itemStyle: { color: r.converted(i) ? c.lapis : c.rubric } }));
    if (top.current === undefined) {
      chart.setOption({ animation: false, yAxis: { max: null }, series: [{ id: "bars", data: bars }, { id: "band", data: [] }] });
      top.current = axisTop(chart);
    }
    // The MODIS years are inked in one after another; from the first VIIRS year the bars leap.
    const grown = (k: number) => (k < r.nModis ? move(time, s + B.modis + k * B.modisEvery, B.modisFor) : arrive(time, s + B.viirs + (k - r.nModis) * B.viirsEvery));
    chart.setOption({ animation: false, yAxis: { max: top.current }, series: [{ id: "bars", data: bars.map((bar, k) => ({ ...bar, value: bar.value * grown(k) })) }, { id: "band", data: [] }] });
    chart.getZr().flush();
    const x = (k: number) => chart.convertToPixel({ seriesId: "bars" }, [k, 0])[0];
    const step = x(1) - x(0), high = chart.convertToPixel({ seriesId: "bars" }, [0, top.current])[1], foot = chart.convertToPixel({ seriesId: "bars" }, [0, 0])[1];
    const place = (element: HTMLElement | null, first: number, last: number) => {
      if (!element) return;
      element.style.left = `${x(first) - step * 0.41}px`;
      element.style.width = `${x(last) - x(first) + step * 0.82}px`;
    };
    place(modisMark.current, 0, r.nModis - 1);
    place(viirsMark.current, r.nModis, r.rows.length - 1);
    if (divide.current) {
      divide.current.style.left = `${(x(r.nModis - 1) + x(r.nModis)) / 2}px`;
      divide.current.style.top = `${high + 34}px`;
      divide.current.style.height = `${(foot - high) * move(time, s + B.divide, 0.3)}px`;
    }
  });

  return (
    <>
      <Paper as="div" kind="slip" seed="board-corner" className="board-corner">Team Zij · Harmonization of MODIS and VIIRS Hot Spots</Paper>
      <Sheet ref={sheet} className="film-seasons" x={0} y={0} w={780} k={1.5}>
        <ResultPaper letter="ه" id="board-jump" title={<>Nile Delta · Seasons · {r.seasonWords}</>}
          extra={<Lever label="Which record" off="As recorded" on="On one scale" checked={false} onChange={noop} />}>
          <PaperTitle n={1} scale={1.5} />
          <ul className="key board-key"><li><i className="key-modis" aria-hidden="true" />MODIS, as recorded</li><li><i className="key-viirs" aria-hidden="true" />VIIRS, as recorded</li></ul>
          <div className="film-chart">
            <SeriesChart area={area} fromYear={Number(r.from.slice(0, 4))} toYear={Number(r.to.slice(0, 4))} normal={r.normal} recorded />
            <p ref={modisMark} className="film-half is-modis" style={inked(t, s + B.modisLabel)}>
              <b>MODIS</b> {r.modisYears[0]}–{r.modisYears[r.modisYears.length - 1]}
            </p>
            <p ref={viirsMark} className="film-half is-viirs" style={inked(t, s + B.viirsLabel)}>
              <b>VIIRS</b> {r.viirsYears[0]}–{r.viirsYears[r.viirsYears.length - 1]}
            </p>
            <i ref={divide} className="film-divide" style={t < s + B.divide ? { visibility: "hidden" } : undefined} aria-hidden="true" />
          </div>
        </ResultPaper>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- 2. the link

export function LinkPaper({ area }: { area: Area }) {
  const t = useT();
  const s = STORY[2], B = BEATS.link;
  const sheet = useRef<HTMLDivElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const tops = useRef<{ recorded?: number; one?: number }>({});
  const r = useSeasons(area);
  const recorded = t < s + B.flip;
  useReady("link", true);

  useDriver((time) => {
    const chart = chartIn(sheet.current);
    if (!chart) return;
    const c = COLOURS, d = r.s;
    const state = time < s + B.flip ? "recorded" : "one";
    const whole = {
      bars: r.rows.map((i) => ({ value: state === "recorded" ? r.raw(i) : d.value[i], itemStyle: { color: state === "recorded" && r.converted(i) ? c.lapis : c.rubric } })),
      band: state === "recorded" ? [] : r.rows.map((i, k) => [k, d.lo[i], d.hi[i]]),
    };
    if (tops.current[state] === undefined) {
      chart.setOption({ animation: false, yAxis: { max: null }, series: [{ id: "bars", data: whole.bars }, { id: "band", data: whole.band }] });
      tops.current[state] = axisTop(chart);
    }
    const max = tops.current[state];
    if (state === "recorded") {
      chart.setOption({ animation: false, yAxis: { max }, series: [{ id: "bars", data: whole.bars }, { id: "band", data: [] }] });
    } else {
      const k1 = move(time, s + B.flip, B.settle), k2 = move(time, s + B.whiskers, 0.5), k3 = move(time, s + B.median, 0.3);
      chart.setOption({
        animation: false,
        yAxis: { max },
        series: [
          {
            id: "bars",
            data: r.rows.map((i) => ({ value: lerp(r.raw(i), d.value[i], k1), itemStyle: { color: r.converted(i) ? mixHex(c.lapis, c.rubric, k1) : c.rubric } })),
            markLine: { lineStyle: { opacity: k3 }, label: { opacity: k3 } },
          },
          { id: "band", data: r.rows.map((i, k) => (d.lo[i] === null || d.hi[i] === null ? [k, null, null] : [k, lerp(d.value[i], d.lo[i] as number, k2), lerp(d.value[i], d.hi[i] as number, k2)])) },
        ],
      });
    }
    chart.getZr().flush();
    // The calendar's rows are stamped in, oldest first.
    calendar.current?.querySelectorAll<SVGGElement>("svg > g:nth-of-type(1) > g").forEach((row, k) => {
      const at = s + B.rows + k * B.rowEvery;
      const landed = arrive(time, at, B.rowFor);
      row.style.transformBox = "fill-box";
      row.style.transformOrigin = "50% 50%";
      row.style.opacity = String(clamp((time - at) / 0.07));
      row.style.transform = `scale(${(1 + 0.14 * (1 - landed)).toFixed(4)})`;
    });
  });

  return (
    <>
      <Sheet ref={sheet} className="film-seasons" x={0} y={0} w={780} k={1.38} style={{ ["--film-lever" as string]: move(t, s + B.lever, B.leverFor) }}>
        <ResultPaper letter="ه" id="board-link" title={<>Nile Delta · Seasons · {r.seasonWords}</>}
          extra={<Lever label="Which record" off="As recorded" on="On one scale" checked={!recorded} onChange={noop} />}>
          <PaperTitle n={2} scale={1.38} />
          <div className="film-chart">
            <SeriesChart area={area} fromYear={Number(r.from.slice(0, 4))} toYear={Number(r.to.slice(0, 4))} normal={r.normal} recorded={recorded} />
          </div>
          {recorded
            ? <ul className="key"><li><i className="key-modis" aria-hidden="true" />MODIS, as recorded</li><li><i className="key-viirs" aria-hidden="true" />VIIRS, as recorded</li></ul>
            : <ul className="key"><li><i className="key-viirs" aria-hidden="true" />on one scale, VIIRS terms</li><li><i className="key-whisker" aria-hidden="true" />likely range, converted year</li><li><i className="key-dashed" aria-hidden="true" />median season {r.b0}–{r.b1}</li></ul>}
        </ResultPaper>
      </Sheet>
      <Sheet ref={calendar} className="film-calendar" x={1116} y={8} w={500} rot={1.2}>
        <ResultPaper letter="ج" id="board-calendar" title={<>Calendar · <UnitTerm /> per month</>}>
          <div className="calendar-scroll">
            <Calendar area={area} from={r.from} to={r.to} labelSize={17} />
          </div>
        </ResultPaper>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- 3. the proof

export function ProofPaper({ svg, numbers }: { svg: string; numbers: ProofNumbers }) {
  const t = useT();
  const s = STORY[3], B = BEATS.proof;
  const chart = useRef<HTMLDivElement>(null);

  useDriver((time) => {
    const root = chart.current?.querySelector("svg");
    if (!root) return;
    // Every bar starts at the chart's zero line and is 13 high; the number beside it comes when it is drawn.
    [...root.querySelectorAll<SVGRectElement>('rect[height="13.0"]')].forEach((bar, n) => {
      const full = Number(bar.dataset.full ?? bar.getAttribute("width"));
      bar.dataset.full = String(full);
      const k = move(time, s + B.bars + Math.floor(n / 2) * B.barEvery + (n % 2) * 0.08, B.barFor);
      bar.setAttribute("width", (full * k).toFixed(2));
      const label = bar.nextElementSibling as SVGTextElement | null;
      if (label?.tagName === "text") label.style.opacity = k >= 1 ? "1" : "0";
    });
  });

  const value = Math.round(lerp(numbers.raw, numbers.zij, move(t, s + B.counter, B.counterFor)));
  return (
    <>
      <Sheet x={0} y={0} w={1010} k={1.22}>
        <Paper as="div" kind="sheet" seed="board-proof" className="film-proof">
          <PaperTitle n={3} scale={1.22} />
          <div ref={chart} dangerouslySetInnerHTML={{ __html: svg }} />
        </Paper>
      </Sheet>
      <Sheet x={1272} y={90} w={300} k={1.5} rot={1.5}>
        <Paper as="div" kind="card" seed="board-counter" className="film-counter">
          <p className="eyebrow">Error of a season total</p>
          <p className="film-figure">{String(value).split("").map((digit, k) => <i key={k}>{digit}</i>)}%</p>
          <p className="film-counter-note">
            from raw MODIS read as VIIRS to after Zij, over {numbers.areas} test areas, each year predicted without being used to fit
          </p>
        </Paper>
      </Sheet>
    </>
  );
}
