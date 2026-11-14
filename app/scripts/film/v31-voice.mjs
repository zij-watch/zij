#!/usr/bin/env node
// The film v3.1's voice, placed (docs/event/FILM.md, "v3.1"). Yassen's take runs 31.1 s and the film
// may not pass 29.9 s, with the book closing after his last word. So: every pause in it (quieter
// than -40 dB for 80 ms or more) is shortened to 70 ms, the take is played at most 5% faster with
// rubberband (high quality, formants kept: no change of pitch), and it is placed so his first word starts at 0.3 s and his last ends
// by 29.05 s. Then whisper.cpp gives the placed voice's word times, which every beat is keyed to.
//
//   npx tsx scripts/film/v31-voice.mjs            from app/; the take is film/audio/voiceover-v3.*
//
// Writes film/audio/v31-voice-placed.wav (48 kHz, mono) and film/work/v31-voice/words.json.

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DURATION31, SCRIPT31 } from "../../lib/film/v31.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUDIO = join(APP, "film", "audio"), WORK = join(APP, "film", "work", "v31-voice");
const WHISPER = process.env.WHISPER ?? "D:/Zij/zij-story/whisper/build/bin/whisper-cli.exe";
const MODEL = process.env.MODEL ?? "D:/Zij/zij-story/whisper/ggml-large-v3-turbo.bin";
const AT = 0.3, END = 29.05, PAUSE = 0.07, MAX_TEMPO = 1.05;
mkdirSync(WORK, { recursive: true });
const run = (tool, args) => {
  const out = spawnSync(tool, args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (out.status !== 0) throw new Error(`${tool}: ${(out.stderr ?? "").split("\n").slice(-8).join("\n")}`);
  return out;
};
const take = process.env.TAKE ?? readdirSync(AUDIO).filter((f) => /^voiceover-v3\.(wav|mp3|m4a|flac|aac|ogg|aiff?)$/i.test(f)).map((f) => join(AUDIO, f))[0];
if (!take) throw new Error(`no voiceover-v3.* in ${AUDIO}`);
const length = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", take]).stdout);

// Where he speaks: the take without its leading and trailing quiet, and its pauses.
const quiet = run("ffmpeg", ["-hide_banner", "-nostats", "-i", take, "-af", "silencedetect=noise=-40dB:d=0.08", "-f", "null", "-"]).stderr;
const pauses = [...quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const lead = run("ffmpeg", ["-hide_banner", "-nostats", "-i", take, "-af", "silencedetect=noise=-45dB:d=0.02", "-f", "null", "-"]).stderr;
const leadEnd = lead.match(/silence_start: 0(?:\.0+)?\s[\s\S]*?silence_end: ([\d.]+)/);
const first = leadEnd ? Number(leadEnd[1]) : 0;
const inner = pauses.filter(([a, b]) => a > first + 0.05 && b < length - 0.02);
const tail = pauses.find(([, b]) => b >= length - 0.02);
const last = tail ? tail[0] : length;

// Keep the speech; each inner pause keeps PAUSE seconds, from its middle out.
const keep = [];
let from = first;
for (const [a, b] of inner) {
  const mid = (a + b) / 2;
  keep.push([from, mid - PAUSE / 2]);
  from = mid + PAUSE / 2;
}
keep.push([from, last]);
const spoken = keep.reduce((s, [a, b]) => s + (b - a), 0);
const tempo = Math.min(MAX_TEMPO, Math.max(1, spoken / (END - AT)));
const ends = AT + spoken / tempo;
console.log(`  take ${length.toFixed(2)} s; speech ${first.toFixed(2)}-${last.toFixed(2)} s; ${inner.length} pauses shortened to ${PAUSE * 1000} ms: ${spoken.toFixed(2)} s`);
console.log(`  tempo ${tempo.toFixed(4)} (${((tempo - 1) * 100).toFixed(1)}% faster, pitch unchanged): first word at ${AT} s, last word ends ${ends.toFixed(2)} s`);
if (ends > END + 0.01) console.log(`  NOTE: even at ${MAX_TEMPO}x he ends at ${ends.toFixed(2)} s, after ${END} s`);

const parts = keep.map(([a, b], k) => `[0]atrim=start=${a.toFixed(4)}:end=${b.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st=${Math.max(0, b - a - 0.006).toFixed(4)}:d=0.006[p${k}]`);
const graph = `${parts.join(";")};${keep.map((_, k) => `[p${k}]`).join("")}concat=n=${keep.length}:v=0:a=1,pan=mono|c0=0.5*c0+0.5*c1,aresample=48000,rubberband=tempo=${tempo.toFixed(5)}:pitchq=quality:transients=mixed:detector=compound:window=standard:formant=preserved,adelay=${Math.round(AT * 1000)},apad,atrim=0:${DURATION31}[out]`;
const placed = join(AUDIO, "v31-voice-placed.wav");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", take, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_s24le", placed]);
console.log(`  ${placed}`);

const low = join(WORK, "voice16k.wav");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", placed, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", low]);
run(WHISPER, ["-m", MODEL, "-f", low, "-l", "en", "-ml", "1", "-sow", "-oj", "-of", join(WORK, "words"), "--prompt", SCRIPT31.join(" ")]);
console.log(`  ${join(WORK, "words.json")}: the placed voice's word times`);
