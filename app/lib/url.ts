"use client";

// The state of the app lives in the URL, so a link reproduces what is on screen:
//   ?area=nile-delta&from=2000-11&to=2026-11&view=calendar&month=2018-10&basemap=satellite

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { Shape } from "./fit/cells";
import type { Basemap } from "./map/style";

export const VIEWS = ["calendar", "typical", "series", "ranked", "anomalies"] as const;
export type View = (typeof VIEWS)[number];

export interface AppState {
  area: string | null;
  from: string | null; // YYYY-MM
  to: string | null; // YYYY-MM
  view: View;
  month: string | null; // YYYY-MM, the month opened for weekly detail
  basemap: Basemap;
  shape: Shape | null; // a drawn box (?box=w,s,e,n) or polygon (?poly=lon,lat;lon,lat;...)
  year: number | null; // the year drawn over the typical year
  day: string | null; // YYYY-MM-DD, the day view
}

/** The drawn shape as URL parameters. */
export function shapeParams(shape: Shape | null): { box: string | null; poly: string | null } {
  if (!shape) return { box: null, poly: null };
  if (Array.isArray(shape)) return { box: shape.map((v) => +v.toFixed(3)).join(","), poly: null };
  const ring = shape.coordinates[0].slice(0, -1);
  return { box: null, poly: ring.map(([x, y]) => `${+x.toFixed(3)},${+y.toFixed(3)}`).join(";") };
}

function parseShape(params: URLSearchParams): Shape | null {
  const box = params.get("box")?.split(",").map(Number);
  if (box && box.length === 4 && box.every(Number.isFinite) && box[0] < box[2] && box[1] < box[3]) {
    return box as [number, number, number, number];
  }
  const points = params.get("poly")?.split(";").map((pair) => pair.split(",").map(Number));
  if (points && points.length >= 3 && points.length <= 200 && points.every((q) => q.length === 2 && q.every(Number.isFinite))) {
    return { type: "Polygon", coordinates: [[...points, points[0]]] };
  }
  return null;
}

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ID = /^[a-z0-9-]{1,60}$/;

export function parseState(params: URLSearchParams): AppState {
  const pick = (key: string, pattern: RegExp) => {
    const value = params.get(key);
    return value && pattern.test(value) ? value : null;
  };
  const view = params.get("view") as View;
  return {
    area: pick("area", ID),
    from: pick("from", YM),
    to: pick("to", YM),
    view: VIEWS.includes(view) ? view : "calendar",
    month: pick("month", YM),
    basemap: params.get("basemap") === "satellite" ? "satellite" : "zij",
    shape: parseShape(params),
    day: pick("day", YMD),
    year: /^\d{4}$/.test(params.get("year") ?? "") ? Number(params.get("year")) : null,
  };
}

export function useAppState(): [AppState, (patch: Partial<AppState>) => void, string] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(() => parseState(new URLSearchParams(params.toString())), [params]);
  const query = params.toString();
  const update = useCallback(
    (patch: Partial<AppState>) => {
      const next = new URLSearchParams(params.toString());
      const { shape, ...rest } = patch;
      if (shape !== undefined) {
        for (const [key, value] of Object.entries(shapeParams(shape))) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
      }
      for (const [key, value] of Object.entries(rest)) {
        const isDefault = value === null || (key === "view" && value === "calendar") || (key === "basemap" && value === "zij");
        if (isDefault) next.delete(key);
        else next.set(key, String(value));
      }
      const text = next.toString();
      router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
  return [state, update, query];
}
