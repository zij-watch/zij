"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { AreaIndexEntry } from "@/lib/data";
import { boundsOf, type Shape } from "@/lib/fit/cells";
import type { DayHotspot } from "@/lib/hotspots/day";
import { AREA_FILL_LAYER, HOTSPOT_LAYERS, syncDataLayers } from "@/lib/map/layers";
import { getBasemapStyle, MAX_ZOOM, prepareBasemap, type Basemap } from "@/lib/map/style";
import { COLOURS } from "@/lib/tokens";

export type DrawMode = "box" | "polygon" | null;

interface Props {
  basemap: Basemap;
  date: string; // YYYY-MM-DD, for the satellite basemap
  areas: AreaIndexEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
  shape: Shape | null; // the drawn area, if any
  drawMode: DrawMode;
  onDraft: (shape: Shape) => void; // while the shape is being drawn
  onDrawn: (shape: Shape) => void; // when it is finished
  hotspots: DayHotspot[]; // the chosen day's hotspots
  // The rest is optional, for using the map on its own (see app/studio/map).
  labels?: boolean; // names on the basemap; on by default
  chrome?: boolean; // zoom buttons, credits and the area name tags; on by default
  interactive?: boolean; // drag, scroll and click; on by default
  follow?: boolean; // move to the chosen area or shape when it changes; on by default
  view?: { center: [number, number]; zoom: number; bearing?: number; pitch?: number }; // where the map opens
  onMap?: (map: MapLibreMap) => void; // called once, when the map can be moved
  fitPadding?: { top: number; right: number; bottom: number; left: number }; // room to keep free when moving to an area
  tags?: boolean; // the area name tags; follows `chrome` unless set
  onCursor?: (at: { lng: number; lat: number } | null) => void; // where the pointer is, for a readout
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

export default function MapView({ basemap, date, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn, hotspots,
  labels = true, chrome = true, interactive = true, follow = true, view, onMap, tags = chrome, onCursor, fitPadding }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const markers = useRef<Marker[]>([]);
  const declutter = useRef<() => void>(() => {});
  const latest = useRef({ basemap, date, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn, hotspots, onMap, onCursor, fitPadding });
  latest.current = { basemap, date, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn, hotspots, onMap, onCursor, fitPadding };
  const styleKey = `${basemap}|${basemap === "satellite" ? date : ""}|${labels}`;
  const appliedStyle = useRef(styleKey);
  const shapeKey = shape ? JSON.stringify(shape) : "";

  // Layers can be added once the style is in, tiles or no tiles. Between a basemap swap and its
  // style load this throws; the style-load handler then draws the same data.
  const trySync = (map: MapLibreMap) => {
    const now = latest.current;
    try {
      syncDataLayers(map, now.areas, now.selected, now.shape, now.hotspots);
    } catch {
      // the next style load syncs
    }
  };

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let announced = false;
    import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;
      // The worker is served from public/ (see scripts/copy-worker.mjs).
      maplibre.setWorkerUrl(`${window.location.origin}/vendor/maplibre/maplibre-gl-worker.mjs`);
      map = new maplibre.Map({
        container: container.current,
        style: getBasemapStyle(basemap, date, { labels }),
        center: view?.center ?? [10, 15],
        zoom: view?.zoom ?? 1.6,
        bearing: view?.bearing ?? 0,
        pitch: view?.pitch ?? 0,
        maxZoom: MAX_ZOOM,
        interactive,
        attributionControl: chrome ? { compact: true } : false,
      });
      mapRef.current = map;
      if (chrome) map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
      // Data layers go back on after every style load, whatever the basemap is.
      map.on("style.load", () => {
        const now = latest.current;
        syncDataLayers(map!, now.areas, now.selected, now.shape, now.hotspots);
        void prepareBasemap(map!, now.basemap, now.date);
        // Hand the map over as soon as it can be moved; it need not wait for every tile.
        if (!announced) {
          announced = true;
          now.onMap?.(map!);
          // Ready as soon as the style is in: the area is shown and fitted without waiting for
          // every tile, which on a slow line to the satellite imagery can take a long time.
          if (!cancelled) setReady(true);
        }
      });
      // A hotspot says in words what it is: sensor, satellite, time, strength.
      for (const layer of HOTSPOT_LAYERS) {
        map.on("click", layer, (event) => {
          const p = event.features?.[0]?.properties;
          if (!p || latest.current.drawMode) return;
          const box = document.createElement("div");
          box.className = "hotspot-popup";
          const line = (text: string, strong = false) => {
            const el = document.createElement(strong ? "strong" : "span");
            el.textContent = text;
            box.appendChild(el);
          };
          line(`${p.sensor}, ${p.satellite}`, true);
          line(`${p.time} UTC, ${p.daynight === "D" ? "day" : "night"}`);
          line(`Fire radiative power ${p.frp} MW`);
          line(`Confidence ${p.confidence}${p.sensor === "MODIS" ? "%" : ""}`);
          new maplibre.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat(event.lngLat).setDOMContent(box).addTo(map!);
        });
        map.on("mouseenter", layer, () => !latest.current.drawMode && (map!.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => !latest.current.drawMode && (map!.getCanvas().style.cursor = ""));
      }
      map.on("move", () => declutter.current());
      map.on("mousemove", (event) => latest.current.onCursor?.({ lng: event.lngLat.lng, lat: event.lngLat.lat }));
      map.getCanvas().addEventListener("mouseleave", () => latest.current.onCursor?.(null));
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
    map.setStyle(getBasemapStyle(basemap, date, { labels }));
    void prepareBasemap(map, basemap, date);
  }, [styleKey, basemap, date, labels]);

  // Area boxes, their name labels, the drawn shape, and the view.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    import("maplibre-gl").then((maplibre) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      trySync(map);
      markers.current.forEach((marker) => marker.remove());
      markers.current = (tags ? areas : []).map((area) => {
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
      // Name tags never overlap: the selected area's tag is placed first, then the rest in order;
      // a tag that would touch one already placed is hidden until there is room.
      declutter.current = () => {
        const placed: DOMRect[] = [];
        const order = [...markers.current].sort((a, b) => Number(b.getElement().classList.contains("is-selected")) - Number(a.getElement().classList.contains("is-selected")));
        for (const marker of order) {
          const element = marker.getElement();
          const r = element.getBoundingClientRect();
          const touches = placed.some((k) => !(r.right < k.left - 4 || r.left > k.right + 4 || r.bottom < k.top - 2 || r.top > k.bottom + 2));
          element.style.visibility = touches ? "hidden" : "";
          if (!touches) placed.push(r);
        }
      };
      requestAnimationFrame(() => declutter.current());
      const area = areas.find((a) => a.id === selected);
      const box = shape ? boundsOf(shape) : area?.box;
      if (box && follow && !latest.current.drawMode) {
        map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: latest.current.fitPadding ?? 90, maxZoom: 8, duration: 1200 });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, areas, selected, shapeKey, tags]);

  // The chosen day's hotspots.
  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) trySync(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotspots]);

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
      const c = COLOURS;
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
  }, [ready, drawMode]);

  return <div ref={container} className="map" aria-label="Map of the preset areas" />;
}
