#!/usr/bin/env node
// The film v3.1's voice, placed (docs/event/FILM.md, "v3.1"): Yassen's take as he recorded it, with
// each silence between his lines 0.1 s shorter and the whole moved so his first word starts at
// about 0.5 s. No change of speed or pitch: only silence is taken out. Then whisper.cpp gives the
// placed voice's word times, and scripts/film/v31-timing.mjs keys every beat to them.
//
//   npx tsx scripts/film/v31-voice.mjs            from app/
//
// Writes film/audio/v31-voice-placed.wav (48 kHz, mono) and film/work/v31-voice/words.json.

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTIONS31, DURATION31, SCRIPT31, VOICE31 } from "../../lib/film/v31.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUDIO = join(APP, "film", "audio"), WORK = join(APP, "film", "work", "v31-voice");
const WHISPER = process.env.WHISPER ?? "D:/Zij/zij-story/whisper/build/bin/whisper-cli.exe";
const MODEL = process.env.MODEL ?? "D:/Zij/zij-story/whisper/ggml-large-v3-turbo.bin";
mkdirSync(WORK, { recursive: true });
const run = (tool, args) => {
  const out = spawnSync(tool, args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (out.status !== 0) throw new Error(`${tool}: ${(out.stderr ?? "").split("\n").slice(-8).join("\n")}`);
  return out;
};
const take = process.env.TAKE ?? readdirSync(AUDIO).filter((f) => /^voiceover-v3\.(wav|mp3|m4a|flac|aac|ogg|aiff?)$/i.test(f)).map((f) => join(AUDIO, f))[0];
if (!take) throw new Error(`no voiceover-v3.* in ${AUDIO}`);

// The take's silences, so each cut is made inside one.
const quiet = run("ffmpeg", ["-hide_banner", "-nostats", "-i", take, "-af", "silencedetect=noise=-42dB:d=0.1", "-f", "null", "-"]).stderr;
const silences = [];
for (const m of quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)) silences.push([Number(m[1]), Number(m[2])]);
const cuts = CAPTIONS31.slice(1).map((c, k) => {
  const gap = [CAPTIONS31[k].to, c.from];
  // The silence that overlaps the gap the most; its middle, kept inside the gap, is where 0.1 s goes.
  const best = silences.map(([a, b]) => [Math.max(a, gap[0] - 0.15), Math.min(b, gap[1] + 0.15)]).filter(([a, b]) => b - a >= VOICE31.cut + 0.04).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  const mid = best ? (best[0] + best[1]) / 2 : (gap[0] + gap[1]) / 2;
  console.log(`  gap ${k + 1}/${k + 2}: captions ${gap[0]}-${gap[1]} s; ${best ? `silence ${best[0].toFixed(2)}-${best[1].toFixed(2)} s` : "no silence found, the caption gap's middle"}; cut ${(mid - VOICE31.cut / 2).toFixed(3)}-${(mid + VOICE31.cut / 2).toFixed(3)} s`);
  return [mid - VOICE31.cut / 2, mid + VOICE31.cut / 2];
});

// Keep everything but the cuts, joined, then moved so the first caption's start lands at VOICE31.at.
const keep = [];
let from = 0;
for (const [a, b] of cuts) {
  keep.push([from, a]);
  from = b;
}
keep.push([from, null]);
const parts = keep.map(([a, b], k) => `[0]atrim=start=${a.toFixed(4)}${b === null ? "" : `:end=${b.toFixed(4)}`},asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st=${b === null ? 999 : Math.max(0, b - a - 0.004).toFixed(4)}:d=0.004[p${k}]`);
const shift = VOICE31.at - CAPTIONS31[0].from;
const graph = `${parts.join(";")};${keep.map((_, k) => `[p${k}]`).join("")}concat=n=${keep.length}:v=0:a=1,pan=mono|c0=c0,aresample=48000,adelay=${Math.round(shift * 1000)},apad,atrim=0:${DURATION31}[out]`;
const placed = join(AUDIO, "v31-voice-placed.wav");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", take, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_s16le", placed]);
console.log(`  ${placed}: ${cuts.length} gaps each 0.1 s shorter, moved ${shift.toFixed(2)} s later`);

// The placed voice's word times.
const low = join(WORK, "voice16k.wav");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", placed, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", low]);
run(WHISPER, ["-m", MODEL, "-f", low, "-l", "en", "-ml", "1", "-sow", "-oj", "-of", join(WORK, "words"), "--prompt", SCRIPT31.join(" ")]);
console.log(`  ${join(WORK, "words.json")}: word times of the placed voice`);
