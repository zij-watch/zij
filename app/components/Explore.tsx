"use client";

// Explore: the map is the page. Everything else is paper lying on it.
//   top           the running head: the Seal, a live readout (pointer, area, date), Downloads, Help
//   left          two groups of tools: zoom, location (and north, when the map is turned);
//                 draw, capture, share
//   on the area   the area's menu: when to look, the timeline, the marks, save, clear
//   right         Results, when there are results: one paper per answer, the tables last
//   bottom left   the basemap tile (the atlas, or NASA's cloud-free satellite picture), the credit
// A right-drag draws a box, Alt + right-drag a free shape; a middle-drag turns the map.
// Everything on screen is in the address, so a link reproduces it.

import dynamic from "next/dynamic";
import Link from "next/link";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captureMap, saveBlob } from "@/lib/capture";
import { loadArea, loadFindings, loadIndex, loadNotes, type Area, type AreaFinding, type Index } from "@/lib/data";
import { loadDay, loadHotspotDays, shapeOf, type DayResult } from "@/lib/dayData";
import { loadingWords, useLoading } from "@/lib/download";
import { COVERED, loadCellsIndex, resolveDrawn, type DrawnResult } from "@/lib/drawnArea";
import type { AreaFacts } from "@/lib/facts";
import type { Shape } from "@/lib/fit/cells";
import { monthSpan } from "@/lib/format";
import type { DayHotspot } from "@/lib/hotspots/day";
import { satelliteThumb } from "@/lib/map/style";
import { forgetArea, saveArea, useSavedAreas } from "@/lib/presets";
import { remember, useRemembered } from "@/lib/remember";
import { TOUR, tourState } from "@/lib/tour";
import { shapeParams, useAppState } from "@/lib/url";
import { areaVerdict, dayVerdicts } from "@/lib/verdict";
import AreaMenu, { type Insets } from "./AreaMenu";
import GoToDialog from "./GoToDialog";
import Icon from "./icons";
import type { DrawMode } from "./MapView";
import Panel, { paperId, ResultPaper } from "./Panel";
import Paper from "./Paper";
import { FactsPapers, Seal } from "./Shell";
import Timeline, { daysBetween, shortDate } from "./Timeline";
import { Pop, Tip, TooltipProvider } from "./ui";

// MapLibre is the heaviest script on the page. It is loaded on its own, after the first text.
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="map map-waiting">Loading the map…</div> });

const NO_HOTSPOTS: DayHotspot[] = [];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthWords = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
const HINT = "zij.hint.v1";
const STRIP = 44;

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

function CoveragePaper({ result }: { result: Exclude<DrawnResult, { status: "ok" }> }) {
  return (
    <ResultPaper letter="أ" id={paperId("verdict")} title={result.status === "two-countries" ? "Across two regions" : "No data here"}>
      <p className="erratum">
        {result.status === "two-countries"
          ? `The shape touches ${result.countries.join(" and ")}: draw it inside one of them.`
          : `Zij has processed ${COVERED}. Draw inside one of them.`}
      </p>
    </ResultPaper>
  );
}

export default function Explore({ initialIndex = null, facts = null }: { initialIndex?: Index | null; facts?: AreaFacts | null }) {
  const [state, update, query] = useAppState();
  const [index, setIndex] = useState<Index | null>(initialIndex);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [findings, setFindings] = useState<AreaFinding[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [drawn, setDrawn] = useState<DrawnResult | null>(null);
  const [draft, setDraft] = useState<DrawnResult | null>(null);
  const draftTicket = useRef(0);
  const loading = useLoading();
  const [mapWanted, setMapWanted] = useState(false);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [bearing, setBearing] = useState(0);
  const [drawMenu, setDrawMenu] = useState(false);
  const [helpMenu, setHelpMenu] = useState(false);
  const [goTo, setGoTo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const cursorEl = useRef<HTMLSpanElement>(null);
  const saved = useSavedAreas();
  const hintRead = useRemembered(HINT) !== null;
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    // Let the first paint and the area's data go first.
    const timer = setTimeout(() => setMapWanted(true), 300);
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  // The compass shows only while the map is turned.
  useEffect(() => {
    if (!map) return;
    const turn = () => setBearing(map.getBearing());
    map.on("rotate", turn);
    return () => { map.off("rotate", turn); };
  }, [map]);
  const [dayResult, setDayResult] = useState<DayResult | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    if (!initialIndex) loadIndex().then(setIndex).catch((e: Error) => setError(e.message));
    loadNotes().then(setNotes);
    loadFindings().then((f) => setFindings(f.areas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tour. A link may carry only the step (?tour=1): the step's own state is then put in place.
  const tourStep = state.tour ? TOUR[state.tour - 1] : null;
  const tourApplied = useRef<number | null>(null);
  useEffect(() => {
    if (!state.tour || tourApplied.current === state.tour) return;
    tourApplied.current = state.tour;
    setDrawMode(null);
    update(tourState(state.tour));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tour]);
  const goTour = (step: number | null) => {
    tourApplied.current = step;
    setDrawMode(null);
    update(step ? tourState(step) : { tour: null });
  };

  // Presets.
  const shapeKey = state.shape ? JSON.stringify(state.shape) : "";
  const areaEntry = !shapeKey && state.area ? index?.areas.find((a) => a.id === state.area) ?? null : null;
  const areaId = areaEntry?.id ?? null;
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
    if (drawMode) loadCellsIndex().catch(() => undefined);
    if (!drawMode) setDraft(null);
  }, [drawMode]);
  useEffect(() => {
    if (!drawMode) return;
    const stop = (event: KeyboardEvent) => event.key === "Escape" && setDrawMode(null);
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
  }, [drawMode]);

  const openResults = state.panel === "closed" ? "open" : state.panel;
  const readHint = () => !hintRead && remember(HINT, 1);
  // While a shape is being drawn with the Draw tool: a quick fit without bands. Only the newest one is shown.
  const onDraft = (shape: Shape) => {
    const ticket = ++draftTicket.current;
    resolveDrawn(shape, true).then((result) => ticket === draftTicket.current && setDraft(result)).catch(() => undefined);
  };
  const onDrawn = (shape: Shape) => {
    draftTicket.current += 1;
    setDrawMode(null);
    readHint();
    update({ shape, area: null, month: null, panel: openResults });
  };
  const choose = (id: string | null) => {
    setDrawMode(null);
    setDrawMenu(false);
    if (id) readHint();
    update({ area: id, shape: null, month: null, panel: openResults });
  };
  const startDraw = (mode: DrawMode) => {
    setDrawMenu(false);
    setDrawMode(drawMode === mode ? null : mode);
  };

  const shown: DrawnResult | null = drawMode ? draft : shapeKey ? drawn : null;
  const panelArea = shown ? (shown.status === "ok" ? shown.area : null) : area && areaId === area.id ? area : null;
  const isDraft = Boolean(drawMode && shown && shown.status === "ok");
  const hasSelection = Boolean(areaId || shapeKey);
  const hasColumn = Boolean(error || hasSelection || (drawMode && shown));

  const span = panelArea && panelArea.months.year.length ? monthSpan(panelArea) : null;
  const from = span ? (state.from && state.from >= span[0] && state.from <= span[1] ? state.from : span[0]) : state.from ?? "2000-11";
  const to = span ? (state.to && state.to <= span[1] && state.to >= from ? state.to : span[1]) : state.to ?? (index?.last_full_day.slice(0, 7) ?? "2026-11");
  // The day view.
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
    map.fitBounds([[w, s], [e, n]], { padding: 90, maxZoom: 8, duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, areaEntry?.id]);

  // What the papers leave of the map: kept clear when the map moves to an area, and the area's menu stays inside it.
  const [screen, setScreen] = useState<[number, number]>([1440, 900]);
  useEffect(() => {
    const measure = () => setScreen([window.innerWidth, window.innerHeight]);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const closed = state.panel === "closed";
  const wide = state.panel === "wide";
  const columnShown = hasColumn && !closed;
  const docked = screen[0] <= 760;
  const timelineShown = Boolean(state.timeline && tlRange && tlDays.length > 1);
  const insets: Insets = useMemo(() => {
    const [w, h] = screen;
    // A phone: the tools and the credit lie along the top, the menu and Results along the bottom.
    if (docked) return { top: STRIP + 96, left: 8, right: 8, bottom: (columnShown ? Math.round(h * 0.46) : 0) + 128 };
    const column = columnShown ? Math.round(wide ? w / 2 : w <= 1180 ? 380 : 440) + 24 : 0;
    // During the tour its card sits at the top left: on a wide screen the area and its menu keep clear of it.
    const tour = state.tour && w >= 1300 ? 440 : 0;
    return { top: STRIP + 8, left: 64 + tour, right: column + 8, bottom: 16 + (timelineShown ? 96 : 0) };
  }, [screen, docked, columnShown, wide, timelineShown, state.tour]);
  const fitPadding = useMemo(() => {
    // Room above the area for its menu, which is about 100 px tall.
    const menu = docked ? 0 : 120;
    return { top: insets.top + menu, left: insets.left + 16, right: insets.right + 32, bottom: insets.bottom + 24 };
  }, [insets, docked]);

  // The readout.
  const areaName = panelArea?.name ?? areaEntry?.name ?? (shapeKey || drawMode ? "Drawn area" : "No area chosen");
  const country = panelArea?.country ?? areaEntry?.country ?? null;
  const dateText = day ? shortDate(day) : state.days ? `${shortDate(week[0])} to ${shortDate(week[1])}` : `${monthWords(from)} to ${monthWords(to)}`;
  const onCursor = useCallback((at: { lng: number; lat: number } | null) => {
    if (!cursorEl.current) return;
    cursorEl.current.textContent = at
      ? `${Math.abs(at.lat).toFixed(3)}° ${at.lat >= 0 ? "N" : "S"}, ${Math.abs(at.lng).toFixed(3)}° ${at.lng >= 0 ? "E" : "W"}`
      : "Move over the map";
  }, []);

  // The quick choices of time.
  const thisMonth = lastDay.slice(0, 7);
  const season = latestSeason(panelArea?.fit.season ?? areaEntry?.season ?? [], thisMonth);
  const chips: { label: string; on: boolean; go: () => void; off?: string }[] = [
    { label: "Today", on: day === lastDay, go: () => update({ day: lastDay, days: null }) },
    { label: "7 days", on: !day && state.days === 7, go: () => update({ day: null, days: 7 }) },
    { label: "This month", on: !showingDays && state.from === thisMonth && state.to === thisMonth, go: () => update({ from: thisMonth, to: thisMonth, month: thisMonth, view: "calendar", day: null, days: null }) },
    { label: "This season", on: !showingDays && !!season && state.from === season[0] && state.to === season[1], off: season ? undefined : "This area has no fire season in the record.",
      go: () => season && update({ from: season[0], to: season[1], month: null, day: null, days: null }) },
    { label: "All years", on: !showingDays && !state.from && !state.to, go: () => update({ from: null, to: null, month: null, day: null, days: null }) },
  ];

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

  // The verdict Results opens with: the area's this month, or the chosen day's week and month.
  const finding = areaId ? findings.find((f) => f.id === areaId) ?? null : null;
  // A named fire in the findings gives the intensity line its words: its detections and its cells.
  const fire = useMemo(() => {
    const n = finding?.numbers;
    return n?.fire_days && n.viirs_detections && n.grid_cells ? { fire_days: n.fire_days, viirs_detections: n.viirs_detections, grid_cells: n.grid_cells } : null;
  }, [finding]);
  const verdict = useMemo(() => (panelArea ? areaVerdict(panelArea, fire) : null), [panelArea, fire]);
  const dayVerdict = useMemo(() => (day && dayArea ? dayVerdicts(dayArea, day, fire) : { week: null, month: null }), [day, dayArea, fire]);
  const q = query ? `?${query}` : "";
  const progress = loading ? loadingWords(loading) : null;
  const reportHref = panelArea ? `/brief?${areaId ? `area=${areaId}` : Object.entries(shapeParams(state.shape)).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&")}` : null;

  // A link or a tour step that names a paper brings it into view once the area is in.
  const column = useRef<HTMLElement>(null);
  const target = day ? paperId("day") : state.view !== "calendar" ? paperId(state.view) : null;
  useEffect(() => {
    if (!panelArea || !column.current) return;
    const timer = setTimeout(() => {
      const element = target ? document.getElementById(target) : null;
      if (element) element.scrollIntoView({ block: "start", behavior: "smooth" });
      else if (state.tour) column.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 650);
    return () => clearTimeout(timer);
  }, [target, panelArea?.id, state.tour, columnShown]); // eslint-disable-line react-hooks/exhaustive-deps

  // The selection the area's menu stands on.
  const selection: Shape | null = shapeKey ? state.shape : areaEntry ? areaEntry.box : null;
  const savedHere = shapeKey ? saved.find((a) => JSON.stringify(a.shape) === shapeKey) ?? null : null;

  const results = (
    <>
      {error && <ResultPaper letter="أ" id={paperId("verdict")} title="Not loaded"><p className="erratum">The data could not be loaded: {error}</p></ResultPaper>}
      {!error && hasSelection && !panelArea && !(shown && shown.status !== "ok") && (
        facts && facts.id === areaId ? <FactsPapers facts={facts} /> : (
          <ResultPaper letter="أ" id={paperId("verdict")} title={shapeKey ? "Fitting your area" : "Loading"}>
            <p className="marginal" role="status">{progress ?? (shapeKey ? "The record of your shape is worked out in this browser once the region's cells are in." : "Loading…")}</p>
          </ResultPaper>
        )
      )}
      {!error && shown && shown.status !== "ok" && <CoveragePaper result={shown} />}
      {!error && panelArea && (
        <Panel area={panelArea} verdict={verdict} day={day} dayVerdict={dayVerdict} dayResult={dayResult} dayLoading={dayLoading} loadingText={progress}
          onCloseDay={() => update({ day: null })} finding={finding} note={notes[panelArea.id]} drawn={Boolean(shown)} draft={isDraft}
          recorded={state.recorded} onRecorded={(recorded) => update({ recorded })} from={from} to={to} month={state.month} year={state.year}
          onMonth={(month) => update({ month })} onYear={(year) => update({ year })} reportHref={reportHref} />
      )}
    </>
  );

  const showHint = !hintRead && !hasSelection && !drawMode && !state.tour;

  return (
    <TooltipProvider delayDuration={350}>
    <div className={`explore panel-${columnShown ? state.panel : "closed"}${timelineShown ? " has-timeline" : ""}${state.basemap === "satellite" ? " is-satellite" : ""}${state.tour ? " has-tour" : ""}`}>
      <header className="strip">
        <a className="brand" href="/"><Seal /><h1 className="sr-only">Zij: fire on one scale</h1></a>
        <p className="readout">
          <span ref={cursorEl} className="readout-cursor">Move over the map</span>
          <span className="readout-area">{areaName}</span>
          <span className="readout-date">{dateText}</span>
        </p>
        <nav aria-label="Pages">
          <Link href={`/downloads${q}`}>Downloads</Link>
          <Pop open={helpMenu} onOpenChange={setHelpMenu} side="bottom" align="end" label="Help"
            trigger={<button type="button" className={`nav-menu${helpMenu ? " is-open" : ""}`} aria-label="Help: the tour, and how it works">Help <Icon name="chevron" size={16} /></button>}>
            <div className="menu">
              <button type="button" onClick={() => { setHelpMenu(false); goTour(1); }}>Take the 60-second tour</button>
              <Link className="menu-link" href={`/how-it-works${q}`} onClick={() => setHelpMenu(false)}>How it works</Link>
            </div>
          </Pop>
        </nav>
      </header>

      <div className="mapwrap">
        {!mapWanted && <div className="map map-waiting">Loading the map…</div>}
        {mapWanted && <MapView basemap={state.basemap} date={mapDate} areas={hidden("outlines") ? [] : index?.areas ?? []} selected={areaId}
          onSelect={(id) => choose(id)} onSketchStart={() => loadCellsIndex().catch(() => undefined)}
          shape={drawMode || hidden("outlines") ? null : state.shape} drawMode={drawMode} onDraft={onDraft} onDrawn={onDrawn} hotspots={hotspots}
          chrome={false} tags onMap={setMap} onCursor={onCursor} fitPadding={fitPadding} />}
      </div>

      <div className="left-tools">
        <div className="tool-group slip" role="group" aria-label="Move the map">
          <Tip label="Zoom in" side="right"><button type="button" onClick={() => map?.zoomIn()} aria-label="Zoom in"><Icon name="plus" /></button></Tip>
          <Tip label="Zoom out" side="right"><button type="button" onClick={() => map?.zoomOut()} aria-label="Zoom out"><Icon name="minus" /></button></Tip>
          <Tip label="Go to coordinates" side="right"><button type="button" onClick={() => setGoTo(true)} aria-label="Go to coordinates"><Icon name="location" /></button></Tip>
          {Math.abs(bearing) > 0.5 && (
            <Tip label="Face north (middle-drag turns the map)" side="right">
              <button type="button" className="compass" onClick={() => map?.easeTo({ bearing: 0, duration: 400 })} aria-label="Face north">
                <span style={{ transform: `rotate(${-bearing}deg)` }}><Icon name="north" /></span>
              </button>
            </Tip>
          )}
        </div>
        <div className="tool-group slip" role="group" aria-label="Tools">
          <Pop open={drawMenu} onOpenChange={setDrawMenu} side="right" align="start" label="Draw or choose an area"
            trigger={<button type="button" className={drawMenu || drawMode ? "is-active" : ""} aria-label="Draw or choose an area"><Icon name="draw" /></button>}>
            <div className="menu draw-menu">
              <p className="plate-mark">Draw</p>
              <button type="button" className={drawMode === "box" ? "is-active" : ""} onClick={() => startDraw("box")}>A box</button>
              <button type="button" className={drawMode === "polygon" ? "is-active" : ""} onClick={() => startDraw("polygon")}>A polygon</button>
              <button type="button" className={drawMode === "lasso" ? "is-active" : ""} onClick={() => startDraw("lasso")}>A free shape</button>
              {!coarse && <p className="marginal">Or on the map: right-drag for a box, Alt + right-drag for a free shape.</p>}
              {saved.length > 0 && <p className="plate-mark">Your areas</p>}
              {saved.map((a) => (
                <div key={a.id} className="menu-row">
                  <button type="button" className={JSON.stringify(a.shape) === shapeKey ? "is-active" : ""}
                    onClick={() => { setDrawMenu(false); setDrawMode(null); update({ shape: a.shape, area: null, month: null, panel: openResults }); }}>{a.name}</button>
                  <Tip label={`Forget ${a.name}`}><button type="button" className="icon-button" aria-label={`Forget ${a.name}`} onClick={() => forgetArea(a.id)}><Icon name="close" size={16} /></button></Tip>
                </div>
              ))}
              <p className="plate-mark">Presets</p>
              {(index?.areas ?? []).map((a) => (
                <button key={a.id} type="button" className={a.id === areaId ? "is-active" : ""} onClick={() => choose(a.id)}>{a.name}<span className="menu-aside">{a.country}</span></button>
              ))}
            </div>
          </Pop>
          <Tip label="Save the map as a PNG" side="right"><button type="button" onClick={capture} aria-label="Save the map as a PNG"><Icon name="capture" /></button></Tip>
          <Tip label="Copy a link to this view" side="right"><button type="button" onClick={share} aria-label="Copy a link to this view"><Icon name="share" /></button></Tip>
        </div>
      </div>

      <GoToDialog open={goTo} onOpenChange={setGoTo} shape={state.shape} onGo={goToPoint}
        onBox={(box) => { setGoTo(false); setDrawMode(null); update({ shape: box, area: null, month: null, panel: openResults }); }} />

      <div className="basemap">
        <Tip label={state.basemap === "satellite" ? "Switch to the Zij atlas" : "Switch to NASA satellite imagery"} side="right">
          <button type="button" className={`basemap-tile is-${state.basemap === "satellite" ? "atlas" : "satellite"}`}
            style={state.basemap === "satellite" ? undefined : { backgroundImage: `url("${satelliteThumb()}")` }}
            aria-label={state.basemap === "satellite" ? "Basemap: NASA satellite. Switch to the Zij atlas" : "Basemap: Zij atlas. Switch to NASA satellite imagery"}
            onClick={() => update({ basemap: state.basemap === "satellite" ? "zij" : "satellite" })}>
            <span>{state.basemap === "satellite" ? "Atlas" : "Satellite"}</span>
          </button>
        </Tip>
        <p className="map-credit">Fire data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth · Not affiliated with or endorsed by NASA</p>
      </div>

      {showHint && (
        <Paper as="div" kind="slip" seed="hint" className="first-hint" role="note">
          <p>{coarse ? "Press Draw to draw an area, or tap a named one." : <>Right-drag to draw a box · <kbd>Alt</kbd> + right-drag for a free shape · or click a named area</>}</p>
          <button type="button" className="icon-button" aria-label="Got it" onClick={readHint}><Icon name="close" size={16} /></button>
        </Paper>
      )}
      {drawMode && (
        <p className="map-hint slip" role="status">
          {drawMode === "box" ? "Drag a box, or click one corner and then the other." : drawMode === "lasso" ? "Hold and draw around the area." : "Click each corner; click the first point again to close the shape."}
          {" "}<button type="button" className="catchword" onClick={() => setDrawMode(null)}>Stop</button>
        </p>
      )}
      {selection && !drawMode && map && (
        <AreaMenu map={map} shape={selection} insets={insets} docked={docked} chips={chips}
          day={day} lastDay={lastDay} onDay={(next) => update({ day: next, days: null })}
          from={from} to={to} rangeMin={span ? `${span[0]}-01` : "2000-11-01"} onRange={(a, b) => update({ from: a, to: b })}
          timeline={state.timeline} onTimeline={() => update({ timeline: !state.timeline })}
          layers={{ viirs: !hidden("viirs"), modis: !hidden("modis"), outlines: !hidden("outlines"), counts: countsReady ? counts : null, onLayer: setLayer }}
          save={shapeKey && state.shape ? {
            saved: savedHere,
            onSave: (name) => { const a = saveArea(name, state.shape!); setToast(`Saved as ${a.name}: it is under Draw, Your areas.`); },
            onForget: (id) => { forgetArea(id); setToast("Forgotten."); },
          } : null}
          clearLabel={shapeKey ? "Clear the drawn area" : "Deselect the area"} onClear={() => update({ shape: null, area: null, month: null, day: null, days: null })} />
      )}
      {tourStep && state.tour && (
        <Paper as="section" kind="card" seed={`tour-${state.tour}`} className="tour" aria-label="Tour" aria-live="polite">
          <span className="pin" style={{ left: "50%", top: 12 }} aria-hidden="true" />
          <p className="plate-mark">Tour · {state.tour} of {TOUR.length}</p>
          <h2>{tourStep.title}</h2>
          <p>{tourStep.text}</p>
          <div className="tour-acts">
            <button type="button" className="catchword" disabled={state.tour === 1} onClick={() => goTour(state.tour! - 1)}>Back</button>
            {state.tour < TOUR.length
              ? <button type="button" className="stamp" onClick={() => goTour(state.tour! + 1)}>Next</button>
              : tourStep.link && <Link className="stamp" href={tourStep.link.href}>{tourStep.link.label}</Link>}
            <button type="button" className="catchword tour-skip" onClick={() => goTour(null)}>{state.tour < TOUR.length ? "Skip the tour" : "End the tour"}</button>
          </div>
        </Paper>
      )}
      {progress && <p className="map-progress slip" role="status">{progress}</p>}
      {toast && <p className="toast slip" role="status">{toast}</p>}

      {columnShown && (
        <aside ref={column} className={`results${wide ? " is-wide" : ""}`} aria-label="Results">
          <header className="results-head slip">
            <div className="results-title">
              <p className="eyebrow">Results</p>
              <h2>{areaName}</h2>
              {country && <span className="results-country">{shown ? `Drawn, ${country}` : country}</span>}
            </div>
            {!docked && (
              <Tip label={wide ? "Narrow Results" : "Widen to half the screen"} side="bottom">
                <button type="button" className="icon-button" onClick={() => update({ panel: wide ? "open" : "wide" })} aria-label={wide ? "Narrow Results" : "Widen Results to half the screen"}>
                  <Icon name={wide ? "shrink" : "expand"} />
                </button>
              </Tip>
            )}
            <Tip label="Fold Results away" side="bottom">
              <button type="button" className="icon-button" onClick={() => update({ panel: "closed" })} aria-label="Fold Results away"><Icon name="fold" /></button>
            </Tip>
          </header>
          {results}
        </aside>
      )}
      {hasColumn && closed && <button type="button" className="results-tab bookmark" onClick={() => update({ panel: "open" })}>Results</button>}

      {timelineShown && (
        <Timeline days={tlDays} day={day} counts={tlCounts}
          note={!dayArea ? "Choose an area to see its hotspots" : !range ? "Loading the hotspots…" : null}
          onDay={(next) => update({ day: next, days: null }, true)} onClose={() => update({ timeline: false })} />
      )}
    </div>
    </TooltipProvider>
  );
}
