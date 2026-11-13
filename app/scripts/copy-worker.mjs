// Copies two kinds of files from node_modules into public/vendor/, where the app loads them by URL:
//
//   maplibre/  MapLibre's web worker. The bundler moves MapLibre into a chunk, so the worker's
//              own URL no longer exists; components/MapView.tsx points MapLibre at this copy.
//   fonts/     Two font files, embedded into the calendar PNG so it looks like the screen.
//
// The copies are committed, so the app builds under a plain `next build` too. This script runs
// before `dev` and `build` (predev, prebuild) to keep them in step with the installed packages.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["maplibre-gl/dist/maplibre-gl-worker.mjs", "maplibre/maplibre-gl-worker.mjs"],
  ["@fontsource/amiri/files/amiri-latin-400-normal.woff2", "fonts/amiri-latin-400-normal.woff2"],
  ["@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2", "fonts/cormorant-garamond-latin-600-normal.woff2"],
];
for (const [from, to] of copies) {
  const target = join(root, "public", "vendor", to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(root, "node_modules", from), target);
}
console.log(`Copied ${copies.length} files to public/vendor/`);
