// Builds app/public/atlas from the Zij atlas data (github.com/zij-watch/zij-map, public/atlas).
// The app's map stops at zoom 9 and is opened on slow connections, so the data comes in two tiers:
//
//   world/*.json     a light world: coarse coast, borders, big rivers and lakes, the larger towns.
//                    Loaded first; it is all the map needs below zoom 4.
//   cells/I_J.json   the detail, cut into cells of 20 degrees. The app loads only the cells in view
//                    once the map is at zoom 4 or closer (app/lib/map/detail.ts).
//   *.json           small files used whole at every zoom (deserts, ranges, names of seas and countries).
//
// Usage: node scripts/atlas-lite.mjs <zij-map>/public/atlas public/atlas
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const [src, out] = process.argv.slice(2);
const CELL = 20; // degrees
const OVERLAP = 0.02; // clipped land overlaps its neighbour a little, so no seam shows between cells
const DETAIL = { land: 0.006, rivers: 0.01, lakes: 0.01, borders: 0.01 }; // simplification, degrees
const LIGHT = 0.1;

rmSync(out + "/world", { recursive: true, force: true });
rmSync(out + "/cells", { recursive: true, force: true });
mkdirSync(out + "/world", { recursive: true });
mkdirSync(out + "/cells", { recursive: true });

const read = (name) => JSON.parse(readFileSync(join(src, `${name}.json`), "utf8"));
const r3 = (n) => Math.round(n * 1000) / 1000;
const sizes = { world: 0, whole: 0, cells: 0 };
function write(path, value, group) {
  const text = JSON.stringify(value);
  writeFileSync(join(out, path), text);
  const gz = gzipSync(text, { level: 9 }).length;
  sizes[group] += gz;
  return { bytes: text.length, gz };
}

// ---- simplification (Douglas-Peucker) -------------------------------------------------------
function dp(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, wd = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const dedupe = (pts) => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
const round = (pts) => dedupe(pts.map(([x, y]) => [r3(x), r3(y)]));
const line = (l, tol) => { const o = round(dp(l, tol)); return o.length >= 2 ? o : null; };
const ring = (g, tol) => {
  const mid = g.length >> 1;
  const o = round([...dp(g.slice(0, mid + 1), tol), ...dp(g.slice(mid), tol).slice(1)]);
  return o.length >= 4 ? o : null;
};
const polygon = (p, tol) => { const outer = ring(p[0], tol); return outer ? [outer, ...p.slice(1).map((h) => ring(h, tol)).filter(Boolean)] : null; };
const polygonsOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
const linesOf = (g) => (g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []);

// ---- clipping to a box ----------------------------------------------------------------------
function bboxOf(pts) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of pts) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}
const inside = (b, box) => b[0] >= box[0] && b[1] >= box[1] && b[2] <= box[2] && b[3] <= box[3];
const touches = (b, box) => b[0] <= box[2] && b[2] >= box[0] && b[1] <= box[3] && b[3] >= box[1];

/** Sutherland-Hodgman: a ring cut to a box. */
function clipRing(pts, [w, s, e, n]) {
  const edges = [
    [(p) => p[0] >= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= s, (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s]],
    [(p) => p[1] <= n, (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n]],
  ];
  let poly = pts.slice(0, -1);
  for (const [isIn, cut] of edges) {
    const next = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = isIn(a), bin = isIn(b);
      if (ain) next.push(a);
      if (ain !== bin) next.push(cut(a, b));
    }
    poly = next;
    if (poly.length < 3) return null;
  }
  const closed = round([...poly, poly[0]]);
  return closed.length >= 4 ? closed : null;
}

/** A line cut to a box: the runs of it that are inside (Liang-Barsky per segment). */
function clipLine(pts, [w, s, e, n]) {
  const runs = [];
  let run = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, x0 - w], [dx, e - x0], [-dy, y0 - s], [dy, n - y0]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } }
      else {
        const t = q / p;
        if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; }
        else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
      }
    }
    if (!ok) { run = null; continue; }
    const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy];
    if (!run || t0 > 0) { run = [a]; runs.push(run); }
    run.push(b);
    if (t1 < 1) run = null;
  }
  return runs.map(round).filter((l) => l.length >= 2);
}

// ---- the cells ------------------------------------------------------------------------------
const cells = new Map();
function cell(i, j) {
  const key = `${i}_${j}`;
  if (!cells.has(key)) cells.set(key, { land: [], coast: [], rivers: [], lakes: [], borders: [], places: [], hills: [], peaks: [] });
  return cells.get(key);
}
const boxOf = (i, j, pad = 0) => [-180 + i * CELL - pad, -90 + j * CELL - pad, -180 + (i + 1) * CELL + pad, -90 + (j + 1) * CELL + pad];
const clampI = (v) => Math.max(0, Math.min(360 / CELL - 1, v));
const clampJ = (v) => Math.max(0, Math.min(180 / CELL - 1, v));
function* cellsTouching(b) {
  for (let i = clampI(Math.floor((b[0] + 180) / CELL)); i <= clampI(Math.floor((b[2] + 180) / CELL)); i++)
    for (let j = clampJ(Math.floor((b[1] + 90) / CELL)); j <= clampJ(Math.floor((b[3] + 90) / CELL)); j++) yield [i, j];
}
const feature = (properties, type, coordinates) => ({ type: "Feature", properties, geometry: { type, coordinates } });

// Land: the fill is clipped per cell; the coast is the same rings as lines, clipped cleanly.
const land = read("land");
const lightLand = [];
for (const f of land.features) {
  for (const raw of polygonsOf(f.geometry)) {
    const light = polygon(raw, LIGHT);
    if (light) { const b = bboxOf(light[0]); if (b[2] - b[0] + (b[3] - b[1]) > 1) lightLand.push(feature({}, "Polygon", light)); }
    const p = polygon(raw, DETAIL.land);
    if (!p) continue;
    const b = bboxOf(p[0]);
    for (const [i, j] of cellsTouching(b)) {
      const tight = boxOf(i, j), wide = boxOf(i, j, OVERLAP);
      if (inside(b, tight)) {
        cell(i, j).land.push(feature({}, "Polygon", p));
        for (const r of p) cell(i, j).coast.push(feature({}, "LineString", r));
        continue;
      }
      const outer = clipRing(p[0], wide);
      if (outer) cell(i, j).land.push(feature({}, "Polygon", [outer, ...p.slice(1).filter((h) => touches(bboxOf(h), wide)).map((h) => clipRing(h, wide)).filter(Boolean)]));
      for (const r of p) for (const run of clipLine(r, tight)) cell(i, j).coast.push(feature({}, "LineString", run));
    }
  }
}
const world = {};
world.land = { type: "FeatureCollection", features: lightLand };

// Lines: rivers and borders, clipped per cell. The light world keeps the big rivers only.
function lines(name, keepLight) {
  const light = [];
  for (const f of read(name).features) {
    const props = { ...f.properties };
    delete props.name_ar;
    const parts = linesOf(f.geometry);
    if (keepLight(props)) {
      const l = parts.map((part) => line(part, LIGHT)).filter(Boolean);
      if (l.length) light.push(feature(props, "MultiLineString", l));
    }
    for (const part of parts) {
      const d = line(part, DETAIL[name]);
      if (!d) continue;
      for (const [i, j] of cellsTouching(bboxOf(d))) for (const run of clipLine(d, boxOf(i, j))) cell(i, j)[name].push(feature(props, "LineString", run));
    }
  }
  world[name] = { type: "FeatureCollection", features: light };
}
lines("rivers", (p) => p.rank <= 4.5);
lines("borders", () => true);

// Lakes: whole, in every cell they touch, with a number so the app draws each once.
const lightLakes = [];
read("lakes").features.forEach((f, k) => {
  const props = { ...f.properties, _i: k };
  delete props.name_ar;
  const light = polygonsOf(f.geometry).map((p) => polygon(p, LIGHT)).filter(Boolean);
  if (props.rank <= 3 && light.length) lightLakes.push(feature(props, "MultiPolygon", light));
  const d = polygonsOf(f.geometry).map((p) => polygon(p, DETAIL.lakes)).filter(Boolean);
  if (!d.length) return;
  for (const [i, j] of cellsTouching(bboxOf(d.flatMap((p) => p[0])))) cell(i, j).lakes.push(feature(props, "MultiPolygon", d));
});
world.lakes = { type: "FeatureCollection", features: lightLakes };

// Points: each in its one cell.
function points(name, kind, keepLight) {
  const light = [];
  for (const f of read(name).features) {
    const props = { ...f.properties };
    delete props.name_ar; delete props.pop; delete props.country;
    const [x, y] = f.geometry.coordinates.map(r3);
    const point = feature(props, "Point", [x, y]);
    if (keepLight(props)) light.push(point);
    cell(clampI(Math.floor((x + 180) / CELL)), clampJ(Math.floor((y + 90) / CELL)))[kind].push(point);
  }
  world[kind] = { type: "FeatureCollection", features: light };
}
points("places", "places", (p) => p.minzoom <= 5.4); // what the style shows below zoom 4
points("relief-hills", "hills", (p) => p.level <= 1);
points("peaks", "peaks", () => false); // peaks appear from zoom 5

console.log("light world (loaded first)");
for (const [name, fc] of Object.entries(world)) {
  const { gz } = write(`world/${name}.json`, fc, "world");
  console.log(" ", name.padEnd(8), String(fc.features.length).padStart(6), "features", (gz / 1e3).toFixed(0).padStart(5), "KB gz");
}

// Small files used whole. Arabic names are dropped: the app's map is set in English.
const WHOLE = ["countries", "cultivated", "deserts", "marine", "ranges", "regions"];
for (const name of WHOLE) {
  const fc = read(name);
  for (const f of fc.features) delete f.properties.name_ar;
  write(`${name}.json`, fc, "whole");
}
for (const f of readdirSync(out)) if (f.endsWith(".json") && !WHOLE.includes(f.replace(".json", ""))) rmSync(join(out, f));

const index = { cell_degrees: CELL, min_zoom: 4, cells: {} };
let largest = 0;
for (const [key, value] of cells) {
  if (Object.values(value).every((list) => list.length === 0)) continue;
  const { gz } = write(`cells/${key}.json`, value, "cells");
  index.cells[key] = gz; // about what travels; used for the progress line
  largest = Math.max(largest, gz);
}
write("cells/index.json", index, "world");
const kb = (n) => `${(n / 1e3).toFixed(0)} KB`;
console.log(`first map: ${kb(sizes.world + sizes.whole)} gz (light world ${kb(sizes.world)}, small whole files ${kb(sizes.whole)})`);
console.log(`detail: ${Object.keys(index.cells).length} cells, ${kb(sizes.cells)} gz in all, largest ${kb(largest)}`);
