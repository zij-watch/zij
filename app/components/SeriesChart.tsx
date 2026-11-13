"use client";

// Season totals, one bar per year, in two states, as on the landing page:
//   recorded     what each instrument counted: MODIS until VIIRS begins, then VIIRS. The jump shows.
//   harmonized   every year on one scale, with the likely range of each year converted from MODIS.
// The chart is kept between the two states, so the bars move from one to the other.

import { BarChart, CustomChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { Area } from "@/lib/data";
import { num } from "@/lib/format";
import { COLOURS, FONT_TEXT } from "@/lib/tokens";

echarts.use([BarChart, CustomChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface Props { area: Area; fromYear: number; toYear: number; normal: number; recorded?: boolean }

export default function SeriesChart({ area, fromYear, toYear, normal, recorded = false }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // One chart for the life of the component.
  useEffect(() => {
    if (!element.current) return;
    const chart = echarts.init(element.current);
    chartRef.current = chart;
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = COLOURS;
    const s = area.seasons;
    const rows = s.year.map((_, i) => i).filter((i) => s.year[i] >= fromYear && s.year[i] <= toYear);
    const text = { color: c["ink-muted"], fontFamily: FONT_TEXT, fontSize: 14 };
    const converted = (i: number) => s.source[i] !== "VIIRS";
    const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chart.setOption({
      animation: !still,
      animationDuration: 0,
      animationDurationUpdate: 800,
      animationEasingUpdate: "cubicOut",
      grid: { left: 58, right: 14, top: 16, bottom: 30 },
      tooltip: {
        trigger: "axis",
        backgroundColor: c["ground-raised"],
        borderColor: c.rule,
        textStyle: { color: c.ink, fontFamily: FONT_TEXT, fontSize: 15 },
        formatter: (items: { dataIndex: number }[]) => {
          const i = rows[items[0].dataIndex];
          return `${s.year[i]}<br/>As recorded: MODIS ${num(s.modis[i])}${s.viirs[i] !== null ? `, VIIRS ${num(s.viirs[i])}` : ""}` +
            `<br/>On one scale: ${num(s.value[i])}` +
            (converted(i) && s.lo[i] !== null ? `, likely ${num(s.lo[i])} to ${num(s.hi[i])} (converted from MODIS)` : " (measured by VIIRS)");
        },
      },
      xAxis: { type: "category", data: rows.map((i) => String(s.year[i])), axisLine: { lineStyle: { color: c.rule } }, axisTick: { show: false }, axisLabel: text },
      yAxis: { type: "value", axisLabel: text, splitLine: { lineStyle: { color: c.rule, opacity: 0.4 } } },
      series: [
        {
          id: "bars",
          type: "bar",
          barCategoryGap: "18%",
          data: rows.map((i) => ({
            value: recorded ? (converted(i) ? s.modis[i] : s.viirs[i]) : s.value[i],
            itemStyle: { color: recorded && converted(i) ? c.lapis : c.rubric },
          })),
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: c.ink, type: "dashed", width: 1 },
            label: { formatter: "median", position: "insideEndTop", color: c["ink-muted"], fontFamily: FONT_TEXT, fontSize: 13 },
            data: !recorded && Number.isFinite(normal) ? [{ yAxis: normal }] : [],
          },
        },
        {
          // The likely range of a converted year: an ink whisker from lo to hi. Harmonized state only.
          id: "band",
          type: "custom",
          silent: true,
          z: 3,
          data: recorded ? [] : rows.map((i, k) => [k, s.lo[i], s.hi[i]]),
          renderItem: (_params: unknown, api: { value: (d: number) => number; coord: (p: number[]) => number[] }) => {
            const lo = api.value(1), hi = api.value(2);
            if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
            const top = api.coord([api.value(0), hi]), bottom = api.coord([api.value(0), lo]);
            const line = (x1: number, y1: number, x2: number, y2: number) => ({ type: "line", shape: { x1, y1, x2, y2 }, style: { stroke: c.ink, lineWidth: 1.5 } });
            return { type: "group", children: [line(top[0], top[1], top[0], bottom[1]), line(top[0] - 4, top[1], top[0] + 4, top[1]), line(top[0] - 4, bottom[1], top[0] + 4, bottom[1])] };
          },
        },
      ],
    }, { replaceMerge: ["series"] });
  }, [area, fromYear, toYear, normal, recorded]);

  return (
    <div ref={element} className="chart" role="img"
      aria-label={recorded
        ? `Season totals per year for ${area.name} as each instrument recorded them: MODIS, then VIIRS`
        : `Season totals per year for ${area.name} on one scale, with the likely range of converted years`} />
  );
}
