// Checks the words of Hudhud's Fire Diary against its word budget, and its numbers against the data.
// Runs before `pnpm dev` and `pnpm build` and fails them on any problem. Node runs the TypeScript in
// lib/diary/ directly (type stripping), so this is the same check /studio/diary?script shows.
//   node scripts/check-diary.mjs          the problems, or one line saying all is well
//   node scripts/check-diary.mjs --list   every line with its word count as well

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Node notes that the .ts files have no "type" in package.json; the app's own build doesn't care.
process.removeAllListeners("warning");
process.on("warning", (w) => { if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(w); });

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const lib = (f) => import(pathToFileURL(join(APP, "lib", "diary", f)).href);
const read = (f) => JSON.parse(readFileSync(join(APP, "public", "data", f), "utf-8"));

const { diaryNumbers, placeholders, picks, claims } = await lib("numbers.ts");
const { SCRIPT, RUNNING_HEAD, UI_LABELS } = await lib("script.ts");
const { checkScript } = await lib("check.ts");

const n = diaryNumbers({ delta: read("areas/nile-delta.json"), method: read("method.json"), findings: read("findings.json") });
const report = checkScript({ chapters: SCRIPT, runningHead: RUNNING_HEAD, ui: UI_LABELS }, placeholders(n), picks(n), claims(n));

if (process.argv.includes("--list")) {
  let at = "";
  for (const r of report.rows) {
    if (r.chapter !== at) console.log(`\n${(at = r.chapter)}`);
    for (const t of r.texts) console.log(`  ${String(t.words).padStart(2)}/${t.limit}  ${t.inUse ? " " : "~"} ${t.plain}`);
  }
  for (const note of report.notes) for (const t of note.texts) console.log(`\n${note.chapter}, for grown-ups\n  ${t.words}/${t.limit}  ${t.plain}`);
}

const lines = report.rows.reduce((s, r) => s + r.texts.length, 0) + report.notes.length + report.runningHead.length + report.ui.length;
if (report.issues.length) {
  console.error(`check-diary: ${report.issues.length} problem${report.issues.length > 1 ? "s" : ""} in lib/diary/script.ts (data of ${n.builtAt}):`);
  for (const i of report.issues) console.error(`  - ${i}`);
  process.exit(1);
}
console.log(`check-diary: ${lines} lines and labels within the word budget, numbers from the data of ${n.builtAt}.`);
