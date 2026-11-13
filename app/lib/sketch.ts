// Drawing with one gesture: a right-drag draws a box, Alt + right-drag a free shape (a lasso).
// The pure parts live here, so they can be tested: turning two corners into a box, thinning a
// lasso to what the address can hold, and telling a drag from a click.

import type { Shape } from "./fit/cells";

export type Point = [number, number];

/** Under this many screen pixels a right-drag is a click, and draws nothing. */
export const MIN_DRAG_PX = 8;

/** The address holds at most 200 points of a polygon (lib/url.ts), the closing one not counted. */
export const MAX_POINTS = 199;

/** The longitude moved into -180 to 180. */
export function wrapLon(lon: number): number {
  const x = ((((lon + 180) % 360) + 360) % 360) - 180;
  return x === -180 && lon > 0 ? 180 : x;
}

/**
 * The box between two corners given as [lon, lat]. The map can show copies of the world side by
 * side, so the corners are brought back to -180..180 first; a box that would cross the 180th
 * meridian is refused (null), as is a box with no width or height.
 */
export function boxFromCorners(a: Point, b: Point): [number, number, number, number] | null {
  const span = Math.abs(a[0] - b[0]);
  if (span >= 360) return null;
  const shift = wrapLon(Math.min(a[0], b[0])) - Math.min(a[0], b[0]);
  const west = Math.min(a[0], b[0]) + shift, east = Math.max(a[0], b[0]) + shift;
  if (east > 180) return null;
  const south = Math.max(-85, Math.min(a[1], b[1])), north = Math.min(85, Math.max(a[1], b[1]));
  if (!(west < east) || !(south < north)) return null;
  return [west, south, east, north].map((v) => +v.toFixed(3)) as [number, number, number, number];
}

/** True when a drag from `a` to `b` (screen pixels) is too small to mean a shape. */
export function isTooSmall(points: Point[]): boolean {
  if (points.length < 2) return true;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return maxX - minX < MIN_DRAG_PX || maxY - minY < MIN_DRAG_PX;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker on an open line: the indices of the points kept, first and last always. */
function keep(points: Point[], tolerance: number): number[] {
  const kept = new Uint8Array(points.length);
  kept[0] = kept[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let worst = -1, index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > worst) { worst = d; index = i; }
    }
    if (index > 0 && worst > tolerance) {
      kept[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: number[] = [];
  kept.forEach((k, i) => k && out.push(i));
  return out;
}

/**
 * Thin a traced line to at most `max` points, as few as keep its shape within `tolerance` pixels.
 * The tolerance is raised until the line fits. Returns the indices of the points kept, so the
 * caller can keep the points' map coordinates. Points closer than a pixel to the last are dropped first.
 */
export function simplifyIndices(points: Point[], max = MAX_POINTS, tolerance = 1.5): number[] {
  const open: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const last = open.length ? points[open[open.length - 1]] : null;
    if (!last || Math.hypot(points[i][0] - last[0], points[i][1] - last[1]) >= 1) open.push(i);
  }
  // A closed trace ends where it began: leave the end out, the ring closes itself.
  if (open.length > 2) {
    const a = points[open[0]], z = points[open[open.length - 1]];
    if (Math.hypot(a[0] - z[0], a[1] - z[1]) < 1) open.pop();
  }
  const line = open.map((i) => points[i]);
  let t = tolerance;
  let kept = keep(line, t);
  while (kept.length > max) {
    t *= 1.5;
    kept = keep(line, t);
  }
  return kept.map((k) => open[k]);
}

/**
 * The lasso as a polygon: `screen` is the trace in pixels, `lngLat` the same points on the map.
 * Null when it is too small or has fewer than 3 points left.
 */
export function lassoShape(screen: Point[], lngLat: Point[]): Shape | null {
  if (isTooSmall(screen)) return null;
  const ring = simplifyIndices(screen).map((i) => {
    const [lon, lat] = lngLat[i];
    return [+wrapLon(lon).toFixed(3), +Math.max(-85, Math.min(85, lat)).toFixed(3)] as Point;
  });
  const distinct = ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
  if (distinct.length < 3) return null;
  // The lasso may not cross the 180th meridian: its points would wrap to the far side.
  const lons = distinct.map((p) => p[0]);
  if (Math.max(...lons) - Math.min(...lons) > 180) return null;
  return { type: "Polygon", coordinates: [[...distinct, distinct[0]]] };
}
