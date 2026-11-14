"use client";

// The menu of the chosen area: a slip of paper above it on the map (below it when there is no room),
// following it as the map moves. Everything here is about that area: when to look (the quick
// choices, a day, a range of months, the timeline), which marks to show, saving it, clearing it.
// On a phone it lies along the bottom of the map instead.

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { boundsOf, type Shape } from "@/lib/fit/cells";
import { nextName, type SavedArea } from "@/lib/presets";
import Icon from "./icons";
import Paper from "./Paper";
import { Check, DayField, Pop, RangeField, Tip } from "./ui";

export interface Insets { top: number; left: number; right: number; bottom: number }

interface Props {
  map: MapLibreMap | null;
  shape: Shape; // the chosen area's outline: a preset's box or the drawn shape
  insets: Insets; // the map left free by the strip, the tools and Results, in pixels from each edge of the window
  docked: boolean; // a phone: along the bottom, not over the area
  chips: { label: string; on: boolean; go: () => void; off?: string }[];
  day: string | null;
  lastDay: string;
  onDay: (day: string | null) => void;
  from: string;
  to: string;
  rangeMin: string;
  onRange: (from: string, to: string) => void;
  timeline: boolean;
  onTimeline: () => void;
  layers: { viirs: boolean; modis: boolean; outlines: boolean; counts: { viirs: number; modis: number } | null; onLayer: (layer: "viirs" | "modis" | "outlines", on: boolean) => void };
  save: null | { saved: SavedArea | null; onSave: (name: string) => void; onForget: (id: string) => void };
  clearLabel: string;
  onClear: () => void;
}

function SaveForm({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState(nextName);
  return (
    <form className="save-form" onSubmit={(event) => { event.preventDefault(); onSave(name); }}>
      <label className="ruled">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button type="submit" className="catchword">Save to Draw · Your areas</button>
    </form>
  );
}

export default function AreaMenu({ map, shape, insets, docked, chips, day, lastDay, onDay, from, to, rangeMin, onRange, timeline, onTimeline, layers, save, clearLabel, onClear }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const shapeKey = JSON.stringify(shape);
  const { top, left, right, bottom } = insets;

  // Placed by hand on every frame the map moves: no React render on the way.
  useEffect(() => {
    const element = holder.current;
    if (!map || !element || docked) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const [w, s, e, n] = boundsOf(JSON.parse(shapeKey) as Shape);
      const box = map.getContainer().getBoundingClientRect();
      const corners = [[w, s], [e, s], [e, n], [w, n]].map((p) => map.project(p as [number, number]));
      const xs = corners.map((p) => p.x + box.left), ys = corners.map((p) => p.y + box.top);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const free = { left: left + 8, right: window.innerWidth - right - 8, top: top + 8, bottom: window.innerHeight - bottom - 8 };
      const away = x1 < free.left || x0 > free.right || y1 < free.top || y0 > free.bottom;
      const mw = element.offsetWidth, mh = element.offsetHeight;
      const centre = (Math.max(x0, free.left) + Math.min(x1, free.right)) / 2;
      const x = Math.round(Math.min(Math.max(centre - mw / 2, free.left), Math.max(free.left, free.right - mw)));
      let y = y0 - mh - 16;
      let side = "above";
      if (y < free.top) {
        y = y1 + 16;
        side = "below";
        // No room above or below: inside the area, at its top.
        if (y + mh > free.bottom) { y = Math.max(free.top, y0 + 12); side = "inside"; }
      }
      element.style.transform = `translate(${x}px, ${Math.round(y)}px)`;
      element.style.setProperty("--notch", `${Math.round(Math.min(Math.max(centre - x, 18), mw - 18))}px`);
      element.dataset.side = side;
      element.classList.toggle("is-away", away);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    map.on("move", schedule);
    map.on("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    schedule();
    return () => {
      map.off("move", schedule);
      map.off("resize", schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [map, shapeKey, docked, top, left, right, bottom]);

  const count = (n: number | undefined) => (layers.counts ? (n ?? 0).toLocaleString("en") : "–");

  return (
    <div ref={holder} className={`area-menu${docked ? " is-docked" : ""}`} role="toolbar" aria-label="The chosen area">
      <Paper as="div" kind="slip" seed="area-menu" className="area-menu-sheet">
        <div className="area-menu-row chips" role="group" aria-label="When">
          {chips.map((chip) => (
            <button key={chip.label} type="button" data-chip={chip.label} className={`chip${chip.on ? " is-active" : ""}`} aria-pressed={chip.on} disabled={Boolean(chip.off)} title={chip.off} onClick={chip.go}>{chip.label}</button>
          ))}
        </div>
        <div className="area-menu-row">
          <div className="area-menu-dates">
            <DayField label="Day" value={day} min="2000-11-01" max={lastDay} onChange={onDay} />
            <RangeField label="From and to" from={from} to={to} min={rangeMin} max={lastDay} onChange={onRange} />
          </div>
          <span className="area-menu-rule" aria-hidden="true" />
          <Tip label={timeline ? "Close the timeline" : "Timeline: step through the days"}>
            <button type="button" className={`tool${timeline ? " is-active" : ""}`} aria-pressed={timeline} aria-label="Timeline" onClick={onTimeline}><Icon name="timeline" /></button>
          </Tip>
          <Pop open={layersOpen} onOpenChange={setLayersOpen} label="Marks on the map" side="bottom" align="end"
            trigger={<button type="button" className={`tool${layersOpen ? " is-active" : ""}`} aria-label="Marks on the map: hotspots and outlines"><Icon name="layers" /></button>}>
            <p className="plate-mark">Marks on the map</p>
            <Check label="VIIRS hotspots" checked={layers.viirs} onChange={(on) => layers.onLayer("viirs", on)}>
              <span className="mark-viirs" /> VIIRS <b>{count(layers.counts?.viirs)}</b>
            </Check>
            <Check label="MODIS hotspots" checked={layers.modis} onChange={(on) => layers.onLayer("modis", on)}>
              <span className="mark-modis" /> MODIS <b>{count(layers.counts?.modis)}</b>
            </Check>
            <Check label="Area outlines and names" checked={layers.outlines} onChange={(on) => layers.onLayer("outlines", on)}>Area outlines and names</Check>
            {!layers.counts && <p className="marginal">Hotspots show for a day, 7 days or the timeline.</p>}
          </Pop>
          {save && (
            <Pop open={saveOpen} onOpenChange={setSaveOpen} label="Save this area" side="bottom" align="end"
              trigger={<button type="button" className={`tool${save.saved ? " is-saved" : ""}`} aria-label={save.saved ? `Saved as ${save.saved.name}` : "Save this area"}><Icon name={save.saved ? "saved" : "save"} /></button>}>
              {save.saved ? (
                <div className="save-form">
                  <p className="plate-mark">Saved as</p>
                  <p className="save-name">{save.saved.name}</p>
                  <button type="button" className="catchword" onClick={() => { save.onForget(save.saved!.id); setSaveOpen(false); }}>Forget it</button>
                </div>
              ) : (
                <SaveForm onSave={(name) => { save.onSave(name); setSaveOpen(false); }} />
              )}
            </Pop>
          )}
          <Tip label={clearLabel}>
            <button type="button" className="tool" aria-label={clearLabel} onClick={onClear}><Icon name="close" /></button>
          </Tip>
        </div>
      </Paper>
      <span className="area-menu-notch" aria-hidden="true" />
    </div>
  );
}
