// Two small instruments of level 4. A chart of the years both satellites flew, on a Folio slip:
// VIIRS as a solid rubric line, the translator's MODIS as a dashed ink line, each named in words.
// And the how-close scale, from far off to spot on, its marker an alidade sliding along a rule.

import type { CSSProperties } from "react";

export type Line = { values: number[]; kind: "viirs" | "guess"; label: string };

export function Chart({ years, lines, max, label }: { years: number[]; lines: Line[]; max: number; label: string }) {
  const W = 320, H = 150, pad = { l: 18, r: 18, t: 10, b: 22 };
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, years.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - Math.min(1.08, v / max));
  const path = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <figure className="chart slip" data-theme="folio" aria-label={label} role="img">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <path className="chart-axis" d={`M${pad.l} ${H - pad.b}H${W - pad.r}`} />
        {years.map((yr, i) => (i === 0 || i === years.length - 1 || yr % 2 === 0) && <text key={yr} className="chart-year" x={x(i)} y={H - 6} textAnchor="middle">{yr}</text>)}
        {lines.map((l) => <path key={l.kind} className={`chart-line is-${l.kind}`} d={path(l.values)} />)}
      </svg>
      <figcaption className="chart-key">
        {lines.map((l) => <span key={l.kind} className={`chart-name is-${l.kind}`}><i aria-hidden="true" />{l.label}</span>)}
      </figcaption>
    </figure>
  );
}

/** The how-close scale: a ruled brass line, far off at the left, spot on at the right. */
export function HowClose({ closeness, labels, small = false }: { closeness: number; labels: { far: string; spot: string }; small?: boolean }) {
  return (
    <div className={`howclose${small ? " is-small" : ""}`} data-theme="folio" style={{ "--c": Math.min(1, Math.max(0, closeness)) } as CSSProperties}>
      <span className="howclose-end">{labels.far}</span>
      <span className="howclose-rule" aria-hidden="true">
        <i className="howclose-mark" />
      </span>
      <span className="howclose-end">{labels.spot}</span>
    </div>
  );
}
