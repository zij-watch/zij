// Contrast of every text colour on the paper, WCAG 2. Every floating piece of the app is paper
// (app/app/materials.css), opaque over the map and over satellite imagery alike, so text is only
// ever read on paper. The paper is tested plain (ground, ground-raised) and as painted (lib/paper.ts):
// measured in Chrome on 14 Nov 2026 on the painted sheets of Results, 18 px in from the edge where
// text begins, the darkest sheet has a mean relative luminance of 0.709. Only scattered specks of
// tooth and foxing go darker, and they are smaller than a letter.
// Usage: node scripts/contrast.mjs   (exits 1 if anything is under 4.5:1)
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/tokens.ts", import.meta.url), "utf8");
const token = (name) => source.match(new RegExp(`["']?${name}["']?: "(#[0-9a-f]{6})"`))[1];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const PAINTED = 0.709; // the darkest painted sheet's mean luminance, measured as above

const papers = {
  "ground": lum(rgb(token("ground"))),
  "ground-raised (slips)": lum(rgb(token("ground-raised"))),
  "painted sheet": PAINTED,
};
const contrast = (text, paper) => (Math.max(lum(text), paper) + 0.05) / (Math.min(lum(text), paper) + 0.05);
const texts = {
  "ink (body text, figures)": token("ink"),
  "ink-muted (labels, notes)": token("ink-muted"),
  "brass (eyebrows, instruments)": token("brass"),
  "rubric (fire, the stamp)": token("rubric"),
  "lapis (MODIS, below normal)": token("lapis"),
};
let failed = false;
for (const [what, hex] of Object.entries(texts)) {
  const cells = Object.entries(papers).map(([name, under]) => {
    const r = contrast(rgb(hex), under);
    if (r < 4.5) failed = true;
    return `${name} ${r.toFixed(2)}:1`;
  });
  console.log(`  ${what.padEnd(32)} ${hex}  ${cells.join("   ")}`);
}
// The stamp: paper-white ink on rubric. Selected controls: raised ground on brass.
const stamp = ratio(rgb(token("on-rubric")), rgb(token("rubric")));
const selected = ratio(rgb(token("ground-raised")), rgb(token("brass")));
console.log(`  ${"the stamp (on-rubric on rubric)".padEnd(32)} ${stamp.toFixed(2)}:1`);
console.log(`  ${"selected (raised ground on brass)".padEnd(32)} ${selected.toFixed(2)}:1`);
if (failed || stamp < 4.5 || selected < 4.5) { console.error("FAIL: under 4.5:1"); process.exit(1); }
console.log("all at 4.5:1 or more");
