// Fetching the big data files: with progress the user can read, and an unzip that works everywhere.
//
// - Progress: "Loading 4.2 MB… 37%". The size comes from the index files, so it is known before
//   the first byte arrives.
// - Unzip: the files are gzipped (.bin.gz). Some hosts unzip such files on the way, so the gzip
//   magic bytes are checked first and the bytes are inflated only if they are there. The inflate
//   is fflate's, bundled, not the browser's DecompressionStream, so older Safari works too.

import { versioned } from "./version";
import { gunzipSync } from "fflate";
import { useSyncExternalStore } from "react";

export interface Loading {
  label: string; // "the cells of Argentina"
  bytes: number; // the file's size, from the index
  received: number;
}

let current: Loading | null = null;
const listeners = new Set<() => void>();
function set(next: Loading | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

/** For loaders that fetch in their own way (the map's detail cells): say what is in progress, or null when done. */
export function reportLoading(next: Loading | null) {
  set(next);
}

/** The download in progress, if any, for showing to the user. */
export function useLoading(): Loading | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

export function megabytes(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Loading the cells of Argentina, 4.0 MB… 37%" */
export function loadingWords(loading: Loading): string {
  const pct = loading.bytes > 0 ? Math.min(99, Math.round((100 * loading.received) / loading.bytes)) : 0;
  return `Loading ${loading.label}, ${megabytes(loading.bytes)}… ${pct}%`;
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** The file's bytes, unzipped if they are gzipped. Always a buffer of its own, starting at byte 0. */
export function inflateIfGzip(bytes: Uint8Array): ArrayBuffer {
  const out = isGzip(bytes) ? gunzipSync(bytes) : bytes;
  return out.byteOffset === 0 && out.byteLength === out.buffer.byteLength
    ? (out.buffer as ArrayBuffer)
    : (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
}

/** Fetch a data file with progress, and return it unzipped. */
export async function fetchData(url: string, label: string, bytes: number): Promise<ArrayBuffer> {
  set({ label, bytes, received: 0 });
  try {
    const response = await fetch(versioned(url));
    if (!response.ok) throw new Error(`Could not load ${label} (${response.status})`);
    const chunks: Uint8Array[] = [];
    let received = 0;
    const reader = response.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        set({ label, bytes, received });
      }
    } else {
      chunks.push(new Uint8Array(await response.arrayBuffer()));
      received = chunks[0].length;
    }
    const all = new Uint8Array(received);
    let at = 0;
    for (const chunk of chunks) {
      all.set(chunk, at);
      at += chunk.length;
    }
    return inflateIfGzip(all);
  } finally {
    set(null);
  }
}
