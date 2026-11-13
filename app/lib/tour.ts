// The 60-second tour: six steps, each one a state of the app that a link can reproduce.
// The step is in the URL (?tour=1 to 6); moving to a step sets the whole state it needs, so the
// tour can be entered at any step, skipped at any step, and replayed from Help.

import type { AppState } from "./url";

export interface TourStep {
  title: string;
  text: string;
  state: Partial<AppState>;
  link?: { href: string; label: string }; // the last step leaves the map
}

// Everything a step does not set is put back to its default, so steps never inherit from each other.
const CLEAN: Partial<AppState> = {
  area: null, shape: null, day: null, days: null, from: null, to: null, view: "calendar", month: null, year: null,
  basemap: "zij", hide: [], panel: "open", timeline: false, mode: "simple", recorded: false,
};

export const TOUR: TourStep[] = [
  {
    title: "The jump",
    text: "The Nile Delta's burning seasons as the satellites recorded them: MODIS in blue until 2011, VIIRS in red from 2012. The record leaps in one year. Nothing changed on the ground. The instrument did: VIIRS sees much smaller fires.",
    state: { area: "nile-delta", mode: "expert", view: "series", recorded: true },
  },
  {
    title: "The correction",
    text: "The same seasons on one scale. Zij learns, from the years both flew, what VIIRS would have counted when MODIS counted a given amount. The ink whiskers are the likely range of each year converted from MODIS.",
    state: { area: "nile-delta", mode: "expert", view: "series" },
  },
  {
    title: "2018, found on its own",
    text: "Nobody told Zij about 2018. On one scale it stands out by itself: the quietest burning season of the record, far below the usual range. These are the seasons the record flags as unusual.",
    state: { area: "nile-delta", mode: "expert", view: "anomalies" },
  },
  {
    title: "The Chilecito fire",
    text: "29 July 2026, Argentina. Each dot is a VIIRS detection and each ring a MODIS one, over that day's satellite picture. The panel says how unusual the day's week and month were for this place.",
    state: { area: "chilecito", day: "2026-07-29", basemap: "satellite" },
  },
  {
    title: "Draw your own area",
    text: "The answer is not only for the ten areas. This box was drawn on the map, and its record was fitted in your browser. Press Draw to make your own, anywhere in Egypt, mainland Portugal or Argentina.",
    state: { shape: [30.5, 30.6, 31.5, 31.4] },
  },
  {
    title: "Take the numbers with you",
    text: "Every series is a download: weekly and monthly values with their bands as CSV, the calendar as a picture, and the single hotspots of any range. The tour ends here. The map is yours.",
    state: { area: "nile-delta" },
    link: { href: "/downloads?area=nile-delta", label: "Open Downloads" },
  },
];

export const tourState = (step: number): Partial<AppState> => ({ ...CLEAN, ...TOUR[step - 1].state, tour: step });
