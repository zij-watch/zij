// Renders the demo film from the real app, one frame at a time. No screen recording.
//
// A film page has one function, window.__film.seek(t), that draws the exact frame for the time t
// and resolves when the page is still (docs/event/FILM.md). This script opens that page in
// headless Chrome, steps t by 1/30 s, takes a JPEG screenshot of every frame at quality 92, and
// has ffmpeg make one mp4 per piece with the same settings (libx264, crf 18, yuv420p): one per
// scene for the first film, one per five seconds for the board. The pieces are joined with the
// concat demuxer and -c copy; sound is added last with -c:v copy. Where the page asks for motion
// blur (the board, while its camera travels), a frame is the mean of four pictures 1/120 s apart.
//
// Before any frame is taken it checks the captions against the scenes and method.json, and writes
// the caption track from the same parse: zij-demo30.en.srt, .vtt and .ass (for YTSubConverter, to
// YouTube's .ytt). Nothing is burned in: the captions go to YouTube as a separate track.
//
//   pnpm build && pnpm start --port 3111                  the app, built
//   node scripts/film/render.mjs --stills 2.9,7.6         still frames only, into film/stills/
//   node scripts/film/render.mjs                          the whole film, into film/
//   node scripts/film/render.mjs --parts 4,5              those pieces again, then the joins
//   node scripts/film/render.mjs --captions               the checks and the caption files only
//   node scripts/film/render.mjs --film v2 ...            the same for the board (/studio/film/v2)
//   node scripts/film/render.mjs --film v3 ...            the same for the three surfaces (/studio/film/v3)
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

const FILMS = {
  // v1 and v2 read the voice-over's captions of the second cut (zij-demo30-v2.en.srt) and write theirs
  // into film/v2-captions/; v3 reads zij-demo30.en.srt and writes into film/.
  v1: { path: "/studio/film", name: "film", stills: "stills", work: "work", thumb: "thumbnail.jpg", source: "zij-demo30-v2.en.srt", captions: "v2-captions" },
  v2: { path: "/studio/film/v2", name: "film-v2", stills: "stills-v2", work: join("work", "v2"), thumb: "thumbnail-v2.jpg", source: "zij-demo30-v2.en.srt", captions: "v2-captions" },
  v3: { path: "/studio/film/v3", name: "film-v3", stills: "stills-v3", work: join("work", "v3"), thumb: "thumbnail-v3.jpg", source: "zij-demo30.en.srt", captions: "" },
};
const FILM = FILMS[option("film", "v1")];
if (!FILM) throw new Error(`--film must be one of ${Object.keys(FILMS).join(", ")}`);
const URL_ = option("url", `http://localhost:3111${FILM.path}`);
const OUT = resolve(APP, option("out", "film"));
const SCALE = Number(option("scale", "2"));
const QUALITY = 92;
const CHROME = option("chrome", process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome"));
const WORK = join(OUT, FILM.work);
const CAPTIONS = "zij-demo30.en";
const MUSIC = join(OUT, "music.mp3");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, width = 5) => String(n).padStart(width, "0");

// ---------------------------------------------------------------- Chrome, over the DevTools protocol

async function openChrome() {
  const profile = mkdtempSync(join(tmpdir(), "zij-film-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--run-all-compositor-stages-before-draw", "--mute-audio", "--force-color-profile=srgb", "--window-size=1920,1080",
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
  const about = await evaluate(`window.__film.ready.then(() => ({ fps: __film.fps, duration: __film.duration, frames: __film.frames, width: __film.width, height: __film.height,
    scenes: __film.scenes, cues: __film.cues, proof: __film.proof, stillFrom: __film.stillFrom ?? null, chunks: __film.chunks ?? null, subframes: __film.subframes ?? 1, shutter: __film.shutter ?? 0, facts: __film.facts ?? null }))`);
  const seek = (t) => evaluate(`window.__film.seek(${t})`);
  const blurAt = (t) => (about.subframes > 1 ? evaluate(`window.__film.blurAt(${t})`) : false);
  const slideAt = (t, dt) => evaluate(`window.__film.slideAt ? window.__film.slideAt(${t}, ${dt}) : null`);
  const shot = async (quality) => (await page("Page.captureScreenshot", { format: "jpeg", quality, captureBeyondViewport: false })).data;
  // A page that is not in front gets no animation frames, and a frame is only done after two.
  const front = () => page("Page.bringToFront");
  return { about, seek, blurAt, slideAt, shot, front };
}

/**
 * A second page, the darkroom, that makes one frame of motion blur from its subframes, on the GPU
 * (WebGL 2). Each subframe stands for its own slice of the shutter: it is smeared along the way the
 * picture slides in that slice (the page's slideAt, an affine field), so the subframes meet without
 * a gap and the frame is one smooth smear. The smears are summed in a float buffer, divided, and
 * encoded as a JPEG at quality 92 by the same encoder Chrome uses for its screenshots.
 */
async function openDarkroom(chrome) {
  // A window of its own, so the film's page stays in front of its own window.
  const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank", newWindow: true, background: true });
  const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => chrome.send(method, params, sessionId);
  await page("Runtime.enable");
  const { result: global } = await page("Runtime.evaluate", { expression: "globalThis" });
  // Runs in the darkroom. slides[k] is [a, b, c, e, f, g] in frame pixels (or null: no smear); scale is the pictures' pixels per frame pixel.
  const develop = async function (pictures, slides, scale, quality) {
    const decode = async (b64) => createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const first = await decode(pictures[0]);
    const w = first.width, h = first.height;
    let room = globalThis.__room;
    if (!room || room.w !== w || room.h !== h) {
      const canvas = new OffscreenCanvas(w, h);
      const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!gl || !gl.getExtension("EXT_color_buffer_float") || !gl.getExtension("EXT_float_blend")) throw new Error("darkroom: WebGL 2 with float colour buffers is needed");
      const VS = "#version 300 es\nvoid main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }";
      const SMEAR = `#version 300 es
        precision highp float;
        uniform sampler2D picture; uniform vec2 size; uniform vec3 dx; uniform vec3 dy; uniform int taps;
        out vec4 colour;
        void main() {
          vec2 p = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
          vec2 d = vec2(dot(dx, vec3(p, 1.0)), dot(dy, vec3(p, 1.0)));
          vec4 sum = vec4(0.0);
          for (int i = 0; i < taps; i++) sum += texture(picture, (p - d * ((float(i) + 0.5) / float(taps))) / size);
          colour = sum / float(taps);
        }`;
      const DEVELOP = `#version 300 es
        precision highp float;
        uniform sampler2D sum; uniform float n;
        out vec4 colour;
        void main() { colour = vec4(texelFetch(sum, ivec2(gl_FragCoord.xy), 0).rgb / n, 1.0); }`;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`darkroom: ${gl.getShaderInfoLog(shader)}`);
        return shader;
      };
      const program = (fs) => {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`darkroom: ${gl.getProgramInfoLog(p)}`);
        return p;
      };
      const texture = (format, filter) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        if (format) gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      const sum = texture(gl.RGBA32F, gl.NEAREST);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sum, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("darkroom: the float buffer is not usable");
      room = { w, h, canvas, gl, smear: program(SMEAR), develop: program(DEVELOP), sum, fbo, picture: texture(0, gl.LINEAR) };
      globalThis.__room = room;
    }
    const { gl, canvas } = room;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.viewport(0, 0, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, room.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(room.smear);
    const at = (name) => gl.getUniformLocation(room.smear, name);
    gl.uniform1i(at("picture"), 0);
    gl.uniform2f(at("size"), w, h);
    let most = 0;
    for (let k = 0; k < pictures.length; k++) {
      const bitmap = k === 0 ? first : await decode(pictures[k]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, room.picture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      bitmap.close();
      const [a, b, c, e, f, g] = slides[k] ?? [0, 0, 0, 0, 0, 0];
      // In the pictures' pixels the linear part is the same and the offset scales.
      const d = (x, y) => Math.hypot(a * x + b * y + c * scale, e * x + f * y + g * scale);
      const longest = Math.max(d(0, 0), d(w, 0), d(0, h), d(w, h));
      most = Math.max(most, longest);
      gl.uniform3f(at("dx"), a, b, c * scale);
      gl.uniform3f(at("dy"), e, f, g * scale);
      gl.uniform1i(at("taps"), Math.min(96, Math.max(1, Math.ceil(longest / 0.75)))); // a tap every 3/4 of a pixel, at most
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(room.develop);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, room.sum);
    gl.uniform1i(gl.getUniformLocation(room.develop, "sum"), 0);
    gl.uniform1f(gl.getUniformLocation(room.develop, "n"), pictures.length);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality })).arrayBuffer());
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { jpeg: btoa(text), smear: most };
  };
  return async (pictures, slides, scale) => {
    const { result, exceptionDetails } = await page("Runtime.callFunctionOn", {
      objectId: global.objectId, functionDeclaration: develop.toString(), arguments: [{ value: pictures }, { value: slides }, { value: scale }, { value: QUALITY / 100 }], awaitPromise: true, returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
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
function check({ cues, scenes, proof, facts }) {
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
  // A caption that quotes the error must quote method.json; the captions follow the voice-over, which may not quote it.
  const said = cues.map((c) => c.lines.join(" ").match(/(\d+)% to (\d+)%/)).find(Boolean);
  if (!said) console.log(`  no caption quotes the error; the counter on screen is checked against method.json (${raw}% to ${zij}%)`);
  else if (Number(said[1]) !== raw || Number(said[2]) !== zij) problems.push(`the caption says ${said[1]}% to ${said[2]}%, method.json gives ${raw}% to ${zij}%`);
  else console.log(`  the caption's ${said[1]}% to ${said[2]}% matches method.json (raw ${error("raw")}%, M4 ${error("M4")}%, leaving one year out)`);
  if (!proof || proof.raw !== raw || proof.zij !== zij) problems.push(`the counter on screen runs ${proof?.raw}% to ${proof?.zij}%, method.json gives ${raw}% to ${zij}%`);
  if (facts) checkFacts(facts, problems);
  if (problems.length) throw new Error(`Not rendered:\n  ${problems.join("\n  ")}`);
}

/**
 * The final cut (v3) states five things the brief names, each read from the data files by the page:
 * the jump (162 and 1,609 hotspot-days, 2011 and 2012), the error (77% and 14%), the rise after the
 * 2004 ban (+97%) and the fall since 2018 (-53%), and the verdict's rank among 26 years, which the
 * sentence on screen must state as the rank worked out again from the drawn area's own numbers.
 */
function checkFacts(f, problems) {
  const want = (name, got, expected) => {
    if (got !== expected) problems.push(`${name}: the film shows ${got}, the brief says ${expected}`);
    else console.log(`  ${name}: ${got}, as the brief says`);
  };
  want("MODIS season 2011", Math.round(f.tenfold.modis2011), 162);
  want("VIIRS season 2012", Math.round(f.tenfold.viirs2012), 1609);
  console.log(`  tenfold: ${(f.tenfold.viirs2012 / f.tenfold.modis2011).toFixed(2)} times`);
  want("raw MODIS error", f.error.raw, 77);
  want("Zij error", f.error.zij, 14);
  want("after the 2004 ban", f.ban, 97);
  want("since 2018", f.since, -53);
  const rank = f.rank.computed, sentence = f.rank.sentence ?? "";
  if (!rank || !sentence.includes(rank) || !/ of 26 years/.test(rank)) problems.push(`the verdict's rank: worked out "${rank}", the sentence says "${sentence}"`);
  else console.log(`  the verdict's rank: "${rank}", in the sentence and worked out again from the area's numbers`);
  console.log(`  fitted in the browser in ${(f.fitMs / 1000).toFixed(2)} s`);
}

// ---------------------------------------------------------------- the caption track

const stamp = (seconds, comma) => {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${comma ? "," : "."}${pad(ms % 1000, 3)}`;
};
const assStamp = (seconds) => {
  const cs = Math.round(seconds * 100);
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60, 2)}:${pad(Math.floor(cs / 100) % 60, 2)}.${pad(cs % 100, 2)}`;
};
/** #RRGGBB and an opacity (0 to 1) as an ASS colour, &HAABBGGRR, where alpha 00 is opaque. */
const assColour = (hex, opacity = 1) => {
  const [r, g, b] = [1, 3, 5].map((i) => hex.slice(i, i + 2).toUpperCase());
  return `&H${Math.round(255 * (1 - opacity)).toString(16).toUpperCase().padStart(2, "0")}${b}${g}${r}`;
};

/**
 * The captions as files, from the same parse of zij-demo30.en.srt the film reads, with the same
 * times, lines and line breaks:
 *   .srt  plain, as the source
 *   .vtt  WebVTT, set low (the bottom of the box 8% above the bottom of the frame)
 *   .ass  for YTSubConverter: Times New Roman (YouTube cannot use our faces), not bold, ink on a
 *         box of paper at 85% opacity, no outline and no shadow, bottom centre, 8% above the bottom.
 *         YTSubConverter takes the box from OutlineColour when BorderStyle is 3 and Outline is above
 *         0 (the box's padding; there is no outline round the letters), and places a line by its
 *         \pos, not by MarginV: each line carries \an2\pos at 8% above the bottom.
 */
function writeCaptions(cues, { w, h }) {
  const INK = "#1E1A15", PAPER = "#F6EDD8", LOW = 0.08;
  const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.from, true)} --> ${stamp(c.to, true)}\n${c.lines.join("\n")}\n`).join("\n");
  const vtt = "WEBVTT\n\nNOTE Zij demo film captions, from zij-demo30.en.srt: the same times and lines, set low so they never cover a paper's heading.\n\n" +
    cues.map((c, i) => `${i + 1}\n${stamp(c.from, false)} --> ${stamp(c.to, false)} line:${Math.round((1 - LOW) * 100)}%,end align:center\n${c.lines.join("\n")}\n`).join("\n");
  const x = Math.round(w / 2), y = Math.round(h * (1 - LOW));
  const ass = [
    "[Script Info]",
    "; Zij demo film captions, from zij-demo30.en.srt: the same times, lines and line breaks. Styled for YTSubConverter (.ass to YouTube .ytt).",
    "Title: Zij demo film",
    "ScriptType: v4.00+",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Times New Roman,54,${assColour(INK)},${assColour(INK)},${assColour(PAPER, 0.85)},${assColour(PAPER, 0.85)},0,0,0,0,100,100,0,0,3,1,0,2,${Math.round(w * 0.1)},${Math.round(w * 0.1)},${Math.round(h * LOW)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...cues.map((c) => `Dialogue: 0,${assStamp(c.from)},${assStamp(c.to)},Default,,0,0,0,,{\\an2\\pos(${x},${y})}${c.lines.join("\\N")}`),
    "",
  ].join("\n");
  const files = { srt, vtt, ass };
  const dir = join(OUT, FILM.captions);
  mkdirSync(dir, { recursive: true });
  for (const [ext, text] of Object.entries(files)) writeFileSync(join(dir, `${CAPTIONS}.${ext}`), text);
  const source = readFileSync(join(APP, "..", "docs", "event", FILM.source), "utf8").replace(/^﻿/, "").replace(/\r/g, "").trim();
  const same = source === srt.trim();
  console.log(`  captions: ${Object.keys(files).map((ext) => `${CAPTIONS}.${ext}`).join(", ")} in ${dir}${same ? "; the .srt is the source, byte for byte" : "; NOTE: the .srt differs from the source in its layout"}`);
}

// ---------------------------------------------------------------- the run

const chrome = await openChrome();
let failed = null;
try {
  const film = await openFilm(chrome);
  const { fps, duration, frames, scenes, stillFrom, chunks, subframes, shutter } = film.about;
  console.log(`${FILM.name}: ${duration} s at ${fps} fps, ${frames} frames, ${scenes.length} scenes, ${film.about.cues.length} captions; photographing at x${SCALE}`);
  check(film.about);
  mkdirSync(OUT, { recursive: true });
  writeCaptions(film.about.cues, { w: film.about.width ?? 1920, h: film.about.height ?? 1080 });
  const darkroom = subframes > 1 ? await openDarkroom(chrome) : null;
  await film.front();
  const warnings = [];
  let blurred = 0;
  const seekAt = async (t) => {
    const result = await film.seek(t);
    for (const warning of result.warnings) warnings.push(`t=${t.toFixed(3)}: ${warning}`);
  };
  // A frame: one photograph, or, where the page asks for motion blur, the mean of `subframes`
  // photographs spread evenly over the shutter, each standing for its own slice of it.
  const frameAt = async (t, file) => {
    if (!file) return seekAt(t);
    if (darkroom && (await film.blurAt(t))) {
      const pictures = [], slides = [], slice = shutter / subframes;
      for (let k = 0; k < subframes; k++) {
        await seekAt(t + k * slice);
        pictures.push(await film.shot(100));
        slides.push(await film.slideAt(t + k * slice, slice));
      }
      const { jpeg } = await darkroom(pictures, slides, SCALE);
      writeFileSync(file, Buffer.from(jpeg, "base64"));
      blurred += 1;
      return;
    }
    await seekAt(t);
    writeFileSync(file, Buffer.from(await film.shot(QUALITY), "base64"));
  };

  if (flag("captions")) {
    // The checks and the caption files only.
  } else if (option("stills")) {
    // Still frames, at full size, for looking at before the whole film is rendered.
    const dir = join(OUT, FILM.stills);
    mkdirSync(join(WORK, "stills"), { recursive: true });
    mkdirSync(dir, { recursive: true });
    const times = option("stills").split(",").map(Number).filter((t) => Number.isFinite(t));
    for (const [k, time] of times.entries()) {
      const t = Math.round(time * fps) / fps; // a still is a frame of the film
      const raw = join(WORK, "stills", `raw-${pad(k + 1, 2)}.jpg`);
      await frameAt(t, raw);
      const name = `still-${pad(k + 1, 2)}-t${t.toFixed(2)}.jpg`;
      toPicture(raw, join(dir, name), 1920, 1080);
      console.log(`  ${name}  (scene ${scenes.find((s) => t < s.to)?.n ?? scenes.length})${blurred ? `, motion blur: the mean of ${subframes}` : ""}`);
      blurred = 0;
    }
  } else {
    // The pieces: one per scene for the first film, about five seconds each for the board.
    const parts = chunks ?? scenes;
    const kind = chunks ? "chunk" : "scene";
    const pick = option("parts") ?? option("scenes");
    const only = pick ? pick.split(",").map(Number) : parts.map((s) => s.n);
    mkdirSync(join(WORK, "parts"), { recursive: true });
    const started = Date.now();
    for (const scene of parts.filter((s) => only.includes(s.n))) {
      const first = Math.round(scene.from * fps), last = Math.round(scene.to * fps); // frames first .. last-1
      const dir = join(WORK, "frames", `${kind}-${pad(scene.n, 2)}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      // A first pass over the scene without photographs: map tiles and pictures are fetched once, here.
      const before = warnings.length;
      for (let f = first; f < last; f += 6) await frameAt(f / fps, null);
      warnings.length = before; // what the first pass waited for is not a fault of a frame
      const t0 = Date.now();
      // From stillFrom to the end the film does not move: that second is one photograph, repeated.
      let held = null;
      const still = typeof stillFrom === "number";
      for (let f = first; f < last; f++) {
        const file = join(dir, `f_${pad(f - first)}.jpg`);
        if (still && held && f / fps >= stillFrom) copyFileSync(held, file);
        else {
          await frameAt(f / fps, file);
          if (still && f / fps >= stillFrom) held = file;
        }
      }
      const file = join(WORK, "parts", `${kind}-${pad(scene.n, 2)}.mp4`);
      run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-start_number", "0", "-i", join(dir, "f_%05d.jpg"),
        "-frames:v", String(last - first), "-vf", toFrame(1920, 1080), ...VIDEO, file]);
      console.log(`  ${kind} ${scene.n} (${scene.name}, ${scene.from}–${scene.to} s): ${last - first} frames${blurred ? `, ${blurred} with motion blur` : ""} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      blurred = 0;
      if (held) {
        // Proof that nothing moves in it: the page's very last frame, photographed again, against the held one.
        const again = join(WORK, "last-frame.jpg");
        await frameAt((last - 1) / fps, again);
        const same = spawnSync("ffmpeg", ["-hide_banner", "-i", held, "-i", again, "-lavfi", "[0][1]psnr", "-f", "null", "-"], { encoding: "utf8" });
        const psnr = (same.stderr ?? "").match(/average:(\S+)/)?.[1] ?? "?";
        console.log(`  the last second: one photograph held for ${last - Math.round(stillFrom * fps)} frames; the page's last frame matches it at ${psnr} dB PSNR`);
      }
    }

    // Join: every piece must be there, made with the same settings, so the streams are copied.
    const files = parts.map((s) => join(WORK, "parts", `${kind}-${pad(s.n, 2)}.mp4`));
    const missing = files.filter((file) => !existsSync(file));
    if (missing.length) throw new Error(`Not joined: ${missing.length} ${kind} file(s) are not rendered yet. Run without --parts.`);
    const list = join(WORK, "parts.txt");
    writeFileSync(list, files.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    const silent = join(OUT, `${FILM.name}-silent.mp4`);
    run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", silent]);

    // Sound last: the picture is copied, never encoded again.
    const final = join(OUT, `${FILM.name}.mp4`);
    if (existsSync(MUSIC)) {
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", MUSIC, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-af", `afade=t=in:st=0:d=0.4,afade=t=out:st=${duration - 2}:d=2`, "-t", String(duration), "-movflags", "+faststart", final]);
    } else copyFileSync(silent, final);

    // The thumbnail: one frame of the film, 1280 by 720.
    const thumbAt = Math.round(Number(option("thumb", "9.9")) * fps) / fps;
    const raw = join(WORK, "thumbnail-raw.jpg");
    await frameAt(thumbAt, raw);
    toPicture(raw, join(OUT, FILM.thumb), 1280, 720);

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
    console.log(`  ${FILM.thumb}: frame at ${thumbAt.toFixed(2)} s, 1280x720`);
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
