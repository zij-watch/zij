"use client";

// Explore: the map is the page, and the tools float on it.
//   top strip     the Seal, a live readout (pointer position, area, date), links
//   left          zoom in, zoom out, go to coordinates
//   right         one paper panel: Time, Area, Layers, Results; it closes, reopens and widens
//   bottom        the dock (Draw, Location, Layers, Timeline, Capture, Share, Help) and the timeline
// Everything on screen is in the address, so a link reproduces it.

import dynamic from "next/dynamic";
import Link from "next/link";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { captureMap, saveBlob } from "@/lib/capture";
import { loadArea, loadIndex, loadNotes, type Area, type Index } from "@/lib/data";
import { loadDay, loadHotspotDays, shapeOf, type DayResult } from "@/lib/dayData";
import { loadingWords, useLoading } from "@/lib/download";
import { COVERED, loadCellsIndex, resolveDrawn, type DrawnResult } from "@/lib/drawnArea";
import type { AreaFacts } from "@/lib/facts";
import type { Shape } from "@/lib/fit/cells";
import { monthSpan } from "@/lib/format";
import type { DayHotspot } from "@/lib/hotspots/day";
import { BASEMAPS } from "@/lib/map/style";
import { useAppState } from "@/lib/url";
import DayPanel from "./DayPanel";
import type { DrawMode } from "./MapView";
import Panel from "./Panel";
import { AreaLinks, FactsBlock, INTRO, Seal, VerdictLine } from "./Shell";
import { areaVerdict, dayVerdicts } from "@/lib/verdict";
import Timeline, { daysBetween, shortDate } from "./Timeline";
import { Check, DayField, Modal, Pop, RangeField, Select, Tip, TooltipProvider } from "./ui";

// MapLibre is the heaviest script on the page. It is loaded on its own, after the panel has its text.
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="map map-waiting">Loading the map…</div> });

const NO_HOTSPOTS: DayHotspot[] = [];
const VIEW_WORDS = { calendar: "Calendar", typical: "Typical year", series: "Seasons", ranked: "Busiest", anomalies: "Anomalies" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthWords = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

/** Last day of a YYYY-MM month, not after `cap`. */
function lastDayOf(ym: string, cap: string): string {
  const [y, m] = ym.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return day > cap ? cap : day;
}

/** The latest fire season on or before `ym`: [first month, last month] as YYYY-MM. */
function latestSeason(season: number[], ym: string): [string, string] | null {
  if (!season.length) return null;
  let y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const back = () => { m -= 1; if (m === 0) { m = 12; y -= 1; } };
  const text = () => `${y}-${String(m).padStart(2, "0")}`;
  for (let k = 0; k < 12 && !season.includes(m); k++) back();
  const end = text();
  let start = end;
  for (let k = 0; k < 11; k++) {
    back();
    if (!season.includes(m)) break;
    start = text();
  }
  return [start, end];
}

const ICONS: Record<string, ReactNode> = {
  draw: <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />,
  location: <><circle cx="12" cy="12" r="6" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></>,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  timeline: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  capture: <><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  expand: <path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6" />,
  shrink: <path d="M19 10h-5V5M5 14h5v5M14 10l6-6M10 14l-6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};
function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

function CoverageMessage({ result }: { result: Exclude<DrawnResult, { status: "ok" }> }) {
  return (
    <div className="panel-body">
      <p className="eyebrow">Drawn area</p>
      <h2>{result.status === "two-countries" ? "This area crosses two regions" : "No data here yet"}</h2>
      {result.status === "two-countries" ? (
        <p>The shape touches {result.countries.join(" and ")}. Zij reads one region at a time: draw the area inside one of them.</p>
      ) : (
        <p>This shape is outside the regions Zij has processed.</p>
      )}
      <p>Covered regions: {COVERED}.</p>
    </div>
  );
}

function CoordinateEntry({ shape, onBox }: { shape: Shape | null; onBox: (box: Shape) => void }) {
  const start = Array.isArray(shape) ? shape : null;
  const [south, setSouth] = useState(start ? String(start[1]) : "");
  const [west, setWest] = useState(start ? String(start[0]) : "");
  const [north, setNorth] = useState(start ? String(start[3]) : "");
  const [east, setEast] = useState(start ? String(start[2]) : "");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const [s, w, n, e] = [south, west, north, east].map((v) => Number(v.trim().replace(",", ".")));
    if (![s, w, n, e].every(Number.isFinite) || [south, west, north, east].some((v) => v.trim() === "")) return setProblem("Give four numbers, in decimal degrees.");
    if (s < -90 || n > 90 || w < -180 || e > 180) return setProblem("Latitude runs from -90 to 90, longitude from -180 to 180.");
    if (!(s < n) || !(w < e)) return setProblem("South must be below north, and west left of east. South and west are negative numbers.");
    setProblem(null);
    onBox([w, s, e, n]);
  };
  const field = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <label>
      <span>{label}</span>
      <input inputMode="decimal" value={value} placeholder={hint} onChange={(e) => set(e.target.value)} size={7} />
    </label>
  );
  return (
    <form className="coords" onSubmit={submit}>
      {field("South (lat)", south, setSouth, "30.0")}
      {field("West (lon)", west, setWest, "29.8")}
      {field("North (lat)", north, setNorth, "31.6")}
      {field("East (lon)", east, setEast, "32.3")}
      <button type="submit">Show box</button>
      {problem && <p className="coords-problem" role="alert">{problem}</p>}
    </form>
  );
}

/** Go to coordinates: one point, typed as latitude and longitude. */
function GoTo({ onGo, onBox }: { onGo: (lat: number, lon: number) => void; onBox: () => void }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const [a, o] = [lat, lon].map((v) => Number(v.trim().replace(",", ".")));
    if (lat.trim() === "" || lon.trim() === "" || !Number.isFinite(a) || !Number.isFinite(o)) return setProblem("Give two numbers, in decimal degrees.");
    if (a < -85 || a > 85 || o < -180 || o > 180) return setProblem("Latitude runs from -85 to 85 here, longitude from -180 to 180.");
    setProblem(null);
    onGo(a, o);
  };
  return (
    <form className="goto" onSubmit={submit}>
      <div className="coords">
        <label><span>Latitude</span><input inputMode="decimal" value={lat} placeholder="30.8" onChange={(e) => setLat(e.target.value)} size={8} autoFocus /></label>
        <label><span>Longitude</span><input inputMode="decimal" value={lon} placeholder="31.0" onChange={(e) => setLon(e.target.value)} size={8} /></label>
        <button type="submit">Go</button>
      </div>
      {problem && <p className="coords-problem" role="alert">{problem}</p>}
      <p className="note">South and west are negative. To study a box instead, <button type="button" className="link" onClick={onBox}>type its four sides</button>.</p>
    </form>
  );
}

type Sections = { time: boolean; area: boolean; layers: boolean; results: boolean };

export default function Explore({ initialIndex = null, facts = null }: { initialIndex?: Index | null; facts?: AreaFacts | null }) {
  const [state, update, query] = useAppState();
  const [index, setIndex] = useState<Index | null>(initialIndex);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [showCoords, setShowCoords] = useState(false);
  const [drawn, setDrawn] = useState<DrawnResult | null>(null);
  const [draft, setDraft] = useState<DrawnResult | null>(null);
  const draftTicket = useRef(0);
  const loading = useLoading();
  const [mapWanted, setMapWanted] = useState(false);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [drawMenu, setDrawMenu] = useState(false);
  const [goTo, setGoTo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const cursorEl = useRef<HTMLSpanElement>(null);
  const layersEl = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    // Let the first paint and the area's data go first.
    const timer = setTimeout(() => setMapWanted(true), 300);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  const [dayResult, setDayResult] = useState<DayResult | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    if (!initialIndex) loadIndex().then(setIndex).catch((e: Error) => setError(e.message));
    loadNotes().then(setNotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Presets.
  const shapeKey = state.shape ? JSON.stringify(state.shape) : "";
  const areaEntry = !shapeKey && state.area ? index?.areas.find((a) => a.id === state.area) ?? null : null;
  const areaId = areaEntry?.id ?? null;
  // Results are the point once an area is chosen; before that, the list of areas is.
  const [open, setOpen] = useState<Sections>({ time: false, area: !state.area && !shapeKey, layers: false, results: true });
  const toggle = (key: keyof Sections) => (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const isOpen = event.currentTarget.open;
    setOpen((now) => (now[key] === isOpen ? now : { ...now, [key]: isOpen }));
  };
  useEffect(() => {
    if (!areaId) {
      setArea(null);
      return;
    }
    let current = true;
    loadArea(areaId).then((a) => current && setArea(a)).catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [areaId]);

  // The drawn area: fitted in the browser, with its bands.
  useEffect(() => {
    if (!shapeKey) {
      setDrawn(null);
      return;
    }
    let current = true;
    resolveDrawn(JSON.parse(shapeKey) as Shape)
      .then((result) => current && setDrawn(result))
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [shapeKey]);

  // The cell index is small: fetch it as soon as drawing starts, so the first shape is quick.
  useEffect(() => {
    if (drawMode || showCoords) loadCellsIndex().catch(() => undefined);
    if (!drawMode) setDraft(null);
  }, [drawMode, showCoords]);

  // While a shape is being drawn: a quick fit without bands. Only the newest one is shown.
  const onDraft = (shape: Shape) => {
    const ticket = ++draftTicket.current;
    resolveDrawn(shape, true).then((result) => ticket === draftTicket.current && setDraft(result)).catch(() => undefined);
  };
  const onDrawn = (shape: Shape) => {
    draftTicket.current += 1;
    setDrawMode(null);
    update({ shape, area: null, month: null, panel: state.panel === "closed" ? "open" : state.panel });
  };
  const startDraw = (mode: DrawMode) => {
    setDrawMenu(false);
    setDrawMode(drawMode === mode ? null : mode);
  };

  const shown: DrawnResult | null = drawMode ? draft : shapeKey ? drawn : null;
  const panelArea = shown ? (shown.status === "ok" ? shown.area : null) : area && areaId === area.id ? area : null;
  const isDraft = Boolean(drawMode && shown && shown.status === "ok");
  const hasPanel = Boolean(areaId || shapeKey || drawMode);

  const span = panelArea && panelArea.months.year.length ? monthSpan(panelArea) : null;
  const from = span ? (state.from && state.from >= span[0] && state.from <= span[1] ? state.from : span[0]) : state.from ?? "2000-11";
  const to = span ? (state.to && state.to <= span[1] && state.to >= from ? state.to : span[1]) : state.to ?? (index?.last_full_day.slice(0, 7) ?? "2026-11");
  // The day view. The satellite basemap follows the chosen day.
  const lastDay = index?.last_full_day ?? "2026-11-12";
  const day = state.day && state.day >= "2000-11-01" && state.day <= lastDay ? state.day : null;
  const mapDate = day ?? lastDayOf(to, lastDay);
  const dayArea = !isDraft ? panelArea : null;
  useEffect(() => {
    if (!day || !dayArea) {
      setDayResult(null);
      return;
    }
    let current = true;
    setDayLoading(true);
    loadDay(dayArea, day)
      .then((result) => current && setDayResult(result))
      .catch((e: Error) => current && setError(e.message))
      .finally(() => current && setDayLoading(false));
    return () => {
      current = false;
    };
  }, [day, dayArea]);

  // The timeline's days. They hold still while the day moves inside them.
  const [tlRange, setTlRange] = useState<[string, string] | null>(null);
  useEffect(() => {
    if (!state.timeline) return setTlRange(null);
    setTlRange((now) => {
      const chosen: [string, string] | null = state.from && state.to ? [`${from}-01`, lastDayOf(to, lastDay)] : null;
      const fits = (r: [string, string] | null) => r !== null && Date.parse(r[1]) - Date.parse(r[0]) <= 366 * 86400000 && (!day || (day >= r[0] && day <= r[1]));
      if (fits(chosen)) return now && now[0] === chosen![0] && now[1] === chosen![1] ? now : chosen;
      if (now && (!day || (day >= now[0] && day <= now[1]))) return now;
      const end = day ? (addDays(day, 45) > lastDay ? lastDay : addDays(day, 45)) : lastDay;
      return [addDays(end, -89), end];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timeline, state.from, state.to, from, to, day, lastDay]);
  const week: [string, string] = useMemo(() => [addDays(lastDay, -6), lastDay], [lastDay]);
  const loadRange = tlRange ?? (state.days && !day ? week : null);
  const rangeKey = loadRange && dayArea ? `${loadRange[0]}|${loadRange[1]}|${dayArea.id}|${shapeKey}` : "";
  const [rangeDays, setRangeDays] = useState<{ key: string; days: Map<string, DayHotspot[]> } | null>(null);
  useEffect(() => {
    if (!rangeKey || !loadRange || !dayArea) return;
    let current = true;
    loadHotspotDays(shapeOf(dayArea), loadRange[0], loadRange[1])
      .then((days) => current && setRangeDays({ key: rangeKey, days }))
      .catch(() => undefined);
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);
  const range = rangeDays && rangeDays.key === rangeKey ? rangeDays.days : null;
  const tlDays = useMemo(() => (tlRange ? daysBetween(tlRange[0], tlRange[1]) : []), [tlRange]);
  const tlCounts = useMemo(() => (range && tlRange ? new Map([...range].map(([d, list]) => [d, list.length])) : null), [range, tlRange]);

  // The hotspots on the map: the chosen day's, or the last 7 days'.
  const allHotspots = useMemo(() => {
    if (day) return range?.get(day) ?? (dayResult && dayResult.view.date === day ? dayResult.view.hotspots : NO_HOTSPOTS);
    if (state.days && range) return daysBetween(week[0], week[1]).flatMap((d) => range.get(d) ?? []);
    return NO_HOTSPOTS;
  }, [day, range, dayResult, state.days, week]);
  const counts = useMemo(() => ({ viirs: allHotspots.filter((h) => h.sensor === "VIIRS").length, modis: allHotspots.filter((h) => h.sensor === "MODIS").length }), [allHotspots]);
  const hidden = (layer: string) => state.hide.includes(layer);
  const hideKey = state.hide.join(",");
  const hotspots = useMemo(
    () => (hideKey ? allHotspots.filter((h) => !hideKey.split(",").includes(h.sensor.toLowerCase())) : allHotspots),
    [allHotspots, hideKey],
  );
  const setLayer = (layer: string, on: boolean) => update({ hide: on ? state.hide.filter((l) => l !== layer) : [...state.hide, layer] });
  const showingDays = Boolean(day || state.days);
  // The counts are known once the day (or the week) of the chosen area has loaded.
  const countsReady = Boolean(showingDays && dayArea && (range || (day && dayResult && dayResult.view.date === day)));

  // With the outlines off the map has no box to follow, so move it here.
  useEffect(() => {
    if (!map || !areaEntry || !hidden("outlines")) return;
    const [w, s, e, n] = areaEntry.box;
    map.fitBounds([[w, s], [e, n]], { padding: 90, maxZoom: 8, duration: 1200 }); // the panel's side is not kept clear here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, areaEntry?.id]);

  // Keep the chosen area clear of the panel, the dock and the timeline when the map moves to it.
  const [screen, setScreen] = useState<[number, number]>([1440, 900]);
  useEffect(() => {
    const measure = () => setScreen([window.innerWidth, window.innerHeight]);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const fitPadding = useMemo(() => {
    const [w, h] = screen;
    const timeline = state.timeline ? 86 : 0;
    if (w <= 760) return { top: 84 + (state.timeline ? 110 : 0), left: 28, right: 28, bottom: 54 + (state.panel === "closed" ? 0 : Math.round(h * 0.46)) + 24 };
    const sheet = state.panel === "closed" ? 0 : state.panel === "wide" ? w / 2 : w <= 1180 ? 404 : 464;
    return { top: 96, left: 72, right: Math.round(sheet) + 48, bottom: 104 + timeline };
  }, [screen, state.panel, state.timeline]);

  // The readout.
  const areaName = panelArea?.name ?? areaEntry?.name ?? (shapeKey || drawMode ? "Drawn area" : "No area chosen");
  const dateText = day ? shortDate(day) : state.days ? `${shortDate(week[0])} to ${shortDate(week[1])}` : `${monthWords(from)} to ${monthWords(to)}`;
  const onCursor = useCallback((at: { lng: number; lat: number } | null) => {
    if (!cursorEl.current) return;
    cursorEl.current.textContent = at
      ? `${Math.abs(at.lat).toFixed(3)}° ${at.lat >= 0 ? "N" : "S"}, ${Math.abs(at.lng).toFixed(3)}° ${at.lng >= 0 ? "E" : "W"}`
      : "Move over the map";
  }, []);

  // The quick chips.
  const thisMonth = lastDay.slice(0, 7);
  const season = latestSeason(panelArea?.fit.season ?? areaEntry?.season ?? [], thisMonth);
  const chips: { label: string; on: boolean; go: () => void; off?: string }[] = [
    { label: "Today", on: day === lastDay, go: () => update({ day: lastDay, days: null }) },
    { label: "7 days", on: !day && state.days === 7, go: () => update({ day: null, days: 7 }) },
    { label: "This month", on: !showingDays && state.from === thisMonth && state.to === thisMonth, go: () => update({ from: thisMonth, to: thisMonth, month: thisMonth, view: "calendar", day: null, days: null }) },
    { label: "This season", on: !showingDays && !!season && state.from === season[0] && state.to === season[1], off: season ? undefined : "Choose an area first: each has its own season.",
      go: () => season && update({ from: season[0], to: season[1], month: null, day: null, days: null }) },
    { label: "All years", on: !showingDays && !state.from && !state.to, go: () => update({ from: null, to: null, month: null, day: null, days: null }) },
  ];

  // The dock.
  const openLayers = () => {
    update({ panel: state.panel === "closed" ? "open" : state.panel });
    setOpen((now) => ({ ...now, layers: true }));
    setTimeout(() => layersEl.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };
  const capture = async () => {
    if (!map) return setToast("The map is still loading.");
    try {
      const stamp = day ?? (state.days ? `${week[0]}_${week[1]}` : `${from}_${to}`);
      saveBlob(await captureMap(map, areaName, dateText), `zij_${areaId ?? (shapeKey ? "drawn-area" : "map")}_${stamp}.png`);
      setToast("Saved the map as a PNG.");
    } catch {
      setToast("The picture could not be made.");
    }
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast("Link copied. It opens this same view.");
    } catch {
      setToast("Copy the address from the browser's address bar: it holds this view.");
    }
  };
  const goToPoint = (lat: number, lon: number) => {
    map?.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 7), duration: 1600 });
    setGoTo(false);
    setToast(`At ${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}.`);
  };
  const dock: { id: string; label: string; tip: string; on?: boolean; go: () => void }[] = [
    { id: "location", label: "Location", tip: "Go to coordinates", go: () => { setDrawMenu(false); setGoTo(true); } },
    { id: "layers", label: "Layers", tip: "Hotspots, outlines and basemap", go: openLayers },
    { id: "timeline", label: "Timeline", tip: state.timeline ? "Close the timeline" : "Step through the days", on: state.timeline, go: () => update({ timeline: !state.timeline }) },
    { id: "capture", label: "Capture", tip: "Save the map as a PNG", go: capture },
    { id: "share", label: "Share", tip: "Copy a link to this view", go: share },
  ];
  // The verdict the panel opens with: the area's this month, or the chosen day's week and month.
  const verdict = useMemo(() => (panelArea ? areaVerdict(panelArea) : null), [panelArea]);
  const dayVerdict = useMemo(() => (day && dayArea ? dayVerdicts(dayArea, day) : { week: null, month: null }), [day, dayArea]);
  const q = query ? `?${query}` : "";
  const closed = state.panel === "closed";
  const wide = state.panel === "wide";
  const progress = loading ? loadingWords(loading) : null;

  const results = (
    <>
      {error && <p className="panel-body">Could not load the data: {error}</p>}
      {!error && !hasPanel && (
        <div className="panel-body">
          <p className="eyebrow">Zij</p>
          <h2>26 years of fire, on one scale</h2>
          {INTRO.map((text) => <p key={text}>{text}</p>)}
          <p>Choose an area on the map or below, or draw your own in {COVERED}.</p>
          <div onClick={(event) => {
            // The links work without scripts; with them, the page changes area without reloading.
            const link = (event.target as HTMLElement).closest("a");
            const id = link ? new URL(link.href).searchParams.get("area") : null;
            if (id) {
              event.preventDefault();
              update({ area: id, shape: null, month: null });
            }
          }}>
            <AreaLinks areas={index?.areas ?? []} />
          </div>
        </div>
      )}
      {!error && drawMode && !shown && <p className="panel-body" role="status">{progress ?? "Draw on the map. The numbers appear here as the shape grows."}</p>}
      {!error && !drawMode && hasPanel && !panelArea && !(shown && shown.status !== "ok") && (
        facts && facts.id === areaId ? (
          <FactsBlock facts={facts} named={false} />
        ) : (
          <div className="panel-body" role="status">
            <p>{progress ?? (shapeKey ? "Fitting your drawn area. This runs in your browser, once the page's scripts and the region's cells have loaded." : "Loading…")}</p>
            {shapeKey && INTRO.map((text) => <p key={text} className="note">{text}</p>)}
          </div>
        )
      )}
      {!error && shown && shown.status !== "ok" && <CoverageMessage result={shown} />}
      {!error && day && !panelArea && !drawMode && (
        <p className="panel-body">Choose an area to see {day}: its hotspots on the map and how the day compares.</p>
      )}
      {!error && !day && panelArea && !isDraft && verdict && <div className="panel-body verdict-wrap"><VerdictLine verdict={verdict} /></div>}
      {!error && day && dayArea && (dayVerdict.week || dayVerdict.month) && (
        <div className="panel-body verdict-wrap">
          {dayVerdict.week && <VerdictLine verdict={dayVerdict.week} />}
          {dayVerdict.month && <VerdictLine verdict={dayVerdict.month} />}
        </div>
      )}
      {!error && day && dayArea && (
        <div className="panel-body day-wrap">
          <DayPanel area={dayArea} date={day} result={dayResult && dayResult.view.date === day ? dayResult : null} loading={dayLoading}
            loadingText={progress} onClose={() => update({ day: null })} />
        </div>
      )}
      {!error && panelArea && (
        <Panel area={panelArea} simple={state.mode === "simple"} onExpert={() => update({ mode: "expert" })} named={false} from={from} to={to} view={state.view} month={state.month} year={state.year}
          note={notes[panelArea.id]} drawn={Boolean(shown)} draft={isDraft}
          onView={(view) => update({ view })} onMonth={(month) => update({ month })} onYear={(year) => update({ year })} />
      )}
    </>
  );

  return (
    <TooltipProvider delayDuration={350}>
    <div className={`explore panel-${state.panel}${state.timeline && tlRange ? " has-timeline" : ""}${state.basemap === "satellite" ? " is-satellite" : ""}`}>
      <header className="strip paper">
        <a className="brand" href="/"><Seal /><h1 className="sr-only">Zij: fire on one scale</h1></a>
        <p className="readout">
          <span ref={cursorEl} className="readout-cursor">Move over the map</span>
          <span className="readout-area">{areaName}</span>
          <span className="readout-date">{dateText}</span>
        </p>
        <nav aria-label="Pages">
          <Link href={`/downloads${q}`}>Downloads</Link>
          <Link href={`/how-it-works${q}`}>How it works</Link>
        </nav>
      </header>

      <div className="mapwrap">
        {!mapWanted && <div className="map map-waiting">Loading the map…</div>}
        {mapWanted && <MapView basemap={state.basemap} date={mapDate} areas={hidden("outlines") ? [] : index?.areas ?? []} selected={areaId}
          onSelect={(id) => update({ area: id, shape: null, month: null })}
          shape={drawMode || hidden("outlines") ? null : state.shape} drawMode={drawMode} onDraft={onDraft} onDrawn={onDrawn} hotspots={hotspots}
          chrome={false} tags onMap={setMap} onCursor={onCursor} fitPadding={fitPadding} />}
      </div>

      <div className="left-tools" role="group" aria-label="Map controls">
        <Tip label="Zoom in" side="right"><button type="button" onClick={() => map?.zoomIn()} aria-label="Zoom in"><Icon name="plus" /></button></Tip>
        <Tip label="Zoom out" side="right"><button type="button" onClick={() => map?.zoomOut()} aria-label="Zoom out"><Icon name="minus" /></button></Tip>
        <Tip label="Go to coordinates" side="right"><button type="button" onClick={() => { setDrawMenu(false); setGoTo(true); }} aria-label="Go to coordinates"><Icon name="location" /></button></Tip>
      </div>

      <Modal open={goTo} onOpenChange={setGoTo} title="Go to coordinates">
        <GoTo onGo={goToPoint} onBox={() => { setGoTo(false); setShowCoords(true); setOpen((now) => ({ ...now, area: true })); update({ panel: closed ? "open" : state.panel }); }} />
      </Modal>
      {drawMode && (
        <p className="map-hint paper" role="status">
          {drawMode === "box" ? "Click one corner, move, and click the opposite corner." : "Click each corner; click the first point again to close the shape."}
          {" "}The panel follows as you draw. <button type="button" className="link" onClick={() => setDrawMode(null)}>Stop drawing</button>
        </p>
      )}
      {progress && <p className="map-progress paper" role="status">{progress}</p>}
      {toast && <p className="toast paper" role="status">{toast}</p>}

      <aside className={`sheet paper${wide ? " is-wide" : ""}`} hidden={closed} aria-label="Panel">
        <header className="sheet-head">
          <p>{(panelArea?.country ?? areaEntry?.country) && <span>{shown ? "Your area, " : ""}{panelArea?.country ?? areaEntry?.country}</span>}<strong>{areaName}</strong></p>
          <div className="switch mode-switch" role="radiogroup" aria-label="How much to show">
            <button type="button" role="radio" aria-checked={state.mode === "simple"} className={state.mode === "simple" ? "is-active" : ""} onClick={() => update({ mode: "simple" })}>Simple</button>
            <button type="button" role="radio" aria-checked={state.mode === "expert"} className={state.mode === "expert" ? "is-active" : ""} onClick={() => update({ mode: "expert" })}>Expert</button>
          </div>
          <Tip label={wide ? "Narrow the panel" : "Widen to half the screen"} side="bottom">
            <button type="button" className="icon-button" onClick={() => update({ panel: wide ? "open" : "wide" })} aria-label={wide ? "Narrow the panel" : "Widen the panel to half the screen"}>
              <Icon name={wide ? "shrink" : "expand"} />
            </button>
          </Tip>
          <Tip label="Close the panel" side="bottom">
            <button type="button" className="icon-button" onClick={() => update({ panel: "closed" })} aria-label="Close the panel"><Icon name="close" /></button>
          </Tip>
        </header>
        <div className="sheet-body">
          <details open={open.time} onToggle={toggle("time")}>
            <summary><span>Time</span><em>{dateText}</em></summary>
            <div className="section">
              <div className="chips" role="group" aria-label="Quick choices">
                {chips.map((chip) => (
                  <button key={chip.label} type="button" className={chip.on ? "is-active" : ""} aria-pressed={chip.on} disabled={Boolean(chip.off)} title={chip.off} onClick={chip.go}>{chip.label}</button>
                ))}
              </div>
              <div className="fields">
                <div className="field">
                  <span>Day</span>
                  <DayField label="Day" value={day} min="2000-11-01" max={lastDay} onChange={(next) => update({ day: next, days: null })} />
                </div>
                <div className="field">
                  <span>From and to</span>
                  <RangeField label="From and to" from={from} to={to} min={span ? `${span[0]}-01` : "2000-11-01"} max={lastDay} onChange={(a, b) => update({ from: a, to: b })} />
                </div>
              </div>
              <p className="note">The data ends on {shortDate(lastDay)}: “Today” is that day. A day shows its hotspots on the map; From and To set the calendar and charts.</p>
            </div>
          </details>

          <details open={open.area} onToggle={toggle("area")}>
            <summary><span>Area</span><em>{areaEntry ? `Preset, ${areaEntry.country}` : shapeKey ? (Array.isArray(state.shape) ? "Drawn box" : "Drawn polygon") : drawMode ? "Drawing" : "None chosen"}</em></summary>
            <div className="section">
              <div className="field">
                <span>Preset areas</span>
                <Select label="Preset areas" placeholder="Choose an area" value={areaId ?? (shapeKey ? "drawn" : null)}
                  options={[...(shapeKey ? [{ value: "drawn", label: "Your drawn area" }] : []), ...(index?.areas ?? []).map((a) => ({ value: a.id, label: `${a.name}, ${a.country}` })), ...(areaId ? [{ value: "none", label: "No area" }] : [])]}
                  onChange={(next) => { if (next === "drawn") return; setDrawMode(null); update({ area: next === "none" ? null : next, shape: null, month: null }); }} />
              </div>
              <div className="switch" role="group" aria-label="Draw your own area">
                <button type="button" className={drawMode === "box" ? "is-active" : ""} aria-pressed={drawMode === "box"} onClick={() => startDraw("box")}>Draw box</button>
                <button type="button" className={drawMode === "polygon" ? "is-active" : ""} aria-pressed={drawMode === "polygon"} onClick={() => startDraw("polygon")}>Draw polygon</button>
                <button type="button" className={showCoords ? "is-active" : ""} aria-pressed={showCoords} onClick={() => setShowCoords(!showCoords)}>Type coordinates</button>
                {shapeKey && <button type="button" onClick={() => update({ shape: null, month: null })}>Clear</button>}
              </div>
              {showCoords && <CoordinateEntry key={shapeKey} shape={state.shape} onBox={(box) => { setDrawMode(null); update({ shape: box, area: null, month: null }); }} />}
              <p className="note">Your own area can be drawn in {COVERED}.</p>
            </div>
          </details>

          <details ref={layersEl} open={open.layers} onToggle={toggle("layers")}>
            <summary><span>Layers</span><em>{state.basemap === "satellite" ? "NASA satellite" : "Zij atlas"}{countsReady ? `, ${(counts.viirs + counts.modis).toLocaleString("en")} hotspots` : ""}{state.hide.length ? `, ${state.hide.length} off` : ""}</em></summary>
            <div className="section">
              <p className="section-label">Hotspots{showingDays ? `, ${dateText}` : ""}</p>
              <Check label="VIIRS hotspots" checked={!hidden("viirs")} onChange={(on) => setLayer("viirs", on)}>
                <span className="mark-viirs" /> VIIRS <b>{countsReady ? counts.viirs.toLocaleString("en") : "–"}</b>
              </Check>
              <Check label="MODIS hotspots" checked={!hidden("modis")} onChange={(on) => setLayer("modis", on)}>
                <span className="mark-modis" /> MODIS <b>{countsReady ? counts.modis.toLocaleString("en") : "–"}</b>
              </Check>
              {!showingDays && <p className="note">No day or week is chosen, so there is nothing to count. Pick a day or “7 days” under Time, or open the Timeline.</p>}
              {showingDays && !dayArea && <p className="note">Choose an area to count its hotspots for {dateText}.</p>}
              {showingDays && dayArea && !countsReady && <p className="note">Counting the hotspots…</p>}
              {countsReady && <p className="note">Kept detections in this area, {dateText}. The two counts are not on one scale: VIIRS sees smaller fires.</p>}
              <p className="section-label">Outlines</p>
              <Check label="Area outlines and names" checked={!hidden("outlines")} onChange={(on) => setLayer("outlines", on)}>Area outlines and names</Check>
              <p className="section-label">Basemap</p>
              <div className="switch" role="radiogroup" aria-label="Basemap">
                {BASEMAPS.map((b) => (
                  <button key={b.id} type="button" role="radio" className={state.basemap === b.id ? "is-active" : ""} aria-checked={state.basemap === b.id} onClick={() => update({ basemap: b.id })}>
                    {b.id === "zij" ? "Zij atlas" : "NASA satellite"}
                  </button>
                ))}
              </div>
              {state.basemap === "satellite" && <p className="note">NASA GIBS true colour, {shortDate(mapDate)}.</p>}
            </div>
          </details>

          <details open={open.results} onToggle={toggle("results")} className="results" aria-live="polite">
            <summary><span>Results</span><em>{!hasPanel ? "Choose an area" : day ? shortDate(day) : state.mode === "simple" ? "The short answer" : VIEW_WORDS[state.view]}</em></summary>
            {results}
          </details>
        </div>
      </aside>
      {closed && <button type="button" className="sheet-tab paper" onClick={() => update({ panel: "open" })}>Open the panel</button>}

      {state.timeline && tlRange && tlDays.length > 1 && (
        <Timeline days={tlDays} day={day} counts={tlCounts}
          note={!dayArea ? "Choose an area to see its hotspots" : !range ? "Loading the hotspots…" : null}
          onDay={(next) => update({ day: next, days: null }, true)} onClose={() => update({ timeline: false })} />
      )}

      <nav className="dock paper" aria-label="Tools">
        <Pop open={drawMenu} onOpenChange={setDrawMenu} side="top" align="center" label="Draw your own area"
          trigger={<button type="button" className={drawMenu || drawMode ? "is-active" : ""} aria-label="Draw your own area"><Icon name="draw" /><span>Draw</span></button>}>
          <div className="menu">
            <button type="button" className={drawMode === "box" ? "is-active" : ""} onClick={() => startDraw("box")}>Draw a box</button>
            <button type="button" className={drawMode === "polygon" ? "is-active" : ""} onClick={() => startDraw("polygon")}>Draw a polygon</button>
            {shapeKey && <button type="button" onClick={() => { setDrawMenu(false); update({ shape: null, month: null }); }}>Clear the drawn area</button>}
          </div>
        </Pop>
        {dock.map((tool) => (
          <Tip key={tool.id} label={tool.tip}>
            <button type="button" className={tool.on ? "is-active" : ""} aria-pressed={tool.on} aria-label={tool.tip} onClick={tool.go}>
              <Icon name={tool.id} /><span>{tool.label}</span>
            </button>
          </Tip>
        ))}
        <Tip label="How it works: the method and the numbers"><Link href={`/how-it-works${q}`} aria-label="Help: how it works"><Icon name="help" /><span>Help</span></Link></Tip>
      </nav>

      <p className="map-credit">Fire data: NASA FIRMS. Imagery: NASA GIBS. Map: Natural Earth. Not affiliated with or endorsed by NASA.</p>
    </div>
    </TooltipProvider>
  );
}
