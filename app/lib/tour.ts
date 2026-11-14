// The tour of Explore: the screen dims, one piece of the page is lit at a time, a card beside it says
// what it is for, and a drawn pointer shows the gesture (a click, a right-drag, a scroll) before the
// page answers as it would to a real one. It plays on the first visit and again from Help.
//
// Each step names the whole state of the app it starts from, so steps never inherit from each other
// and Back replays a step from its beginning. The lit piece stays live: the visitor can try it.
// components/Tour.tsx plays these steps; nothing here touches the page.

import type { AppState } from "./url";

/** What the drawn pointer does, in order, once a step is lit. */
export type Act =
  // Goes to a piece of the page and clicks it. `on` is a CSS selector, or "label:Name" for a named
  // area's tag on the map. `patch` is what the click does to the app; `real` clicks the element itself.
  | { kind: "press"; on: string; label?: string; patch?: Partial<AppState>; real?: boolean; then?: string | null; hold?: number }
  // Drags a box on the map over `shape`, then the shape is the chosen area.
  | { kind: "drag"; shape: [number, number, number, number]; patch: Partial<AppState>; hold?: number }
  // Scrolls a piece down and back, to show there is more.
  | { kind: "scroll"; on: string; by: number };

export interface TourStep {
  title: string;
  text: string;
  textTouch?: string; // said instead where there is no mouse
  try?: string; // what the visitor can do in the lit piece
  // The lit piece: CSS selectors, or "map" for the map left free by the papers; several are lit as one.
  // null dims the whole page and puts the card in the middle.
  target: string | null;
  state: Partial<AppState>;
  acts?: Act[];
  locked?: boolean; // the lit piece is shown, not live
  inside?: "bottom-left" | "top-left"; // the card lies on the lit piece, in this corner (it does anyway when there is no room beside)
}

// Everything a step does not set is put back to its default.
export const CLEAN: AppState = {
  area: null, shape: null, day: null, days: null, from: null, to: null, view: "calendar", month: null, year: null,
  basemap: "zij", hide: [], panel: "open", timeline: false, recorded: false, tour: null,
};

export const TOUR_AREA = "nile-delta";
const BOX: [number, number, number, number] = [30.5, 30.6, 31.5, 31.4];
const HERE: Partial<AppState> = { area: TOUR_AREA };

export const TOUR: TourStep[] = [
  {
    title: "Welcome to Zij",
    text: "Every fire the satellites have seen since 2000, put on one scale, so any week of any place can be held against its own past. Here is where everything is. It takes about a minute.",
    target: null,
    state: {},
  },
  {
    title: "The map is the page",
    text: "Drag to move, scroll to zoom. Each outlined box is a named area with its record ready: click one to open it.",
    textTouch: "Drag to move, pinch to zoom. Each outlined box is a named area with its record ready: tap one to open it.",
    try: "Try it: pick any area you like.",
    target: "map",
    state: {},
    acts: [{ kind: "press", on: `label:${TOUR_AREA}`, patch: HERE, hold: 1400 }],
    inside: "bottom-left",
  },
  {
    title: "Results, one paper per answer",
    text: "First the verdict: how unusual this month is for this place. Under it the calendar, the typical year, every season on one scale, the unusual ones, and the tables last.",
    try: "Try it: scroll the papers. The two buttons at the top widen Results or fold them away.",
    target: ".results",
    state: HERE,
    acts: [{ kind: "scroll", on: ".results", by: 560 }],
  },
  {
    title: "When to look",
    text: "This slip follows the chosen area. Today, the last 7 days, this month, this season or all years; or name any day since November 2000. A day or a week puts its hotspots on the map.",
    try: "Try it: press another one.",
    target: ".area-menu",
    state: HERE,
    acts: [{ kind: "press", on: '.chip[data-chip="7 days"]', patch: { days: 7 }, hold: 1200 }],
  },
  {
    title: "The timeline",
    text: "Step through the days one at a time, or play them. Each bar is a day's hotspots; the map and Results follow the day you stop on.",
    try: "Try it: drag the pointer along the days.",
    target: ".area-menu",
    state: { ...HERE, days: 7 },
    acts: [
      { kind: "press", on: '.area-menu button[aria-label="Timeline"]', patch: { timeline: true }, then: ".timeline", hold: 1100 },
      { kind: "press", on: ".timeline-play", real: true },
    ],
  },
  {
    title: "Draw your own area",
    text: "The answer is not only for the named areas. Right-drag anywhere on the map for a box, or hold Alt for a free shape. Draw, at the left, has polygons, the named areas and the ones you save. Your shape's record is fitted here, in your browser.",
    textTouch: "The answer is not only for the named areas. Press Draw, at the top, choose a box, and drag it on the map. Draw also has polygons, the named areas and the ones you save. Your shape's record is fitted here, in your browser.",
    try: "Try it: draw one anywhere in Egypt, mainland Portugal or Argentina.",
    target: 'map, [data-tour="draw"]',
    state: {},
    acts: [{ kind: "drag", shape: BOX, patch: { shape: BOX }, hold: 1200 }],
    inside: "bottom-left",
  },
  {
    title: "Atlas or satellite",
    text: "The map is a drawn atlas. This tile lays NASA's cloud-free satellite picture under the same marks, and brings the atlas back.",
    target: ".basemap-tile",
    state: { ...HERE, day: null, days: 7 },
    acts: [{ kind: "press", on: ".basemap-tile", patch: { basemap: "satellite" }, hold: 1200 }],
  },
  {
    title: "Move, keep, share",
    text: "Zoom, and go to any coordinates. Then Draw; save the map as a picture; and copy a link. Everything on screen is in the address, so the link opens this exact view for anyone.",
    target: ".left-tools",
    state: HERE,
    locked: true,
  },
  {
    title: "The numbers, and this tour",
    text: "Downloads has every series as a file: weekly and monthly values with their ranges, and the single hotspots. Help plays this tour again and explains how the one scale is made. The map is yours.",
    target: ".strip nav",
    state: HERE,
    locked: true,
  },
];
