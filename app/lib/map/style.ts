// All basemap styling lives in this file, built from the design tokens.
// getBasemapStyle(theme, basemap) is the only place a basemap style is made or swapped:
// to give the map a new look, change this file and nothing else.
// Data layers (lib/map/layers.ts) are added on top of whatever this returns.

import type { StyleSpecification } from "maplibre-gl";
import { COLOURS, type Theme } from "../tokens";

export type Basemap = "zij" | "satellite";

export const BASEMAPS: { id: Basemap; label: string }[] = [
  { id: "zij", label: "Zij" },
  { id: "satellite", label: "Satellite" },
];

const COUNTRIES_URL = "/data/basemap/countries.json";

// NASA GIBS true-colour layers, by the dates each one covers.
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
function gibsLayer(date: string): string {
  if (date < "2012-01-20") return "MODIS_Terra_CorrectedReflectance_TrueColor";
  if (date <= "2026-11-01") return "VIIRS_SNPP_CorrectedReflectance_TrueColor";
  return "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
}

/** The "Zij" basemap: Natural Earth outlines drawn from tokens. Works offline. */
function zijStyle(theme: Theme): StyleSpecification {
  const c = COLOURS[theme];
  return {
    version: 8,
    sources: {
      countries: { type: "geojson", data: COUNTRIES_URL, attribution: "Outlines: Natural Earth" },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": c.sky } },
      { id: "land", type: "fill", source: "countries", paint: { "fill-color": c["ground-raised"] } },
      {
        id: "borders",
        type: "line",
        source: "countries",
        paint: { "line-color": c.rule, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 8, 1.25] },
      },
    ],
  };
}

/** The "Satellite" basemap: NASA GIBS true colour for one day, with the outlines on top. */
function satelliteStyle(theme: Theme, date: string): StyleSpecification {
  const c = COLOURS[theme];
  return {
    version: 8,
    sources: {
      gibs: {
        type: "raster",
        tiles: [`${GIBS}/${gibsLayer(date)}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`],
        tileSize: 256,
        maxzoom: 9,
        attribution: "Imagery: NASA GIBS",
      },
      countries: { type: "geojson", data: COUNTRIES_URL, attribution: "Outlines: Natural Earth" },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": c.sky } },
      { id: "imagery", type: "raster", source: "gibs" },
      { id: "borders", type: "line", source: "countries", paint: { "line-color": c.ink, "line-opacity": 0.5, "line-width": 0.75 } },
    ],
  };
}

/**
 * The style of a basemap. `date` (YYYY-MM-DD) is used by the satellite basemap only.
 */
export function getBasemapStyle(theme: Theme, basemap: Basemap, date?: string): StyleSpecification {
  if (basemap === "satellite" && date) return satelliteStyle(theme, date);
  return zijStyle(theme);
}
