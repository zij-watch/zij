"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { AreaIndexEntry } from "@/lib/data";
import { boundsOf, type Shape } from "@/lib/fit/cells";
import type { DayHotspot } from "@/lib/hotspots/day";
import { AREA_FILL_LAYER, HOTSPOT_LAYERS, setSketch, syncDataLayers } from "@/lib/map/layers";
import { getBasemapStyle, MAX_ZOOM, prepareBasemap, type Basemap } from "@/lib/map/style";
import { boxFromCorners, isTooSmall, lassoShape, type Point } from "@/lib/sketch";
import { COLOURS } from "@/lib/tokens";

/** The Draw tool's modes. A right-drag draws a box without any of them; Alt + right-drag a lasso. */
export type DrawMode = "box" | "polygon" | "lasso" | null;

interface Props {
  basemap: Basemap;
  date: string; // YYYY-MM-DD, for the satellite basemap
  sky?: boolean; // the satellite basemap shows that day's sky, not the cloud-free picture
  areas: AreaIndexEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
  shape: Shape | null; // the drawn area, if any
  drawMode: DrawMode;
  onDraft: (shape: Shape) => void; // while the shape is being drawn with the Draw tool
  onDrawn: (shape: Shape) => void; // when it is finished
  onSketchStart?: () => void; // a right-drag has begun
  hotspots: DayHotspot[]; // the chosen day's hotspots
  // The rest is optional, for using the map on its own (see app/studio/map).
  labels?: boolean; // names on the basemap; on by default
  chrome?: boolean; // zoom buttons, credits and the area name tags; on by default
  interactive?: boolean; // drag, scroll, click and right-drag to draw; on by default
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
    return boxFromCorners([Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

/** The zoom at which one world fills the map: the map never shows the world twice, or an edge of it. */
function oneWorldZoom(element: HTMLElement): number {
  const size = Math.max(element.clientWidth, element.clientHeight);
  return size > 0 ? Math.max(0, Math.log2(size / 512)) : 0;
}

export default function MapView({ basemap, date, sky = false, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn, onSketchStart, hotspots,
  labels = true, chrome = true, interactive = true, follow = true, view, onMap, tags = chrome, onCursor, fitPadding }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const markers = useRef<Marker[]>([]);
  const declutter = useRef<() => void>(() => {});
  const latest = useRef({ basemap, date, sky, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn, onSketchStart, hotspots, onMap, onCursor, fitPadding });
  latest.current = { basemap, date, sky, areas, selected, onSelect, shape, drawMode, onDraft, onDrawn, onSketchStart, hotspots, onMap, onCursor, fitPadding };
  const styleKey = `${basemap}|${basemap === "satellite" && sky ? date : ""}|${labels}`;
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
    const unlisten: (() => void)[] = [];
    import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;
      // The worker is served from public/ (see scripts/copy-worker.mjs).
      maplibre.setWorkerUrl(`${window.location.origin}/vendor/maplibre/maplibre-gl-worker.mjs`);
      const oneWorld = interactive && !view;
      map = new maplibre.Map({
        container: container.current,
        style: getBasemapStyle(basemap, date, { labels, sky }),
        center: view?.center ?? [10, 15],
        zoom: Math.max(view?.zoom ?? 1.6, oneWorld ? oneWorldZoom(container.current) : 0),
        minZoom: oneWorld ? oneWorldZoom(container.current) : 0,
        bearing: view?.bearing ?? 0,
        pitch: view?.pitch ?? 0,
        maxZoom: MAX_ZOOM,
        interactive,
        attributionControl: chrome ? { compact: true } : false,
        // The map turns only with a middle-drag (below), and never tilts: the record is a flat grid of cells.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: view?.pitch ? 85 : 0,
        renderWorldCopies: !oneWorld,
      });
      const m = map;
      mapRef.current = m;
      if (interactive) {
        m.touchZoomRotate.disableRotation();
        m.keyboard.disableRotation();
      }
      if (oneWorld) {
        const fit = () => m.setMinZoom(oneWorldZoom(m.getContainer()));
        m.on("resize", fit);
      }
      if (chrome) m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
      // Data layers go back on after every style load, whatever the basemap is.
      m.on("style.load", () => {
        const now = latest.current;
        syncDataLayers(m, now.areas, now.selected, now.shape, now.hotspots);
        void prepareBasemap(m, now.basemap, now.date);
        // Hand the map over as soon as it can be moved; it need not wait for every tile.
        if (!announced) {
          announced = true;
          now.onMap?.(m);
          // Ready as soon as the style is in: the area is shown and fitted without waiting for
          // every tile, which on a slow line to the satellite imagery can take a long time.
          if (!cancelled) setReady(true);
        }
      });
      // A hotspot says in words what it is: sensor, satellite, time, strength.
      for (const layer of HOTSPOT_LAYERS) {
        m.on("click", layer, (event) => {
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
          new maplibre.Popup({ closeButton: true, maxWidth: "260px", className: "slip-popup" }).setLngLat(event.lngLat).setDOMContent(box).addTo(m);
        });
        m.on("mouseenter", layer, () => !latest.current.drawMode && (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => !latest.current.drawMode && (m.getCanvas().style.cursor = ""));
      }
      m.on("move", () => declutter.current());
      m.on("mousemove", (event) => latest.current.onCursor?.({ lng: event.lngLat.lng, lat: event.lngLat.lat }));
      m.getCanvas().addEventListener("mouseleave", () => latest.current.onCursor?.(null));
      m.on("click", AREA_FILL_LAYER, (event) => {
        if (latest.current.drawMode) return; // a click belongs to the drawing
        const id = event.features?.[0]?.properties?.id;
        if (id) latest.current.onSelect(String(id));
      });
      m.on("mouseenter", AREA_FILL_LAYER, () => !latest.current.drawMode && (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", AREA_FILL_LAYER, () => !latest.current.drawMode && (m.getCanvas().style.cursor = ""));

      // ------------------------------------------------ right-drag: a box; Alt + right-drag: a lasso;
      // middle-drag: turn the map
      if (interactive) {
        const surface = m.getCanvasContainer();
        let sketch: { lasso: boolean; screen: Point[]; lngLat: Point[]; id: number } | null = null;
        let turn: { x: number; bearing: number; id: number } | null = null;
        // Keep the drag when the pointer leaves the map. A pointer the browser no longer tracks cannot be held: no matter.
        const capture = (id: number) => { try { surface.setPointerCapture(id); } catch { /* not held */ } };
        const at = (event: PointerEvent): Point => {
          const r = surface.getBoundingClientRect();
          return [event.clientX - r.left, event.clientY - r.top];
        };
        // A box is drawn as the screen shows it: on a turned map its four corners are not a
        // north-up box, so they are kept as a four-point shape.
        const corners = (s: NonNullable<typeof sketch>): { screen: Point[]; lngLat: Point[] } => {
          const [a, b] = [s.screen[0], s.screen[s.screen.length - 1]];
          const screen: Point[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
          return { screen, lngLat: screen.map((p) => { const ll = m.unproject(p); return [ll.lng, ll.lat] as Point; }) };
        };
        const end = (keep: boolean) => {
          const done = sketch;
          sketch = null;
          setSketch(m, null);
          m.getCanvas().style.cursor = "";
          if (!done || !keep || isTooSmall(done.screen)) return;
          let result: Shape | null;
          if (done.lasso) result = lassoShape(done.screen, done.lngLat);
          else if (Math.abs(m.getBearing()) < 0.5) result = boxFromCorners(done.lngLat[0], done.lngLat[done.lngLat.length - 1]);
          else { const q = corners(done); result = lassoShape(q.screen, q.lngLat); }
          if (result) latest.current.onDrawn(result);
        };
        const down = (event: PointerEvent) => {
          if (event.pointerType === "touch") return;
          if (event.button === 1) {
            // A middle press would start the browser's autoscroll; here it turns the map.
            event.preventDefault();
            turn = { x: event.clientX, bearing: m.getBearing(), id: event.pointerId };
            capture(event.pointerId);
            m.getCanvas().style.cursor = "ew-resize";
            return;
          }
          if (event.button !== 2 || latest.current.drawMode) return;
          event.preventDefault();
          const p = at(event);
          const ll = m.unproject(p);
          sketch = { lasso: event.altKey, screen: [p], lngLat: [[ll.lng, ll.lat]], id: event.pointerId };
          capture(event.pointerId);
          m.getCanvas().style.cursor = "crosshair";
          latest.current.onSketchStart?.();
        };
        const move = (event: PointerEvent) => {
          if (turn && event.pointerId === turn.id) {
            m.setBearing(turn.bearing + (event.clientX - turn.x) * 0.4);
            return;
          }
          if (!sketch || event.pointerId !== sketch.id) return;
          const p = at(event);
          const ll = m.unproject(p);
          if (sketch.lasso) {
            sketch.screen.push(p);
            sketch.lngLat.push([ll.lng, ll.lat]);
            setSketch(m, sketch.lngLat);
          } else {
            sketch.screen[1] = p;
            sketch.lngLat[1] = [ll.lng, ll.lat];
            setSketch(m, corners(sketch).lngLat);
          }
        };
        const up = (event: PointerEvent) => {
          if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
          if (turn && event.pointerId === turn.id) {
            turn = null;
            m.getCanvas().style.cursor = "";
            // Within a few degrees of north it snaps back to north.
            if (Math.abs(m.getBearing()) < 4) m.easeTo({ bearing: 0, duration: 200 });
            return;
          }
          if (!sketch || event.pointerId !== sketch.id) return;
          end(true);
        };
        const cancel = () => {
          turn = null;
          end(false);
        };
        const key = (event: KeyboardEvent) => {
          if (!sketch) return;
          if (event.key === "Escape") end(false);
          // Alt on its own would move the focus to the browser's menu bar when it is let go.
          if (event.key === "Alt") event.preventDefault();
        };
        const menu = (event: MouseEvent) => event.preventDefault();
        // Some browsers start autoscroll on the mouse event, not the pointer event.
        const middle = (event: MouseEvent) => event.button === 1 && event.preventDefault();
        surface.addEventListener("pointerdown", down);
        surface.addEventListener("pointermove", move);
        surface.addEventListener("pointerup", up);
        surface.addEventListener("pointercancel", cancel);
        surface.addEventListener("contextmenu", menu);
        surface.addEventListener("mousedown", middle);
        surface.addEventListener("auxclick", middle);
        window.addEventListener("keydown", key);
        window.addEventListener("keyup", key);
        unlisten.push(() => {
          surface.removeEventListener("pointerdown", down);
          surface.removeEventListener("pointermove", move);
          surface.removeEventListener("pointerup", up);
          surface.removeEventListener("pointercancel", cancel);
          surface.removeEventListener("contextmenu", menu);
          surface.removeEventListener("mousedown", middle);
          surface.removeEventListener("auxclick", middle);
          window.removeEventListener("keydown", key);
          window.removeEventListener("keyup", key);
        });
      }
    });
    return () => {
      cancelled = true;
      unlisten.forEach((off) => off());
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
    map.setStyle(getBasemapStyle(basemap, date, { labels, sky }));
    void prepareBasemap(map, basemap, date);
  }, [styleKey, basemap, date, labels, sky]);

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

  // The Draw tool (terra-draw). It lives only while a shape is being drawn: the finished
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
          // A box can be clicked corner to corner, or dragged.
          new terra.TerraDrawRectangleMode({ styles, drawInteraction: "click-move-or-drag" }),
          new terra.TerraDrawPolygonMode({ styles: { ...styles, closingPointColor: c.ink as `#${string}`, closingPointOutlineColor: c.ground as `#${string}` } }),
          new terra.TerraDrawFreehandMode({ styles: { ...styles, closingPointColor: c.ink as `#${string}`, closingPointOutlineColor: c.ground as `#${string}` }, drawInteraction: "click-drag", minDistance: 6 }),
        ],
      });
      draw.start();
      draw.setMode(drawMode === "box" ? "rectangle" : drawMode === "lasso" ? "freehand" : "polygon");
      const current = (thin: boolean): Shape | null => {
        const feature = draw.getSnapshot().find((f) => f.geometry.type === "Polygon");
        if (!feature) return null;
        const ring = (feature.geometry.coordinates as Ring[])[0];
        // A lasso can hold thousands of points: thinned to what the address can carry.
        if (drawMode === "lasso" && thin) {
          const screen = ring.map(([lon, lat]) => { const p = map.project([lon, lat]); return [p.x, p.y] as Point; });
          return lassoShape(screen, ring as Point[]);
        }
        return toShape(ring, drawMode);
      };
      draw.on("change", () => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          const draft = stopped ? null : current(false);
          if (draft) latest.current.onDraft(draft);
        }, 120);
      });
      draw.on("finish", () => {
        const done = current(true);
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
