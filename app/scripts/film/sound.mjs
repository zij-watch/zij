#!/usr/bin/env node
// Sound for the demo film: music, a quiet ambience bed, a few effects and, in a second version, the
// voice-over, mixed onto the rendered silent films (docs/event/FILM.md, "Sound"; every source is
// listed in docs/event/AUDIO_CREDITS.md). No generated audio of any kind: the music and most effects
// are recordings from the registration film's folder (zij-story), the rest are synthesised here
// with ffmpeg's own sources and filters (noise, a sine tick) and labelled as such.
//
// The effects are placed from the films' own timelines, never by ear: lib/film/board.ts for the
// board (the glides, the thread reaching each pin, each paper's beats) and lib/film/timeline.ts for
// the first film. That is why this script runs with tsx, which reads TypeScript:
//
//   npx tsx scripts/film/sound.mjs                    both films, if their silent files exist
//   npx tsx scripts/film/sound.mjs --films v2         the board only
//   npx tsx scripts/film/sound.mjs --story D:/Zij/zij-story
//   npx tsx scripts/film/sound.mjs --films v3         the third film (see "The third film" below)
//
// Writes app/film/film-final.mp4, film-final-voice.mp4, film-v2-final.mp4, film-v2-final-voice.mp4:
// the picture copied (-c:v copy), AAC 48 kHz, 29.5 s, mastered to -14 LUFS and at most -1 dBTP.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BEATS, STORY, THREAD, threadDrawn, TITLE_INK, TRAVELS } from "../../lib/film/board.ts";
import { DURATION, FILM_QUERY, T } from "../../lib/film/timeline.ts";
import { makeCut } from "../../lib/film/v3.ts";
import { DURATION31, makeCut31 } from "../../lib/film/v31.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const STORY_DIR = option("story", "D:/Zij/zij-story");
const OUT = join(APP, "film");
const WORK = join(OUT, "work", "sound");
const AUDIO = join(OUT, "audio");
const SFX = join(STORY_DIR, "assets", "sfx");
const MUSIC = join(STORY_DIR, "assets", "music", "pixabay-kulakovka-arabic-295885.mp3");
const VOICE = readdirSync(AUDIO).filter((f) => /^voiceover\./.test(f)).map((f) => join(AUDIO, f))[0];
const VOICE_V3 = readdirSync(AUDIO).filter((f) => /^voiceover-v3\.(wav|mp3|m4a|flac|aac|ogg|aiff?)$/i.test(f)).map((f) => join(AUDIO, f))[0];
const RATE = 48000;
const LOUDNESS = -14, TRUE_PEAK = -1;

// The voice-over: kept from 0.05 s to the end, played 3% faster (atempo: no change of pitch) and
// placed so its first sound is at 0.15 s; it ends at 29.03 s, and the music resolves after it.
const VOICE_TEMPO = 1.03, VOICE_FROM = 0.05, VOICE_AT = 0.15;
// The music: the last part of the track, back-timed so its final note (struck at 125.0 s in the
// track) lands at 28.95 s, on the voice's last word, and rings out over the last half-second, faded
// to silence by 29.5 s. Film time t is track time t + MUSIC_OFFSET.
const MUSIC_OFFSET = 96.05;

function run(tool, list) {
  const out = spawnSync(tool, list, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (out.status !== 0) throw new Error(`${tool} ${list.join(" ").slice(0, 300)}\n${(out.stderr ?? "").split("\n").slice(-10).join("\n")}`);
  return out;
}
const ff = (list) => run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...list]);
const FORMAT = `aresample=${RATE},aformat=sample_fmts=fltp:channel_layouts=stereo`;

/** Integrated loudness, true peak and sample peak of a file. */
function measure(file) {
  const loud = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]).stderr;
  const summary = loud.slice(loud.lastIndexOf("Summary:"));
  const lufs = Number(summary.match(/I:\s+(-?[\d.]+|-inf) LUFS/)?.[1] ?? NaN);
  const tp = Number(summary.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/)?.[1] ?? NaN);
  const stats = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "astats=measure_perchannel=none", "-f", "null", "-"]).stderr;
  const peak = Number(stats.match(/Peak level dB:\s+(-?[\d.]+|-inf)/)?.[1] ?? NaN);
  return { lufs, tp, peak };
}
const db = (x) => Math.pow(10, x / 20);

/** A cut of a recording, filtered, at a given sample peak. */
function cut(out, src, from, dur, filters, peak) {
  const raw = `${out}.raw.wav`;
  ff(["-ss", String(from), "-t", String(dur), "-i", src, "-af", `${filters},${FORMAT}`, raw]);
  ff(["-i", raw, "-af", `volume=${(peak - measure(raw).peak).toFixed(2)}dB`, out]);
  rmSync(raw);
  return out;
}
/** A synthesised sound (ffmpeg sources only), at a given sample peak. */
function synth(out, source, dur, filters, peak) {
  const raw = `${out}.raw.wav`;
  ff(["-f", "lavfi", "-t", String(dur), "-i", source, "-af", `${filters},${FORMAT}`, raw]);
  ff(["-i", raw, "-af", `volume=${(peak - measure(raw).peak).toFixed(2)}dB`, out]);
  rmSync(raw);
  return out;
}
const fades = (dur, rise = 0.04, fall = 0.15) => `afade=t=in:d=${rise}:curve=qsin,afade=t=out:st=${Math.max(0, dur - fall).toFixed(3)}:d=${fall}:curve=qsin`;

// ---------------------------------------------------------------- one sound per kind of event

/** The sound of one event, made for its length. Peaks are low: the effects are quiet and few. */
function sound(e, k) {
  const file = join(WORK, `fx-${pad(k)}-${e.kind}.wav`);
  const gain = e.gain ?? 0;
  switch (e.kind) {
    case "air": { // a glide of the camera: soft air (recorded wind, banded)
      const dur = e.dur;
      return cut(file, join(SFX, "wind-desert-plain-fs697217.mp3"), 2 + (e.seed ?? 0) * 3.7, dur,
        `highpass=f=180,lowpass=f=1600,afade=t=in:d=${(dur * 0.45).toFixed(3)}:curve=qsin,afade=t=out:st=${(dur * 0.45).toFixed(3)}:d=${(dur * 0.55).toFixed(3)}:curve=qsin`, -27 + gain);
    }
    case "thread": // the thread drawn along with the glide: a faint rasp (synthesised: pink noise, band-passed)
      return synth(file, `anoisesrc=color=pink:amplitude=0.6:seed=${17 + (e.seed ?? 0)}:sample_rate=${RATE}`, e.dur,
        `bandpass=f=4200:width_type=h:w=2600,afade=t=in:d=${(e.dur * 0.35).toFixed(3)}:curve=qsin,afade=t=out:st=${(e.dur * 0.35).toFixed(3)}:d=${(e.dur * 0.65).toFixed(3)}:curve=qsin`, -40 + gain);
    case "pin": // the thread reaching a pin, or the lever: a small metal tick (synthesised: two decaying sines)
      return synth(file, `aevalsrc=exprs='0.7*sin(2*PI*2650*t)*exp(-t*75)+0.3*sin(2*PI*5150*t)*exp(-t*120)':s=${RATE}:d=0.12`, 0.12,
        "highpass=f=900,afade=t=out:st=0.06:d=0.06", -30 + gain);
    case "ink": // a title or a line inked in: a quill on parchment
      return cut(file, join(SFX, "quill-parchment-fs507864.mp3"), 0.25 + ((e.seed ?? 0) % 3) * 0.45, Math.max(0.35, e.dur + 0.1),
        `highpass=f=500,${fades(Math.max(0.35, e.dur + 0.1), 0.03, 0.15)}`, -28 + gain);
    case "draw": // a longer line drawn: the polygon, the ink rule
      return cut(file, join(SFX, "quill-parchment-fs507864.mp3"), 10.9, e.dur, `highpass=f=500,${fades(e.dur, 0.05, 0.25)}`, -30 + gain);
    case "brush": // the Seal's brush
      return cut(file, join(SFX, "quill-parchment-fs507864.mp3"), 7.45, e.dur, `highpass=f=300,${fades(e.dur, 0.05, 0.4)}`, -26 + gain);
    case "stamp": // a file or a badge set down: heavy parchment, one knock
      return cut(file, join(SFX, "paper-parchment-fs112579.mp3"), 0.66, 0.3, `lowpass=f=2600,${fades(0.3, 0.005, 0.12)}`, -22 + gain);
    case "slide": // a sheet slid in
      return cut(file, join(SFX, "paper-sheets-fs450803.mp3"), 0.6, 0.8, `highpass=f=300,${fades(0.8, 0.08, 0.3)}`, -26 + gain);
    default:
      throw new Error(`no sound for ${e.kind}`);
  }
}
const pad = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- the events, from the timelines

const vertices = FILM_QUERY.match(/poly=([^&]+)/)[1].split(";").length; // the polygon's corners, so its sides

function boardEvents() {
  const s = STORY, out = [];
  TRAVELS.forEach(([a, b], i) => {
    out.push({ kind: "air", at: a - 0.12, dur: b - a + 0.5, seed: i, gain: i === TRAVELS.length - 1 ? -2 : 0 });
    out.push({ kind: "thread", at: a + 0.1, dur: Math.max(0.5, b - a - 0.1), seed: i });
  });
  // The thread reaches each pin: the first time the drawn length passes the pin's place along it.
  for (let i = 1; i < THREAD.at.length; i++) {
    for (let f = 0; f <= DURATION * 240; f++) if (threadDrawn(f / 240) >= THREAD.at[i] - 0.5) { out.push({ kind: "pin", at: f / 240 }); break; }
  }
  for (let n = 1; n <= 6; n++) out.push({ kind: "ink", at: s[n], dur: TITLE_INK, seed: n }); // the titles
  out.push({ kind: "stamp", at: s[2] + BEATS.link.rows, gain: -5 }); // the calendar's rows stamped
  out.push({ kind: "draw", at: s[4] + BEATS.area.draw, dur: vertices * BEATS.area.drawEvery }); // the polygon
  out.push({ kind: "slide", at: s[4] + BEATS.area.results }); // Results
  out.push({ kind: "stamp", at: s[4] + BEATS.area.badge, gain: -3 }); // the verdict's badge
  out.push({ kind: "ink", at: s[4] + BEATS.area.verdict, dur: BEATS.area.verdictFor, seed: 7, gain: -3 }); // the verdict
  out.push({ kind: "slide", at: s[5] + BEATS.day.slip, gain: -4 }); // the day's slip
  out.push({ kind: "stamp", at: s[6] + BEATS.take.csv }, { kind: "stamp", at: s[6] + BEATS.take.picture, gain: -2 }); // the two files
  out.push({ kind: "brush", at: s[7] + BEATS.seal.seal, dur: 1.6 }); // the Seal
  out.push({ kind: "ink", at: s[7] + BEATS.seal.team, dur: 0.3, seed: 8 }, { kind: "ink", at: s[7] + BEATS.seal.credit, dur: 0.3, seed: 9, gain: -3 });
  return out;
}

function firstEvents() {
  return [
    { kind: "slide", at: T.corner, gain: -5 }, // the corner slip
    { kind: "ink", at: T.modisLabel, dur: 0.25, seed: 1, gain: -4 }, { kind: "ink", at: T.viirsLabel, dur: 0.25, seed: 2, gain: -4 },
    { kind: "pin", at: T.lever }, // the lever
    { kind: "slide", at: T.calendarIn }, { kind: "stamp", at: T.rows, gain: -5 },
    { kind: "draw", at: T.proofRule, dur: 0.7 }, { kind: "slide", at: T.proofCard, gain: -3 },
    { kind: "slide", at: T.mapIn, gain: -3 }, { kind: "air", at: T.fly, dur: T.flyFor + 0.3, seed: 2 },
    { kind: "draw", at: T.draw, dur: vertices * T.drawEvery },
    { kind: "slide", at: T.resultsIn }, { kind: "stamp", at: T.badge, gain: -3 }, { kind: "ink", at: T.verdict, dur: T.verdictFor, seed: 7, gain: -3 },
    { kind: "slide", at: T.daySlip, gain: -4 }, { kind: "air", at: T.turn, dur: T.turnFor + 0.3, seed: 5, gain: -3 },
    { kind: "slide", at: T.briefIn }, { kind: "stamp", at: T.csv }, { kind: "stamp", at: T.picture, gain: -2 },
    { kind: "draw", at: T.endRule, dur: 0.7 }, { kind: "brush", at: T.seal, dur: 1.6 },
    { kind: "ink", at: T.team, dur: 0.3, seed: 8 }, { kind: "ink", at: T.credit, dur: 0.3, seed: 9, gain: -3 },
  ];
}

/** The final cut (lib/film/v3.ts): its beats come from the words' times, as the picture's do. */
const TIMING = JSON.parse(readFileSync(join(APP, "..", "docs", "event", "zij-demo30-v3-timing.json"), "utf8"));
function v3Events() {
  const { beats: b, glides } = makeCut(TIMING), out = [];
  glides.forEach(([a, c], i) => out.push({ kind: "air", at: a - 0.12, dur: c - a + 0.5, seed: i + 1, gain: -2 })); // the camera's moves
  out.push({ kind: "slide", at: b.fold[0], gain: -4 }); // the picture folds down
  out.push({ kind: "stamp", at: b.leap, gain: -6 }); // the leap on "tenfold"
  out.push({ kind: "draw", at: b.circle, dur: 0.7 }); // the circle round 2012
  b.stages.forEach((at, k) => out.push({ kind: "pin", at, seed: k, gain: 2 })); // the machine's four stages
  out.push({ kind: "thread", at: b.dial[0], dur: b.dial[1] - b.dial[0], seed: 3, gain: 2 }, { kind: "pin", at: b.dial[1], gain: 3 }); // the dial's sweep, and where it lands
  out.push({ kind: "draw", at: b.box[0], dur: b.box[1] - b.box[0], gain: -3 }); // the box
  out.push({ kind: "stamp", at: b.badge, gain: -6 }); // the verdict's badge
  out.push({ kind: "draw", at: b.ban, dur: 0.45, gain: -3 }); // the arrow up from 2004
  out.push({ kind: "stamp", at: b.stamp }); // the stamp
  out.push({ kind: "stamp", at: b.seal, gain: 1 }); // the Seal lands
  return out;
}

// ---------------------------------------------------------------- stems

/** Many short sounds, each at its moment, summed into one 29.5 s stem. */
function place(out, events, tag, dur = DURATION) {
  const files = events.map((e, k) => sound(e, `${tag}${k}`));
  const inputs = files.flatMap((f) => ["-i", f]);
  const chains = events.map((e, k) => `[${k}]adelay=${Math.max(0, Math.round(e.at * RATE))}S:all=1[d${k}]`);
  const graph = `${chains.join(";")};${events.map((_, k) => `[d${k}]`).join("")}amix=inputs=${events.length}:normalize=0,apad,atrim=0:${dur},${FORMAT}[out]`;
  ff([...inputs, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_f32le", out]);
  return out;
}

function stems(withVoice = true) {
  // The music: the end of the track, faded in over a second; its last note dies away before 29.5 s.
  const music = join(WORK, "music.wav");
  ff(["-ss", String(MUSIC_OFFSET), "-t", String(DURATION), "-i", MUSIC, "-af",
    `${FORMAT},afade=t=in:d=1.0:curve=qsin,afade=t=out:st=${DURATION - 0.45}:d=0.42:curve=qsin,apad,atrim=0:${DURATION}`, "-c:a", "pcm_f32le", music]);
  // The bed: the lamp's flame, under every second.
  const bed = join(WORK, "bed.wav");
  ff(["-ss", "6", "-t", String(DURATION), "-i", join(SFX, "lamp-flame-fs680474.mp3"), "-af",
    `highpass=f=120,lowpass=f=5000,${FORMAT},afade=t=in:d=0.8,afade=t=out:st=${DURATION - 0.6}:d=0.55,apad,atrim=0:${DURATION}`, "-c:a", "pcm_f32le", bed]);
  if (!withVoice) return { music, bed, voice: null };
  // The voice: cleaned lightly (a high-pass, a gentle de-noise), one channel to both, 3% faster, placed.
  const voice = join(AUDIO, "voiceover-clean.wav");
  const delay = Math.round((VOICE_AT - VOICE_FROM / VOICE_TEMPO) * RATE);
  ff(["-i", VOICE, "-af", `pan=mono|c0=c0,highpass=f=80:poles=2,afftdn=nr=6:nf=-50,atempo=${VOICE_TEMPO},${FORMAT},adelay=${delay}S:all=1,apad,atrim=0:${DURATION}`, "-c:a", "pcm_f32le", voice]);
  return { music, bed, voice };
}

/** Sets a stem to a loudness (LUFS). */
function level(file, lufs, out) {
  const m = measure(file);
  ff(["-i", file, "-af", `volume=${(lufs - m.lufs).toFixed(2)}dB`, "-c:a", "pcm_f32le", out]);
  return out;
}

/** The master: to -14 LUFS, then a true-peak limit below -1 dBTP, checked; lowered until it holds. */
function master(mix, out) {
  const m = measure(mix);
  let gain = LOUDNESS - m.lufs, limit = -1.6;
  for (let i = 0; i < 6; i++) {
    ff(["-i", mix, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=${db(limit).toFixed(4)}:level=false:attack=2:release=80:asc=1,${FORMAT}`, "-c:a", "pcm_f32le", out]);
    const r = measure(out);
    if (r.tp <= TRUE_PEAK - 0.2 && Math.abs(r.lufs - LOUDNESS) <= 0.5) return r;
    if (r.tp > TRUE_PEAK - 0.2) limit -= 0.4;
    else gain += LOUDNESS - r.lufs;
  }
  return measure(out);
}

function mux(picture, audio, out, dur = DURATION) {
  ff(["-i", picture, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", String(RATE),
    "-t", String(dur), "-movflags", "+faststart", out]);
  const probe = run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,sample_rate,width,height", "-of", "json", out]).stdout;
  const info = JSON.parse(probe);
  const duration = Number(info.format.duration);
  if (duration > 29.9) throw new Error(`${out} is ${duration} s long`);
  const after = measure(out);
  return { duration, ...after, streams: info.streams.map((s) => s.codec_type === "video" ? `${s.codec_name} ${s.width}x${s.height}` : `${s.codec_name} ${s.sample_rate} Hz`).join(", ") };
}

// ---------------------------------------------------------------- the run

mkdirSync(WORK, { recursive: true });
const films = option("films", "v1,v2").split(",");
const older = films.filter((f) => f !== "v3" && f !== "v31");
if (older.length && !VOICE) throw new Error(`No voice-over in ${AUDIO} (voiceover.*)`);
const { music, bed, voice } = stems(older.length > 0);
const voiceLevel = voice ? level(voice, -16, join(WORK, "voice-16.wav")) : null;
const report = [];
if (films.includes("v3")) third();
if (films.includes("v31")) third31();
for (const film of older) {
  const name = film === "v1" ? "film" : "film-v2";
  const picture = join(OUT, `${name}-silent.mp4`);
  if (!existsSync(picture)) {
    console.log(`  ${name}: no ${name}-silent.mp4 yet, skipped`);
    continue;
  }
  const events = film === "v1" ? firstEvents() : boardEvents();
  writeFileSync(join(WORK, `events-${film}.txt`), events.map((e) => `${e.at.toFixed(3)}\t${e.kind}${e.dur ? `\t${e.dur.toFixed(2)} s` : ""}`).join("\n") + "\n");
  const fx = place(join(WORK, `fx-${film}.wav`), events, film);
  const fxPeak = measure(fx).peak;
  // Without the voice: the music carries it, the bed under it, the effects on top.
  const plain = join(WORK, `mix-${film}.wav`);
  ff(["-i", level(music, -16, join(WORK, "music-16.wav")), "-i", level(bed, -38, join(WORK, "bed-38.wav")), "-i", fx, "-filter_complex",
    "[0][1][2]amix=inputs=3:normalize=0[out]", "-map", "[out]", "-c:a", "pcm_f32le", plain]);
  // With the voice: the music ducked 13 dB under it while he speaks, rising for its last note after his last word.
  const under = level(music, -29, join(WORK, "music-29.wav"));
  const voiced = join(WORK, `mix-${film}-voice.wav`);
  const end = VOICE_AT + (29.8 - VOICE_FROM) / VOICE_TEMPO - 0.11; // as his last word ends (29.03 s), the music comes back up for its final note
  ff(["-i", voiceLevel, "-i", under, "-i", level(bed, -40, join(WORK, "bed-40.wav")), "-i", fx, "-filter_complex",
    `[1]volume='if(lt(t,${end.toFixed(2)}),1,1+${(db(11) - 1).toFixed(4)}*min(1,(t-${end.toFixed(2)})/0.12))':eval=frame[m];[3]volume=-2dB[x];[0][m][2][x]amix=inputs=4:normalize=0[out]`,
    "-map", "[out]", "-c:a", "pcm_f32le", voiced]);
  for (const [mix, suffix] of [[plain, ""], [voiced, "-voice"]]) {
    const mastered = join(AUDIO, `${name}-final${suffix}.wav`);
    const m = master(mix, mastered);
    const file = join(OUT, `${name}-final${suffix}.mp4`);
    const checked = mux(picture, mastered, file);
    report.push(`  ${name}-final${suffix}.mp4: ${checked.duration.toFixed(3)} s, ${checked.streams}; ${checked.lufs} LUFS, true peak ${checked.tp} dBTP (master ${m.lufs} LUFS, ${m.tp} dBTP); effects stem peak ${fxPeak} dBFS`);
  }
}
console.log(report.join("\n"));

// ---------------------------------------------------------------- the third film
//
// The music is a background bed, not a feature, and the effects are quieter than in the first two
// films (6 dB lower against the music). Without a voice the music is still what carries the
// loudness: mastered to -14 LUFS it is the loudest thing there is. With a voice (a file at
// film/audio/voiceover-v3.*, transcribed and placed beforehand by scripts/film/v3-timing.mjs, whose
// timing file says where its first word goes and how much faster it plays) the voice is set to -16 LUFS, the music 18 dB under it (-34 LUFS), and ducked a
// further 6 dB or so while the voice speaks (a side-chain compressor keyed by the voice).
function third() {
  const picture = join(OUT, "film-v3-silent.mp4");
  if (!existsSync(picture)) {
    console.log("  film-v3: no film-v3-silent.mp4 yet, skipped");
    return;
  }
  const events = v3Events();
  writeFileSync(join(WORK, "events-v3.txt"), events.map((e) => `${e.at.toFixed(3)}\t${e.kind}${e.dur ? `\t${e.dur.toFixed(2)} s` : ""}`).join("\n") + "\n");
  const fx = place(join(WORK, "fx-v3.wav"), events, "v3");
  const fxPeak = measure(fx).peak - 6;
  const plain = join(WORK, "mix-v3.wav");
  ff(["-i", level(music, -16, join(WORK, "music-16.wav")), "-i", level(bed, -37, join(WORK, "bed-37.wav")), "-i", fx, "-filter_complex",
    "[2]volume=-6dB[x];[0][1][x]amix=inputs=3:normalize=0[out]", "-map", "[out]", "-c:a", "pcm_f32le", plain]);
  const mixes = [[plain, ""]];
  if (VOICE_V3) {
    // Placed as the timing file says: its first word (at t0 in the take) at `at`, `tempo` times faster.
    const { tempo, t0, at } = TIMING.voice ?? { tempo: 1, t0: 0, at: 0 };
    if (!(tempo >= 1 && tempo <= 1.05)) throw new Error("the voice's tempo must be from 1 to 1.05 (at most 5% faster)");
    const clean = join(AUDIO, "voiceover-v3-clean.wav");
    const shift = at - t0 / tempo;
    const trim = shift < 0 ? `atrim=start=${(-shift * tempo).toFixed(3)},asetpts=PTS-STARTPTS,` : "";
    const delay = Math.max(0, Math.round(shift * RATE));
    ff(["-i", VOICE_V3, "-af", `pan=mono|c0=c0,${trim}highpass=f=80:poles=2,afftdn=nr=6:nf=-50${tempo !== 1 ? `,atempo=${tempo}` : ""},${FORMAT},adelay=${delay}S:all=1,apad,atrim=0:${DURATION}`, "-c:a", "pcm_f32le", clean]);
    const spoken = level(clean, -16, join(WORK, "voice-v3-16.wav"));
    const voiced = join(WORK, "mix-v3-voice.wav");
    ff(["-i", spoken, "-i", level(music, -34, join(WORK, "music-34.wav")), "-i", level(bed, -40, join(WORK, "bed-40.wav")), "-i", fx, "-filter_complex",
      "[0]asplit=2[v][key];[1][key]sidechaincompress=threshold=0.015:ratio=6:attack=40:release=450:makeup=1[m];[3]volume=-8dB[x];[v][m][2][x]amix=inputs=4:normalize=0[out]",
      "-map", "[out]", "-c:a", "pcm_f32le", voiced]);
    mixes.push([voiced, "-voice"]);
  } else console.log("  film-v3: no film/audio/voiceover-v3.* yet, so no voice version");
  for (const [mix, suffix] of mixes) {
    const mastered = join(AUDIO, `film-v3-final${suffix}.wav`);
    const m = master(mix, mastered);
    const file = join(OUT, `film-v3-final${suffix}.mp4`);
    const checked = mux(picture, mastered, file);
    console.log(`  film-v3-final${suffix}.mp4: ${checked.duration.toFixed(3)} s, ${checked.streams}; ${checked.lufs} LUFS, true peak ${checked.tp} dBTP (master ${m.lufs} LUFS, ${m.tp} dBTP); effects peak ${fxPeak.toFixed(1)} dBFS in the mix, before mastering`);
  }
}

// ---------------------------------------------------------------- the film v3.1
//
// Yassen's take, placed by scripts/film/v31-voice.mjs (each gap 0.1 s shorter, the first word at
// 0.5 s; no change of speed or pitch), cleaned lightly and set to -16 LUFS. The music is a quiet bed
// 18 dB under it (-34 LUFS), ducked about 6 dB more while he speaks, back-timed so its final note
// lands at 29.2 s and rings out by 29.75 s. The film is 29.8 s; it is still from 29.5 s.
function timing31() { return JSON.parse(readFileSync(join(APP, "..", "docs", "event", "zij-demo30-v3.1-timing.json"), "utf8")); }
function v31Events() {
  const { beats: b, moves } = makeCut31(timing31()), out = [];
  moves.forEach(([a, c], i) => out.push({ kind: "air", at: a - 0.1, dur: c - a + 0.45, seed: i + 1, gain: i === 0 ? 0 : -2 })); // the camera's moves
  out.push({ kind: "air", at: b.flyModis[0], dur: b.flyViirs + b.fly - b.flyModis[0] + 0.2, seed: 7, gain: -6 }); // the dots in flight
  out.push({ kind: "stamp", at: b.leap, gain: -6 }); // the leap on "tenfold"
  out.push({ kind: "draw", at: b.circle, dur: 0.7 }); // the circle round 2012
  b.stages.forEach((at, k) => out.push({ kind: "pin", at, seed: k, gain: 2 })); // the four stages
  out.push({ kind: "thread", at: b.dial[0], dur: b.dial[1] - b.dial[0], seed: 3, gain: 2 }, { kind: "pin", at: b.dial[1], gain: 3 }); // the dial
  out.push({ kind: "draw", at: b.box[0], dur: b.box[1] - b.box[0], gain: -3 }); // the box
  out.push({ kind: "stamp", at: b.badge, gain: -6 }); // the verdict's badge
  out.push({ kind: "draw", at: b.ban, dur: 0.45, gain: -3 }); // the arrow up from 2004
  out.push({ kind: "stamp", at: b.stamp }); // "since 2018"
  out.push({ kind: "slide", at: b.stack[0], gain: -2 }); // the sheets slide together
  out.push({ kind: "stamp", at: b.close[1] - 0.05, gain: 1 }); // the cover closes
  out.push({ kind: "brush", at: b.brush[0], dur: b.brush[1] - b.brush[0] + 0.15, gain: -2 }); // the Seal
  return out;
}
function third31() {
  const D = DURATION31;
  const picture = join(OUT, "film-v3.1-silent.mp4");
  if (!existsSync(picture)) return console.log("  film-v3.1: no film-v3.1-silent.mp4 yet, skipped");
  const events = v31Events();
  writeFileSync(join(WORK, "events-v3.1.txt"), events.map((e) => `${e.at.toFixed(3)}\t${e.kind}${e.dur ? `\t${e.dur.toFixed(2)} s` : ""}`).join("\n") + "\n");
  const fx = place(join(WORK, "fx-v3.1.wav"), events, "v31", D);
  const music = join(WORK, "music-v3.1.wav"), bed = join(WORK, "bed-v3.1.wav");
  ff(["-ss", String(MUSIC_OFFSET - 0.25), "-t", String(D), "-i", MUSIC, "-af",
    `${FORMAT},afade=t=in:d=1.0:curve=qsin,afade=t=out:st=${D - 0.5}:d=0.45:curve=qsin,apad,atrim=0:${D}`, "-c:a", "pcm_f32le", music]);
  ff(["-ss", "6", "-t", String(D), "-i", join(SFX, "lamp-flame-fs680474.mp3"), "-af",
    `highpass=f=120,lowpass=f=5000,${FORMAT},afade=t=in:d=0.8,afade=t=out:st=${D - 0.6}:d=0.55,apad,atrim=0:${D}`, "-c:a", "pcm_f32le", bed]);
  const placed = join(AUDIO, "v31-voice-placed.wav");
  const mixes = [];
  if (existsSync(placed)) {
    const clean = join(AUDIO, "v31-voice-clean.wav");
    ff(["-i", placed, "-af", `highpass=f=80:poles=2,afftdn=nr=6:nf=-50,${FORMAT},apad,atrim=0:${D}`, "-c:a", "pcm_f32le", clean]);
    const voiced = join(WORK, "mix-v3.1-voice.wav");
    ff(["-i", level(clean, -16, join(WORK, "voice-v3.1-16.wav")), "-i", level(music, -42, join(WORK, "music-v3.1-42.wav")), "-i", level(bed, -46, join(WORK, "bed-v3.1-46.wav")), "-i", fx, "-filter_complex",
      "[0]asplit=2[v][key];[1][key]sidechaincompress=threshold=0.015:ratio=6:attack=40:release=450:makeup=1[m];[3]volume=-8dB[x];[v][m][2][x]amix=inputs=4:normalize=0[out]",
      "-map", "[out]", "-c:a", "pcm_f32le", voiced]);
    mixes.push([voiced, ""]);
  } else console.log("  film-v3.1: no placed voice yet (scripts/film/v31-voice.mjs); the file is built with music and effects only, as film-v3.1-final-novoice.mp4");
  if (!mixes.length) {
    const plain = join(WORK, "mix-v3.1.wav");
    ff(["-i", level(music, -20, join(WORK, "music-v3.1-20.wav")), "-i", level(bed, -38, join(WORK, "bed-v3.1-38.wav")), "-i", fx, "-filter_complex",
      "[2]volume=-6dB[x];[0][1][x]amix=inputs=3:normalize=0[out]", "-map", "[out]", "-c:a", "pcm_f32le", plain]);
    mixes.push([plain, "-novoice"]);
  }
  for (const [mix, suffix] of mixes) {
    const mastered = join(AUDIO, `film-v3.1-final${suffix}.wav`);
    const m = master(mix, mastered);
    const file = join(OUT, `film-v3.1-final${suffix}.mp4`);
    const checked = mux(picture, mastered, file, D);
    console.log(`  film-v3.1-final${suffix}.mp4: ${checked.duration.toFixed(3)} s, ${checked.streams}; ${checked.lufs} LUFS, true peak ${checked.tp} dBTP (master ${m.lufs} LUFS, ${m.tp} dBTP)`);
  }
}
