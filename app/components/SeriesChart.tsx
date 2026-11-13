"use client";

// Season totals, one point per year, with the uncertainty band on converted years.

import { CustomChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { Area } from "@/lib/data";
import { num } from "@/lib/format";
import { COLOURS, FONT_TEXT} from "@/lib/tokens";

echarts.use([LineChart, ScatterChart, CustomChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export default function SeriesChart({ area, fromYear, toYear, normal }: { area: Area; fromYear: number; toYear: number; normal: number }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!element.current) return;
    const c = COLOURS;
    const s = area.seasons;
    const rows = s.year.map((year, i) => i).filter((i) => s.year[i] >= fromYear && s.year[i] <= toYear);
    const years = rows.map((i) => String(s.year[i]));
    const text = { color: c["ink-muted"], fontFamily: FONT_TEXT, fontSize: 14 };
    const chart = echarts.init(element.current);
    chart.setOption({
      animation: false,
      grid: { left: 58, right: 14, top: 16, bottom: 30 },
      tooltip: {
        trigger: "axis",
        backgroundColor: c["ground-raised"],
        borderColor: c.rule,
        textStyle: { color: c.ink, fontFamily: FONT_TEXT, fontSize: 15 },
        formatter: (items: { dataIndex: number }[]) => {
          const i = rows[items[0].dataIndex];
          const converted = s.source[i] !== "VIIRS";
          return `${s.year[i]}: ${num(s.value[i])}` +
            (converted && s.lo[i] !== null ? `<br/>converted from MODIS, likely ${num(s.lo[i])} to ${num(s.hi[i])}` : "<br/>measured by VIIRS") +
            `<br/>Raw MODIS ${num(s.modis[i])}, raw VIIRS ${num(s.viirs[i])}`;
        },
      },
      xAxis: { type: "category", data: years, axisLine: { lineStyle: { color: c.rule } }, axisTick: { show: false }, axisLabel: text },
      yAxis: { type: "value", axisLabel: text, splitLine: { lineStyle: { color: c.rule, opacity: 0.4 } } },
      series: [
        {
          // The band: a vertical bar from lo to hi on each converted year.
          type: "custom",
          silent: true,
          data: rows.map((i, k) => [k, s.lo[i], s.hi[i]]),
          renderItem: (_params: unknown, api: { value: (d: number) => number; coord: (p: number[]) => number[] }) => {
            const lo = api.value(1);
            const hi = api.value(2);
            if (!Number.isFinite(lo) || !Number.isFinite(hi) || (lo === 0 && hi === 0 && api.value(0) === undefined)) return null;
            const top = api.coord([api.value(0), hi]);
            const bottom = api.coord([api.value(0), lo]);
            return {
              type: "group",
              children: [
                { type: "rect", shape: { x: top[0] - 7, y: top[1], width: 14, height: Math.max(bottom[1] - top[1], 1) }, style: { fill: c.lapis, opacity: 0.45 } },
              ],
            };
          },
        },
        {
          type: "line",
          data: rows.map((i) => s.value[i]),
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { color: c.rubric, width: 2 },
          itemStyle: { color: c.rubric },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: c.ink, type: "dashed", width: 1 },
            label: { formatter: "median", color: c["ink-muted"], fontFamily: FONT_TEXT, fontSize: 13 },
            data: Number.isFinite(normal) ? [{ yAxis: normal }] : [],
          },
        },
        { type: "line", data: rows.map((i) => s.modis[i]), symbol: "none", lineStyle: { color: c.lapis, width: 1.5, type: "dotted" } },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [area, fromYear, toYear, normal]);

  return <div ref={element} className="chart" role="img" aria-label={`Season totals per year for ${area.name}, with the band on converted years`} />;
}
