"use client";

// The state of the app lives in the URL, so a link reproduces what is on screen:
//   ?area=nile-delta&from=2000-11&to=2026-11&view=calendar&month=2018-10&basemap=satellite

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { Basemap } from "./map/style";

export const VIEWS = ["calendar", "typical", "ranked", "anomalies"] as const;
export type View = (typeof VIEWS)[number];

export interface AppState {
  area: string | null;
  from: string | null; // YYYY-MM
  to: string | null; // YYYY-MM
  view: View;
  month: string | null; // YYYY-MM, the month opened for weekly detail
  basemap: Basemap;
}

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
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
      for (const [key, value] of Object.entries(patch)) {
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
