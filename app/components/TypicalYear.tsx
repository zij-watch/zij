"use client";

import { LineChart } from "echarts/charts";
import { GridComponent, MarkAreaComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { Area } from "@/lib/data";
import { MONTHS_SHORT, num } from "@/lib/format";
import { COLOURS, FONT_TEXT, type Theme } from "@/lib/tokens";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkAreaComponent, CanvasRenderer]);

// The ISO week each month starts in, near enough for axis labels.
const MONTH_FIRST_WEEK = [1, 5, 9, 14, 18, 22, 27, 31, 36, 40, 44, 48];

/** Runs of consecutive weeks, as [first, last] pairs. */
function runs(weeks: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const w of weeks) {
    const last = out[out.length - 1];
    if (last && w === last[1] + 1) last[1] = w;
    else out.push([w, w]);
  }
  return out;
}

export default function TypicalYear({ area, theme, year }: { area: Area; theme: Theme; year: number }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!element.current) return;
    const c = COLOURS[theme];
    const chart = echarts.init(element.current);
    const w = area.climatology.weeks;
    const index = w.iso_week.map((k, i) => (k <= 52 ? i : -1)).filter((i) => i >= 0);
    const weeks = index.map((i) => w.iso_week[i]);
    const median = index.map((i) => w.median[i] ?? 0);
    const p10 = index.map((i) => w.p10[i] ?? 0);
    const spread = index.map((i) => Math.max((w.p90[i] ?? 0) - (w.p10[i] ?? 0), 0));
    const thisYear = weeks.map((k) => {
      const i = area.weeks.year.findIndex((y, j) => y === year && area.weeks.iso_week[j] === k);
      return i >= 0 ? area.weeks.value[i] : null;
    });
    const text = { color: c["ink-muted"], fontFamily: FONT_TEXT, fontSize: 14 };
    chart.setOption({
      animation: false,
      grid: { left: 54, right: 14, top: 16, bottom: 34 },
      tooltip: {
        trigger: "axis",
        backgroundColor: c["ground-raised"],
        borderColor: c.rule,
        textStyle: { color: c.ink, fontFamily: FONT_TEXT, fontSize: 15 },
        formatter: (items: { dataIndex: number }[]) => {
          const i = items[0].dataIndex;
          const now = thisYear[i];
          return `Week ${weeks[i]}<br/>Median: ${num(median[i], 1)}<br/>Usual range: ${num(p10[i], 1)} to ${num(p10[i] + spread[i], 1)}` +
            (now === null || now === undefined ? "" : `<br/>${year}: ${num(now, 1)}`);
        },
      },
      xAxis: {
        type: "category",
        data: weeks,
        axisLine: { lineStyle: { color: c.rule } },
        axisTick: { show: false },
        axisLabel: { ...text, interval: 0, formatter: (value: string) => { const k = MONTH_FIRST_WEEK.indexOf(Number(value)); return k >= 0 ? MONTHS_SHORT[k] : ""; } },
      },
      yAxis: { type: "value", axisLabel: text, splitLine: { lineStyle: { color: c.rule, opacity: 0.4 } } },
      series: [
        { type: "line", data: p10, stack: "band", symbol: "none", lineStyle: { opacity: 0 }, silent: true },
        { type: "line", data: spread, stack: "band", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: c.brass, opacity: 0.25 }, silent: true },
        {
          type: "line",
          data: median,
          symbol: "none",
          lineStyle: { color: c.ink, width: 2 },
          markArea: {
            silent: true,
            itemStyle: { color: c.rubric, opacity: 0.16 },
            data: runs(area.climatology.critical_weeks).map(([a, b]) => [{ xAxis: String(a) }, { xAxis: String(b) }]),
          },
        },
        { type: "line", data: thisYear, symbol: "none", connectNulls: false, lineStyle: { color: c.rubric, width: 2 } },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [area, theme, year]);

  return <div ref={element} className="chart" role="img" aria-label={`Typical year for ${area.name}: weekly median with the critical period shaded`} />;
}
