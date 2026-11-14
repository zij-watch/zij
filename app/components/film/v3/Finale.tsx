"use client";

// L6 of the third film (lib/film/v3.ts): what the split record hid. The Nile Delta's harmonized
// seasons, 2001 to 2026, drawn as one line with its margin; on "split record hid" the two raw
// halves flash once behind it; an arrow up from 2004 for the rise after the ban; a stamp for the
// fall since 2018 (both from findings.json). Then the Seal, zij.watch and the credit line land
// under the last word and hold to the end.

import { useRef } from "react";
import type { Area } from "@/lib/data";
import { arrive, clamp, move } from "@/lib/film/timeline";
import type { Beats } from "@/lib/film/v3";
import Paper from "../../Paper";
import { inked, useDriver, useT } from "../kit";

export interface Findings { ban: number; banYear: number; since: number; sinceYear: number }

const F = 712;
const Y = (v: number) => F - v * 0.2;
const X0 = 120, X1 = 1220;

export function Finale({ area, b, findings, seal }: { area: Area; b: Beats; findings: Findings; seal: string | null }) {
  const t = useT();
  const holder = useRef<HTMLDivElement>(null);
  const s = area.seasons;
  const n = s.year.length, step = (X1 - X0) / n;
  const X = (k: number) => X0 + step * (k + 0.5);
  const at = (year: number) => s.year.indexOf(year);

  // The Seal lands whole, as the landing page leaves it once written.
  useDriver(() => {
    const svg = holder.current?.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll<SVGPathElement>(".seal-stroke").forEach((path) => {
      path.style.strokeDasharray = "1";
      path.style.strokeDashoffset = "0";
    });
    svg.querySelectorAll<SVGPathElement>(".seal-dot").forEach((path) => (path.style.opacity = "1"));
    svg.querySelectorAll<SVGPathElement>(".seal-wet-stroke").forEach((path) => (path.style.opacity = "0"));
  });

  const line = s.value.map((v, k) => `${k ? "L" : "M"}${X(k).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const conv = s.year.map((_, k) => k).filter((k) => s.source[k] !== "VIIRS");
  const band = `M${conv.map((k) => `${X(k).toFixed(1)} ${Y(s.hi[k] as number).toFixed(1)}`).join(" L")} L${[...conv].reverse().map((k) => `${X(k).toFixed(1)} ${Y(s.lo[k] as number).toFixed(1)}`).join(" L")} Z`;
  const drawn = move(t, b.line[0], b.line[1] - b.line[0]);
  const flash = t < b.flash ? 0 : t < b.flash + 0.2 ? (t - b.flash) / 0.2 : Math.max(0, 1 - (t - b.flash - 0.2) / 0.55);
  const ban = at(findings.banYear), since = at(findings.sinceYear);
  const arrow = move(t, b.ban, 0.4);
  const stamp = arrive(t, b.stamp, 0.35);
  const land = arrive(t, b.seal, 0.4);
  const banTop = 248, banFoot = Y(s.value[ban]) - 18;
  const sinceMid = (X(since) + X(n - 1)) / 2;
  const pct = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v)}%`;

  return (
    <Paper as="div" kind="sheet" seed="v3-finale" className="v3-finale">
      <p className="v3-finale-head" style={inked(t, b.line[0] - 0.1, 0.4)}>Nile Delta · August to October · one record, {s.year[0]} to {s.year[n - 1]}</p>
      <svg className="v3-finale-svg" width={1800} height={1000} viewBox="0 0 1800 1000" aria-hidden="true">
        {[1000, 2000].map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={Y(v)} y2={Y(v)} className="v3-grid" />
            <text x={X0 - 10} y={Y(v) + 7} className="v3-small" textAnchor="end">{v.toLocaleString("en-US")}</text>
          </g>
        ))}
        <line x1={X0} x2={X1} y1={F} y2={F} className="v3-axis" />
        {s.year.filter((y) => y % 5 === 1).map((y) => <text key={y} x={X(at(y))} y={F + 32} className="v3-small" textAnchor="middle">{y}</text>)}

        {/* The split record, as each satellite recorded it: shown once, behind the line. */}
        <g opacity={0.75 * flash}>
          {s.year.map((year, k) => {
            const viirs = s.source[k] === "VIIRS";
            const v = (viirs ? s.viirs[k] : s.modis[k]) as number;
            return <rect key={year} x={X(k) - 13} y={Y(v)} width={26} height={F - Y(v)} className={viirs ? "v3-viirs" : "v3-in"} />;
          })}
        </g>

        {/* One record: the harmonized seasons, with the margin of each converted one. */}
        <g style={{ clipPath: `inset(-20px ${(100 * (1 - drawn)).toFixed(2)}% -20px 0)` }}>
          <path d={band} className="v3-band" opacity={0.5} />
          <path d={line} className="v3-line" />
          {s.value.map((v, k) => <circle key={k} cx={X(k)} cy={Y(v)} r={5} className="v3-dot" />)}
        </g>

        {/* After the ban: an arrow up from 2004. */}
        <g opacity={arrow > 0 ? 1 : 0}>
          <line x1={X(ban)} x2={X(ban)} y1={F} y2={banFoot + 10} className="v3-ban" />
          <line x1={X(ban)} x2={X(ban)} y1={banFoot} y2={banFoot - (banFoot - banTop) * arrow} className="v3-arrow" />
          {arrow >= 1 && <path d={`M${X(ban) - 11} ${banTop + 16} L${X(ban)} ${banTop} L${X(ban) + 11} ${banTop + 16}`} className="v3-arrow" />}
        </g>
      </svg>
      <p className="v3-ban-label" style={{ left: X(ban) + 18, top: banTop - 30, ...inked(t, b.ban + 0.3, 0.35) }}>
        after the {findings.banYear} ban: <b>{pct(findings.ban)}</b>
      </p>
      <p className="v3-stamp" style={{ left: sinceMid, top: Y(Math.max(...s.value.slice(since))) - 150, visibility: t < b.stamp ? "hidden" : undefined, opacity: Math.min(1, stamp * 4), transform: `translateX(-50%) rotate(-7deg) scale(${(1 + 0.35 * (1 - stamp)).toFixed(4)})` }}>
        since {findings.sinceYear}: {pct(findings.since)}
      </p>

      {seal !== null && <div className="v3-sealblock" style={{ visibility: t < b.seal ? "hidden" : undefined, opacity: clamp(land * 4), transform: `scale(${(1 + 0.12 * (1 - land)).toFixed(4)})` }}>
        <div ref={holder} className="film-seal v3-seal" dangerouslySetInnerHTML={{ __html: seal }} />
        <p className="v3-site">zij.watch</p>
        <p className="v3-credit">Data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth</p>
        <p className="v3-credit is-made">Animated from real data with AI-assisted code</p>
      </div>}
    </Paper>
  );
}
