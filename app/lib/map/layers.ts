// Data layers. They are added after every style load and never depend on which basemap is underneath.

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { AreaIndexEntry } from "../data";
import type { Shape } from "../fit/cells";
import { COLOURS, type Theme } from "../tokens";

const SOURCE = "zij-areas";
const DRAWN = "zij-drawn";

type AreaData = Parameters<GeoJSONSource["setData"]>[0];

function areasGeoJson(areas: AreaIndexEntry[], selected: string | null): AreaData {
  const data = {
    type: "FeatureCollection",
    features: areas.map((a) => {
      const [w, s, e, n] = a.box;
      return {
        type: "Feature",
        properties: { id: a.id, name: a.name, selected: a.id === selected },
        geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      };
    }),
  };
  return data as AreaData;
}

function drawnGeoJson(shape: Shape | null): AreaData {
  const features = [];
  if (shape) {
    const geometry = Array.isArray(shape)
      ? { type: "Polygon", coordinates: [[[shape[0], shape[1]], [shape[2], shape[1]], [shape[2], shape[3]], [shape[0], shape[3]], [shape[0], shape[1]]]] }
      : shape;
    features.push({ type: "Feature", properties: {}, geometry });
  }
  return { type: "FeatureCollection", features } as AreaData;
}

/** Add the area boxes, or refresh them if they are already there. Safe to call after any setStyle. */
export function syncDataLayers(map: MapLibreMap, theme: Theme, areas: AreaIndexEntry[], selected: string | null, shape: Shape | null = null): void {
  const c = COLOURS[theme];
  const data = areasGeoJson(areas, selected);
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  const drawn = map.getSource(DRAWN) as GeoJSONSource | undefined;
  if (source && drawn) {
    source.setData(data);
    drawn.setData(drawnGeoJson(shape));
    return;
  }
  map.addSource(SOURCE, { type: "geojson", data });
  map.addLayer({
    id: "zij-areas-fill",
    type: "fill",
    source: SOURCE,
    paint: { "fill-color": c.brass, "fill-opacity": ["case", ["get", "selected"], 0.18, 0.04] },
  });
  map.addLayer({
    id: "zij-areas-line",
    type: "line",
    source: SOURCE,
    paint: {
      "line-color": c.brass,
      "line-width": ["case", ["get", "selected"], 2.5, 1.25],
      "line-opacity": ["case", ["get", "selected"], 1, 0.75],
    },
  });
  // The drawn area: an ink outline, so it reads apart from the brass presets.
  map.addSource(DRAWN, { type: "geojson", data: drawnGeoJson(shape) });
  map.addLayer({ id: "zij-drawn-fill", type: "fill", source: DRAWN, paint: { "fill-color": c.ink, "fill-opacity": 0.12 } });
  map.addLayer({ id: "zij-drawn-line", type: "line", source: DRAWN, paint: { "line-color": c.ink, "line-width": 2.5, "line-dasharray": [3, 2] } });
}

export const AREA_FILL_LAYER = "zij-areas-fill";
