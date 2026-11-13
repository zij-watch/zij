// Draws the favicon set from the Seal (the same mark as the logo in the top strip).
//   public/favicon.svg            the small cut of the Seal on a paper square
//   public/favicon-16.png, -32    the same, as PNG
//   public/apple-touch-icon.png   180 px, the full Seal, square corners (iOS rounds them)
//   public/icon-192.png, -512     the manifest icons, the full Seal
// The PNGs are drawn by a Chrome started with --remote-debugging-port.
// Usage: node scripts/icons.mjs <debugging port>
import { readFileSync, writeFileSync } from "node:fs";

const port = process.argv[2] ?? "9222";
const shell = readFileSync(new URL("../components/Shell.tsx", import.meta.url), "utf8");
const small = [...shell.slice(shell.indexOf("export function Seal")).matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
// The full cut, for 180 px and up (Zij design system, the Seal).
const full = [
  "M46,200L198,200L198,228L86.35,362L198,362L198,390L46,390L46,362L157.65,228L46,228Z",
  "M179.56,272L212,272L212,300L156.23,300Z",
  "M226,200L260,200L260,300L226,300Z",
  "M299,200L333,200L333,349.22L299.02,390L258,390L258,362L282,362L299,341.6Z",
  "M227,161a16,16 0 1,0 32,0a16,16 0 1,0 -32,0ZM235.5,161a7.5,7.5 0 1,1 15,0a7.5,7.5 0 1,1 -15,0Z",
  "M316,144L333,161L316,178L299,161Z",
  "M145,316.5L159.5,331L145,345.5L130.5,331Z",
  "M226,314L240.5,328.5L226,343L211.5,328.5ZM260,314L274.5,328.5L260,343L245.5,328.5Z",
];
const PAPER = "#f6edd8", INK = "#1e1a15", RULE = "#bfa678";

/** The mark centred on a paper square of 400 units. `box` is the mark's own viewBox; `fill` its share of the square. */
function icon(paths, [x, y, w, h], fill, radius) {
  const s = (400 * fill) / Math.max(w, h);
  const dx = (400 - w * s) / 2 - x * s, dy = (400 - h * s) / 2 - y * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" rx="${radius}" fill="${PAPER}"/>` +
    (radius ? `<rect x="6" y="6" width="388" height="388" rx="${radius - 6}" fill="none" stroke="${RULE}" stroke-width="12"/>` : "") +
    `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${s.toFixed(4)})" fill="${INK}">${paths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
}
const smallSvg = icon(small, [44, 135, 306, 255], 0.8, 56);
const fullRound = icon(full, [46, 144, 287, 246], 0.66, 56);
const fullSquare = icon(full, [46, 144, 287, 246], 0.62, 0);
writeFileSync(new URL("../public/favicon.svg", import.meta.url), smallSvg + "\n");

const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) pending.get(m.id)(m.result ?? m.error); };
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send("Page.enable");
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [name, svg, size] of [["favicon-16.png", smallSvg, 16], ["favicon-32.png", smallSvg, 32], ["apple-touch-icon.png", fullSquare, 180], ["icon-192.png", fullRound, 192], ["icon-512.png", fullRound, 512]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: 600, height: 600, deviceScaleFactor: 1, mobile: false });
  const html = `<body style="margin:0;background:transparent"><img width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`;
  await send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html).toString("base64") });
  await new Promise((r) => setTimeout(r, 500));
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  writeFileSync(new URL(`../public/${name}`, import.meta.url), Buffer.from(shot.data, "base64"));
  console.log(name, size);
}
await send("Page.close");
ws.close();
