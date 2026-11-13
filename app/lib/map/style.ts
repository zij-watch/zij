// All basemap styling lives in this file.
// getBasemapStyle(basemap) is the only place a basemap style is made or swapped:
// to give the map a new look, change this file (and the atlas it builds on) and nothing else.
// Data layers (lib/map/layers.ts) are added on top of whatever this returns.
//
// The "Zij" basemap is the Zij atlas (lib/map/atlas, from github.com/zij-watch/zij-map): a sheet
// drawn from the design tokens and two map pigments, with Natural Earth data served from
// /atlas and names set in the Zij faces. It needs no outside service: the atlas can also shade
// terrain from elevation tiles on the network, and that is switched off here.
// The app has one theme, Folio, so the atlas is always asked for its paper sheet.

import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { COLOURS } from "../tokens";
import { drawingImages, illustrationFeatures } from "./atlas/illustrations";
import { patternImages, putImages, rasterize, signImages, type RasterImage } from "./atlas/images";
import { resolvePalette } from "./atlas/palette";
import { buildStyle, DEFAULT_LAYERS, fontFaces, FONT } from "./atlas/style";
import { attachDetail, tiered } from "./detail";

export type Basemap = "zij" | "satellite";

export const BASEMAPS: { id: Basemap; label: string }[] = [
  { id: "zij", label: "Zij" },
  { id: "satellite", label: "Satellite" },
];

export interface BasemapOptions {
  /** Names of places, countries, seas and rivers. On unless set to false. */
  labels?: boolean;
}

const ATLAS = "/atlas";
export const MAX_ZOOM = 9;

// NASA GIBS true-colour layers, by the dates each one covers.
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
function gibsLayer(date: string): string {
  if (date < "2012-01-20") return "MODIS_Terra_CorrectedReflectance_TrueColor";
  if (date <= "2026-11-01") return "VIIRS_SNPP_CorrectedReflectance_TrueColor";
  return "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
}

const hasText = (layer: StyleSpecification["layers"][number]) =>
  layer.type === "symbol" && layer.layout !== undefined && "text-field" in layer.layout;

/** The "Zij" basemap: the atlas sheet. Everything it reads is served by this site. */
function zijStyle(options: BasemapOptions): StyleSpecification {
  const style = buildStyle({
    theme: "folio", // the app has one theme
    mode: "app",
    lang: "en",
    base: ATLAS,
    maxZoom: MAX_ZOOM,
    layers: { ...DEFAULT_LAYERS, hillshade: false }, // no elevation tiles from the network
    demTiles: undefined,
    illustrationData: illustrationFeatures(),
  });
  if (options.labels === false) style.layers = style.layers.filter((layer) => !hasText(layer));
  // A light world first, the detail by region: see ./detail.ts.
  return tiered(style);
}

/** The "Satellite" basemap: NASA GIBS true colour for one day, with borders and place names on top. */
function satelliteStyle(date: string, options: BasemapOptions): StyleSpecification {
  const c = COLOURS;
  const style: StyleSpecification = {
    version: 8,
    "font-faces": fontFaces(ATLAS),
    sources: {
      gibs: {
        type: "raster",
        tiles: [`${GIBS}/${gibsLayer(date)}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`],
        tileSize: 256,
        maxzoom: 9,
        attribution: "Imagery: NASA GIBS",
      },
      countries: { type: "geojson", data: "/data/basemap/countries.json", attribution: "Outlines: Natural Earth" },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": c.sky } },
      { id: "imagery", type: "raster", source: "gibs" },
      { id: "borders", type: "line", source: "countries", paint: { "line-color": c.ink, "line-opacity": 0.5, "line-width": 0.75 } },
    ],
  };
  if (options.labels !== false) {
    style.sources["zij-places"] = { type: "geojson", data: `${ATLAS}/world/places.json`, maxzoom: 9 };
    style.layers.push({
      id: "zij-places",
      type: "symbol",
      source: "zij-places",
      filter: ["<=", ["-", ["get", "minzoom"], 1.4], ["zoom"]],
      layout: {
        "text-field": ["coalesce", ["get", "name"], ""],
        "text-font": [FONT.text], // regular weight: imagery is busy enough
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 9, 16],
        "text-padding": 4,
        "symbol-sort-key": ["get", "rank"],
      },
      // Imagery is dark or bright by turns, so names are always light ink on a dark halo.
      paint: { "text-color": COLOURS["ground-raised"], "text-halo-color": "rgba(16, 12, 9, 0.7)", "text-halo-width": 0.9 },
    });
    return tiered(style);
  }
  return style;
}

/**
 * The style of a basemap. `date` (YYYY-MM-DD) is used by the satellite basemap only.
 */
export function getBasemapStyle(basemap: Basemap, date?: string, options: BasemapOptions = {}): StyleSpecification {
  if (basemap === "satellite" && date) return satelliteStyle(date, options);
  return zijStyle(options);
}

let drawn: Promise<Map<string, RasterImage>> | null = null;
function basemapImages(): Promise<Map<string, RasterImage>> {
  let images = drawn;
  if (!images) {
    const palette = resolvePalette("folio");
    images = Promise.all([
      rasterize([...patternImages(palette), ...signImages(palette)], 2),
      rasterize(drawingImages(palette), 3),
    ]).then(([small, big]) => new Map([...small, ...big]));
    drawn = images;
  }
  return images;
}

/**
 * The patterns, signs and drawings the Zij basemap refers to, drawn in the browser from the palette
 * and handed to the map. Call it after every style change; it is cheap the second time.
 */
export async function prepareBasemap(map: MapLibreMap, basemap: Basemap, date?: string): Promise<void> {
  attachDetail(map);
  if (basemap === "satellite" && date) return;
  const images = await basemapImages();
  try {
    putImages(map, images);
  } catch {
    // the map was removed, or its style is not ready: the next style load calls this again
  }
}
