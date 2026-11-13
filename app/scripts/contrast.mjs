// Contrast of every text and icon colour on the frosted glass (satellite basemap), WCAG 2.
// The glass is the raised ground at 80% over whatever the imagery shows. Two extremes are tested:
// black sea at night-dark (#000000) and the brightest desert or cloud (#ffffff). Blur only averages
// the picture, so no backdrop is darker or lighter than these.
// Usage: node scripts/contrast.mjs   (exits 1 if anything is under 4.5:1)
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/tokens.ts", import.meta.url), "utf8");
const token = (name) => source.match(new RegExp(`["']?${name}["']?: "(#[0-9a-f]{6})"`))[1];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const over = (top, alpha, under) => top.map((v, i) => v * alpha + under[i] * (1 - alpha));

const ALPHA = 0.8;
const glass = rgb(token("ground-raised"));
const backdrops = { "black sea": [0, 0, 0], "bright desert": [255, 255, 255] };
const texts = {
  "ink (body text, icons)": token("ink"),
  "muted ink on glass (notes, labels)": token("glass-ink-muted"),
  "brass on glass (headings, icons)": token("glass-brass"),
};
let failed = false;
console.log(`glass: ${token("ground-raised")} at ${ALPHA * 100}%`);
for (const [what, hex] of Object.entries(texts)) {
  const cells = Object.entries(backdrops).map(([name, under]) => {
    const r = ratio(rgb(hex), over(glass, ALPHA, under));
    if (r < 4.5) failed = true;
    return `${name} ${r.toFixed(2)}:1`;
  });
  console.log(`  ${what.padEnd(36)} ${hex}  ${cells.join("   ")}`);
}
// Selected controls are solid, not glass: light text on deepened brass.
const solid = ratio(rgb(token("ground-raised")), rgb(token("glass-brass")));
console.log(`  ${"selected control (paper on brass)".padEnd(36)} ${solid.toFixed(2)}:1`);
// For comparison: the paper-theme inks would fail on glass over black.
for (const name of ["ink-muted", "brass"]) console.log(`  (not used on glass) ${name.padEnd(16)} ${token(name)}  black sea ${ratio(rgb(token(name)), over(glass, ALPHA, [0, 0, 0])).toFixed(2)}:1`);
if (failed || solid < 4.5) { console.error("FAIL: under 4.5:1"); process.exit(1); }
console.log("all at 4.5:1 or more");
