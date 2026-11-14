"use client";

// The fire diary: a Folio sheet framed with a jadwal, one bar per autumn. MODIS's own counts are
// lapis, VIIRS's rubric, translated years ink with their doubt band; each kind is also named in words
// by whoever shows it. Bars are plain divs scaled from the floor, so filling the diary (the Copy
// movement) runs on the compositor.

import type { CSSProperties, ReactNode } from "react";
import { PaperBack } from "@/components/Paper";

export type Bar = { year: number; value: number; lo?: number; hi?: number; kind: "modis" | "viirs" | "ink"; mark?: boolean; faint?: boolean };

export default function DiaryBook({ title, bars, max, bands = false, children, className = "", label, copying = false, onPick, pickLabel, canPick = (b) => b.kind === "ink" }: {
  title?: string;
  bars: Bar[];
  max: number;
  bands?: boolean;
  children?: ReactNode;
  className?: string;
  label?: string;
  copying?: boolean;
  /** makes the translated (ink) bars pressable */
  onPick?: (year: number) => void;
  pickLabel?: (year: number) => string;
  /** which bars can be pressed; translated ones unless said otherwise */
  canPick?: (b: Bar) => boolean;
}) {
  return (
    <div className={`book paper is-sheet ${className}`} data-theme="folio" role={label ? "img" : undefined} aria-label={label}>
      <PaperBack kind="sheet" seed="diary-book" />
      <span className="jadwal" aria-hidden="true" />
      {title && <p className="book-title t-eyebrow">{title}</p>}
      <div className={`book-chart${copying ? " is-copying" : ""}`} style={{ "--n": bars.length } as CSSProperties}>
        {bars.map((b, i) => (
          <div
            key={b.year}
            className={`book-col${b.mark ? " is-mark" : ""}${b.faint ? " is-faint" : ""}`}
            style={{ "--v": Math.min(1, b.value / max), "--lo": Math.min(1, (b.lo ?? b.value) / max), "--hi": Math.min(1, (b.hi ?? b.value) / max), "--i": i } as CSSProperties}
            data-year={b.year}
          >
            {bands && b.kind === "ink" && b.lo != null && <i className="book-band" />}
            <i className={`book-bar is-${b.kind}`} />
            {onPick && canPick(b) && <button type="button" className="plain book-pick" onClick={() => onPick(b.year)} aria-label={pickLabel?.(b.year) ?? String(b.year)} />}
            <span className="book-year t-figure">{b.year % 5 === 0 || i === 0 || (i === bars.length - 1 && b.year % 5 >= 3) ? b.year : ""}</span>
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}
