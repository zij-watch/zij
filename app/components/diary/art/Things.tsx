// The desk's smaller things for Hudhud's Fire Diary, drawn in SVG in the manuscript hand: wooden
// trays, wax seals, the rumour slip, the people's tokens, the hoopoe constellation, the clock of
// passes, the engraved globe, the sealed envelope, the reading stone and brass thread.

import type { CSSProperties, ReactNode } from "react";

/** A wooden tray on the land's edge, its label on a paper slip pinned to its front. */
export function Tray({ label, lit = false, children }: { label: string; lit?: boolean; children?: ReactNode }) {
  return (
    <div className={`tray${lit ? " is-lit" : ""}`} data-theme="folio">
      <svg viewBox="0 0 180 80" aria-hidden="true">
        <path className="tray-wood th-line" d="M4 18H176L164 76H16Z" />
        <path className="tray-floor" d="M14 24H166L157 68H23Z" />
        <path className="th-hatch" d="M16 60L22 66M150 60L156 66M24 70H156" />
        <path className="th-line" fill="none" d="M14 24H166L157 68H23Z" />
      </svg>
      <span className="tray-slip">{label}</span>
      <div className="tray-hold">{children}</div>
    </div>
  );
}

export type SealKind = "honest" | "detective" | "keeper";

/** The seals' shapes in a 100 by 100 box: the wax, and the emblem pressed into each. */
export const SEAL = {
  wax: "M50 4C62 4 70 9 78 14C88 20 96 30 96 46C97 60 92 70 85 79C77 89 64 96 50 96C35 96 24 90 15 81C7 72 4 61 4 49C4 35 10 23 20 15C29 8 39 4 50 4Z",
  honest: "M50 30V68M34 40H66M34 40L28 54H40ZM66 40L60 54H72ZM42 68H58",
  detective: "M58 46A12 12 0 1 1 34 46A12 12 0 1 1 58 46ZM55 55L68 68",
  keeper: "M38 66C36 54 44 46 54 46C62 46 66 52 64 58M54 46L50 30M54 46L58 31M54 46L64 34M54 46L44 33M64 58L76 64",
};

/** A wax seal: the wax spread a little at the edge, an emblem pressed into it. */
export function WaxSeal({ kind, pressed = true, size = 96 }: { kind: SealKind; pressed?: boolean; size?: number }) {
  return (
    <div className={`seal${pressed ? " is-pressed" : ""}`} style={{ width: size, height: size }} data-theme="folio" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <path className="seal-wax" d={SEAL.wax} />
        <circle className="seal-ring" cx={50} cy={50} r={33} />
        <circle className="seal-ring is-inner" cx={50} cy={50} r={29} />
        <path className="seal-mark" d={SEAL[kind]} />
      </svg>
    </div>
  );
}

/** The rumour slip pinned to the desk. Pressing False lets one drop of ink spread over it. */
export function RumourSlip({ text, struck = false, stamp }: { text: string; struck?: boolean; stamp?: string }) {
  return (
    <div className={`rumour slip${struck ? " is-struck" : ""}`} data-theme="folio">
      <i className="rumour-pin" aria-hidden="true" />
      <p className="rumour-text">{text}</p>
      <i className="rumour-ink" aria-hidden="true" />
      {stamp && <span className="rumour-word">{stamp}</span>}
    </div>
  );
}

/** Five engraved people on wooden tokens. They are examples, not real users. */
export function PersonToken({ who, label }: { who: 1 | 2 | 3 | 4 | 5; label: string }) {
  const art: Record<number, ReactNode> = {
    1: <path d="M30 18a7 7 0 1 1 0.1 0M22 24C22 22 38 22 38 24L38 28H22ZM16 52C16 40 22 34 30 34C38 34 44 40 44 52M40 40L48 32L50 34L42 42" />,
    2: <path d="M30 20a7 7 0 1 1 0.1 0M16 18H44C42 14 38 12 30 12C22 12 18 14 16 18ZM16 52C16 40 22 34 30 34C38 34 44 40 44 52M46 50C46 42 48 38 52 36M48 44C50 42 52 42 53 43" />,
    3: <path d="M30 22a7 7 0 1 1 0.1 0M18 18C18 10 42 10 42 18L46 20H14ZM30 8V12M16 52C16 40 22 34 30 34C38 34 44 40 44 52" />,
    4: <path d="M30 18a7 7 0 1 1 0.1 0M16 52C16 40 22 34 30 34C38 34 44 40 44 52M40 38H50V50H40ZM42 42H48M42 45H48M52 34L46 46" />,
    5: <path d="M30 18a7 7 0 1 1 0.1 0M16 52C16 40 22 34 30 34C38 34 44 40 44 52M20 44H34V52H20ZM27 44V52" />,
  };
  return (
    <div className="person">
      <span className="token-disc" aria-hidden="true"><svg viewBox="0 0 60 60" className="person-art">{art[who]}</svg></span>
      <span className="person-label">{label}</span>
    </div>
  );
}

// The hoopoe constellation: fifteen stars, three for each level, joined by brass thread at the end.
export const STARS: [number, number][] = [
  [14, 92], [34, 72], [52, 60], // tail and wing: level 1
  [72, 56], [90, 44], [106, 34], // back and head: level 2
  [86, 16], [98, 10], [110, 16], // the crest: level 3
  [122, 40], [140, 46], [98, 62], // the bill and breast: level 4
  [80, 78], [56, 80], [84, 100], // belly and foot: level 5
];
const EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 9], [9, 10], [5, 6], [5, 7], [5, 8], [4, 11], [11, 12], [12, 13], [13, 1], [12, 14]];
export const constellationPath = EDGES.map(([a, b]) => `M${STARS[a][0]} ${STARS[a][1]}L${STARS[b][0]} ${STARS[b][1]}`).join("");

/** The constellation: lit stars bright, dimmed ones faint, unearned ones a mere point. */
export function Constellation({ lit, threaded = false, label }: { lit: ("on" | "dim" | "off")[]; threaded?: boolean; label?: string }) {
  return (
    <div className={`constellation${threaded ? " is-threaded" : ""}`} role={label ? "img" : undefined} aria-label={label}>
      <svg viewBox="0 0 154 112" aria-hidden="true">
        <path className="const-thread" d={constellationPath} pathLength={1} />
        {STARS.map(([x, y], i) => (
          <g key={i} className={`const-star is-${lit[i] ?? "off"}`}>
            <circle cx={x} cy={y} r={lit[i] === "on" ? 2.6 : lit[i] === "dim" ? 1.8 : 1} />
            {lit[i] === "on" && <path d={`M${x - 6} ${y}H${x + 6}M${x} ${y - 6}V${y + 6}`} />}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Brass thread from one point to another, sagging a little like real thread. */
export function threadPath(a: [number, number], b: [number, number], sag = 18): string {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + sag;
  return `M${a[0]} ${a[1]}Q${mx} ${my} ${b[0]} ${b[1]}`;
}

/**
 * A clock of the satellites' passes, noon at the top: the day half in paper, the night half hatched,
 * a brass arc at each pass. Hours are hours of the day (0 to 24). An illustration, with no figures.
 */
export function PassClock({ passes, fire, labels }: { passes: number[]; fire?: { from: number; to: number; caught: boolean } | null; labels: { day: string; night: string } }) {
  const P = (h: number, r: number) => { const a = ((h - 12) / 24) * Math.PI * 2; return [100 + Math.sin(a) * r, 100 - Math.cos(a) * r]; };
  const arc = (h0: number, h1: number, r: number) => { const [x0, y0] = P(h0, r), [x1, y1] = P(h1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${h1 - h0 > 12 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  return (
    <div className="clock" data-theme="folio">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs><pattern id="clock-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V5" className="clock-hatchline" /></pattern></defs>
        <circle className="clock-face" cx={100} cy={100} r={90} />
        <path fill="url(#clock-hatch)" d="M10 100A90 90 0 0 0 190 100Z" />
        <circle className="th-line" fill="none" cx={100} cy={100} r={90} />
        <path className="th-line" d="M10 100H190" />
        <path className="th-ink-line" d={Array.from({ length: 24 }, (_, h) => { const [x0, y0] = P(h, h % 6 ? 84 : 78), [x1, y1] = P(h, 90); return `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`; }).join("")} />
        {passes.map((h) => <path key={h} className="clock-pass" d={arc(h - 0.6, h + 0.6, 70)} />)}
        {fire && <path className={`clock-fire${fire.caught ? " is-caught" : ""}`} d={arc(fire.from, fire.to, 56)} />}
      </svg>
      <span className="clock-label is-day">{labels.day}</span>
      <span className="clock-label is-night">{labels.night}</span>
    </div>
  );
}

/** The engraved globe: graticule, land in ink, the night side hatched with a straight edge. */
export function Globe({ size, land, graticule, children }: { size: number; land: string; graticule: string; children?: ReactNode }) {
  return (
    <div className="globe" data-theme="folio" style={{ "--size": size } as CSSProperties}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <clipPath id="globe-clip"><circle cx={size / 2} cy={size / 2} r={size / 2 - 14} /></clipPath>
          <pattern id="globe-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0V6" className="globe-hatchline" /></pattern>
        </defs>
        <circle className="globe-sea" cx={size / 2} cy={size / 2} r={size / 2 - 14} />
        <g clipPath="url(#globe-clip)">
          <path className="globe-grat" d={graticule} />
          <path className="globe-land" d={land} />
          <rect fill="url(#globe-hatch)" x={0} y={0} width={size * 0.3} height={size} />
          <path className="th-line" d={`M${size * 0.3} 0V${size}`} />
        </g>
        <circle className="th-line" fill="none" cx={size / 2} cy={size / 2} r={size / 2 - 14} />
      </svg>
      {children}
    </div>
  );
}

/** A sealed envelope, its flap closed with wax. */
export function Envelope({ label, open = false }: { label: string; open?: boolean }) {
  return (
    <div className={`envelope${open ? " is-open" : ""}`} data-theme="folio">
      <svg viewBox="0 0 200 130" aria-hidden="true">
        <rect className="env-paper th-line" x={4} y={4} width={192} height={122} />
        <path className="th-line" fill="none" d={open ? "M4 4L100 -40L196 4" : "M4 4L100 72L196 4"} />
        <path className="th-line" fill="none" d="M4 126L80 62M196 126L120 62" />
        {!open && <path className="seal-wax" d="M100 58C112 58 118 64 118 74C118 84 110 90 100 90C88 90 82 84 82 74C82 64 89 58 100 58Z" />}
      </svg>
      <span className="env-label">{label}</span>
    </div>
  );
}

/** The reading stone: a lens of rock crystal in a brass rim, from Ibn Yunus's own desk. */
export function ReadingStone({ size = 72 }: { size?: number }) {
  return (
    <div className="stone" style={{ width: size, height: size }} data-theme="folio" aria-hidden="true">
      <svg viewBox="0 0 80 80"><circle className="stone-glass" cx={40} cy={40} r={34} /><circle className="th-brass-line" cx={40} cy={40} r={34} /><circle className="th-brass-line" cx={40} cy={40} r={30} /><path className="stone-glint" d="M22 30C24 22 30 18 38 16" /></svg>
    </div>
  );
}

/** The plate-mark every drawing that is not the record carries beside itself. */
export function IllusTag({ text }: { text: string }) {
  return <span className="plate-mark jadwal-box illus-tag">{text}</span>;
}
