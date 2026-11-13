// The drawings of the error pages. Each error is a different accident to the book of tables, with a
// satellite that has its own trouble overhead:
//   CutBook      404: the scissors run down the gutter, the leaf falls out; the swath finds no pixel
//   InkBook      500: the inkwell tips and the ink floods both pages; the downlink breaks
//   CloudMap     Explore: the map unfolds, its fires light up, and cloud rolls over them
//   LooseLeaves  the whole app: the binding snaps, the leaves scatter, and Earth's shadow takes
//                both satellites
// Each plays in three acts: the drawing is inked in (outlines first, then the colour), the table
// fills row by row as the app's calendar does, then the accident. The CSS (app/errors.css) holds the
// timing; every element's resting state is its last frame, so with reduced motion, or before the
// stylesheet, the drawing is simply finished. Plain SVG, no hooks: they render on the server and in
// error boundaries alike. The drawings sit on Folio paper, whatever the page around them.

import type { CSSProperties, ReactNode } from "react";

const W = 640;
const H = 420;
const v = (vars: Record<string, string | number>) => vars as CSSProperties;

// A month-by-year table, coloured like the app's calendar: autumn burns, the rest is quiet. A torn
// fragment starts at a later month (from), so its few columns still hold the burning season. Each
// cell carries its place in the reading order, so the table fills row by row from `delay`.
function Table({ x, y, cols = 12, rows = 9, cell = 15, gap = 3, seed = 1, from = 0, delay = 0.7 }: {
  x: number; y: number; cols?: number; rows?: number; cell?: number; gap?: number; seed?: number; from?: number; delay?: number;
}) {
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const c = col + from;
      const autumn = c >= 7 && c <= 10 ? 2 + (c === 8 || c === 9 ? 1 : 0) : 0;
      const wobble = (r * 7 + c * 3 + seed * 5) % 5;
      const k = Math.max(0, Math.min(5, autumn + (wobble > 3 ? 1 : 0) - (wobble === 0 && autumn ? 1 : 0) + (c === 3 && wobble === 2 ? 1 : 0)));
      cells.push(
        <rect key={`${r}-${col}`} className="ea-cell" x={x + col * (cell + gap)} y={y + r * (cell + gap)} width={cell} height={cell}
          style={v({ fill: `var(--heat-${k})`, "--d": `${delay}s`, "--i": r * cols + col })} />,
      );
    }
  }
  return <g>{cells}</g>;
}

// Lines of text, written as rules, one after another.
function Lines({ x, y, width, count, step = 12, delay = 1.4 }: { x: number; y: number; width: number; count: number; step?: number; delay?: number }) {
  return (
    <g className="ea-text">
      {Array.from({ length: count }, (_, i) => {
        const w = width * (i % 4 === 3 ? 0.62 : 0.92 + ((i * 13) % 7) / 100);
        return <line key={i} pathLength={1} x1={x} y1={y + i * step} x2={x + w} y2={y + i * step} style={v({ "--d": `${delay + i * 0.12}s` })} />;
      })}
    </g>
  );
}

// A shape inked in: its outline drawn, then its colour washed in. `at` is when the pen starts.
function Inked({ as = "path", className, at = 0, ...rest }: { as?: "path" | "rect" | "ellipse"; className: string; at?: number } & Record<string, unknown>) {
  const style = v({ "--d": `${at}s` });
  const props = { ...rest, className: `${className} ea-sketch`, pathLength: 1, style };
  if (as === "rect") return <rect {...props} />;
  if (as === "ellipse") return <ellipse {...props} />;
  return <path {...props} />;
}

// A satellite: the body in brass, two solar panels in lapis.
function Satellite({ dim = false }: { dim?: boolean }) {
  return (
    <g className={dim ? "ea-sat is-dimming" : "ea-sat"}>
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

const COVER = "M34 86 Q177 62 320 88 Q463 62 606 86 L606 358 Q463 334 320 360 Q177 334 34 358 Z";
const LEFT_STACK = "M46 80 Q183 58 320 82 L320 350 Q183 328 46 348 Z";
const LEFT_PAGE = "M54 75 Q187 53 320 77 L320 345 Q187 323 54 343 Z";
const RIGHT_STACK = "M594 80 Q457 58 320 82 L320 350 Q457 328 594 348 Z";
const RIGHT_PAGE = "M586 75 Q453 53 320 77 L320 345 Q453 323 586 343 Z";

const Shadow = ({ cy = 372, rx = 292 }: { cy?: number; rx?: number }) => <ellipse className="ea-shadow" cx={W / 2} cy={cy} rx={rx} ry={18} />;
const Gutter = () => <rect className="ea-gutter" x={300} y={70} width={40} height={286} />;

function OpenBook({ folio }: { folio: string }) {
  return (
    <g>
      <Shadow />
      <Inked className="ea-cover" d={COVER} />
      <Inked className="ea-stack" d={LEFT_STACK} at={0.12} />
      <Inked className="ea-page" d={LEFT_PAGE} at={0.22} />
      <text className="ea-head ea-appear" x={88} y={104} style={v({ "--d": "0.5s" })}>Nile Delta · months</text>
      <Table x={88} y={118} rows={9} seed={1} delay={0.7} />
      <Lines x={88} y={292} width={196} count={3} delay={1.5} />
      <text className="ea-folio ea-appear" x={88} y={330} style={v({ "--d": "0.9s" })}>{folio}</text>
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
      <stop offset="0.9" style={{ stopColor: "var(--shadow)", stopOpacity: 0.55 }} />
      <stop offset="1" style={{ stopColor: "var(--shadow)", stopOpacity: 0 }} />
    </radialGradient>
    <radialGradient id="ea-gloss" cx="0.35" cy="0.3" r="0.6">
      <stop offset="0" style={{ stopColor: "var(--ground-raised)", stopOpacity: 0.28 }} />
      <stop offset="1" style={{ stopColor: "var(--ground-raised)", stopOpacity: 0 }} />
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
    <Frame label="An open book of tables. Scissors run down the gutter and the right-hand leaf, page 404, falls out and lies loose beside the book. A satellite's swath passes over the gap and finds no pixel there.">
      <OpenBook folio="403" />
      {/* under the leaf: the cover, hatched as the app hatches weeks with no data, and the stubs */}
      <path className="ea-gap" d={RIGHT_PAGE} />
      <path className="ea-gap-hatch" d={RIGHT_PAGE} />
      {[34, 26, 18, 11].map((w, i) => <path key={w} className="ea-stub" d={stub(w, 78 + i, 344 - i, i)} />)}
      {/* the leaf as it was, until the scissors have passed */}
      <g className="ea-cutaway">
        <Inked className="ea-stack" d={RIGHT_STACK} at={0.16} />
        <Inked className="ea-page" d={RIGHT_PAGE} at={0.26} />
        <text className="ea-head ea-appear" x={352} y={104} style={v({ "--d": "0.6s" })}>Nile Delta · weeks</text>
        <Table x={352} y={118} cols={11} rows={9} seed={3} delay={0.9} />
        <Lines x={352} y={292} width={196} count={3} delay={1.7} />
      </g>
      <Gutter />
      {/* the line it is cut along, drawn as the scissors go */}
      <line className="ea-cutline" x1={366} y1={84} x2={366} y2={334} pathLength={1} />
      <g transform="translate(366 72) rotate(90)">
        <g className="ea-snip">
          <g className="ea-blades">
            <circle className="ea-scissor" cx={-12} cy={-6} r={5} />
            <circle className="ea-scissor" cx={-12} cy={6} r={5} />
            <path className="ea-scissor-blade" d="M-8 -4 L13 3 M-8 4 L13 -3" />
          </g>
        </g>
      </g>
      {/* the loose leaf: it falls from where the page was to the desk, then stirs */}
      <g transform="translate(468 214) rotate(14)">
        <g className="ea-drop">
          <g className="ea-fall">
            <path className="ea-leaf" d="M0 0 L128 -4 L132 150 L4 156 L6 140 L1 128 L5 114 L0 100 L4 86 L-1 72 L4 58 L0 44 L5 30 L0 16 Z" />
            <Table x={18} y={16} cols={6} rows={5} cell={12} gap={3} seed={4} from={6} delay={0} />
            <Lines x={18} y={104} width={96} count={2} delay={0} />
            <text className="ea-folio is-missing" x={18} y={140}>404</text>
          </g>
        </g>
      </g>
      {/* the satellite passes, its swath sweeping the gap */}
      <g transform="translate(470 36)">
        <g className="ea-arrive">
          <g className="ea-scan">
            <polygon className="ea-swath" points="-7,12 7,12 66,244 -66,244" />
            <text className="ea-tag ea-late" x={0} y={206} textAnchor="middle">no pixel</text>
            <Satellite />
          </g>
        </g>
      </g>
    </Frame>
  );
}

// ---------------------------------------------------------------- 500: the ink ran
const FLOOD_HALO = "M548 96 C622 112 626 214 584 270 C548 316 470 344 404 330 C340 318 292 346 236 316 C178 286 204 222 248 198 C280 180 286 138 344 126 C404 114 468 70 548 96 Z";
const FLOOD = "M548 100 C610 118 612 206 576 258 C546 300 474 324 412 312 C350 300 304 324 254 298 C206 272 226 226 264 206 C296 190 298 152 350 140 C402 128 474 80 548 100 Z";

export function InkBook() {
  return (
    <Frame label="An open book of tables. An inkwell standing on the right-hand page tips over, and its ink floods across both pages, hiding the tables, then drips off the bottom edge. Above, a satellite tumbles and its downlink to the ground breaks.">
      <defs>
        <clipPath id="ea-pages">
          <path d={LEFT_PAGE} />
          <path d={RIGHT_PAGE} />
        </clipPath>
      </defs>
      <OpenBook folio="499" />
      <Inked className="ea-stack" d={RIGHT_STACK} at={0.16} />
      <Inked className="ea-page" d={RIGHT_PAGE} at={0.26} />
      <text className="ea-head ea-appear" x={352} y={104} style={v({ "--d": "0.6s" })}>Seasons · 2001 to 2026</text>
      <g className="ea-bars">
        {[10, 12, 11, 13, 16, 15, 14, 16, 15, 17, 18, 16, 15].map((h, i) => (
          <rect key={i} x={352 + i * 15} y={214 - h * 4.4} width={10} height={h * 4.4} className={i < 6 ? "is-modis" : "is-viirs"} style={v({ "--d": `${0.9 + i * 0.06}s` })} />
        ))}
      </g>
      <Lines x={352} y={238} width={200} count={7} delay={1.4} />
      <text className="ea-folio ea-appear" x={530} y={330} style={v({ "--d": "0.9s" })}>500</text>
      <Gutter />
      {/* the flood: a wet halo spreading ahead of the ink itself, kept to the paper; a gloss on top */}
      <g clipPath="url(#ea-pages)">
        <path className="ea-ink is-halo" d={FLOOD_HALO} />
        <path className="ea-ink" d={FLOOD} />
        <path className="ea-ink-gloss" d={FLOOD} fill="url(#ea-gloss)" />
      </g>
      <path className="ea-drip" pathLength={1} d="M398 330 C398 346 400 356 399 372" />
      <path className="ea-drip is-late" pathLength={1} d="M452 326 C452 338 454 350 453 362" />
      <path className="ea-drip is-later" pathLength={1} d="M300 344 C301 352 300 360 300 366" />
      {/* the inkwell: set down upright, then over it goes */}
      <g transform="translate(556 104)">
        <g className="ea-tip">
          <rect className="ea-well" x={-15} y={-28} width={30} height={32} rx={5} />
          <rect className="ea-well" x={-8} y={-37} width={16} height={10} rx={2} />
          <ellipse className="ea-ink-solid" cx={0} cy={-38} rx={8} ry={3.4} />
        </g>
      </g>
      <line className="ea-reed ea-appear" x1={470} y1={60} x2={604} y2={40} style={v({ "--d": "1.2s" })} />
      {/* the satellite in safe mode; its downlink holds, then breaks as the ink runs */}
      <g transform="translate(232 28)">
        <g className="ea-tumble"><Satellite /></g>
      </g>
      <path className="ea-link is-whole" d="M240 50 L308 80" />
      <path className="ea-link is-broken" d="M240 50 L262 60" />
      <path className="ea-link is-broken" d="M284 70 L308 80" />
      <g transform="translate(273 65)" className="ea-late">
        <g className="ea-blink"><path className="ea-cross" d="M-6 -6 L6 6 M6 -6 L-6 6" /></g>
      </g>
      <text className="ea-tag ea-late" x={186} y={30} textAnchor="end">signal lost</text>
    </Frame>
  );
}

// ---------------------------------------------------------------- Explore: under cloud
export function CloudMap() {
  const fires = [[214, 226], [246, 214], [262, 248], [292, 230], [318, 262], [338, 236], [360, 270], [384, 248], [300, 282], [236, 262], [410, 232], [276, 200]];
  const clouds: [string, string, number][] = [
    ["M176 238 C160 238 156 216 174 212 C176 192 204 188 214 202 C226 186 254 192 254 212 C272 212 274 238 256 238 Z", "is-left", 0],
    ["M282 270 C262 270 258 244 280 240 C282 214 318 210 330 228 C346 208 382 216 380 240 C402 240 404 270 382 270 Z", "is-right", 1],
    ["M330 214 C316 214 312 196 328 192 C330 176 354 172 362 186 C372 174 394 180 392 196 C406 196 408 214 394 214 Z", "is-right", 2],
    ["M392 262 C378 262 374 244 390 240 C392 224 414 220 422 234 C432 222 452 228 450 244 C464 244 466 262 452 262 Z", "is-left", 3],
  ];
  return (
    <Frame label="A folded map of the Nile Delta unfolds, and its fires light up in red. Then cloud rolls in over the map and hides most of the fires. A satellite overhead looks down through its swath and cannot see the ground.">
      <ellipse className="ea-shadow" cx={W / 2} cy={378} rx={270} ry={16} />
      {/* the map sheet, folded in four: it opens, alternate panels a shade darker */}
      <g transform="rotate(-2 320 240)">
        <g className="ea-unfold">
          <rect className="ea-page" x={70} y={110} width={500} height={258} />
          <rect className="ea-fold" x={195} y={110} width={125} height={258} />
          <rect className="ea-fold" x={445} y={110} width={125} height={258} />
          <line className="ea-foldline" x1={70} y1={239} x2={570} y2={239} />
        </g>
        {/* the Delta: the Nile's fan, its two branches and the coast, drawn in */}
        <path className="ea-fan ea-appear" d="M320 300 C290 250 240 200 200 166 L440 166 C400 210 350 252 320 300 Z" style={v({ "--d": "1.2s" })} />
        <path className="ea-coast ea-pen" pathLength={1} d="M120 168 C200 150 280 160 320 156 C380 150 450 160 528 172" style={v({ "--d": "0.7s" })} />
        <path className="ea-river ea-pen" pathLength={1} d="M320 350 L318 300 C312 270 280 230 252 170 M318 300 C330 266 368 228 402 162" style={v({ "--d": "0.9s" })} />
        {fires.map(([x, y], i) => <circle key={i} className="ea-fire" cx={x} cy={y} r={i % 3 === 0 ? 5 : 3.6} style={v({ "--d": `${1.5 + i * 0.07}s` })} />)}
        <text className="ea-head ea-appear" x={92} y={136} style={v({ "--d": "0.6s" })}>Nile Delta</text>
        <text className="ea-folio ea-appear" x={92} y={352} style={v({ "--d": "0.8s" })}>scene 2026-11-13</text>
      </g>
      {/* the cloud rolls in between the satellite and the ground, then drifts */}
      {clouds.map(([d, side, i]) => (
        <g key={i} className={`ea-roll ${side}`} style={v({ "--d": `${2.5 + i * 0.18}s` })}>
          <g className={i % 2 ? "ea-drift is-back" : "ea-drift"}><path className="ea-cloud" d={d} /></g>
        </g>
      ))}
      <g transform="translate(320 40)">
        <g className="ea-arrive">
          <polygon className="ea-swath" points="-7,12 7,12 150,190 -150,190" />
          <Satellite />
        </g>
      </g>
      <text className="ea-tag ea-late" x={470} y={124}>cloud: no view</text>
    </Frame>
  );
}

// ---------------------------------------------------------------- the whole app: the binding broke
export function LooseLeaves() {
  // where each leaf comes to rest, and how far it flies from the stack on the cover to get there
  const leaves: [number, number, number, string, number, number, number][] = [
    [96, 150, -14, "12", 1, 168, 100], [236, 182, 8, "7", 2, 28, 68], [380, 146, -6, "30", 3, -116, 104], [470, 214, 16, "2", 4, -206, 36],
  ];
  return (
    <Frame label="A book whose binding snaps: its leaves fly out and scatter across the desk, out of order, around the empty cover. Above, the Earth's shadow sweeps over two satellites and they go dark.">
      {/* Earth's shadow, sweeping over the two satellites */}
      <g className="ea-eclipse">
        <circle cx={200} cy={-262} r={360} fill="url(#ea-earth)" />
        <circle className="ea-limb" cx={200} cy={-262} r={344} />
      </g>
      <g transform="translate(176 40) rotate(-8)"><g className="ea-drift is-slow"><Satellite dim /></g></g>
      <g transform="translate(300 64) rotate(6)"><g className="ea-drift is-back"><Satellite dim /></g></g>
      <text className="ea-tag ea-late" x={384} y={50}>eclipse: both dark</text>
      <ellipse className="ea-shadow" cx={W / 2} cy={384} rx={300} ry={16} />
      {/* the empty cover, its spine split */}
      <g transform="translate(150 280) rotate(-4)">
        <g className="ea-half is-left"><Inked className="ea-cover" d="M0 0 L170 -6 L176 86 L4 92 Z" /></g>
        <g className="ea-half is-right"><Inked className="ea-cover" d="M178 -6 L346 0 L342 92 L182 86 Z" /></g>
        <path className="ea-spine ea-pen" pathLength={1} d="M174 -8 L176 4 L172 14 L177 26 L172 38 L178 50 L173 62 L177 74 L174 88" style={v({ "--d": "1.3s" })} />
        <circle className="ea-thread-end ea-appear" cx={174} cy={20} r={2.4} style={v({ "--d": "1.6s" })} />
        <circle className="ea-thread-end ea-appear" cx={176} cy={66} r={2.4} style={v({ "--d": "1.6s" })} />
      </g>
      {leaves.map(([x, y, a, folio, seed, dx, dy], k) => (
        <g key={folio} transform={`translate(${x} ${y}) rotate(${a})`}>
          <g className="ea-scatter" style={v({ "--dx": `${dx}px`, "--dy": `${dy}px`, "--a": `${-a}deg`, "--d": `${1.7 + k * 0.16}s` })}>
            <g className={seed % 2 ? "ea-fall" : "ea-fall is-back"}>
              <path className="ea-leaf" d="M0 0 L118 -3 L120 136 L2 140 Z" />
              <path className="ea-torn" d="M0 0 L-3 12 L1 24 L-2 36 L1 48" />
              <Table x={14} y={14} cols={6} rows={5} cell={12} gap={3} seed={seed} from={5 + (seed % 2)} delay={0.4 + k * 0.1} />
              <Lines x={14} y={100} width={90} count={2} delay={0.9} />
              <text className="ea-folio" x={14} y={128}>{folio}</text>
            </g>
          </g>
        </g>
      ))}
    </Frame>
  );
}
