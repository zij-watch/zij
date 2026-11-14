// Renders the demo film from the real app, one frame at a time. No screen recording.
//
// The page /studio/film has one function, window.__film.seek(t), that draws the exact frame for
// the time t and resolves when the page is still (docs/event/FILM.md). This script opens that page
// in headless Chrome, steps t by 1/30 s, takes a JPEG screenshot of every frame at quality 92, and
// has ffmpeg make ONE mp4 per scene with the same settings (libx264, crf 18, yuv420p). The scenes
// are joined with the concat demuxer and -c copy; sound is added last with -c:v copy.
//
//   pnpm build && pnpm start --port 3111          the app, built (the dev server's badge is hidden too)
//   node scripts/film/render.mjs --stills 2.9,7.6 still frames only, into film/stills/
//   node scripts/film/render.mjs                  the whole film, into film/
//   node scripts/film/render.mjs --scenes 4,5     those scenes' frames and files again, then the joins
//
// Options: --url (the page), --out (default film/), --scale (device pixels per CSS pixel while
// photographing, default 2: frames are taken at 3840x2160 and scaled to 1920x1080 by ffmpeg),
// --thumb (the thumbnail's time in seconds), --chrome (path to Chrome), --keep (keep the frames).
//
// Needs: Node 22 or later, Chrome, ffmpeg and ffprobe on the PATH.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const URL_ = option("url", "http://localhost:3111/studio/film");
const OUT = resolve(APP, option("out", "film"));
const SCALE = Number(option("scale", "2"));
const QUALITY = 92;
const CHROME = option("chrome", process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome"));
const WORK = join(OUT, "work");
const MUSIC = join(OUT, "music.mp3");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, width = 5) => String(n).padStart(width, "0");

// ---------------------------------------------------------------- Chrome, over the DevTools protocol

async function openChrome() {
  const profile = mkdtempSync(join(tmpdir(), "zij-film-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb", "--window-size=1920,1080",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--ignore-gpu-blocklist", "--enable-gpu", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((done, fail) => {
    let text = "";
    const timer = setTimeout(() => fail(new Error("Chrome did not start")), 30000);
    chrome.stderr.on("data", (chunk) => {
      text += chunk;
      const found = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) {
        clearTimeout(timer);
        done(found[1]);
      }
    });
    chrome.on("exit", () => fail(new Error(`Chrome exited early: ${text.slice(-400)}`)));
  });
  const socket = new WebSocket(endpoint);
  await new Promise((done, fail) => {
    socket.onopen = done;
    socket.onerror = () => fail(new Error("no connection to Chrome"));
  });
  let id = 0;
  const waiting = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    const call = waiting.get(data.id);
    if (!call) return;
    waiting.delete(data.id);
    if (data.error) call.fail(new Error(`${call.method}: ${data.error.message}`));
    else call.done(data.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
    id += 1;
    waiting.set(id, { done, fail, method });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const close = async () => {
    try {
      await send("Browser.close");
    } catch { /* already gone */ }
    await sleep(400);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch { /* Chrome may still hold a file: the system's temp folder is cleaned in time */ }
  };
  return { send, close };
}

async function openFilm(chrome) {
  const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => chrome.send(method, params, sessionId);
  await page("Page.enable");
  await page("Runtime.enable");
  await page("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: SCALE, mobile: false });
  // The app's own charts draw without animation when motion is reduced; the film sets every state itself.
  await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await page("Page.navigate", { url: URL_ });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  // The page is ready when everything the film draws is loaded: data, fonts, charts, both maps, the files.
  const started = Date.now();
  for (;;) {
    const state = await evaluate("({ film: !!window.__film, waiting: document.documentElement.dataset.filmWaiting ?? '', problem: document.querySelector('.film-problem')?.textContent ?? '' })").catch(() => ({}));
    if (state.problem) throw new Error(`The film cannot start: ${state.problem}`);
    if (state.film && state.waiting === "") break;
    if (Date.now() - started > 180000) throw new Error(`The film was not ready after 3 minutes (waiting for: ${state.waiting ?? "the page"})`);
    await sleep(500);
  }
  const about = await evaluate("window.__film.ready.then(() => ({ fps: __film.fps, duration: __film.duration, frames: __film.frames, scenes: __film.scenes, cues: __film.cues, proof: __film.proof, stillFrom: __film.stillFrom }))");
  const seek = (t) => evaluate(`window.__film.seek(${t})`);
  const shoot = async (file) => {
    const { data } = await page("Page.captureScreenshot", { format: "jpeg", quality: QUALITY, captureBeyondViewport: false });
    writeFileSync(file, Buffer.from(data, "base64"));
  };
  return { about, seek, shoot };
}

// ---------------------------------------------------------------- ffmpeg

function run(tool, list) {
  const out = spawnSync(tool, list, { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`${tool} failed:\n${(out.stderr ?? "").split("\n").slice(-12).join("\n")}`);
  return out.stdout;
}

// A screenshot is a full-range JPEG at the photographing scale: it is scaled to 1920x1080 and
// brought to video range, BT.709, the same way for every scene, the stills and the thumbnail.
const toFrame = (w, h) => `scale=${w}:${h}:flags=lanczos:in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`;
const VIDEO = ["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-movflags", "+faststart"];

const toPicture = (from, to, w, h) => run("ffmpeg", ["-y", "-loglevel", "error", "-i", from, "-vf", `scale=${w}:${h}:flags=lanczos`, "-q:v", "2", to]);

const probe = (file) => JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames,pix_fmt", "-of", "json", file]));

// ---------------------------------------------------------------- checks before any frame is taken

/**
 * The captions and the numbers must agree with the film and the data, or nothing is rendered:
 * every caption lies inside one scene, and the error the caption names ("from 77% to 14%") is the
 * error method.json holds (raw MODIS and M4, each leaving one year out, rounded), which is also
 * what the counter on screen runs between.
 */
function check({ cues, scenes, proof }) {
  const problems = [];
  if (cues.length === 0) problems.push("the caption file has no captions");
  for (const cue of cues) {
    const home = scenes.find((s) => cue.from >= s.from && cue.to <= s.to);
    const words = cue.lines.join(" ");
    if (!home) problems.push(`caption ${cue.n} (${cue.from}–${cue.to} s, "${words}") crosses a scene boundary`);
    else console.log(`  caption ${cue.n}  ${cue.from.toFixed(1)}–${cue.to.toFixed(1)} s  inside scene ${home.n} (${home.from}–${home.to} s)`);
  }
  const method = JSON.parse(readFileSync(join(APP, "public", "data", "method.json"), "utf8"));
  const error = (model) => method.models.all_areas.find((r) => r.model === model && r.scheme === "LOYO")?.season_err_abs_pct;
  const raw = Math.round(error("raw")), zij = Math.round(error("M4"));
  const said = cues.map((c) => c.lines.join(" ").match(/from (\d+)% to (\d+)%/)).find(Boolean);
  if (!said) problems.push(`no caption says "from N% to M%"; method.json gives ${raw}% and ${zij}%`);
  else if (Number(said[1]) !== raw || Number(said[2]) !== zij) problems.push(`the caption says ${said[1]}% to ${said[2]}%, method.json gives ${raw}% to ${zij}%`);
  else console.log(`  the caption's ${said[1]}% to ${said[2]}% matches method.json (raw ${error("raw")}%, M4 ${error("M4")}%, leaving one year out)`);
  if (!proof || proof.raw !== raw || proof.zij !== zij) problems.push(`the counter on screen runs ${proof?.raw}% to ${proof?.zij}%, method.json gives ${raw}% to ${zij}%`);
  if (problems.length) throw new Error(`Not rendered:\n  ${problems.join("\n  ")}`);
}

// ---------------------------------------------------------------- the run

const chrome = await openChrome();
let failed = null;
try {
  const film = await openFilm(chrome);
  const { fps, duration, frames, scenes, stillFrom } = film.about;
  console.log(`film: ${duration} s at ${fps} fps, ${frames} frames, ${scenes.length} scenes, ${film.about.cues.length} captions; photographing at x${SCALE}`);
  check(film.about);
  const warnings = [];
  const frameAt = async (t, file) => {
    const result = await film.seek(t);
    for (const warning of result.warnings) warnings.push(`t=${t.toFixed(3)}: ${warning}`);
    if (file) await film.shoot(file);
  };

  if (option("stills")) {
    // Still frames, at full size, for looking at before the whole film is rendered.
    const dir = join(OUT, "stills");
    mkdirSync(join(WORK, "stills"), { recursive: true });
    mkdirSync(dir, { recursive: true });
    const times = option("stills").split(",").map(Number).filter((t) => Number.isFinite(t));
    for (const [k, time] of times.entries()) {
      const t = Math.round(time * fps) / fps; // a still is a frame of the film
      const raw = join(WORK, "stills", `raw-${pad(k + 1, 2)}.jpg`);
      await frameAt(t, raw);
      const name = `still-${pad(k + 1, 2)}-t${t.toFixed(2)}.jpg`;
      toPicture(raw, join(dir, name), 1920, 1080);
      console.log(`  ${name}  (scene ${scenes.find((s) => t < s.to)?.n ?? scenes.length})`);
    }
  } else {
    const only = option("scenes") ? option("scenes").split(",").map(Number) : scenes.map((s) => s.n);
    mkdirSync(join(WORK, "scenes"), { recursive: true });
    const started = Date.now();
    for (const scene of scenes.filter((s) => only.includes(s.n))) {
      const first = Math.round(scene.from * fps), last = Math.round(scene.to * fps); // frames first .. last-1
      const dir = join(WORK, "frames", `scene-${pad(scene.n, 2)}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      // A first pass over the scene without photographs: map tiles and pictures are fetched once, here.
      const before = warnings.length;
      for (let f = first; f < last; f += 6) await frameAt(f / fps, null);
      warnings.length = before; // what the first pass waited for is not a fault of a frame
      const t0 = Date.now();
      // From stillFrom to the end the film does not move: that second is one photograph, repeated.
      let held = null;
      for (let f = first; f < last; f++) {
        const file = join(dir, `f_${pad(f - first)}.jpg`);
        if (held && f / fps >= stillFrom) copyFileSync(held, file);
        else {
          await frameAt(f / fps, file);
          if (f / fps >= stillFrom) held = file;
        }
      }
      const file = join(WORK, "scenes", `scene-${pad(scene.n, 2)}.mp4`);
      run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-start_number", "0", "-i", join(dir, "f_%05d.jpg"),
        "-frames:v", String(last - first), "-vf", toFrame(1920, 1080), ...VIDEO, file]);
        console.log(`  scene ${scene.n} (${scene.name}): ${last - first} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      if (held) {
        // Proof that nothing moves in it: the page's very last frame, photographed again, against the held one.
        const again = join(WORK, "last-frame.jpg");
        await frameAt((last - 1) / fps, again);
        const same = spawnSync("ffmpeg", ["-hide_banner", "-i", held, "-i", again, "-lavfi", "[0][1]psnr", "-f", "null", "-"], { encoding: "utf8" });
        const psnr = (same.stderr ?? "").match(/average:(\S+)/)?.[1] ?? "?";
        console.log(`  the last second: one photograph held for ${last - Math.round(stillFrom * fps)} frames; the page's last frame matches it at ${psnr} dB PSNR`);
      }
    }

    // Join: every scene file must be there, made with the same settings, so the streams are copied.
    const files = scenes.map((s) => join(WORK, "scenes", `scene-${pad(s.n, 2)}.mp4`));
    const missing = files.filter((file) => !existsSync(file));
    if (missing.length) throw new Error(`Not joined: ${missing.length} scene file(s) are not rendered yet. Run without --scenes.`);
    const list = join(WORK, "scenes.txt");
    writeFileSync(list, files.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    const silent = join(OUT, "film-silent.mp4");
    run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", silent]);

    // Sound last: the picture is copied, never encoded again.
    const final = join(OUT, "film.mp4");
    if (existsSync(MUSIC)) {
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", MUSIC, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-af", `afade=t=in:st=0:d=0.4,afade=t=out:st=${duration - 2}:d=2`, "-t", String(duration), "-movflags", "+faststart", final]);
    } else copyFileSync(silent, final);

    // The thumbnail: one frame of the film, 1280 by 720.
    const thumbAt = Math.round(Number(option("thumb", "9.9")) * fps) / fps;
    const raw = join(WORK, "thumbnail-raw.jpg");
    await frameAt(thumbAt, raw);
    toPicture(raw, join(OUT, "thumbnail.jpg"), 1280, 720);

    // Check what was made.
    for (const file of [silent, final]) {
      const info = probe(file);
      const video = info.streams.find((s) => s.codec_type === "video");
      const length = Number(info.format.duration);
      const sound = info.streams.find((s) => s.codec_type === "audio");
      console.log(`  ${file}: ${length.toFixed(3)} s, ${video.width}x${video.height}, ${video.r_frame_rate} fps, ${video.nb_frames} frames, ${video.codec_name} ${video.pix_fmt}${sound ? `, sound ${sound.codec_name}` : ", silent"}`);
      if (video.width !== 1920 || video.height !== 1080) throw new Error(`${file} is not 1920x1080`);
      if (Math.abs(length - duration) > 0.05 || length > 29.9) throw new Error(`${file} is ${length} s long: it must be ${duration} s and never over 29.9`);
    }
    console.log(`  thumbnail.jpg: frame at ${thumbAt.toFixed(2)} s, 1280x720`);
    console.log(`rendered in ${((Date.now() - started) / 60000).toFixed(1)} min`);
    if (!flag("keep")) for (const name of readdirSync(join(WORK, "frames"))) rmSync(join(WORK, "frames", name), { recursive: true, force: true });
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} frame(s) could not wait for something:`);
    for (const warning of warnings.slice(0, 40)) console.log(`  ${warning}`);
  }
} catch (error) {
  failed = error;
} finally {
  await chrome.close();
}
if (failed) {
  console.error(failed.message);
  process.exit(1);
}
