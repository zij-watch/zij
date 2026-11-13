"use client";

// What the browser remembers for this visitor only: saved areas, the last coordinates typed, a hint
// already read. Kept in localStorage, which can be missing, full or blocked (a private window, a
// preview): every read and write is guarded, and the app works the same without it.

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const cache = new Map<string, string | null>();

function readRaw(key: string): string | null {
  if (cache.has(key)) return cache.get(key)!;
  let value: string | null = null;
  try {
    value = window.localStorage.getItem(key);
  } catch {
    value = null;
  }
  cache.set(key, value);
  return value;
}

export function recall<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function remember(key: string, value: unknown): void {
  const raw = value === undefined ? null : JSON.stringify(value);
  cache.set(key, raw);
  try {
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
  } catch {
    // not kept: it lives until the page is closed
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key) cache.delete(event.key);
    else cache.clear();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** A remembered value that re-renders when it changes, here or in another tab. */
export function useRemembered(key: string): string | null {
  return useSyncExternalStore(subscribe, () => readRaw(key), () => null);
}
