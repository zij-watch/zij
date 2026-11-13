// The four screenshots in the README, taken from the live site with headless Chrome.
//
//   node scripts/readme_screenshots.mjs                      (Node 22 or later, Chrome installed)
//   node scripts/readme_screenshots.mjs http://localhost:3000   another origin
//   CHROME=/path/to/chrome node scripts/readme_screenshots.mjs
//
// Writes docs/assets/screenshot-*.webp. No packages: Chrome is driven over its DevTools protocol.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const origin = (process.argv[2] ?? "https://zij.watch").replace(/\/$/, "");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "assets");
const WIDTH = 1440;
const HEIGHT = 900;

// name, path, seconds to wait after the page has loaded (the map and the fit need time), height
const SHOTS = [
  ["landing", "/", 6, HEIGHT],
  ["explore", "/explore?area=nile-delta", 14, HEIGHT],
  ["drawn-area", "/explore?box=30.6,30.7,31.4,31.3", 16, HEIGHT],
  ["brief", "/brief?area=nile-delta", 10, 1500],
];

const chrome = [
  process.env.CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) throw new Error("Chrome not found: set CHROME to its path");

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "zij-shots-"));
const browser = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},${HEIGHT}`, "--hide-scrollbars", "--no-first-run", "--enable-unsafe-swiftshader", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function pageSocket() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome is still starting */ }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

try {
  const ws = new WebSocket(await pageSocket());
  await new Promise((done, fail) => { ws.onopen = done; ws.onerror = fail; });
  let id = 0;
  const waiting = new Map();
  const events = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) { waiting.get(msg.id)?.(msg); waiting.delete(msg.id); }
    else { events.get(msg.method)?.(); events.delete(msg.method); }
  };
  const send = (method, params = {}) => new Promise((done, fail) => {
    waiting.set(++id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : done(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = (method) => new Promise((done) => events.set(method, done));

  await send("Page.enable");
  mkdirSync(out, { recursive: true });
  for (const [name, path, seconds, height] of SHOTS) {
    await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height, deviceScaleFactor: 1, mobile: false });
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url: origin + path });
    await Promise.race([loaded, sleep(30000)]);
    await sleep(seconds * 1000);
    const { data } = await send("Page.captureScreenshot", { format: "webp", quality: 88 });
    const file = join(out, `screenshot-${name}.webp`);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`${file}  ${origin + path}`);
  }
  ws.close();
} finally {
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}
