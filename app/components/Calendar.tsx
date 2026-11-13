"use client";

// The calendar: years as rows, months as columns, one heat ramp.
// Every colour is written as an attribute (no CSS variables), so the same <svg>
// can be saved as a file from the Downloads page.

import type { Area } from "@/lib/data";
import { MONTHS, MONTHS_SHORT, num } from "@/lib/format";
import { heatBreaks, heatClass } from "@/lib/heat";
import { COLOURS, FONT_DISPLAY, FONT_TEXT, heatRamp, type Theme } from "@/lib/tokens";

const CELL_W = 40;
const CELL_H = 22;
const LEFT = 64;
const TOP = 30;
const GAP = 2;

export interface CalendarProps {
  area: Area;
  from: string; // YYYY-MM
  to: string;
  theme: Theme;
  selected?: string | null;
  onSelect?: (ym: string) => void;
  title?: boolean;
  id?: string;
}

export default function Calendar({ area, from, to, theme, selected, onSelect, title, id }: CalendarProps) {
  const c = COLOURS[theme];
  const ramp = heatRamp(theme);
  const m = area.months;
  const breaks = heatBreaks(m.value);
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  const years = Array.from({ length: Math.max(lastYear - firstYear + 1, 0) }, (_, i) => firstYear + i);
  const byKey = new Map<string, number>();
  m.year.forEach((y, i) => byKey.set(`${y}-${String(m.month[i]).padStart(2, "0")}`, i));

  const titleH = title ? 44 : 0;
  const gridH = years.length * (CELL_H + GAP);
  const legendY = titleH + TOP + gridH + 18;
  const width = LEFT + 12 * (CELL_W + GAP) + 8;
  const height = legendY + 78;
  const label = { fontFamily: FONT_TEXT, fontSize: 13, fill: c["ink-muted"] };

  return (
    <svg id={id} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width="100%" role="img"
      aria-label={`Calendar of ${area.unit_label} per month for ${area.name}, ${from} to ${to}`}>
      <defs>
        <pattern id="zij-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={c.ground} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={c.rule} strokeWidth="2" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={c.ground} />
      {title && (
        <>
          <text x={LEFT} y={22} fontFamily={FONT_DISPLAY} fontSize={22} fontWeight={600} fill={c.ink}>{area.name}</text>
          <text x={LEFT} y={40} {...label}>{`${area.unit_label} per month. Built ${area.built_at_utc.slice(0, 10)}, data to ${area.last_full_day}.`}</text>
        </>
      )}
      <g transform={`translate(0 ${titleH})`}>
        {MONTHS_SHORT.map((name, k) => (
          <text key={name} x={LEFT + k * (CELL_W + GAP) + CELL_W / 2} y={TOP - 10} textAnchor="middle" {...label}>{name}</text>
        ))}
        {years.map((year, row) => {
          const y = TOP + row * (CELL_H + GAP);
          return (
            <g key={year}>
              <text x={LEFT - 10} y={y + CELL_H - 6} textAnchor="end" {...label} fill={c.ink}>{year}</text>
              {MONTHS.map((monthName, k) => {
                const ym = `${year}-${String(k + 1).padStart(2, "0")}`;
                const i = byKey.get(ym);
                const x = LEFT + k * (CELL_W + GAP);
                const inRange = ym >= from && ym <= to;
                if (i === undefined || !inRange) {
                  return <rect key={ym} x={x} y={y} width={CELL_W} height={CELL_H} fill={inRange ? "url(#zij-hatch)" : c.ground} />;
                }
                const k5 = heatClass(m.value[i], breaks);
                const converted = m.source[i] !== "VIIRS";
                const isSelected = selected === ym;
                const words = `${monthName} ${year}: ${num(m.value[i])} ${area.unit_label}` +
                  (converted ? `, converted from MODIS (${num(m.lo[i])} to ${num(m.hi[i])})` : "") +
                  (m.complete[i] ? "" : ", month not complete") +
                  (m.flag[i] ? `, unusually ${m.flag[i]}` : "");
                return (
                  <g key={ym} onClick={onSelect ? () => onSelect(ym) : undefined} style={onSelect ? { cursor: "pointer" } : undefined}>
                    <title>{words}</title>
                    <rect x={x} y={y} width={CELL_W} height={CELL_H} fill={k5 === 0 ? c["ground-raised"] : ramp[k5 - 1]}
                      opacity={m.complete[i] ? 1 : 0.55} />
                    {converted && <path d={`M${x} ${y}h9l-9 9z`} fill={c.lapis} />}
                    {m.flag[i] && (
                      <rect x={x + 1} y={y + 1} width={CELL_W - 2} height={CELL_H - 2} fill="none" stroke={c.ink} strokeWidth={1.5}
                        strokeDasharray={m.flag[i] === "low" ? "3 2" : undefined} />
                    )}
                    {isSelected && <rect x={x - 1} y={y - 1} width={CELL_W + 2} height={CELL_H + 2} fill="none" stroke={c.brass} strokeWidth={2.5} />}
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>
      <g transform={`translate(${LEFT} ${legendY})`}>
        <rect x={0} y={0} width={26} height={14} fill={c["ground-raised"]} stroke={c.rule} strokeWidth={0.5} />
        <text x={32} y={12} {...label}>0</text>
        {ramp.map((colour, k) => (
          <g key={colour} transform={`translate(${62 + k * 84} 0)`}>
            <rect width={26} height={14} fill={colour} />
            <text x={32} y={12} {...label}>
              {k === 0 ? `under ${num(breaks[0])}` : k === 4 ? `${num(breaks[3])} +` : `${num(breaks[k - 1])} to ${num(breaks[k])}`}
            </text>
          </g>
        ))}
        <g transform="translate(0 26)">
          <rect width={26} height={14} fill={c["ground-raised"]} />
          <path d="M0 0h9l-9 9z" fill={c.lapis} />
          <text x={32} y={12} {...label}>converted from MODIS</text>
          <rect x={196} width={26} height={14} fill="none" stroke={c.ink} strokeWidth={1.5} />
          <text x={228} y={12} {...label}>unusually high</text>
          <rect x={336} width={26} height={14} fill="none" stroke={c.ink} strokeWidth={1.5} strokeDasharray="3 2" />
          <text x={368} y={12} {...label}>unusually low</text>
        </g>
        <g transform="translate(0 52)">
          <rect width={26} height={14} fill="url(#zij-hatch)" />
          <text x={32} y={12} {...label}>no data</text>
          <rect x={196} width={26} height={14} fill={ramp[2]} opacity={0.55} />
          <text x={228} y={12} {...label}>month not complete</text>
        </g>
      </g>
    </svg>
  );
}
