// The atlas in two tiers, so a map shows before megabytes have travelled.
//
// tiered(style) rewrites an atlas style: every heavy source reads the light world file
// (/atlas/world), and each of its layers gets a twin that draws the detail from zoom 4.
// attachDetail(map) then keeps the twins fed: when the map is at zoom 4 or closer it loads the
// 20-degree cells in view (/atlas/cells, built by scripts/atlas-lite.mjs) and hands them over.
// While cells are on their way the light world stays on screen and the progress line says so.

import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { reportLoading } from "../download";

const ATLAS = "/atlas";
const DETAIL_ZOOM = 4;
const KINDS: Record<string, string> = {
  "zij-land": "land",
  "zij-rivers": "rivers",
  "zij-lakes": "lakes",
  "zij-borders": "borders",
  "zij-places": "places",
  "zij-hills": "hills",
  "zij-peaks": "peaks",
};
const COAST = "zij-coast-detail";
const EMPTY = { type: "FeatureCollection" as const, features: [] };
const TWIN = "~detail";

type Feature = { properties: Record<string, unknown> };
type Cell = Record<string, Feature[]>;
type CellIndex = { cell_degrees: number; min_zoom: number; cells: Record<string, number> };
type LightLayer = { id: string; min: number; max: number };

/** Point an atlas style at the light world, and give every heavy layer a detail twin. */
export function tiered(style: StyleSpecification): StyleSpecification {
  const sources = { ...style.sources };
  for (const [id, kind] of Object.entries(KINDS)) {
    const source = sources[id];
    if (!source || source.type !== "geojson") continue;
    sources[id] = { ...source, data: `${ATLAS}/world/${kind}.json` };
    sources[`${id}-detail`] = { ...source, data: EMPTY };
    if (id === "zij-land") sources[COAST] = { ...source, data: EMPTY };
  }
  const layers: LayerSpecification[] = [];
  const light: LightLayer[] = [];
  for (const layer of style.layers) {
    const source = "source" in layer && typeof layer.source === "string" ? layer.source : null;
    if (!source || !(source in KINDS) || !sources[`${source}-detail`]) {
      layers.push(layer);
      continue;
    }
    const min = layer.minzoom ?? 0;
    const max = layer.maxzoom ?? 24;
    if (min < DETAIL_ZOOM) {
      layers.push({ ...layer, maxzoom: Math.min(max, DETAIL_ZOOM) } as LayerSpecification);
      light.push({ id: layer.id, min, max });
    }
    if (max > DETAIL_ZOOM) {
      // Coast lines come as lines, so a cell's edge is never drawn as coast.
      const detail = source === "zij-land" && layer.type === "line" ? COAST : `${source}-detail`;
      layers.push({ ...layer, id: layer.id + TWIN, source: detail, minzoom: Math.max(min, DETAIL_ZOOM) } as LayerSpecification);
    }
  }
  return { ...style, sources, layers, metadata: { ...(style.metadata as object), "zij:light": light } };
}

let indexPromise: Promise<CellIndex> | null = null;
const loaded = new Map<string, Cell>();
const pending = new Map<string, Promise<void>>();

function cellIndex(): Promise<CellIndex> {
  indexPromise ??= fetch(`${ATLAS}/cells/index.json`).then((r) => {
    if (!r.ok) throw new Error(`cells index ${r.status}`);
    return r.json() as Promise<CellIndex>;
  });
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

function cellsInView(map: MapLibreMap, index: CellIndex): string[] {
  const size = index.cell_degrees;
  const b = map.getBounds();
  const keys = new Set<string>();
  const south = Math.max(-90, b.getSouth()), north = Math.min(89.999, b.getNorth());
  const west = b.getWest(), east = Math.min(b.getEast(), west + 359.999);
  for (let x = Math.floor(west / size) * size; x <= east; x += size) {
    const lon = ((((x + 180) % 360) + 360) % 360) - 180;
    for (let y = Math.floor((south + 90) / size); y <= Math.floor((north + 90) / size); y++) {
      const key = `${Math.floor((lon + 180) / size)}_${y}`;
      if (key in index.cells) keys.add(key);
    }
  }
  return [...keys].sort();
}

const managed = new WeakMap<MapLibreMap, { refresh: () => void; reset: () => void }>();

/** Keep the detail twins of this map fed. Safe to call after every style change. */
export function attachDetail(map: MapLibreMap): void {
  const existing = managed.get(map);
  if (existing) {
    existing.reset();
    existing.refresh();
    return;
  }
  let applied = "";
  let ticket = 0;

  const lightUntil = (zoom: number | null) => {
    const light = ((map.getStyle()?.metadata as Record<string, unknown> | undefined)?.["zij:light"] ?? []) as LightLayer[];
    for (const l of light) if (map.getLayer(l.id)) map.setLayerZoomRange(l.id, l.min, zoom === null ? l.max : Math.min(l.max, zoom));
  };

  const apply = (keys: string[]) => {
    const key = keys.join(",");
    if (key === applied) return;
    const cells = keys.map((k) => loaded.get(k)!).filter(Boolean);
    const set = (id: string, kind: string) => {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (!source) return;
      let features = cells.flatMap((c) => c[kind] ?? []);
      if (kind === "lakes") {
        // A lake is in every cell it touches: draw it once.
        const seen = new Set<unknown>();
        features = features.filter((f) => !seen.has(f.properties._i) && seen.add(f.properties._i));
      }
      source.setData({ type: "FeatureCollection", features } as Parameters<GeoJSONSource["setData"]>[0]);
    };
    for (const [id, kind] of Object.entries(KINDS)) set(`${id}-detail`, kind);
    set(COAST, "coast");
    applied = key;
  };

  const refresh = async () => {
    if (map.getZoom() < DETAIL_ZOOM - 0.4 || !map.getSource(COAST) && !map.getSource("zij-places-detail")) return;
    const mine = ++ticket;
    try {
      const index = await cellIndex();
      const keys = cellsInView(map, index).slice(0, 24);
      const missing = keys.filter((k) => !loaded.has(k));
      if (missing.length) {
        lightUntil(null); // the light world stays on screen while the detail travels
        const bytes = missing.reduce((sum, k) => sum + index.cells[k], 0);
        let received = 0;
        const label = "the detailed map of this region";
        reportLoading({ label, bytes, received });
        await Promise.all(missing.map((k) => {
          let job = pending.get(k);
          if (!job) {
            job = fetch(`${ATLAS}/cells/${k}.json`)
              .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`cell ${k}: ${r.status}`))))
              .then((cell: Cell) => void loaded.set(k, cell))
              .finally(() => pending.delete(k));
            pending.set(k, job);
          }
          return job.then(() => {
            received += index.cells[k];
            if (mine === ticket) reportLoading({ label, bytes, received });
          });
        })).finally(() => mine === ticket && reportLoading(null));
      }
      if (mine !== ticket) return;
      apply(keys);
      lightUntil(DETAIL_ZOOM);
    } catch {
      // Offline or a failed cell: the light world stays, and the next move tries again.
      if (mine === ticket) lightUntil(null);
    }
  };

  managed.set(map, { refresh: () => void refresh(), reset: () => (applied = "") });
  map.on("moveend", () => void refresh());
  void refresh();
}
