// Drawing with one gesture (app/lib/sketch.ts): boxes from two corners, the 180th meridian,
// thinning a lasso to what the address can hold, and telling a drag from a click.
//
//   node --import ./lib/fit/test/register.mjs --test "lib/map/test/*.test.mjs"   (from app/)

import assert from "node:assert/strict";
import test from "node:test";

import { boxFromCorners, isTooSmall, lassoShape, MAX_POINTS, simplifyIndices, wrapLon } from "../../sketch.ts";

test("a box is the same whichever corner the drag starts from", () => {
  assert.deepEqual(boxFromCorners([31.5, 31.4], [30.5, 30.6]), [30.5, 30.6, 31.5, 31.4]);
  assert.deepEqual(boxFromCorners([30.5, 31.4], [31.5, 30.6]), [30.5, 30.6, 31.5, 31.4]);
});

test("a box drawn on a copy of the world is brought back to -180..180", () => {
  assert.deepEqual(boxFromCorners([390.5, 30.6], [391.5, 31.4]), [30.5, 30.6, 31.5, 31.4]);
  assert.deepEqual(boxFromCorners([-329.5, 30.6], [-328.5, 31.4]), [30.5, 30.6, 31.5, 31.4]);
});

test("a box across the 180th meridian, or with no width or height, is refused", () => {
  assert.equal(boxFromCorners([170, 0], [190, 10]), null);
  assert.equal(boxFromCorners([10, 5], [10, 9]), null);
  assert.equal(boxFromCorners([10, 5], [12, 5]), null);
  assert.equal(boxFromCorners([-200, 5], [200, 9]), null);
});

test("latitudes stay inside the map's ±85", () => {
  assert.deepEqual(boxFromCorners([10, -89], [20, 89]), [10, -85, 20, 85]);
});

test("wrapLon keeps 180 and -180 apart", () => {
  assert.equal(wrapLon(180), 180);
  assert.equal(wrapLon(-180), -180);
  assert.equal(wrapLon(190), -170);
  assert.equal(wrapLon(-190), 170);
});

test("a drag under 8 pixels either way is a click", () => {
  assert.equal(isTooSmall([[0, 0], [7, 40]]), true);
  assert.equal(isTooSmall([[0, 0], [40, 7]]), true);
  assert.equal(isTooSmall([[0, 0], [8, 8]]), false);
  assert.equal(isTooSmall([[5, 5]]), true);
});

/** A circle traced with `n` points, radius `r` pixels. */
const circle = (n, r = 200) => Array.from({ length: n }, (_, i) => [300 + r * Math.cos((2 * Math.PI * i) / n), 300 + r * Math.sin((2 * Math.PI * i) / n)]);

test("a long trace is thinned to at most 199 points", () => {
  const kept = simplifyIndices(circle(5000));
  assert.ok(kept.length <= MAX_POINTS, `${kept.length} points`);
  assert.ok(kept.length >= 20, `${kept.length} points: too few to keep a circle round`);
  // The indices keep their order.
  assert.deepEqual([...kept].sort((a, b) => a - b), kept);
});

test("a straight stretch keeps only its ends", () => {
  const line = Array.from({ length: 50 }, (_, i) => [i * 4, 10]);
  assert.deepEqual(simplifyIndices(line), [0, 49]);
});

test("a lasso becomes a closed polygon the address can hold", () => {
  const screen = circle(1200);
  const lngLat = screen.map(([x, y]) => [x / 100, y / 100]);
  const shape = lassoShape(screen, lngLat);
  assert.equal(shape.type, "Polygon");
  const ring = shape.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.ok(ring.length - 1 <= MAX_POINTS);
  assert.ok(ring.length - 1 >= 3);
});

test("a tiny lasso, or one across the 180th meridian, draws nothing", () => {
  assert.equal(lassoShape([[0, 0], [3, 2], [1, 4]], [[0, 0], [0.03, 0.02], [0.01, 0.04]]), null);
  const screen = [[0, 0], [100, 0], [100, 100], [0, 100]];
  assert.equal(lassoShape(screen, [[170, 0], [190, 0], [190, 10], [170, 10]]), null);
});
