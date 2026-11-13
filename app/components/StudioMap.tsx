"use client";

// The map alone, for recording: no top bar, no panel, no controls, no cursor.
// Everything is set by the URL. The parameters are written up in docs/event/STUDIO.md.

import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadIndex, type AreaIndexEntry, type Index } from "@/lib/data";
import { loadHotspotDays } from "@/lib/dayData";
import { boundsOf, type Shape } from "@/lib/fit/cells";
import type { DayHotspot } from "@/lib/hotspots/day";
import { easeLamp } from "@/lib/map/atlas/camera";
import type { Theme } from "@/lib/tokens";
import { parseState } from "@/lib/url";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const NONE: DayHotspot[] = [];
const noop = () => {};

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to) && out.length < 400; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function number(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = params.get(key);
  const value = raw === null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Tell a recorder where the map is: loading, ready, flying, playing or done (on <html data-studio>). */
function mark(status: string) {
  document.documentElement.dataset.studio = status;
}

export default function StudioMap() {
  const search = useSearchParams();
  const params = useMemo(() => new URLSearchParams(search.toString()), [search]);
  const state = useMemo(() => parseState(params), [params]);

  const theme: Theme = params.get("theme") === "folio" ? "folio" : "night";
  const off = (key: string) => ["0", "off", "false", "no"].includes(params.get(key) ?? "");
  const showHotspots = !off("hotspots");
  const labels = !off("labels");
  const outline = !off("outline");
  const caption = ["1", "on", "true", "yes"].includes(params.get("caption") ?? "");
  const pad = number(params, "pad", 120, 0, 400);
  const pace = number(params, "pace", 800, 100, 10000);
  const flyMs = number(params, "flyms", 6000, 500, 60000);
  const delay = number(params, "delay", 1500, 0, 30000);
  const bearing = number(params, "bearing", 0, -180, 180);
  const pitch = number(params, "pitch", 0, 0, 60);
  const flyTo = /^[a-z0-9-]{1,60}$/.test(params.get("fly") ?? "") ? params.get("fly") : null;

  const centre = (params.get("centre") ?? params.get("center"))?.split(",").map(Number);
  const hasCentre = !!centre && centre.length === 2 && centre.every(Number.isFinite);
  const zoom = number(params, "zoom", NaN, 0, 9);

  const play = useMemo(() => {
    const [from, to] = (params.get("play") ?? "").split(",");
    return from && to && YMD.test(from) && YMD.test(to) && from <= to ? daysBetween(from, to) : null;
  }, [params]);

  const [index, setIndex] = useState<Index | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [days, setDays] = useState<Map<string, DayHotspot[]> | null>(null);
  const [step, setStep] = useState(0);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    mark("loading");
    loadIndex().then(setIndex, (error) => setFailed(String(error.message ?? error)));
  }, []);

  const find = (id: string | null): AreaIndexEntry | null => index?.areas.find((a) => a.id === id) ?? null;
  // The area whose outline and hotspots are shown: the one named, or the one flown to.
  const area = find(state.area) ?? (state.shape ? null : find(flyTo));
  const shape: Shape | null = state.shape ?? area?.box ?? null;
  const shapeKey = shape ? JSON.stringify(shape) : "";
  const dates = useMemo(() => play ?? (state.day ? [state.day] : []), [play, state.day]);
  const date = dates[Math.min(step, dates.length - 1)] ?? null;

  // Every day is loaded before anything moves, so the pace is steady.
  useEffect(() => {
    if (!index) return;
    if (!shape || !showHotspots || dates.length === 0) {
      setDays(new Map());
      return;
    }
    let cancelled = false;
    loadHotspotDays(shape, dates[0], dates[dates.length - 1]).then(
      (loaded) => !cancelled && setDays(loaded),
      (error) => !cancelled && setFailed(String(error.message ?? error)),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, shapeKey, showHotspots, dates]);

  // Where the map opens: the centre and zoom if given, else the area or box, else the world.
  const opening = shape ? boundsOf(shape) : null;
  const onMap = useCallback(
    (loaded: MapLibreMap) => {
      if (opening && !(hasCentre || Number.isFinite(zoom)) && !(flyTo && !state.area && !state.shape)) {
        loaded.fitBounds([[opening[0], opening[1]], [opening[2], opening[3]]], { padding: pad, duration: 0, bearing, pitch });
      }
      setMap(loaded);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapeKey],
  );

  // The run: wait for the map and the data, hold for `delay`, fly if asked, then play if asked.
  const started = useRef(false);
  useEffect(() => {
    if (!map || !days || started.current) return;
    started.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ticker: ReturnType<typeof setInterval> | null = null;
    const target = find(flyTo);
    const playDays = () => {
      if (!play || play.length < 2) return mark("done");
      mark("playing");
      let i = 0;
      ticker = setInterval(() => {
        i += 1;
        setStep(i);
        if (i >= play.length - 1) {
          if (ticker) clearInterval(ticker);
          timer = setTimeout(() => mark("done"), pace);
        }
      }, pace);
    };
    let begun = false;
    const begin = () => {
      if (begun) return;
      begun = true;
      mark("ready");
      timer = setTimeout(() => {
        if (!target) return playDays();
        mark("flying");
        map.once("moveend", playDays);
        const [w, s, e, n] = target.box;
        map.fitBounds([[w, s], [e, n]], { padding: pad, duration: flyMs, easing: easeLamp, essential: true, bearing, pitch });
      }, delay);
    };
    if (map.loaded() && !map.isMoving()) begin();
    else map.once("idle", begin);
    // Satellite tiles can be slow or missing; the run starts anyway after 8 seconds.
    const patience = setTimeout(begin, 8000);
    return () => {
      clearTimeout(patience);
      if (timer) clearTimeout(timer);
      if (ticker) clearInterval(ticker);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, days]);

  if (failed) return <main className="studio" data-theme={theme}><p className="studio-note">{failed}</p></main>;
  const hotspots = (showHotspots && date && days?.get(date)) || NONE;
  const view = hasCentre || Number.isFinite(zoom)
    ? { center: (hasCentre ? centre : [10, 15]) as [number, number], zoom: Number.isFinite(zoom) ? zoom : 1.6, bearing, pitch }
    : { center: [10, 15] as [number, number], zoom: 1.6, bearing, pitch };

  return (
    <main className="studio" data-theme={theme}>
      {index && (
        <MapView
          theme={theme}
          basemap={state.basemap}
          date={date ?? index.last_full_day}
          areas={outline && area ? [area] : []}
          selected={area?.id ?? null}
          onSelect={noop}
          shape={outline ? state.shape : null}
          drawMode={null}
          onDraft={noop}
          onDrawn={noop}
          hotspots={hotspots}
          labels={labels}
          chrome={false}
          interactive={false}
          follow={false}
          view={view}
          onMap={onMap}
        />
      )}
      {caption && date && <p className="studio-caption">{LONG_DATE.format(new Date(`${date}T00:00:00Z`))}</p>}
    </main>
  );
}
