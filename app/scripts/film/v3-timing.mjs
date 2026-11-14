#!/usr/bin/env node
// The third film's word times, and its captions from them (docs/event/FILM.md, "The third version").
//
//   npx tsx scripts/film/v3-timing.mjs --planned
//       the planned timings: each line spread over its window (L1 0.1-2.8, L2 2.8-5.0, L3 5.0-9.4,
//       L4 9.4-16.0, L5 16.0-22.0, L6 22.0-28.9), word by word in proportion to its letters
//   npx tsx scripts/film/v3-timing.mjs --whisper film/work/v3-voice/words.json --tempo 1.02 --at 0.12
//       the recorded voice's word times: whisper.cpp's JSON (-ml 1 -sow -oj), matched to the script
//       word by word, played `tempo` times faster and placed so its first word starts at `at`
//
// Writes docs/event/zij-demo30-v3-timing.json (the times every beat is keyed to) and
// docs/event/zij-demo30.en.srt (the captions: short cues, no gaps, each inside its shot).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cuesOf, makeCut, SCRIPT, words } from "../../lib/film/v3.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOCS = join(APP, "..", "docs", "event");
const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const bare = (w) => w.toLowerCase().replace(/[^a-z0-9%']/g, "");

let timing;
if (argv.includes("--planned")) {
  const windows = [[0.1, 2.8], [2.8, 5.0], [5.0, 9.4], [9.4, 16.0], [16.0, 22.0], [22.0, 28.9]];
  const pause = [0.15, 0.6, 0.25, 0.25, 0.25, 0.05]; // L2 ends with a beat of stillness
  timing = {
    source: "planned: the brief's line windows, words spread by their letters",
    tempo: 1,
    lines: SCRIPT.map((line, k) => {
      const list = words(line);
      const [a, b] = windows[k];
      const from = a + (k === 0 ? 0.05 : 0.08), to = b - pause[k];
      const weight = list.map((w) => bare(w).length + 2);
      const total = weight.reduce((x, y) => x + y, 0);
      let at = from;
      return list.map((w, i) => {
        const span = ((to - from) * weight[i]) / total;
        const word = { w, from: r3(at), to: r3(at + span * 0.92) };
        at += span;
        return word;
      });
    }),
  };
} else if (option("whisper")) {
  // whisper.cpp with -ml 1 -sow gives one segment per word, offsets in milliseconds.
  const tempo = Number(option("tempo", "1")), at = Number(option("at", "0.1"));
  if (!(tempo >= 1 && tempo <= 1.05)) throw new Error("--tempo must be 1 to 1.05");
  const heard = JSON.parse(readFileSync(option("whisper"), "utf8")).transcription
    .map((s) => ({ w: bare(s.text), from: s.offsets.from / 1000, to: s.offsets.to / 1000 })).filter((s) => s.w);
  const t0 = heard[0].from;
  const place = (x) => r3(at + (x - t0) / tempo);
  let j = 0;
  const unmatched = [];
  timing = {
    source: `voice: whisper.cpp word times, ${tempo === 1 ? "at its own speed" : `${Math.round((tempo - 1) * 1000) / 10}% faster`}, first word at ${at} s`,
    tempo,
    voice: { tempo, t0, at },
    lines: SCRIPT.map((line) => words(line).map((w) => {
      const want = bare(w);
      // The next heard word that is this one, within a few words; else this word is placed between its neighbours.
      for (let k = j; k < Math.min(heard.length, j + 4); k++) {
        if (heard[k].w === want || heard[k].w.replace(/'/g, "") === want.replace(/'/g, "") || (want.length > 3 && heard[k].w.startsWith(want.slice(0, 4)))) {
          j = k + 1;
          return { w, from: place(heard[k].from), to: place(heard[k].to) };
        }
      }
      unmatched.push(w);
      return { w, from: NaN, to: NaN };
    })),
  };
  // Words whisper did not give apart are spread between the matched words either side.
  const flat = timing.lines.flat();
  flat.forEach((word, i) => {
    if (!Number.isNaN(word.from)) return;
    let a = i - 1, b = i + 1;
    while (a >= 0 && Number.isNaN(flat[a].from)) a--;
    while (b < flat.length && Number.isNaN(flat[b].from)) b++;
    const lo = a >= 0 ? flat[a].to : 0, hi = b < flat.length ? flat[b].from : lo + 0.4;
    const n = b - a - 1, k = i - a;
    word.from = r3(lo + ((hi - lo) * (k - 1)) / n);
    word.to = r3(lo + ((hi - lo) * k) / n);
  });
  if (unmatched.length) console.log(`  placed between their neighbours (not heard apart): ${unmatched.join(", ")}`);
} else throw new Error("--planned or --whisper <file>");

const cut = makeCut(timing); // throws if a beat's word is missing
writeFileSync(join(DOCS, "zij-demo30-v3-timing.json"), JSON.stringify(timing, null, 1) + "\n");
const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const cues = cuesOf(cut);
writeFileSync(join(DOCS, "zij-demo30.en.srt"), cues.map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`).join("\n"));
console.log(`  ${timing.source}`);
console.log(`  shots: ${cut.beats.shots.map((s) => s.toFixed(2)).join(", ")}; last word ends ${cut.beats.end.toFixed(2)} s`);
console.log(`  ${cues.length} captions written to docs/event/zij-demo30.en.srt`);
