"use client";

// Go to coordinates: a point (latitude and longitude, or where you are), or a box by its four
// sides. The last point chosen is filled in next time; it is kept in this browser only, and where
// you are is read by the browser and never leaves it.

import { useState } from "react";
import type { Shape } from "@/lib/fit/cells";
import { recall, remember } from "@/lib/remember";
import { Modal } from "./ui";

const LAST = "zij.goto.last";
const parse = (v: string) => Number(v.trim().replace(",", "."));
const tidy = (v: number) => String(+v.toFixed(4));

function PointForm({ onGo }: { onGo: (lat: number, lon: number) => void }) {
  const last = recall<[number, number] | null>(LAST, null);
  const [lat, setLat] = useState(last ? tidy(last[0]) : "");
  const [lon, setLon] = useState(last ? tidy(last[1]) : "");
  const [problem, setProblem] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const go = (a: number, o: number) => {
    remember(LAST, [a, o]);
    onGo(a, o);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const [a, o] = [parse(lat), parse(lon)];
    if (lat.trim() === "" || lon.trim() === "" || !Number.isFinite(a) || !Number.isFinite(o)) return setProblem("Two numbers, in decimal degrees.");
    if (a < -85 || a > 85 || o < -180 || o > 180) return setProblem("Latitude runs from −85 to 85 here, longitude from −180 to 180.");
    setProblem(null);
    go(a, o);
  };
  const here = () => {
    if (!("geolocation" in navigator)) return setProblem("This browser cannot tell where you are.");
    setFinding(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFinding(false);
        const a = Math.max(-85, Math.min(85, position.coords.latitude)), o = position.coords.longitude;
        setLat(tidy(a));
        setLon(tidy(o));
        go(a, o);
      },
      (error) => {
        setFinding(false);
        setProblem(error.code === error.PERMISSION_DENIED ? "The browser was not allowed to say where you are." : "Where you are could not be found.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };
  return (
    <form className="goto-form" onSubmit={submit}>
      <div className="goto-fields">
        <label className="ruled"><span>Latitude</span><input inputMode="decimal" value={lat} placeholder="30.8" onChange={(e) => setLat(e.target.value)} autoFocus /></label>
        <label className="ruled"><span>Longitude</span><input inputMode="decimal" value={lon} placeholder="31.0" onChange={(e) => setLon(e.target.value)} /></label>
      </div>
      {problem && <p className="erratum" role="alert">{problem}</p>}
      <div className="goto-acts">
        <button type="button" className="catchword" onClick={here} disabled={finding}>{finding ? "Finding you…" : "Use my location"}</button>
        <button type="submit" className="stamp">Go</button>
      </div>
      <p className="marginal">South and west are negative.</p>
    </form>
  );
}

function BoxForm({ shape, onBox }: { shape: Shape | null; onBox: (box: Shape) => void }) {
  const start = Array.isArray(shape) ? shape : null;
  const [south, setSouth] = useState(start ? String(start[1]) : "");
  const [west, setWest] = useState(start ? String(start[0]) : "");
  const [north, setNorth] = useState(start ? String(start[3]) : "");
  const [east, setEast] = useState(start ? String(start[2]) : "");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const [s, w, n, e] = [south, west, north, east].map(parse);
    if (![s, w, n, e].every(Number.isFinite) || [south, west, north, east].some((v) => v.trim() === "")) return setProblem("Four numbers, in decimal degrees.");
    if (s < -90 || n > 90 || w < -180 || e > 180) return setProblem("Latitude runs from −90 to 90, longitude from −180 to 180.");
    if (!(s < n) || !(w < e)) return setProblem("South must be below north, and west left of east.");
    setProblem(null);
    onBox([w, s, e, n]);
  };
  const field = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <label className="ruled"><span>{label}</span><input inputMode="decimal" value={value} placeholder={hint} onChange={(e) => set(e.target.value)} /></label>
  );
  return (
    <form className="goto-form" onSubmit={submit}>
      <div className="goto-fields is-box">
        {field("North", north, setNorth, "31.6")}
        {field("West", west, setWest, "29.8")}
        {field("East", east, setEast, "32.3")}
        {field("South", south, setSouth, "30.0")}
      </div>
      {problem && <p className="erratum" role="alert">{problem}</p>}
      <div className="goto-acts"><span /><button type="submit" className="stamp">Show the box</button></div>
      <p className="marginal">South and west are negative.</p>
    </form>
  );
}

export default function GoToDialog({ open, onOpenChange, shape, onGo, onBox }: {
  open: boolean; onOpenChange: (open: boolean) => void; shape: Shape | null; onGo: (lat: number, lon: number) => void; onBox: (box: Shape) => void;
}) {
  const [tab, setTab] = useState<"point" | "box">("point");
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Go to coordinates">
      <div className="bookmarks" role="tablist" aria-label="Go to">
        <button type="button" role="tab" className="bookmark" aria-selected={tab === "point"} onClick={() => setTab("point")}>A point</button>
        <button type="button" role="tab" className="bookmark" aria-selected={tab === "box"} onClick={() => setTab("box")}>A box</button>
      </div>
      <div role="tabpanel" className="goto-panel">
        {tab === "point" ? <PointForm onGo={onGo} /> : <BoxForm shape={shape} onBox={onBox} />}
      </div>
    </Modal>
  );
}
