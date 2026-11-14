"use client";

// Scenes 1 and 2: the Nile Delta's seasons as recorded, then on one scale, then the calendar.
// The chart, the lever, the key and the calendar are the app's own (SeriesChart, Lever, Calendar,
// ResultPaper), fed the exported area file. The film only decides, for each frame, how much of
// the chart's own two states is on the page: the chart is found by its element and its bars are
// set for the frame, with its animation off.

import * as echarts from "echarts/core";
import { useRef } from "react";
import type { Area } from "@/lib/data";
import { MONTHS_SHORT, monthSpan } from "@/lib/format";
import { arrive, clamp, lerp, move, RULE_FOR, SCENES, SLIDE, T } from "@/lib/film/timeline";
import { COLOURS } from "@/lib/tokens";
import Calendar from "../Calendar";
import { ResultPaper } from "../Panel";
import SeriesChart from "../SeriesChart";
import { Lever, UnitTerm } from "../ui";
import { inked, ruledOut, Sheet, shown, useDriver, useReady, useT } from "./kit";

const noop = () => {};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mixHex = (a: string, b: string, k: number) => {
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
const axisTop = (chart: echarts.ECharts) =>
  (chart as unknown as { getModel: () => { getComponent: (type: string, index: number) => AxisModel } }).getModel().getComponent("yAxis", 0).axis.scale.getExtent()[1];

export default function Record({ area }: { area: Area }) {
  const t = useT();
  const seasons = useRef<HTMLDivElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const modisMark = useRef<HTMLParagraphElement>(null);
  const viirsMark = useRef<HTMLParagraphElement>(null);
  const divide = useRef<HTMLElement>(null);
  const tops = useRef<{ recorded?: number; one?: number }>({});

  const s = area.seasons;
  const [b0, b1] = area.climatology.baseline_years;
  const normal = median(s.value.filter((_, i) => s.year[i] >= b0 && s.year[i] <= b1));
  const [from, to] = monthSpan(area);
  const rows = s.year.map((_, i) => i);
  const converted = (i: number) => s.source[i] !== "VIIRS";
  const raw = (i: number) => (converted(i) ? s.modis[i] : s.viirs[i]) ?? 0;
  const nModis = rows.filter(converted).length;
  const modisYears = rows.filter(converted).map((i) => s.year[i]);
  const viirsYears = rows.filter((i) => !converted(i)).map((i) => s.year[i]);
  const season = area.fit.season;
  const seasonWords = season.length ? `${MONTHS_SHORT[season[0] - 1]}–${MONTHS_SHORT[season[season.length - 1] - 1]}` : "";

  const recorded = t < T.flip;
  const two = t >= SCENES[1].from; // the second layout: the seasons to the left, room for the calendar
  const calendarIn = move(t, T.calendarIn, SLIDE);

  const chartOf = (): echarts.ECharts | undefined => {
    const element = seasons.current?.querySelector<HTMLElement>(".chart");
    return element ? echarts.getInstanceByDom(element) : undefined;
  };
  useReady("record", true);

  useDriver((time) => {
    const chart = chartOf();
    if (!chart || time >= T.proofRule + RULE_FOR) return;
    const c = COLOURS;
    const state = time < T.flip ? "recorded" : "one";
    const whole = {
      bars: rows.map((i) => ({ value: state === "recorded" ? raw(i) : s.value[i], itemStyle: { color: state === "recorded" && converted(i) ? c.lapis : c.rubric } })),
      band: state === "recorded" ? [] : rows.map((i, k) => [k, s.lo[i], s.hi[i]]),
    };
    // The axis is the chart's own for the state it is in: measured once with the whole record
    // drawn, then held, so bars that are still growing do not move it.
    if (tops.current[state] === undefined) {
      chart.setOption({ animation: false, yAxis: { max: null }, series: [{ id: "bars", data: whole.bars }, { id: "band", data: whole.band }] });
      tops.current[state] = axisTop(chart);
    }
    const max = tops.current[state];
    if (state === "recorded") {
      // The MODIS years are inked in one after another; from the first VIIRS year the bars leap.
      const grown = (k: number) => (k < nModis
        ? move(time, T.modisBars + k * T.modisEvery, T.modisFor)
        : arrive(time, T.viirsBars + (k - nModis) * T.viirsEvery));
      chart.setOption({
        animation: false,
        yAxis: { max },
        series: [{ id: "bars", data: whole.bars.map((bar, k) => ({ ...bar, value: bar.value * grown(k) })) }, { id: "band", data: [] }],
      });
    } else {
      const k1 = move(time, T.flip, T.settle), k2 = move(time, T.whiskers, 0.5), k3 = move(time, T.median, 0.3);
      chart.setOption({
        animation: false,
        yAxis: { max },
        series: [
          {
            id: "bars",
            data: rows.map((i) => ({ value: lerp(raw(i), s.value[i], k1), itemStyle: { color: converted(i) ? mixHex(c.lapis, c.rubric, k1) : c.rubric } })),
            markLine: { lineStyle: { opacity: k3 }, label: { opacity: k3 } },
          },
          { id: "band", data: rows.map((i, k) => (s.lo[i] === null || s.hi[i] === null ? [k, null, null] : [k, lerp(s.value[i], s.lo[i] as number, k2), lerp(s.value[i], s.hi[i] as number, k2)])) },
        ],
      });
    }
    chart.getZr().flush();

    // The labels over the two halves, and the line between them, sit where the chart put its bars.
    const x = (k: number) => chart.convertToPixel({ seriesId: "bars" }, [k, 0])[0];
    const step = x(1) - x(0), top = chart.convertToPixel({ seriesId: "bars" }, [0, max ?? 0])[1], foot = chart.convertToPixel({ seriesId: "bars" }, [0, 0])[1];
    const place = (element: HTMLElement | null, first: number, last: number) => {
      if (!element) return;
      element.style.left = `${x(first) - step * 0.41}px`;
      element.style.width = `${x(last) - x(first) + step * 0.82}px`;
    };
    place(modisMark.current, 0, nModis - 1);
    place(viirsMark.current, nModis, rows.length - 1);
    if (divide.current) {
      divide.current.style.left = `${(x(nModis - 1) + x(nModis)) / 2}px`;
      divide.current.style.top = `${top + 34}px`;
      divide.current.style.height = `${(foot - top) * move(time, T.divide, 0.3)}px`;
    }

    // The calendar's rows are stamped in, oldest first.
    const rowsOf = calendar.current?.querySelectorAll<SVGGElement>("svg > g:nth-of-type(1) > g");
    rowsOf?.forEach((row, k) => {
      const at = T.rows + k * T.rowEvery;
      const landed = arrive(time, at, T.rowFor);
      row.style.transformBox = "fill-box";
      row.style.transformOrigin = "50% 50%";
      row.style.opacity = String(clamp((time - at) / 0.07));
      row.style.transform = `scale(${(1 + 0.14 * (1 - landed)).toFixed(4)})`;
    });
  });

  const marksOff = t >= T.lever; // the halves' names go when the lever is touched
  return (
    <div className="film-group" style={{ ...shown(t, 0, T.proofRule + RULE_FOR), ...ruledOut(t, T.proofRule) }}>
      <Sheet ref={seasons} className="film-seasons" style={{ ["--film-lever" as string]: move(t, T.lever, T.leverFor) }}
        {...(two ? { x: 134, y: 110, w: 780, k: 1.42 } : { x: 336, y: 100, w: 780, k: 1.6 })}>
        <ResultPaper letter="ه" id="film-seasons" title={<>{area.name} · Seasons · {seasonWords}</>}
          extra={<Lever label="Which record" off="As recorded" on="On one scale" checked={!recorded} onChange={noop} />}>
          <div className="film-chart">
            <SeriesChart area={area} fromYear={Number(from.slice(0, 4))} toYear={Number(to.slice(0, 4))} normal={normal} recorded={recorded} />
            <p ref={modisMark} className="film-half is-modis" style={marksOff ? { visibility: "hidden" } : inked(t, T.modisLabel)}>
              <b>MODIS</b> {modisYears[0]}–{modisYears[modisYears.length - 1]}
            </p>
            <p ref={viirsMark} className="film-half is-viirs" style={marksOff ? { visibility: "hidden" } : inked(t, T.viirsLabel)}>
              <b>VIIRS</b> {viirsYears[0]}–{viirsYears[viirsYears.length - 1]}
            </p>
            <i ref={divide} className="film-divide" style={marksOff || t < T.divide ? { visibility: "hidden" } : undefined} aria-hidden="true" />
          </div>
          {recorded
            ? <ul className="key"><li><i className="key-modis" aria-hidden="true" />MODIS, as recorded</li><li><i className="key-viirs" aria-hidden="true" />VIIRS, as recorded</li></ul>
            : <ul className="key"><li><i className="key-viirs" aria-hidden="true" />on one scale, VIIRS terms</li><li><i className="key-whisker" aria-hidden="true" />likely range, converted year</li><li><i className="key-dashed" aria-hidden="true" />median season {b0}–{b1}</li></ul>}
        </ResultPaper>
      </Sheet>

      <Sheet ref={calendar} className="film-calendar" x={1286} y={54} w={500} dx={(1 - calendarIn) * 760} style={shown(t, T.calendarIn)}>
        <ResultPaper letter="ج" id="film-calendar" title={<>Calendar · <UnitTerm /> per month</>}>
          <div className="calendar-scroll">
            <Calendar area={area} from={from} to={to} labelSize={17} />
          </div>
        </ResultPaper>
      </Sheet>
    </div>
  );
}
