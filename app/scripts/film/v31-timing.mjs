#!/usr/bin/env node
// The film v3.1's word times and captions (docs/event/FILM.md, "v3.1").
//
//   npx tsx scripts/film/v31-timing.mjs --planned
//       each cue's words spread over its time (his captions, on the film's clock), by their letters
//   npx tsx scripts/film/v31-timing.mjs --whisper film/work/v31-voice/words.json
//       the placed voice's word times from whisper.cpp (-ml 1 -sow -oj), matched to his words
//
// Writes docs/event/zij-demo30-v3.1-timing.json and docs/event/zij-demo30-v3.1.en.srt: his ten
// captions, renumbered 1 to 10, his words exactly, a line over 42 characters split in two, the
// times moved with the voice (each gap between lines 0.1 s shorter, the first word at 0.5 s).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTIONS31, captions31, captionsFromWords, makeCut31, SCRIPT31 } from "../../lib/film/v31.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOCS = join(APP, "..", "docs", "event");
const argv = process.argv.slice(2);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const bare = (w) => w.toLowerCase().replace(/[^a-z0-9%']/g, "");
const cues = captions31();

let timing;
if (argv.includes("--planned")) {
  timing = {
    source: "planned: his captions' times on the film's clock, each cue's words spread by their letters",
    tempo: 1,
    lines: SCRIPT31.map((line, k) => {
      const list = line.split(" ");
      const from = cues[k].from + 0.03, to = cues[k].to - 0.08;
      const weight = list.map((w) => bare(w).length + 2), total = weight.reduce((a, c) => a + c, 0);
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
  const heard = JSON.parse(readFileSync(option("whisper"), "utf8")).transcription
    .map((s) => ({ w: bare(s.text), from: s.offsets.from / 1000, to: s.offsets.to / 1000 })).filter((s) => s.w);
  let j = 0;
  const missed = [];
  timing = {
    source: "voice: whisper.cpp word times on the placed voice (pauses shortened, 2.9% faster, pitch unchanged)",
    tempo: 1,
    lines: SCRIPT31.map((line) => line.split(" ").map((w) => {
      const want = bare(w);
      for (let k = j; k < Math.min(heard.length, j + 4); k++) {
        if (heard[k].w === want || heard[k].w.replace(/'/g, "") === want.replace(/'/g, "") || (want.length > 3 && heard[k].w.startsWith(want.slice(0, 4))) || (want.length > 1 && want.startsWith(heard[k].w) && heard[k].w.length >= 2)) {
          j = k + 1;
          return { w, from: r3(heard[k].from), to: r3(heard[k].to) };
        }
      }
      missed.push(w);
      return { w, from: NaN, to: NaN };
    })),
  };
  const flat = timing.lines.flat();
  flat.forEach((word, i) => {
    if (!Number.isNaN(word.from)) return;
    let a = i - 1, b = i + 1;
    while (a >= 0 && Number.isNaN(flat[a].from)) a--;
    while (b < flat.length && Number.isNaN(flat[b].from)) b++;
    const lo = a >= 0 ? flat[a].to : 0.5, hi = b < flat.length ? flat[b].from : lo + 0.4;
    const n = b - a - 1, k = i - a;
    word.from = r3(lo + ((hi - lo) * (k - 1)) / n);
    word.to = r3(lo + ((hi - lo) * k) / n);
  });
  if (missed.length) console.log(`  placed between their neighbours (not heard apart): ${missed.join(", ")}`);
} else throw new Error("--planned or --whisper <file>");

const cut = makeCut31(timing);
const timed = argv.includes("--planned") ? cues : captionsFromWords(timing, cut.beats.shots);
writeFileSync(join(DOCS, "zij-demo30-v3.1-timing.json"), JSON.stringify(timing, null, 1) + "\n");
const stamp = (s) => {
  const ms = Math.round(s * 1000), p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync(join(DOCS, "zij-demo30-v3.1.en.srt"), timed.map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.lines.join("\n")}\n`).join("\n"));
console.log(`  ${timing.source}`);
console.log(`  shots: ${cut.beats.shots.join(", ")}; last word ends ${cut.beats.end} s; ${CAPTIONS31.length} captions`);
