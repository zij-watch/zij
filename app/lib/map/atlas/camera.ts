// Cameras shared by the app, the film and the harness: named views, study-area fits and flights.
import type { Map as MapLibreMap } from 'maplibre-gl';

/** [west, south, east, north], the same order the Zij data contract uses. */
export type Box = [number, number, number, number];

export interface View {
  center: [number, number];
  zoom: number;
}

export interface NamedView {
  id: string;
  name: string;
  name_ar?: string;
  box: Box;
}

/** Views worth having by name. Study areas come from public/atlas/study-areas.json. */
export const VIEWS: NamedView[] = [
  { id: 'old-world', name: 'The old world', name_ar: 'العالم القديم', box: [-14, 6, 82, 56] },
  { id: 'mediterranean', name: 'The Mediterranean', name_ar: 'البحر المتوسط', box: [-10, 28, 40, 47] },
  { id: 'egypt', name: 'Egypt', name_ar: 'مصر', box: [24.5, 21.8, 37, 32] },
  { id: 'lower-egypt', name: 'Lower Egypt', name_ar: 'الوجه البحري', box: [29.2, 29.6, 33, 31.9] },
  { id: 'cairo', name: 'Cairo', name_ar: 'القاهرة', box: [30.9, 29.8, 31.6, 30.3] },
  { id: 'iberia', name: 'Iberia', name_ar: 'الأندلس', box: [-10.5, 35.5, 4, 44.2] },
  { id: 'rio-de-la-plata', name: 'Río de la Plata', box: [-62, -36.5, -54, -30] },
  { id: 'andes-south', name: 'The southern Andes', box: [-74, -36, -62, -24] },
];

export const boxCenter = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

export function boxPolygon(b: Box): GeoJSON.Feature<GeoJSON.Polygon> {
  const [w, s, e, n] = b;
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** The view that fits a box in a width × height viewport (MapLibre zoom, 512px world at zoom 0). */
export function fitBox(box: Box, width: number, height: number, padding = 40): View {
  const [w, s, e, n] = box;
  const fx = Math.max(1e-9, (e - w) / 360);
  const fy = Math.max(1e-9, (mercY(n) - mercY(s)) / (2 * Math.PI));
  const zoom = Math.log2(Math.min((width - padding * 2) / (512 * fx), (height - padding * 2) / (512 * fy)));
  const cy = (mercY(n) + mercY(s)) / 2;
  const lat = (Math.atan(Math.sinh(cy)) * 180) / Math.PI;
  return { center: [(w + e) / 2, lat], zoom };
}

export function flyToBox(map: MapLibreMap, box: Box, opts: { padding?: number; duration?: number; maxZoom?: number } = {}): void {
  map.fitBounds([[box[0], box[1]], [box[2], box[3]]], {
    padding: opts.padding ?? 48,
    duration: opts.duration ?? 2400, // dur-camera
    maxZoom: opts.maxZoom,
    essential: true,
    // ease-lamp: in and out, no overshoot
    easing: easeLamp,
  });
}

// The Zij motion curves, as functions of t in 0..1.
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const fy = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= (fx(t) - x) / d;
    }
    return fy(t);
  };
}
export const easeInk = bezier(0.22, 0.61, 0.36, 1);
export const easePaper = bezier(0.32, 0.72, 0, 1);
export const easeLamp = bezier(0.45, 0, 0.25, 1);

/** A flight is a list of views with the share of time spent reaching each one. */
export interface Flight {
  id: string;
  name: string;
  stops: { view: View; hold?: number; travel?: number }[];
}

/**
 * The view at time t (0..1) along a flight. Deterministic, so a film frame can ask for it:
 * `cameraAt(flight, frame / durationInFrames)`.
 * Zoom and position ease together; the zoom dips slightly on long moves, like lifting the lens.
 */
export function cameraAt(flight: Flight, t: number): View {
  const stops = flight.stops;
  if (stops.length === 1) return stops[0].view;
  const spans: { kind: 'hold' | 'travel'; from: View; to: View; w: number }[] = [];
  stops.forEach((s, i) => {
    if (i > 0) spans.push({ kind: 'travel', from: stops[i - 1].view, to: s.view, w: s.travel ?? 1 });
    if (s.hold) spans.push({ kind: 'hold', from: s.view, to: s.view, w: s.hold });
  });
  const total = spans.reduce((a, s) => a + s.w, 0);
  let at = Math.max(0, Math.min(1, t)) * total;
  for (const s of spans) {
    if (at <= s.w || s === spans[spans.length - 1]) {
      if (s.kind === 'hold') return s.from;
      const k = easeLamp(Math.min(1, at / s.w));
      const dist = Math.hypot(s.to.center[0] - s.from.center[0], s.to.center[1] - s.from.center[1]);
      const lift = Math.min(1.2, dist / 40) * Math.sin(Math.PI * k);
      return {
        center: [s.from.center[0] + (s.to.center[0] - s.from.center[0]) * k, s.from.center[1] + (s.to.center[1] - s.from.center[1]) * k],
        zoom: s.from.zoom + (s.to.zoom - s.from.zoom) * k - lift,
      };
    }
    at -= s.w;
  }
  return stops[stops.length - 1].view;
}

export const FLIGHTS: Flight[] = [
  {
    id: 'world-to-delta',
    name: 'The old world to the Delta',
    stops: [
      { view: { center: [34, 33], zoom: 2.6 }, hold: 0.6 },
      { view: { center: [30.8, 27.2], zoom: 5.1 }, travel: 1.4, hold: 0.4 },
      { view: { center: [31.05, 30.85], zoom: 7.6 }, travel: 1.2, hold: 0.8 },
    ],
  },
  {
    id: 'delta-to-portugal',
    name: 'The Delta to Portugal',
    stops: [
      { view: { center: [31.05, 30.85], zoom: 7.4 }, hold: 0.4 },
      { view: { center: [11, 36], zoom: 3.7 }, travel: 1.3 },
      { view: { center: [-8, 39.6], zoom: 6.3 }, travel: 1.3, hold: 0.8 },
    ],
  },
  {
    id: 'three-regions',
    name: 'Egypt, Portugal, Argentina',
    stops: [
      { view: { center: [31, 28], zoom: 5.2 }, hold: 0.5 },
      { view: { center: [-8, 39.6], zoom: 5.6 }, travel: 1.5, hold: 0.5 },
      { view: { center: [-62, -32], zoom: 4.8 }, travel: 2, hold: 0.8 },
    ],
  },
];
