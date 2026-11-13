// buildStyle(options) → a complete MapLibre style for the Zij atlas.
// Pure function, no DOM: safe to call on a server, in a script, or in the browser.
import type {
  ExpressionSpecification,
  FontFacesSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { mix, resolvePalette, rgba, type Palette, type PaletteOverrides, type Theme } from './palette';

export type Lang = 'en' | 'ar' | 'both';
export type Mode = 'app' | 'display';

export interface LayerToggles {
  /** Real terrain shading from elevation tiles (needs the network unless tiles are packaged). */
  hillshade: boolean;
  /** Drawn hills placed inside mountain ranges, the old-atlas way. */
  hills: boolean;
  deserts: boolean;
  cultivated: boolean;
  /** How many echo lines follow the coast out to sea (0–4). */
  waterLining: number;
  seaLines: boolean;
  coastTint: boolean;
  rivers: boolean;
  lakes: boolean;
  borders: boolean;
  graticule: boolean;
  places: boolean;
  countries: boolean;
  regions: boolean;
  marine: boolean;
  peaks: boolean;
  illustrations: boolean;
}

/** OpenStreetMap detail pack. Not built yet: the shape is fixed so consumers can already pass it. */
export interface OsmDetail {
  roads: 'none' | 'major' | 'all';
  canals: boolean;
  towns: boolean;
  landuse: boolean;
}

export interface AtlasOptions {
  theme: Theme;
  mode: Mode;
  lang: Lang;
  /** Where public/atlas is served from. No trailing slash. */
  base: string;
  layers: LayerToggles;
  detail: { osm: false | OsmDetail };
  palette?: PaletteOverrides;
  /** Elevation tiles (Terrarium encoding) for the hillshade. */
  demTiles?: string;
  /** Largest zoom the app allows; place density is tuned up to here. */
  maxZoom?: number;
  /** Placed drawings, as built by illustrationFeatures(). */
  illustrationData?: GeoJSON.FeatureCollection;
}

export const DEFAULT_LAYERS: LayerToggles = {
  hillshade: true,
  hills: true,
  deserts: true,
  cultivated: true,
  waterLining: 3,
  seaLines: true,
  coastTint: true,
  rivers: true,
  lakes: true,
  borders: true,
  graticule: true,
  places: true,
  countries: true,
  regions: true,
  marine: true,
  peaks: true,
  illustrations: true,
};

export const DEFAULT_DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const DEFAULT_OPTIONS: AtlasOptions = {
  theme: 'folio',
  mode: 'app',
  lang: 'en',
  base: '/atlas',
  layers: DEFAULT_LAYERS,
  detail: { osm: false },
  demTiles: DEFAULT_DEM,
  maxZoom: 11,
};

/** Layers the app inserts its own layers before, e.g. map.addLayer(hotspots, SLOTS.data). */
export const SLOTS = {
  /** Above land, water and relief; below illustrations and every label. Hotspots, grid cells. */
  data: 'zij-slot-data',
  /** Above data, below labels. Selected areas, drawn boxes. */
  selection: 'zij-slot-selection',
  /** Above everything in the style. Thread, cursors. */
  top: 'zij-slot-top',
} as const;

export const FONT = {
  text: 'Zij Text',
  textItalic: 'Zij Text Italic',
  textBold: 'Zij Text Bold',
  display: 'Zij Display',
  displayItalic: 'Zij Display Italic',
} as const;

const LATIN = ['U+0000-00FF', 'U+0131', 'U+0152-0153', 'U+02BB-02BC', 'U+02C6', 'U+02DA', 'U+02DC', 'U+2000-206F', 'U+20AC', 'U+2122', 'U+2212'];
const LATIN_EXT = ['U+0100-02BA', 'U+02BD-02C5', 'U+02C7-02CC', 'U+02CE-02D7', 'U+02DD-02FF', 'U+1E00-1E9F', 'U+1EF2-1EFF', 'U+2C60-2C7F', 'U+A720-A7FF'];
const ARABIC = ['U+0600-06FF', 'U+0750-077F', 'U+0870-08FF', 'U+200C-200E', 'U+FB50-FDFF', 'U+FE70-FEFC'];

/** The Zij faces, drawn by MapLibre straight from the font files: no glyph server. */
export function fontFaces(base: string): FontFacesSpecification {
  const f = (name: string) => `${base}/fonts/${name}.woff2`;
  const arabicText = { url: f('amiri-arabic-400-normal'), 'unicode-range': ARABIC };
  return {
    [FONT.text]: [
      { url: f('amiri-latin-400-normal'), 'unicode-range': LATIN },
      { url: f('amiri-latin-ext-400-normal'), 'unicode-range': LATIN_EXT },
      arabicText,
    ],
    [FONT.textItalic]: [
      { url: f('amiri-latin-400-italic'), 'unicode-range': LATIN },
      { url: f('amiri-latin-ext-400-italic'), 'unicode-range': LATIN_EXT },
      arabicText,
    ],
    [FONT.textBold]: [
      { url: f('amiri-latin-700-normal'), 'unicode-range': LATIN },
      { url: f('amiri-latin-ext-400-normal'), 'unicode-range': LATIN_EXT },
      { url: f('amiri-arabic-700-normal'), 'unicode-range': ARABIC },
    ],
    [FONT.display]: [
      { url: f('cormorant-garamond-latin-600-normal'), 'unicode-range': LATIN },
      { url: f('cormorant-garamond-latin-ext-600-normal'), 'unicode-range': LATIN_EXT },
      { url: f('reem-kufi-arabic-500-normal'), 'unicode-range': ARABIC },
    ],
    [FONT.displayItalic]: [
      { url: f('cormorant-garamond-latin-500-italic'), 'unicode-range': LATIN },
      { url: f('cormorant-garamond-latin-ext-500-italic'), 'unicode-range': LATIN_EXT },
      arabicText,
    ],
  };
}

type Expr = ExpressionSpecification;

const nameField = (lang: Lang, secondaryScale = 0.86): Expr => {
  const en: Expr = ['coalesce', ['get', 'name'], ''];
  const ar: Expr = ['coalesce', ['get', 'name_ar'], ['get', 'name'], ''];
  if (lang === 'en') return en;
  if (lang === 'ar') return ar;
  return [
    'case',
    ['==', ['get', 'name_ar'], ['get', 'name']],
    en,
    ['format', en, {}, '\n', {}, ar, { 'font-scale': secondaryScale, 'text-font': ['literal', [FONT.text]] }],
  ] as Expr;
};

/** Letter-spacing and capitals break Arabic joining, so they only apply to Latin labels. */
const latinOnly = <T, F>(lang: Lang, value: T, fallback: F): T | F => (lang === 'ar' ? fallback : value);

function graticule(step: number) {
  const features: GeoJSON.Feature[] = [];
  for (let lng = -180; lng <= 180; lng += step) {
    features.push({ type: 'Feature', properties: { v: lng, axis: 'x' }, geometry: { type: 'LineString', coordinates: [[lng, -85], [lng, -40], [lng, 0], [lng, 40], [lng, 85]] } });
  }
  for (let lat = -80; lat <= 80; lat += step) {
    const coords: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 30) coords.push([lng, lat]);
    features.push({ type: 'Feature', properties: { v: lat, axis: 'y' }, geometry: { type: 'LineString', coordinates: coords } });
  }
  return { type: 'FeatureCollection' as const, features };
}

export function buildStyle(input: Partial<AtlasOptions> = {}): StyleSpecification {
  const o: AtlasOptions = { ...DEFAULT_OPTIONS, ...input, layers: { ...DEFAULT_LAYERS, ...input.layers } };
  const p: Palette = resolvePalette(o.theme, o.palette);
  const L = o.layers;
  const night = o.theme === 'night';
  const url = (name: string) => `${o.base}/${name}.json`;
  const halo = { 'text-halo-color': rgba(p.land, 0.85), 'text-halo-width': 1.3, 'text-halo-blur': 0.6 } as const;
  const seaHalo = { 'text-halo-color': rgba(p.sea, 0.8), 'text-halo-width': 1.2, 'text-halo-blur': 0.6 } as const;

  const sources: Record<string, SourceSpecification> = {
    'zij-empty': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'zij-land': { type: 'geojson', data: url('land'), buffer: 256, tolerance: 0.3, maxzoom: 10, attribution: 'Made with Natural Earth' },
  };
  const layers: LayerSpecification[] = [];

  // ---- Sea --------------------------------------------------------------------------------
  layers.push({ id: 'zij-sea', type: 'background', paint: { 'background-color': p.sea } });
  if (L.seaLines) {
    layers.push({
      id: 'zij-sea-lines',
      type: 'background',
      paint: { 'background-pattern': 'zij-sea-lines', 'background-opacity': night ? 0.22 : 0.55 },
    });
  }

  // Water lining: echoes of the coast fading out to sea. Drawn under the land so only the
  // seaward side shows (a negative offset is an outset on polygon outlines).
  const lining = Math.max(0, Math.min(4, Math.round(L.waterLining)));
  for (let i = lining; i >= 1; i--) {
    const off = [0, 3, 7.5, 13, 20][i];
    layers.push({
      id: `zij-water-lining-${i}`,
      type: 'line',
      source: 'zij-land',
      paint: {
        'line-color': p.seaLine,
        'line-opacity': [0, 0.7, 0.45, 0.28, 0.16][i] * (night ? 0.5 : 1),
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 5, 0.9, 9, 1.1],
        'line-offset': ['interpolate', ['linear'], ['zoom'], 1, -off * 0.45, 4, -off * 0.8, 7, -off],
      },
    });
  }
  // A soft darker band of water against the shore, as on a hand-coloured sheet.
  layers.push({
    id: 'zij-shore-wash',
    type: 'line',
    source: 'zij-land',
    paint: {
      'line-color': p.seaLine,
      'line-opacity': night ? 0.14 : 0.3,
      'line-width': ['interpolate', ['linear'], ['zoom'], 1, 5, 6, 14, 10, 22],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 1, 4, 6, 10, 10, 16],
    },
  });

  // ---- Land -------------------------------------------------------------------------------
  layers.push({ id: 'zij-land', type: 'fill', source: 'zij-land', paint: { 'fill-color': p.land, 'fill-antialias': true } });

  if (L.deserts) {
    sources['zij-deserts'] = { type: 'geojson', data: url('deserts'), tolerance: 1 };
    layers.push({
      id: 'zij-deserts',
      type: 'fill',
      source: 'zij-deserts',
      paint: { 'fill-pattern': 'zij-stipple', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.55, 8, 0.35] },
    });
  }
  if (L.hills) {
    sources['zij-ranges'] = { type: 'geojson', data: url('ranges'), tolerance: 1 };
    layers.push({
      id: 'zij-ranges-wash',
      type: 'fill',
      source: 'zij-ranges',
      paint: { 'fill-color': p.relief, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2, night ? 0.16 : 0.13, 7, 0.05, 9, 0] },
    });
  }
  if (L.cultivated) {
    sources['zij-cultivated'] = { type: 'geojson', data: url('cultivated') };
    layers.push(
      {
        id: 'zij-cultivated-valley',
        type: 'line',
        source: 'zij-cultivated',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.field,
          'line-opacity': night ? 0.42 : 0.4,
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 3, 2.2, 6, 13, 8, 46, 10, 180],
          'line-blur': ['interpolate', ['exponential', 2], ['zoom'], 3, 0.6, 6, 3, 10, 30],
        },
      },
      {
        id: 'zij-cultivated-wash',
        type: 'fill',
        source: 'zij-cultivated',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': p.field, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, night ? 0.34 : 0.3, 9, night ? 0.22 : 0.18], 'fill-antialias': false },
      },
      {
        id: 'zij-cultivated-hatch',
        type: 'fill',
        source: 'zij-cultivated',
        filter: ['==', ['geometry-type'], 'Polygon'],
        minzoom: 5,
        paint: { 'fill-pattern': 'zij-field-hatch', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 0.28] },
      },
    );
  }
  if (L.coastTint) {
    // The warm band of colour inside a coastline (a positive offset is an inset).
    layers.push({
      id: 'zij-coast-tint',
      type: 'line',
      source: 'zij-land',
      paint: {
        'line-color': p.landTint,
        'line-opacity': night ? 0.3 : 0.26,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 3, 6, 9, 10, 14],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 1, 3, 6, 8, 10, 12],
        'line-offset': ['interpolate', ['linear'], ['zoom'], 1, 1.5, 6, 4.5, 10, 7],
      },
    });
  }

  // ---- Terrain shading ----------------------------------------------------------------------
  if (L.hillshade && o.demTiles) {
    sources['zij-dem'] = {
      type: 'raster-dem',
      tiles: [o.demTiles],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 10,
      attribution: 'Terrain: Mapzen, AWS Open Data',
    };
    layers.push({
      id: 'zij-hillshade',
      type: 'hillshade',
      source: 'zij-dem',
      paint: {
        'hillshade-illumination-direction': 315,
        'hillshade-illumination-anchor': 'map',
        'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 1, 0.34, 5, 0.42, 9, 0.3],
        // Neutral shade, warm light: the shadow reads as depth on land and on the sea floor alike.
        'hillshade-shadow-color': night ? p.shadow : mix(p.ink, p.lapis, 0.3),
        'hillshade-highlight-color': night ? rgba(p.flame, 0.22) : rgba(p.groundRaised, 0.7),
        'hillshade-accent-color': night ? p.shadow : mix(p.ink, p.lapis, 0.3),
      },
    });
  }

  // ---- Fresh water ----------------------------------------------------------------------------
  if (L.lakes) {
    sources['zij-lakes'] = { type: 'geojson', data: url('lakes'), tolerance: 0.3 };
    const lakeFilter: Expr = ['<=', ['get', 'rank'], ['step', ['zoom'], 1, 3, 3, 5, 6, 7, 12]];
    layers.push(
      { id: 'zij-lakes', type: 'fill', source: 'zij-lakes', filter: lakeFilter, paint: { 'fill-color': p.lake } },
      { id: 'zij-lakes-hatch', type: 'fill', source: 'zij-lakes', filter: lakeFilter, minzoom: 4, paint: { 'fill-pattern': 'zij-lake-hatch', 'fill-opacity': 0.6 } },
      {
        id: 'zij-lakes-shore',
        type: 'line',
        source: 'zij-lakes',
        filter: lakeFilter,
        paint: { 'line-color': p.waterInk, 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 8, 1] },
      },
    );
  }
  if (L.rivers) {
    sources['zij-rivers'] = { type: 'geojson', data: url('rivers'), tolerance: 0.3 };
    const riverFilter: Expr = ['<=', ['get', 'rank'], ['step', ['zoom'], 3, 3, 5, 4.5, 7, 6, 9, 7.5, 12]];
    layers.push({
      id: 'zij-rivers',
      type: 'line',
      source: 'zij-rivers',
      filter: riverFilter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.waterInk,
        'line-opacity': night ? 0.85 : 0.8,
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          2, ['case', ['<=', ['get', 'rank'], 2], 0.9, 0.4],
          6, ['case', ['<=', ['get', 'rank'], 3], 1.7, ['<=', ['get', 'rank'], 6], 1.0, 0.6],
          10, ['case', ['<=', ['get', 'rank'], 3], 2.8, ['<=', ['get', 'rank'], 6], 1.6, 1.0],
        ],
      },
    });
  }

  // ---- Lines of the sheet -----------------------------------------------------------------------
  if (L.graticule) {
    sources['zij-graticule-10'] = { type: 'geojson', data: graticule(10) };
    sources['zij-graticule-5'] = { type: 'geojson', data: graticule(5) };
    sources['zij-graticule-1'] = { type: 'geojson', data: graticule(1) };
    const grat = (id: string, source: string, minzoom: number, maxzoom: number, opacity: number): LayerSpecification => ({
      id, type: 'line', source, minzoom, maxzoom,
      paint: { 'line-color': p.graticule, 'line-opacity': opacity, 'line-width': 0.6 },
    });
    layers.push(
      grat('zij-graticule-10', 'zij-graticule-10', 0, 4.5, 0.45),
      grat('zij-graticule-5', 'zij-graticule-5', 4.5, 7.5, 0.4),
      grat('zij-graticule-1', 'zij-graticule-1', 7.5, 24, 0.36),
    );
  }
  if (L.borders) {
    sources['zij-borders'] = { type: 'geojson', data: url('borders'), tolerance: 0.4 };
    layers.push({
      id: 'zij-borders',
      type: 'line',
      source: 'zij-borders',
      minzoom: 2,
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': p.border,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.35, 6, 0.6],
        'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 8, 1.1],
        'line-dasharray': [0.2, 2.6],
      },
    });
  }
  layers.push({
    id: 'zij-coast',
    type: 'line',
    source: 'zij-land',
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': p.ink,
      'line-opacity': night ? 0.75 : 0.85,
      'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 5, 1.1, 9, 1.5],
    },
  });

  // ---- Drawn hills ------------------------------------------------------------------------------
  if (L.hills) {
    sources['zij-hills'] = { type: 'geojson', data: url('relief-hills'), maxzoom: 9 };
    const hill = (level: number, minzoom: number): LayerSpecification => ({
      id: `zij-hills-${level}`,
      type: 'symbol',
      source: 'zij-hills',
      minzoom,
      maxzoom: 8.5,
      filter: ['==', ['get', 'level'], level],
      layout: {
        'icon-image': ['concat', 'zij-hill-', ['to-string', ['get', 'v']]],
        'icon-size': ['interpolate', ['linear'], ['zoom'], minzoom, ['*', 0.42, ['get', 's']], Math.min(minzoom + 2.5, 8), ['*', 0.8, ['get', 's']], 8.5, ['*', 1.0, ['get', 's']]],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'bottom',
        'symbol-sort-key': ['-', 0, ['get', 'level']],
        'symbol-z-order': 'viewport-y',
      },
      paint: {
        'icon-opacity': L.hillshade
          ? ['interpolate', ['linear'], ['zoom'], minzoom, 0, minzoom + 0.6, 0.85, 7.4, 0.7, 8.5, 0]
          : ['interpolate', ['linear'], ['zoom'], minzoom, 0, minzoom + 0.6, 0.95, 7.6, 0.9, 8.5, 0],
      },
    });
    layers.push(hill(0, 1.5), hill(1, 3), hill(2, 4.5));
  }

  // ---- Slots for the app's own layers -------------------------------------------------------------
  const slot = (id: string): LayerSpecification => ({ id, type: 'line', source: 'zij-empty', layout: { visibility: 'none' } });
  layers.push(slot(SLOTS.data), slot(SLOTS.selection));

  // ---- Illustrations (filled by installIllustrations; ranks below every label) -----------------------
  if (L.illustrations) {
    sources['zij-illustrations'] = { type: 'geojson', data: o.illustrationData ?? { type: 'FeatureCollection', features: [] } };
    layers.push({
      id: 'zij-illustrations',
      type: 'symbol',
      source: 'zij-illustrations',
      filter: ['all', ['<=', ['get', 'minzoom'], ['zoom']], ['>', ['get', 'maxzoom'], ['zoom']]],
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-anchor': ['string', ['get', 'anchor'], 'bottom'] as unknown as 'bottom',
        'icon-offset': ['array', 'number', 2, ['get', 'offset']],
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          2, ['*', 0.5, ['get', 'size']],
          6, ['*', 0.85, ['get', 'size']],
          8.5, ['*', 1.0, ['get', 'size']],
          // close in, drawings shrink back to signs so the data owns the sheet
          11, ['*', 0.55, ['get', 'size']],
        ],
        'icon-padding': 1,
        'symbol-sort-key': ['get', 'priority'],
        'icon-allow-overlap': false,
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 1, 11, 0.7] },
    });
  }

  // ---- Names ----------------------------------------------------------------------------------------
  if (L.rivers) {
    layers.push({
      id: 'zij-river-names',
      type: 'symbol',
      source: 'zij-rivers',
      minzoom: 3.5,
      filter: ['all', ['has', 'name'], ['==', ['get', 'lake'], 0], ['<=', ['get', 'rank'], ['step', ['zoom'], 2, 4.5, 4, 6, 6, 8, 12]]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 420,
        'text-field': nameField(o.lang === 'both' ? 'en' : o.lang),
        'text-font': [FONT.textItalic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3.5, 11.5, 8, 14.5],
        'text-letter-spacing': latinOnly(o.lang, 0.06, 0),
        'text-max-angle': 28,
        'text-offset': [0, -0.7],
        'text-padding': 6,
      },
      paint: { 'text-color': p.labelWater, ...halo },
    });
  }
  if (L.lakes) {
    layers.push({
      id: 'zij-lake-names',
      type: 'symbol',
      source: 'zij-lakes',
      minzoom: 4,
      filter: ['all', ['has', 'name'], ['<=', ['get', 'rank'], ['step', ['zoom'], 1, 5, 3, 6.5, 6, 8, 12]]],
      layout: {
        'text-field': nameField(o.lang === 'both' ? 'en' : o.lang),
        'text-font': [FONT.textItalic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 9, 14],
        'text-max-width': 6,
        'text-padding': 4,
      },
      paint: { 'text-color': p.labelWater, ...seaHalo },
    });
  }
  if (L.peaks) {
    sources['zij-peaks'] = { type: 'geojson', data: url('peaks') };
    layers.push({
      id: 'zij-peaks',
      type: 'symbol',
      source: 'zij-peaks',
      minzoom: 5,
      filter: ['all', ['==', ['get', 'kind'], 'peak'], ['<=', ['get', 'rank'], ['step', ['zoom'], 2, 6, 4, 7.5, 12]]],
      layout: {
        'icon-image': 'zij-peak',
        'icon-size': 0.9,
        'text-field': ['format', nameField(o.lang === 'both' ? 'en' : o.lang), {}, '\n', {}, ['concat', ['to-string', ['round', ['get', 'elevation']]], ' m'], { 'font-scale': 0.85 }],
        'text-font': [FONT.textItalic],
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
        'text-optional': true,
        'text-padding': 3,
      },
      paint: { 'text-color': p.inkMuted, ...halo },
    });
  }
  if (L.marine) {
    sources['zij-marine'] = { type: 'geojson', data: url('marine') };
    layers.push({
      id: 'zij-marine-names',
      type: 'symbol',
      source: 'zij-marine',
      filter: ['all', ['<=', ['-', ['get', 'minzoom'], 1], ['zoom']], ['>=', ['+', ['get', 'maxzoom'], 1.5], ['zoom']]],
      layout: {
        'text-field': nameField(o.lang),
        'text-font': [FONT.displayItalic],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          1, ['case', ['==', ['get', 'kind'], 'ocean'], 15, 11],
          6, ['case', ['==', ['get', 'kind'], 'ocean'], 26, 19],
        ],
        'text-letter-spacing': latinOnly(o.lang, ['case', ['==', ['get', 'kind'], 'ocean'], 0.34, 0.16] as Expr, 0),
        'text-transform': latinOnly(o.lang, ['case', ['==', ['get', 'kind'], 'ocean'], 'uppercase', 'none'] as Expr, 'none'),
        'text-max-width': 7,
        'text-line-height': 1.15,
        'symbol-sort-key': ['get', 'rank'],
        'text-padding': 8,
      },
      paint: { 'text-color': p.labelWater, 'text-opacity': 0.9, ...seaHalo },
    });
  }
  if (L.regions) {
    sources['zij-regions'] = { type: 'geojson', data: url('regions') };
    layers.push({
      id: 'zij-region-names',
      type: 'symbol',
      source: 'zij-regions',
      filter: ['all', ['!=', ['get', 'kind'], 'continent'], ['<=', ['-', ['get', 'minzoom'], 0.5], ['zoom']], ['>=', ['+', ['get', 'maxzoom'], 1.5], ['zoom']]],
      layout: {
        'text-field': nameField(o.lang),
        'text-font': [FONT.displayItalic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11.5, 7, 17],
        'text-letter-spacing': latinOnly(o.lang, 0.14, 0),
        'text-max-width': 7,
        'text-line-height': 1.15,
        'symbol-sort-key': ['get', 'rank'],
        'text-padding': 8,
      },
      paint: { 'text-color': p.labelRegion, 'text-opacity': 0.92, ...halo },
    });
  }
  if (L.places) {
    sources['zij-places'] = { type: 'geojson', data: url('places'), maxzoom: 9 };
    // Natural Earth's min_zoom is tuned for 256px tiles; MapLibre zooms are one less.
    const visible: Expr = ['<=', ['-', ['get', 'minzoom'], 1.4], ['zoom']];
    const big: Expr = ['any', ['==', ['get', 'capital'], 1], ['<=', ['get', 'rank'], 2]];
    layers.push({
      id: 'zij-places',
      type: 'symbol',
      source: 'zij-places',
      filter: visible,
      layout: {
        'icon-image': ['case', ['==', ['get', 'capital'], 1], 'zij-city-capital', ['<=', ['get', 'rank'], 1], 'zij-city', 'zij-town'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.62, 6, 0.9, 10, 1.1],
        'icon-allow-overlap': false,
        'icon-padding': 1,
        'text-field': nameField(o.lang),
        'text-font': ['case', big, ['literal', [FONT.textBold]], ['literal', [FONT.text]]],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          2, ['case', big, 12, 10.5],
          6, ['case', big, 15.5, 13],
          10, ['case', big, 19, 16],
        ],
        'text-letter-spacing': latinOnly(o.lang, ['case', ['==', ['get', 'capital'], 1], 0.06, 0.01] as Expr, 0),
        // The same order in both scripts, so landmarks drawn beside a city keep their side.
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 0.62,
        'text-justify': 'auto',
        'text-max-width': 8,
        'text-line-height': 1.05,
        'text-padding': 3,
        'text-optional': false,
        'symbol-sort-key': ['+', ['*', ['get', 'rank'], 10], ['case', ['==', ['get', 'capital'], 1], 0, 5]],
      },
      paint: { 'text-color': p.ink, ...halo },
    });
  }
  if (L.countries) {
    sources['zij-countries'] = { type: 'geojson', data: url('countries') };
    layers.push({
      id: 'zij-country-names',
      type: 'symbol',
      source: 'zij-countries',
      minzoom: 1.5,
      maxzoom: 8,
      filter: ['all', ['<=', ['-', ['get', 'minzoom'], 1.2], ['zoom']], ['>=', ['+', ['get', 'maxzoom'], 0.5], ['zoom']]],
      layout: {
        'text-field': nameField(o.lang),
        'text-font': [FONT.display],
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 12.5, 6, 21],
        'text-letter-spacing': latinOnly(o.lang, 0.26, 0),
        'text-transform': latinOnly(o.lang, 'uppercase', 'none'),
        'text-max-width': 9,
        'text-line-height': 1.1,
        'symbol-sort-key': ['get', 'rank'],
        'text-padding': 10,
      },
      paint: { 'text-color': p.labelRegion, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.95, 7, 0.7], ...halo },
    });
  }

  layers.push(slot(SLOTS.top));

  return {
    version: 8,
    name: `Zij atlas (${o.theme})`,
    metadata: { 'zij:theme': o.theme, 'zij:mode': o.mode, 'zij:lang': o.lang },
    'font-faces': fontFaces(o.base),
    sources,
    layers,
  };
}
