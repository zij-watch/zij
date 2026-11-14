"use client";

// The third film's first surface (lib/film/v3.ts): the record sheet, one paper that changes in
// place. The chart is the app's own SeriesChart, fed the Nile Delta's exported seasons.
//   0.0   the seasons as recorded: MODIS to 2011, VIIRS from 2012; the bars leap at 2012
//   4.5   an ink circle round 2012, and the two sensors named
//   8.0   the trials written in beside the chart, each error ticking in turn, M4 underlined
//   14.5  the bars become the harmonized record, with its band; the Nile Delta's own error
// Every number comes from method.json (on the server, app/studio/film/v3/page.tsx).

import { useMemo, useRef } from "react";
import type { Area } from "@/lib/data";
import { arrive, clamp, lerp, move } from "@/lib/film/timeline";
import { V3 } from "@/lib/film/v3";
import { COLOURS } from "@/lib/tokens";
import { ResultPaper } from "../../Panel";
import Paper from "../../Paper";
import SeriesChart from "../../SeriesChart";
import { Lever } from "../../ui";
import { axisTop, chartIn, mixHex, useSeasons } from "../board/Charts";
import { inked, Sheet, shown, useDriver, useReady, useT } from "../kit";

export interface Trial { label: string; pct: number }

const noop = () => {};
const B = V3;
const CHART_K = 1.55;
const PAD = 34; // the chart's room above it, for the MODIS and VIIRS marks (film.css, .film-chart)

/** An ellipse drawn by hand: a little more than once round, starting up and to the left, slightly uneven. */
function inkRing(cx: number, cy: number, rx: number, ry: number): string {
  const points: string[] = [];
  const turns = 1.08, n = 120, start = -2.2;
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * turns * 2 * Math.PI;
    const wobble = 1 + 0.035 * Math.sin(3 * a + 0.7) + 0.025 * (i / n);
    points.push(`${(cx + rx * wobble * Math.cos(a)).toFixed(1)} ${(cy + ry * wobble * Math.sin(a)).toFixed(1)}`);
  }
  return `M${points.join(" L")}`;
}

interface Geo { x: number[]; step: number; foot: number; high: number; top2012: number }

export function RecordSheet({ area, trials, areaError }: { area: Area; trials: Trial[]; areaError: number }) {
  const t = useT();
  const sheet = useRef<HTMLDivElement>(null);
  const modisMark = useRef<HTMLParagraphElement>(null);
  const viirsMark = useRef<HTMLParagraphElement>(null);
  const divide = useRef<HTMLElement>(null);
  const ring = useRef<SVGPathElement>(null);
  const sensors = useRef<HTMLDivElement>(null);
  const tops = useRef<{ recorded?: number; one?: number }>({});
  const geo = useRef<Geo | null>(null);
  const r = useSeasons(area);
  const recorded = t < B.flip;
  useReady("record", true);

  useDriver((time) => {
    const chart = chartIn(sheet.current);
    if (!chart) return;
    const c = COLOURS, d = r.s;
    const raw = r.rows.map((i) => ({ value: r.raw(i), itemStyle: { color: r.converted(i) ? c.lapis : c.rubric } }));
    // The two states' axes, each measured once with its full bars; the recorded one also gives the
    // places the marks, the dashed divide and the ink circle are drawn at.
    if (tops.current.recorded === undefined) {
      chart.setOption({ animation: false, yAxis: { max: null }, series: [{ id: "bars", data: raw }, { id: "band", data: [] }] });
      tops.current.recorded = axisTop(chart);
      chart.setOption({ animation: false, yAxis: { max: tops.current.recorded } });
      chart.getZr().flush();
      const px = (k: number, v: number) => chart.convertToPixel({ seriesId: "bars" }, [k, v]);
      const x = r.rows.map((_, k) => px(k, 0)[0]);
      geo.current = { x, step: x[1] - x[0], foot: px(0, 0)[1], high: px(0, tops.current.recorded)[1], top2012: px(r.nModis, raw[r.nModis].value)[1] };
    }
    if (tops.current.one === undefined) {
      chart.setOption({ animation: false, yAxis: { max: null }, series: [{ id: "bars", data: d.value.map((v) => ({ value: v })) }, { id: "band", data: r.rows.map((i, k) => [k, d.lo[i], d.hi[i]]) }] });
      tops.current.one = axisTop(chart);
    }
    if (time < B.flip) {
      const grown = (k: number) => (k < r.nModis ? move(time, B.modis + k * B.modisEvery, B.modisFor) : arrive(time, B.viirs + (k - r.nModis) * B.viirsEvery));
      chart.setOption({ animation: false, yAxis: { max: tops.current.recorded }, series: [{ id: "bars", data: raw.map((bar, k) => ({ ...bar, value: bar.value * grown(k) })) }, { id: "band", data: [] }] });
    } else {
      const k1 = move(time, B.flip, B.settle), k2 = move(time, B.whiskers, 0.5), k3 = move(time, B.median, 0.3);
      chart.setOption({
        animation: false,
        yAxis: { max: tops.current.one },
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

    const g = geo.current!;
    const place = (element: HTMLElement | null, first: number, last: number) => {
      if (!element) return;
      element.style.left = `${g.x[first] - g.step * 0.41}px`;
      element.style.width = `${g.x[last] - g.x[first] + g.step * 0.82}px`;
    };
    place(modisMark.current, 0, r.nModis - 1);
    place(viirsMark.current, r.nModis, r.rows.length - 1);
    if (divide.current) {
      divide.current.style.left = `${(g.x[r.nModis - 1] + g.x[r.nModis]) / 2}px`;
      divide.current.style.top = `${g.high + PAD}px`;
      divide.current.style.height = `${(g.foot - g.high) * move(time, B.divide, 0.3)}px`;
    }
    // The ink circle: round the 2012 bar, from above its top down past the year under it.
    const cx = g.x[r.nModis], top = g.top2012 + PAD - 34, bottom = g.foot + PAD + 34;
    const rx = g.step * 1.05, ry = (bottom - top) / 2, cy = (top + bottom) / 2;
    if (ring.current) {
      ring.current.setAttribute("d", inkRing(cx, cy, rx, ry));
      ring.current.style.strokeDashoffset = String(1 - move(time, B.circle, B.circleFor));
      // Once the bars are on one scale there is no jump left to circle: the ring stays, faint.
      ring.current.style.opacity = String(lerp(0.88, 0.4, move(time, B.flip, 0.6)));
    }
    if (sensors.current) {
      sensors.current.style.opacity = String(1 - move(time, B.flip, 0.5));
      sensors.current.style.left = `${cx - rx - 18}px`;
      sensors.current.style.top = `${cy - 58}px`;
    }
  });

  // The trials: each row is written, then its error ticks from the row above's to its own.
  const rows = useMemo(() => trials.map((trial, k) => ({ ...trial, at: B.row + k * B.rowEvery, from: k === 0 ? 0 : trials[k - 1].pct })), [trials]);
  const most = Math.max(...trials.map((trial) => trial.pct));
  const last = rows[rows.length - 1];

  return (
    <Paper as="div" kind="sheet" seed="v3-record" className="v3-record">
      <p className="v3-corner" style={inked(t, B.corner, 0.4)}>Team Zij · Harmonization of MODIS and VIIRS Hot Spots</p>
      <Sheet ref={sheet} className="film-seasons v3-seasons" x={34} y={78} w={780} k={CHART_K} style={{ ["--film-lever" as string]: move(t, B.lever, B.leverFor) }}>
        <ResultPaper letter="ه" id="v3-record-chart" title={<>Nile Delta · Seasons · {r.seasonWords}</>}
          extra={<Lever label="Which record" off="As recorded" on="On one scale" checked={!recorded} onChange={noop} />}>
          {recorded
            ? <ul className="key board-key"><li><i className="key-modis" aria-hidden="true" />MODIS, as recorded</li><li><i className="key-viirs" aria-hidden="true" />VIIRS, as recorded</li></ul>
            : <ul className="key board-key"><li><i className="key-viirs" aria-hidden="true" />on one scale, VIIRS terms</li><li><i className="key-whisker" aria-hidden="true" />likely range</li><li><i className="key-dashed" aria-hidden="true" />median {r.b0}–{r.b1}</li></ul>}
          <div className="film-chart">
            <SeriesChart area={area} fromYear={Number(r.from.slice(0, 4))} toYear={Number(r.to.slice(0, 4))} normal={r.normal} recorded={recorded} />
            <p ref={modisMark} className="film-half is-modis" style={inked(t, B.modisLabel)}>
              <b>MODIS</b> {r.modisYears[0]}–{r.modisYears[r.modisYears.length - 1]}
            </p>
            <p ref={viirsMark} className="film-half is-viirs" style={inked(t, B.viirsLabel)}>
              <b>VIIRS</b> {r.viirsYears[0]}–{r.viirsYears[r.viirsYears.length - 1]}
            </p>
            <i ref={divide} className="film-divide" style={t < B.divide ? { visibility: "hidden" } : undefined} aria-hidden="true" />
            <svg className="v3-ring" aria-hidden="true" style={t < B.circle ? { visibility: "hidden" } : undefined}>
              <path ref={ring} pathLength={1} strokeDasharray="1 1" />
            </svg>
            <div ref={sensors} className="v3-sensors">
              <p className="is-modis" style={inked(t, B.modisSensor, B.sensorFor)}>MODIS, 1 km</p>
              <p className="is-viirs" style={inked(t, B.viirsSensor, B.sensorFor)}>VIIRS, 375 m</p>
            </div>
          </div>
        </ResultPaper>
      </Sheet>

      <div className="v3-trials">
        <p className="v3-trials-note" style={inked(t, B.trials, 0.45)}>Error of a season total, tested on years the model never saw</p>
        {rows.map((row) => {
          const tick = move(t, row.at + B.rowInk * 0.6, B.tickFor);
          const value = Math.round(lerp(row.from, row.pct, tick));
          return (
            <div key={row.label} className="v3-trial" style={shown(t, row.at)}>
              <span className="v3-trial-label" style={inked(t, row.at, B.rowInk)}>{row.label}</span>
              <b className="v3-trial-value">{String(value).split("").map((digit, k) => <i key={k}>{digit}</i>)}%</b>
              <i className="v3-trial-bar" style={{ width: `${((100 * lerp(row.from, row.pct, tick)) / most).toFixed(2)}%`, opacity: clamp((t - row.at) / 0.1) }} aria-hidden="true" />
              {row === last && <i className="v3-underline" style={{ width: `${(100 * move(t, B.underline, B.underlineFor)).toFixed(2)}%` }} aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      <p className="v3-area-error" style={inked(t, B.areaError, 0.4)}>Nile Delta error: {areaError}%</p>
    </Paper>
  );
}
