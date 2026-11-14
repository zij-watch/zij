"use client";

// The film v3.1's first surface: NASA's picture of the Delta on 20 October 2023 (GIBS true colour,
// the app's satellite basemap), printed with a white border and lying on the desk. Its fire dots
// ink in while it fills the frame; on its border, in ink, the team and the challenge. As the dots
// lift off and fly to the record sheet, they leave the photo.

import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DayResult } from "@/lib/dayData";
import { clamp } from "@/lib/film/timeline";
import { PHOTO, type Beats31 } from "@/lib/film/v31";
import type { DayHotspot } from "@/lib/hotspots/day";
import { fitBox, type View } from "@/lib/map/atlas/camera";
import { mapProps, useIdle } from "../board/Maps";
import { inked, useDriver, useFilm, useReady, useT } from "../kit";

const MapView = dynamic(() => import("../../MapView"), { ssr: false });
const NONE: DayHotspot[] = [];
const NO_AREAS: never[] = [];
/** The Nile Delta, the app's preset box. */
export const DELTA: [number, number, number, number] = [29.8, 30.0, 32.3, 31.6];
export const PHOTO_VIEW: View = fitBox(DELTA, PHOTO.w, PHOTO.h, 20);

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
/** A place on the photo's picture, in its pixels. */
export function onPhoto(lon: number, lat: number): [number, number] {
  const world = 512 * 2 ** PHOTO_VIEW.zoom;
  return [PHOTO.w / 2 + (mercX(lon) - mercX(PHOTO_VIEW.center[0])) * world, PHOTO.h / 2 + (mercY(lat) - mercY(PHOTO_VIEW.center[1])) * world];
}
/** The day's dots in the order the satellites saw them. */
export const daySorted = (dayResult: DayResult) => [...dayResult.view.hotspots].sort((a, c) => a.time_utc.localeCompare(c.time_utc) || a.longitude - c.longitude);

export function Photo({ b, day, dayResult }: { b: Beats31; day: string; dayResult: DayResult }) {
  const t = useT();
  const { warn } = useFilm();
  const idle = useIdle();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [settled, setSettled] = useState(false);
  const applied = useRef(-1);
  const dots = useMemo(() => daySorted(dayResult), [dayResult]);
  // In over the opening; then, as the flight starts, they leave the photo.
  const countAt = useCallback((time: number) => {
    const inn = clamp((time - b.dots[0]) / (b.dots[1] - b.dots[0]));
    const out = clamp((time - b.flyModis[0]) / (b.flyViirs + 0.1 - b.flyModis[0]));
    return Math.round(dots.length * inn * (1 - out));
  }, [dots, b]);
  const count = countAt(t);
  const shown = useMemo(() => (count === 0 ? NONE : dots.slice(dots.length - count)), [dots, count]);

  const onMap = useCallback((m: MapLibreMap) => {
    m.on("error", (event) => warn(`photo: ${event.error?.message ?? "error"}`));
    setMap(m);
  }, [warn]);
  useEffect(() => {
    if (!map) return;
    let live = true;
    idle(map, "photo").then(() => live && setSettled(true));
    return () => {
      live = false;
    };
  }, [map, idle]);
  useReady("photo", settled);
  useDriver(async (time) => {
    if (map && countAt(time) !== applied.current) {
      applied.current = countAt(time);
      await idle(map, "photo");
    }
  });

  return (
    <div className="v31-photo">
      <div className="v31-picture" style={{ left: PHOTO.x, top: PHOTO.y, width: PHOTO.w, height: PHOTO.h }}>
        <MapView {...mapProps} basemap="satellite" date={day} areas={NO_AREAS} selected={null} tags={false} shape={null} hotspots={shown} view={PHOTO_VIEW} onMap={onMap} />
      </div>
      <p className="v31-photo-team" style={inked(t, b.text[0], 0.35)}>Team Zij · Cairo</p>
      <p className="v31-photo-challenge" style={inked(t, b.text[1], 0.45)}>Harmonization of MODIS and VIIRS Hot Spots</p>
    </div>
  );
}
