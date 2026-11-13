// Data layers. They are added after every style load and never depend on which basemap is underneath.

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { AreaIndexEntry } from "../data";
import { COLOURS, type Theme } from "../tokens";

const SOURCE = "zij-areas";

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

/** Add the area boxes, or refresh them if they are already there. Safe to call after any setStyle. */
export function syncDataLayers(map: MapLibreMap, theme: Theme, areas: AreaIndexEntry[], selected: string | null): void {
  const c = COLOURS[theme];
  const data = areasGeoJson(areas, selected);
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
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
}

export const AREA_FILL_LAYER = "zij-areas-fill";
