"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { AreaIndexEntry } from "@/lib/data";
import { boundsOf, type Shape } from "@/lib/fit/cells";
import { AREA_FILL_LAYER, syncDataLayers } from "@/lib/map/layers";
import { getBasemapStyle, type Basemap } from "@/lib/map/style";
import { COLOURS, type Theme } from "@/lib/tokens";

export type DrawMode = "box" | "polygon" | null;

interface Props {
  theme: Theme;
  basemap: Basemap;
  date: string; // YYYY-MM-DD, for the satellite basemap
  areas: AreaIndexEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
  shape: Shape | null; // the drawn area, if any
  drawMode: DrawMode;
  onDraft: (shape: Shape) => void; // while the shape is being drawn
  onDrawn: (shape: Shape) => void; // when it is finished
}

type Ring = number[][];

function toShape(ring: Ring, mode: DrawMode): Shape | null {
  if (!ring || ring.length < 4) return null;
  if (mode === "box") {
    const xs = ring.map((q) => q[0]);
    const ys = ring.map((q) => q[1]);
    const box: Shape = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    return box[0] < box[2] && box[1] < box[3] ? box : null;
  }
  return { type: "Polygon", coordinates: [ring] };
}

export default function MapView({ theme, basemap, date, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const markers = useRef<Marker[]>([]);
  const latest = useRef({ theme, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn });
  latest.current = { theme, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn };
  const styleKey = `${theme}|${basemap}|${basemap === "satellite" ? date : ""}`;
  const appliedStyle = useRef(styleKey);
  const shapeKey = shape ? JSON.stringify(shape) : "";

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;
      // The worker is served from public/ (see scripts/copy-worker.mjs).
      maplibre.setWorkerUrl(`${window.location.origin}/vendor/maplibre/maplibre-gl-worker.mjs`);
      map = new maplibre.Map({
        container: container.current,
        style: getBasemapStyle(theme, basemap, date),
        center: [10, 15],
        zoom: 1.6,
        maxZoom: 9,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
      // Data layers go back on after every style load, whatever the basemap is.
      map.on("style.load", () => {
        const now = latest.current;
        syncDataLayers(map!, now.theme, now.areas, now.selected, now.shape);
      });
      map.once("load", () => !cancelled && setReady(true));
      map.on("click", AREA_FILL_LAYER, (event) => {
        if (latest.current.drawMode) return; // a click belongs to the drawing
        const id = event.features?.[0]?.properties?.id;
        if (id) latest.current.onSelect(String(id));
      });
      map.on("mouseenter", AREA_FILL_LAYER, () => !latest.current.drawMode && (map!.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", AREA_FILL_LAYER, () => !latest.current.drawMode && (map!.getCanvas().style.cursor = ""));
    });
    return () => {
      cancelled = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap. This is the only call to setStyle, and the style comes from getBasemapStyle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyle.current === styleKey) return;
    appliedStyle.current = styleKey;
    map.setStyle(getBasemapStyle(theme, basemap, date));
  }, [styleKey, theme, basemap, date]);

  // Area boxes, their name labels, the drawn shape, and the view.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    import("maplibre-gl").then((maplibre) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      if (map.isStyleLoaded()) syncDataLayers(map, theme, areas, selected, shape);
      markers.current.forEach((marker) => marker.remove());
      markers.current = areas.map((area) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `map-label${area.id === selected ? " is-selected" : ""}`;
        element.textContent = area.name;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!latest.current.drawMode) latest.current.onSelect(area.id);
        });
        return new maplibre.Marker({ element, anchor: "bottom" })
          .setLngLat([(area.box[0] + area.box[2]) / 2, area.box[3]])
          .addTo(map);
      });
      const area = areas.find((a) => a.id === selected);
      const box = shape ? boundsOf(shape) : area?.box;
      if (box && !latest.current.drawMode) {
        map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 90, maxZoom: 8, duration: 1200 });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, areas, selected, theme, shapeKey]);

  // The draw tool (terra-draw). It lives only while a shape is being drawn: the finished
  // shape is drawn by our own data layer, so it survives a basemap swap.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !drawMode) return;
    let stopped = false;
    let stop = () => {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    Promise.all([import("terra-draw"), import("terra-draw-maplibre-gl-adapter")]).then(([terra, adapter]) => {
      if (stopped) return;
      const c = COLOURS[theme];
      const styles = {
        fillColor: c.brass as `#${string}`,
        fillOpacity: 0.2,
        outlineColor: c.ink as `#${string}`,
        outlineWidth: 2,
      };
      const draw = new terra.TerraDraw({
        adapter: new adapter.TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new terra.TerraDrawRectangleMode({ styles }),
          new terra.TerraDrawPolygonMode({ styles: { ...styles, closingPointColor: c.ink as `#${string}`, closingPointOutlineColor: c.ground as `#${string}` } }),
        ],
      });
      draw.start();
      draw.setMode(drawMode === "box" ? "rectangle" : "polygon");
      const current = (): Shape | null => {
        const feature = draw.getSnapshot().find((f) => f.geometry.type === "Polygon");
        return feature ? toShape((feature.geometry.coordinates as Ring[])[0], drawMode) : null;
      };
      draw.on("change", () => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          const draft = stopped ? null : current();
          if (draft) latest.current.onDraft(draft);
        }, 120);
      });
      draw.on("finish", () => {
        const done = current();
        if (done) latest.current.onDrawn(done);
      });
      map.getCanvas().style.cursor = "crosshair";
      stop = () => {
        try {
          draw.stop();
        } catch {
          // the map may already be gone
        }
        map.getCanvas().style.cursor = "";
      };
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [ready, drawMode, theme]);

  return <div ref={container} className="map" aria-label="Map of the preset areas" />;
}
