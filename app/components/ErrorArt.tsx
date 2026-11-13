// The drawings of the error pages. Each error is a different accident to the book of tables, with
// a satellite that has its own trouble overhead:
//   CutBook      404: the leaf was cut out; the swath scans the gap and finds no pixel
//   InkBook      500: the inkwell tipped and the ink ran over both pages; the downlink is lost
//   CloudMap     Explore: the map sheet is under cloud, so its fires cannot be seen
//   LooseLeaves  the whole app failed: the binding broke, the leaves fell out of order, and both
//                satellites are in Earth's shadow
// Plain SVG, no hooks: they render on the server and in error boundaries. Colours are the tokens,
// set by class in app/errors.css; motion is CSS, and stops for prefers-reduced-motion.

import type { ReactNode } from "react";

const W = 640;
const H = 420;

// A month-by-year table, coloured like the app's calendar: autumn burns, the rest is quiet. A torn
// fragment starts at a later month (from), so its few columns still hold the burning season.
function Table({ x, y, cols = 12, rows = 9, cell = 15, gap = 3, seed = 1, from = 0 }: { x: number; y: number; cols?: number; rows?: number; cell?: number; gap?: number; seed?: number; from?: number }) {
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const c = col + from;
      const autumn = c >= 7 && c <= 10 ? 2 + ((c === 8 || c === 9) ? 1 : 0) : 0;
      const wobble = (r * 7 + c * 3 + seed * 5) % 5;
      const k = Math.max(0, Math.min(5, autumn + (wobble > 3 ? 1 : 0) - (wobble === 0 && autumn ? 1 : 0) + (c === 3 && wobble === 2 ? 1 : 0)));
      cells.push(
        <rect key={`${r}-${col}`} x={x + col * (cell + gap)} y={y + r * (cell + gap)} width={cell} height={cell} style={{ fill: `var(--heat-${k})` }} className="ea-cell" />,
      );
    }
  }
  return <g>{cells}</g>;
}

// Lines of text, drawn as rules.
function Lines({ x, y, width, count, step = 12 }: { x: number; y: number; width: number; count: number; step?: number }) {
  return (
    <g className="ea-text">
      {Array.from({ length: count }, (_, i) => {
        const w = width * (i % 4 === 3 ? 0.62 : 0.92 + ((i * 13) % 7) / 100);
        return <line key={i} x1={x} y1={y + i * step} x2={x + w} y2={y + i * step} />;
      })}
    </g>
  );
}

// A satellite: the body in brass, two solar panels in lapis.
function Satellite({ dark = false }: { dark?: boolean }) {
  return (
    <g className={dark ? "ea-sat is-dark" : "ea-sat"}>
      <rect className="ea-panel" x={-42} y={-5} width={30} height={10} />
      <rect className="ea-panel" x={12} y={-5} width={30} height={10} />
      <path className="ea-panel-grid" d="M-32 -5V5M-22 -5V5M22 -5V5M32 -5V5" />
      <line className="ea-stroke" x1={-12} y1={0} x2={-9} y2={0} />
      <line className="ea-stroke" x1={9} y1={0} x2={12} y2={0} />
      <rect className="ea-body" x={-9} y={-8} width={18} height={16} />
      <line className="ea-stroke" x1={0} y1={8} x2={0} y2={14} />
      <circle className="ea-body" cx={0} cy={16} r={2.6} />
    </g>
  );
}

const Shadow = () => <ellipse className="ea-shadow" cx={W / 2} cy={372} rx={292} ry={18} />;
const COVER = "M34 86 Q177 62 320 88 Q463 62 606 86 L606 358 Q463 334 320 360 Q177 334 34 358 Z";
const LEFT_STACK = "M46 80 Q183 58 320 82 L320 350 Q183 328 46 348 Z";
const LEFT_PAGE = "M54 75 Q187 53 320 77 L320 345 Q187 323 54 343 Z";
const RIGHT_STACK = "M594 80 Q457 58 320 82 L320 350 Q457 328 594 348 Z";
const RIGHT_PAGE = "M586 75 Q453 53 320 77 L320 345 Q453 323 586 343 Z";
const Gutter = () => <rect className="ea-gutter" x={300} y={70} width={40} height={286} />;

function LeftPage({ folio }: { folio: string }) {
  return (
    <g>
      <path className="ea-stack" d={LEFT_STACK} />
      <path className="ea-page" d={LEFT_PAGE} />
      <text className="ea-head" x={88} y={104}>Nile Delta · months</text>
      <Table x={88} y={118} rows={9} seed={1} />
      <Lines x={88} y={292} width={196} count={3} />
      <text className="ea-folio" x={88} y={330}>{folio}</text>
    </g>
  );
}

const defs = (
  <defs>
    <pattern id="ea-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line className="ea-hatch-line" x1="0" y1="0" x2="0" y2="8" />
    </pattern>
    <linearGradient id="ea-gutter" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" style={{ stopColor: "var(--shadow)", stopOpacity: 0 }} />
      <stop offset="0.5" style={{ stopColor: "var(--shadow)", stopOpacity: 0.16 }} />
      <stop offset="1" style={{ stopColor: "var(--shadow)", stopOpacity: 0 }} />
    </linearGradient>
    <radialGradient id="ea-earth" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.9" style={{ stopColor: "var(--shadow)", stopOpacity: 0.5 }} />
      <stop offset="1" style={{ stopColor: "var(--shadow)", stopOpacity: 0 }} />
    </radialGradient>
  </defs>
);

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg className="ea" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {defs}
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------- 404: the cut leaf
// Stubs of cut leaves left in the gutter: a ragged edge, as scissors leave it close to the binding.
function stub(width: number, top: number, bottom: number, seed: number) {
  const pts: string[] = [`M320 ${top}`, `L${320 + width} ${top + 2}`];
  for (let y = top + 10, i = 0; y < bottom - 4; y += 11, i++) pts.push(`L${320 + width + (((i * 5 + seed) % 7) - 3)} ${y}`);
  pts.push(`L${320 + width} ${bottom - 2}`, `L320 ${bottom} Z`);
  return pts.join(" ");
}

export function CutBook() {
  return (
    <Frame label="An open book of tables. The right-hand leaf, page 404, has been cut out close to the binding and lies loose beside the book. A satellite's swath passes over the gap and finds no pixel there.">
      <Shadow />
      <path className="ea-cover" d={COVER} />
      <LeftPage folio="403" />
      {/* where the leaf was: the cover shows, hatched as the app hatches weeks with no data */}
      <path className="ea-gap" d={RIGHT_PAGE} />
      <path className="ea-gap-hatch" d={RIGHT_PAGE} />
      {[34, 26, 18, 11].map((w, i) => <path key={w} className="ea-stub" d={stub(w, 78 + i, 344 - i, i)} />)}
      <Gutter />
      {/* the line it was cut along, and the scissors that cut it */}
      <line className="ea-cutline" x1={366} y1={92} x2={366} y2={330} />
      <g transform="translate(366 70) rotate(90)">
        <circle className="ea-scissor" cx={-9} cy={-6} r={5} />
        <circle className="ea-scissor" cx={-9} cy={6} r={5} />
        <path className="ea-scissor-blade" d="M-5 -4 L14 4 M-5 4 L14 -4" />
      </g>
      {/* the loose leaf, slipping off the desk */}
      <g transform="translate(468 214) rotate(14)">
        <g className="ea-fall">
          <path className="ea-leaf" d="M0 0 L128 -4 L132 150 L4 156 L6 140 L1 128 L5 114 L0 100 L4 86 L-1 72 L4 58 L0 44 L5 30 L0 16 Z" />
          <Table x={18} y={16} cols={6} rows={5} cell={12} gap={3} seed={4} from={6} />
          <Lines x={18} y={104} width={96} count={2} />
          <text className="ea-folio is-missing" x={18} y={140}>404</text>
        </g>
      </g>
      {/* the satellite passes, its swath sweeping the gap */}
      <g transform="translate(470 36)">
        <g className="ea-scan">
          <polygon className="ea-swath" points="-7,12 7,12 66,244 -66,244" />
          <text className="ea-tag" x={0} y={206} textAnchor="middle">no pixel</text>
          <Satellite />
        </g>
      </g>
    </Frame>
  );
}

// ---------------------------------------------------------------- 500: the ink ran
export function InkBook() {
  return (
    <Frame label="An open book of tables. An inkwell has tipped over on the right-hand page and its ink has flooded across both pages, hiding the tables, and drips off the bottom edge. Above, a satellite tumbles and its downlink to the ground is broken.">
      <defs>
        <clipPath id="ea-pages">
          <path d={LEFT_PAGE} />
          <path d={RIGHT_PAGE} />
        </clipPath>
      </defs>
      <Shadow />
      <path className="ea-cover" d={COVER} />
      <LeftPage folio="499" />
      <path className="ea-stack" d={RIGHT_STACK} />
      <path className="ea-page" d={RIGHT_PAGE} />
      <text className="ea-head" x={352} y={104}>Seasons · 2001 to 2026</text>
      <g className="ea-bars">
        {[10, 12, 11, 13, 16, 15, 14, 16, 15, 17, 18, 16, 15].map((h, i) => <rect key={i} x={352 + i * 15} y={214 - h * 4.4} width={10} height={h * 4.4} className={i < 6 ? "is-modis" : "is-viirs"} />)}
      </g>
      <Lines x={352} y={238} width={200} count={7} />
      <text className="ea-folio" x={530} y={330}>500</text>
      <Gutter />
      {/* the flood: a wet halo spreading ahead of the ink itself, both kept to the paper */}
      <g clipPath="url(#ea-pages)">
        <path className="ea-ink is-halo" d="M548 96 C622 112 626 214 584 270 C548 316 470 344 404 330 C340 318 292 346 236 316 C178 286 204 222 248 198 C280 180 286 138 344 126 C404 114 468 70 548 96 Z" />
        <path className="ea-ink" d="M548 100 C610 118 612 206 576 258 C546 300 474 324 412 312 C350 300 304 324 254 298 C206 272 226 226 264 206 C296 190 298 152 350 140 C402 128 474 80 548 100 Z" />
      </g>
      <path className="ea-drip" d="M398 330 C398 346 400 356 399 372" />
      <path className="ea-drip is-late" d="M452 326 C452 338 454 350 453 362" />
      <path className="ea-drip is-later" d="M300 344 C301 352 300 360 300 366" />
      {/* the inkwell, on its side, and the reed pen beside it */}
      <g transform="translate(556 96) rotate(-64)">
        <rect className="ea-well" x={-15} y={-20} width={30} height={32} rx={5} />
        <rect className="ea-well" x={-8} y={-29} width={16} height={10} rx={2} />
        <ellipse className="ea-ink-solid" cx={0} cy={-30} rx={8} ry={3.4} />
      </g>
      <line className="ea-reed" x1={470} y1={60} x2={604} y2={40} />
      {/* the satellite, tumbling in safe mode; its downlink breaks halfway down */}
      <g transform="translate(232 28)">
        <g className="ea-tumble"><Satellite /></g>
      </g>
      <path className="ea-link" d="M240 50 L262 60" />
      <path className="ea-link" d="M284 70 L308 80" />
      <g transform="translate(273 65)" className="ea-blink">
        <path className="ea-cross" d="M-6 -6 L6 6 M6 -6 L-6 6" />
      </g>
      <text className="ea-tag" x={186} y={30} textAnchor="end">signal lost</text>
    </Frame>
  );
}

// ---------------------------------------------------------------- Explore: under cloud
export function CloudMap() {
  const fires = [[214, 226], [246, 214], [262, 248], [292, 230], [318, 262], [338, 236], [360, 270], [384, 248], [300, 282], [236, 262], [410, 232], [276, 200]];
  return (
    <Frame label="A folded map of the Nile Delta with fires marked on it in red. Clouds drift over the map and hide most of the fires. A satellite overhead looks down through its swath and cannot see the ground.">
      <ellipse className="ea-shadow" cx={W / 2} cy={378} rx={270} ry={16} />
      {/* the map sheet, folded in four: alternate panels a shade darker */}
      <g transform="rotate(-2 320 240)">
        <rect className="ea-page" x={70} y={110} width={500} height={258} />
        <rect className="ea-fold" x={195} y={110} width={125} height={258} />
        <rect className="ea-fold" x={445} y={110} width={125} height={258} />
        <line className="ea-foldline" x1={70} y1={239} x2={570} y2={239} />
        {/* the Delta: the Nile's fan, its two branches and the coast */}
        <path className="ea-coast" d="M120 168 C200 150 280 160 320 156 C380 150 450 160 528 172" />
        <path className="ea-river" d="M320 350 L318 300 C312 270 280 230 252 170 M318 300 C330 266 368 228 402 162" />
        <path className="ea-fan" d="M320 300 C290 250 240 200 200 166 L440 166 C400 210 350 252 320 300 Z" />
        {fires.map(([x, y], i) => <circle key={i} className="ea-fire" cx={x} cy={y} r={i % 3 === 0 ? 5 : 3.6} />)}
        <text className="ea-head" x={92} y={136}>Nile Delta</text>
        <text className="ea-folio" x={92} y={352}>scene 2026-11-13</text>
      </g>
      {/* the clouds, between the satellite and the ground */}
      <g className="ea-drift"><path className="ea-cloud" d="M176 238 C160 238 156 216 174 212 C176 192 204 188 214 202 C226 186 254 192 254 212 C272 212 274 238 256 238 Z" /></g>
      <g className="ea-drift is-slow"><path className="ea-cloud" d="M282 270 C262 270 258 244 280 240 C282 214 318 210 330 228 C346 208 382 216 380 240 C402 240 404 270 382 270 Z" /></g>
      <g className="ea-drift is-back"><path className="ea-cloud" d="M330 214 C316 214 312 196 328 192 C330 176 354 172 362 186 C372 174 394 180 392 196 C406 196 408 214 394 214 Z" /></g>
      <g className="ea-drift"><path className="ea-cloud" d="M392 262 C378 262 374 244 390 240 C392 224 414 220 422 234 C432 222 452 228 450 244 C464 244 466 262 452 262 Z" /></g>
      <g transform="translate(320 40)">
        <polygon className="ea-swath" points="-7,12 7,12 150,190 -150,190" />
        <Satellite />
      </g>
      <text className="ea-tag" x={470} y={124}>cloud: no view</text>
    </Frame>
  );
}

// ---------------------------------------------------------------- the whole app: the binding broke
export function LooseLeaves() {
  const leaves: [number, number, number, string, number][] = [
    [96, 150, -14, "12", 1], [236, 182, 8, "7", 2], [380, 146, -6, "30", 3], [470, 214, 16, "2", 4],
  ];
  return (
    <Frame label="A book whose binding has broken: the empty cover lies open and four leaves are scattered across the desk, out of order. Above, two satellites sit in the Earth's shadow, dark.">
      {/* Earth's shadow, and the two satellites inside it */}
      <circle cx={200} cy={-262} r={360} fill="url(#ea-earth)" />
      <circle className="ea-limb" cx={200} cy={-262} r={344} />
      <g transform="translate(176 40) rotate(-8)"><g className="ea-drift is-slow"><Satellite dark /></g></g>
      <g transform="translate(300 64) rotate(6)"><g className="ea-drift is-back"><Satellite dark /></g></g>
      <text className="ea-tag" x={384} y={50}>eclipse: both dark</text>
      <ellipse className="ea-shadow" cx={W / 2} cy={384} rx={300} ry={16} />
      {/* the empty cover, its spine split */}
      <g transform="translate(150 280) rotate(-4)">
        <path className="ea-cover" d="M0 0 L170 -6 L176 86 L4 92 Z" />
        <path className="ea-cover" d="M178 -6 L346 0 L342 92 L182 86 Z" />
        <path className="ea-spine" d="M174 -8 L176 4 L172 14 L177 26 L172 38 L178 50 L173 62 L177 74 L174 88" />
        <circle className="ea-thread-end" cx={174} cy={20} r={2.4} />
        <circle className="ea-thread-end" cx={176} cy={66} r={2.4} />
      </g>
      {leaves.map(([x, y, a, folio, seed]) => (
        <g key={folio} transform={`translate(${x} ${y}) rotate(${a})`}>
          <g className={seed % 2 ? "ea-fall" : "ea-fall is-back"}>
            <path className="ea-leaf" d="M0 0 L118 -3 L120 136 L2 140 Z" />
            <path className="ea-torn" d="M0 0 L-3 12 L1 24 L-2 36 L1 48" />
            <Table x={14} y={14} cols={6} rows={5} cell={12} gap={3} seed={seed} from={5 + (seed % 2)} />
            <Lines x={14} y={100} width={90} count={2} />
            <text className="ea-folio" x={14} y={128}>{folio}</text>
          </g>
        </g>
      ))}
    </Frame>
  );
}
