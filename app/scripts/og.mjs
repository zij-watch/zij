// Draws the share images from the landing page's opening (public/landing.html, so run
// build-landing.mjs first):
//   public/og.jpg                  1200 x 630, the picture a link to zij.watch unfurls with
//   ../docs/social-preview.jpg     1280 x 640, the repository's social preview (uploaded by hand in
//                                  the repository's settings on GitHub)
// It serves public/ itself and starts its own headless browser on a free port, so it disturbs no
// other. Usage: node scripts/og.mjs   (BROWSER=<path to a Chromium> to choose the browser)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const pub = fileURLToPath(new URL("../public/", import.meta.url));
const SHOTS = [
  { file: new URL("../public/og.jpg", import.meta.url), w: 1200, h: 630, line: "zij.watch" },
  { file: new URL("../../docs/social-preview.jpg", import.meta.url), w: 1280, h: 640, line: "zij.watch" },
];
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer((req, res) => {
  const path = normalize(join(pub, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(pub) || !existsSync(path)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = process.env.BROWSER ?? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
if (!browser) throw new Error("og: no Chromium found; set BROWSER to its path");
const profile = mkdtempSync(join(tmpdir(), "zij-og-"));
const proc = spawn(browser, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let port;
for (let i = 0; i < 80 && !port; i++) { await sleep(250); try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0].trim(); } catch {} }
if (!port) throw new Error("og: the browser did not start");

try {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const waiting = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d.result ?? d.error); waiting.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable");
  for (const s of SHOTS) {
    await send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: false });
    // ?still: the finished scene, nothing mid-move, and the same picture every run
    await send("Page.navigate", { url: `${origin}/landing.html?still` });
    await sleep(3500);
    // a picture has nothing to click: the link becomes the address, the scroll cue and the top bar go
    await send("Runtime.evaluate", { expression: `(() => {
      const a = document.querySelector('.hero .enter'); if (a) { a.textContent = ${JSON.stringify(s.line)}; a.style.textDecoration = 'none'; a.style.borderBottom = '0'; }
      for (const n of document.querySelectorAll('.scroll-cue, .head, .skip, .progress')) n.style.display = 'none';
    })()` });
    await sleep(300);
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 90, clip: { x: 0, y: 0, width: s.w, height: s.h, scale: 1 } });
    writeFileSync(s.file, Buffer.from(shot.data, "base64"));
    console.log(`og: ${fileURLToPath(s.file)} ${s.w}x${s.h}, ${Math.round(Buffer.from(shot.data, "base64").length / 1024)} KB`);
  }
  ws.close();
} finally {
  proc.kill(); server.close();
  await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
