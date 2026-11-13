// MapLibre runs its tile work in a web worker loaded from a URL next to its own file.
// The bundler moves MapLibre into a chunk, so that URL no longer exists. This copies the
// worker files into public/vendor/maplibre/, and components/MapView.tsx points MapLibre at them.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "vendor", "maplibre");
mkdirSync(to, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) cpSync(join(from, file), join(to, file));
console.log("MapLibre worker copied to public/vendor/maplibre/");
