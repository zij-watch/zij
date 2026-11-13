"use client";

// Areas a visitor saved from the map, kept in this browser only. A saved area is a drawn shape
// with a name: choosing it puts the shape back in the address, so its link still works anywhere.

import { useMemo } from "react";
import type { Shape } from "./fit/cells";
import { recall, remember, useRemembered } from "./remember";

export interface SavedArea { id: string; name: string; shape: Shape; saved: string }

const KEY = "zij.presets.v1";
const sameShape = (a: Shape, b: Shape) => JSON.stringify(a) === JSON.stringify(b);

function valid(entry: unknown): entry is SavedArea {
  const e = entry as SavedArea;
  return Boolean(e && typeof e.id === "string" && typeof e.name === "string" && e.shape && (Array.isArray(e.shape) ? e.shape.length === 4 : Array.isArray(e.shape.coordinates)));
}

export function savedAreas(): SavedArea[] {
  const list = recall<unknown[]>(KEY, []);
  return Array.isArray(list) ? list.filter(valid) : [];
}

export function useSavedAreas(): SavedArea[] {
  const raw = useRemembered(KEY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => savedAreas(), [raw]);
}

export function findSaved(shape: Shape | null): SavedArea | null {
  return shape ? savedAreas().find((a) => sameShape(a.shape, shape)) ?? null : null;
}

/** "My area 3": the first number not taken. */
export function nextName(): string {
  const names = new Set(savedAreas().map((a) => a.name));
  let k = 1;
  while (names.has(`My area ${k}`)) k += 1;
  return `My area ${k}`;
}

export function saveArea(name: string, shape: Shape): SavedArea {
  const area: SavedArea = { id: `a${Date.now().toString(36)}`, name: name.trim() || nextName(), shape, saved: new Date().toISOString() };
  remember(KEY, [...savedAreas().filter((a) => !sameShape(a.shape, shape)), area]);
  return area;
}

export function forgetArea(id: string): void {
  remember(KEY, savedAreas().filter((a) => a.id !== id));
}
