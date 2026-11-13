// Copies the Zij atlas data (github.com/zij-watch/zij-map, public/atlas) into app/public/atlas,
// lightened for the app, whose map stops at zoom 9: coordinates to 3 decimals, lines simplified
// (the coast less than the rest), and the files only the still renderer reads left out.
// Usage: node scripts/atlas-lite.mjs <zij-map>/public/atlas public/atlas
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
const [src, out] = process.argv.slice(2);
const TOLERANCE = { land: 0.006, rivers: 0.01, lakes: 0.01, borders: 0.01 }; // degrees
let TOL = 0.01;
mkdirSync(out, { recursive: true });
const r = (n) => Math.round(n * 1000) / 1000;
function dp(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]]; const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop(); const [ax, ay] = pts[a]; const [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy; let worst = -1, wd = t2;
    for (let i = a + 1; i < b; i++) { const [px, py] = pts[i]; let d;
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)); d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; }
      if (d > wd) { wd = d; worst = i; } }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const dedupe = (pts) => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
const line = (l) => { const o = dedupe(dp(l, TOL).map(([x, y]) => [r(x), r(y)])); return o.length >= 2 ? o : null; };
const ring = (g) => { const mid = g.length >> 1; const o = dedupe([...dp(g.slice(0, mid + 1), TOL), ...dp(g.slice(mid), TOL).slice(1)].map(([x, y]) => [r(x), r(y)])); return o.length >= 4 ? o : null; };
const poly = (p) => { const outer = ring(p[0]); return outer ? [outer, ...p.slice(1).map(ring).filter(Boolean)] : null; };
function geom(g) {
  switch (g.type) {
    case "Point": return { type: "Point", coordinates: g.coordinates.map(r) };
    case "LineString": { const c = line(g.coordinates); return c && { type: g.type, coordinates: c }; }
    case "MultiLineString": { const c = g.coordinates.map(line).filter(Boolean); return c.length ? { type: g.type, coordinates: c } : null; }
    case "Polygon": { const c = poly(g.coordinates); return c && { type: g.type, coordinates: c }; }
    case "MultiPolygon": { const c = g.coordinates.map(poly).filter(Boolean); return c.length ? { type: g.type, coordinates: c } : null; }
    default: return g;
  }
}
const SKIP = new Set(["marine-arcs", "regions-arcs", "study-areas"]); // still renderer and harness only
let raw = 0, gz = 0;
for (const f of readdirSync(src).filter((f) => f.endsWith(".json"))) {
  const name = f.replace(".json", ""); if (SKIP.has(name)) continue;
  const fc = JSON.parse(readFileSync(join(src, f), "utf8"));
  if (name === "places") for (const ft of fc.features) { delete ft.properties.pop; delete ft.properties.country; }
  if (name in TOLERANCE) TOL = TOLERANCE[name];
  if (name in TOLERANCE) fc.features = fc.features.map((ft) => ({ ...ft, geometry: geom(ft.geometry) })).filter((ft) => ft.geometry);
  const text = JSON.stringify(fc); writeFileSync(join(out, f), text);
  const g = gzipSync(text, { level: 9 }).length; raw += text.length; gz += g;
  console.log(name.padEnd(14), (text.length / 1e3).toFixed(0).padStart(6), "KB", (g / 1e3).toFixed(0).padStart(5), "KB gz");
}
console.log("total", (raw / 1e6).toFixed(2), "MB", (gz / 1e6).toFixed(2), "MB gz");
