// Reading the exported files on the server, for the first HTML. Only server components import this.
// The files are included in the server bundle by `outputFileTracingIncludes` in next.config.ts.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Area, Index } from "./data";
import { areaFacts, type AreaFacts } from "./facts";

const DATA = join(process.cwd(), "public", "data");

export async function readIndex(): Promise<Index | null> {
  try {
    return JSON.parse(await readFile(join(DATA, "index.json"), "utf-8")) as Index;
  } catch {
    return null;
  }
}

export async function readArea(id: string): Promise<Area | null> {
  try {
    return JSON.parse(await readFile(join(DATA, "areas", `${id}.json`), "utf-8")) as Area;
  } catch {
    return null;
  }
}

/** The method numbers (validation errors per model), as exported by the pipeline. */
export async function readMethod(): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(join(DATA, "method.json"), "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The headline facts of a preset area, or null for an unknown id or a missing file. */
export async function readFacts(index: Index | null, id: string | null): Promise<AreaFacts | null> {
  if (!index || !id || !index.areas.some((a) => a.id === id)) return null;
  try {
    const area = JSON.parse(await readFile(join(DATA, "areas", `${id}.json`), "utf-8")) as Area;
    return areaFacts(area);
  } catch {
    return null;
  }
}
