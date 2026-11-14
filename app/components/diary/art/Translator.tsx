"use client";

// The translator: a brass desk instrument, no face. An alidade swings over a ruled how-close scale,
// a crank turns it, a × dial sets its one number, four gear seats take the upgrades, and a small
// lantern window holds a flame that grows as it gets closer. Moving parts are divs around SVGs, so
// the needle and the dial turn on the compositor (app/app/diary/diary.css).

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Flame } from "./Fire";

/** The needle's angle from upright for a closeness of 0 (far off) to 1 (spot on). */
export const needleAngle = (c: number) => -68 + 136 * Math.min(1, Math.max(0, c));

function gearPath(cx: number, cy: number, r: number, teeth: number): string {
  let d = "";
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r * 0.84 : r;
    const p = (a: number, q: number) => `${(cx + Math.cos(a) * q).toFixed(2)} ${(cy + Math.sin(a) * q).toFixed(2)}`;
    d += `${i ? "L" : "M"}${p(a0, rr)}L${p(a1, rr)}`;
  }
  return d + "Z";
}

/** A brass gear with an engraved emblem of its idea at the hub. */
export function Gear({ idea, size = 56, className = "" }: { idea: 1 | 2 | 3 | 4; size?: number; className?: string }) {
  return (
    <svg className={`gear ${className}`} viewBox="0 0 60 60" width={size} height={size} aria-hidden="true">
      <path className="tr-brass tr-line" d={gearPath(30, 30, 27, 14)} />
      <circle className="tr-face tr-line" cx={30} cy={30} r={17} />
      {idea === 1 && <path className="tr-ink-line" d="M18 26H42M30 18V40M22 26L19 34H25ZM38 26L35 32H41Z" />}
      {idea === 2 && <><circle className="tr-ink-line" cx={30} cy={30} r={11} /><path className="tr-ink-line" d="M30 19V23M41 30H37M30 41V37M19 30H23M30 30L36 24" /></>}
      {idea === 3 && <path className="tr-ink-line" d="M20 40C17 34 22 31 21 25C25 29 27 33 24 40ZM32 40C27 32 34 26 33 18C40 25 42 33 37 40Z" />}
      {idea === 4 && <path className="tr-ink-line" d="M18 36H42M22 36L36 22M36 22L38 20M20 40H24M36 40H40" />}
      <circle className="tr-brass tr-line" cx={30} cy={30} r={3} />
    </svg>
  );
}

export type TranslatorProps = {
  /** 0 far off … 1 spot on */
  closeness: number;
  labels: { far: string; close: string; spot: string };
  /** the × dial's value, written at its centre; null hides it */
  k?: number | null;
  dialAngle?: number;
  dialProps?: HTMLAttributes<HTMLDivElement>;
  crankAngle?: number;
  crankProps?: HTMLAttributes<HTMLDivElement>;
  seats?: (1 | 2 | 3 | 4 | null)[];
  seatSlot?: (i: number) => ReactNode;
  className?: string;
};

export default function Translator({ closeness, labels, k = null, dialAngle = 0, dialProps, crankAngle = 0, crankProps, seats = [null, null, null, null], seatSlot, className = "" }: TranslatorProps) {
  const ticks = Array.from({ length: 29 }, (_, i) => {
    const a = ((-70 + i * 5) * Math.PI) / 180, long = i % 7 === 0, r0 = long ? 112 : 118;
    return `M${(180 + Math.sin(a) * r0).toFixed(1)} ${(150 - Math.cos(a) * r0).toFixed(1)}L${(180 + Math.sin(a) * 126).toFixed(1)} ${(150 - Math.cos(a) * 126).toFixed(1)}`;
  }).join("");
  const arc = (r: number) => `M${(180 + Math.sin((-70 * Math.PI) / 180) * r).toFixed(1)} ${(150 - Math.cos((-70 * Math.PI) / 180) * r).toFixed(1)}A${r} ${r} 0 0 1 ${(180 + Math.sin((70 * Math.PI) / 180) * r).toFixed(1)} ${(150 - Math.cos((70 * Math.PI) / 180) * r).toFixed(1)}`;
  return (
    <div className={`tr ${className}`} data-theme="folio" style={{ "--close": closeness } as CSSProperties}>
      <svg className="tr-art" viewBox="0 0 360 260" aria-hidden="true">
        {/* the ruled brass scale, from far off to spot on */}
        <path className="tr-scale" d={`${arc(128)}L${(180 + Math.sin((70 * Math.PI) / 180) * 104).toFixed(1)} ${(150 - Math.cos((70 * Math.PI) / 180) * 104).toFixed(1)}A104 104 0 0 0 ${(180 + Math.sin((-70 * Math.PI) / 180) * 104).toFixed(1)} ${(150 - Math.cos((-70 * Math.PI) / 180) * 104).toFixed(1)}Z`} />
        <path className="tr-line" fill="none" d={arc(128)} />
        <path className="tr-line" fill="none" d={arc(104)} />
        <path className="tr-ink-line" d={ticks} />
        {/* the plate it stands on, framed like a page */}
        <rect className="tr-brass tr-line" x={14} y={154} width={332} height={92} />
        <rect className="tr-frame" x={20} y={160} width={320} height={80} />
        <path className="tr-hatch" d="M14 238L22 246M30 238L38 246M46 238L54 246M62 238L70 246M78 238L86 246M94 238L102 246M110 238L118 246M126 238L134 246M142 238L150 246M158 238L166 246M174 238L182 246M190 238L198 246M206 238L214 246M222 238L230 246M238 238L246 246M254 238L262 246M270 238L278 246M286 238L294 246M302 238L310 246M318 238L326 246M334 238L342 246" />
        {/* the pillar and pivot of the alidade */}
        <path className="tr-brass tr-line" d="M172 154L176 150H184L188 154Z" />
        {/* the gear seats */}
        {[0, 1, 2, 3].map((i) => <circle key={i} className={`tr-seat${seats[i] ? " is-full" : ""}`} cx={128 + i * 36} cy={204} r={16} />)}
        {/* the lantern window */}
        <rect className="tr-window tr-line" x={290} y={172} width={36} height={52} />
        <path className="tr-line" fill="none" d="M290 182H326M308 172V224" />
        {/* the dial's ring */}
        <circle className="tr-brass tr-line" cx={62} cy={202} r={34} />
      </svg>
      <span className="tr-label is-far">{labels.far}</span>
      <span className="tr-label is-close">{labels.close}</span>
      <span className="tr-label is-spot">{labels.spot}</span>
      <div className="tr-needle" style={{ "--a": `${needleAngle(closeness)}deg` } as CSSProperties} aria-hidden="true">
        <svg viewBox="0 0 20 140"><path className="tr-brass tr-line" d="M10 4L13 128H7Z" /><path className="tr-ink-line" d="M10 4V14" /><circle className="tr-brass tr-line" cx={10} cy={128} r={7} /></svg>
      </div>
      <div className="tr-lamp" aria-hidden="true"><Flame w={14} h={22} seed={41} /></div>
      <div className="tr-dial" style={{ "--a": `${dialAngle}deg` } as CSSProperties} {...dialProps}>
        <div className="tr-dial-face"><svg viewBox="0 0 80 80" aria-hidden="true">
          <circle className="tr-face tr-line" cx={40} cy={40} r={30} />
          <path className="tr-ink-line" d={Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return `M${(40 + Math.cos(a) * 25).toFixed(1)} ${(40 + Math.sin(a) * 25).toFixed(1)}L${(40 + Math.cos(a) * 30).toFixed(1)} ${(40 + Math.sin(a) * 30).toFixed(1)}`; }).join("")} />
          <path className="tr-brass tr-line" d="M40 6L44 16H36Z" />
        </svg></div>
        {k != null && <span className="tr-k t-figure">{"×"}{k}</span>}
      </div>
      <div className="tr-crank" style={{ "--a": `${crankAngle}deg` } as CSSProperties} {...crankProps}>
        <div className="tr-crank-arm"><svg viewBox="0 0 60 60" aria-hidden="true"><path className="tr-brass tr-line" d="M27 30V8H33V30Z" /><circle className="tr-brass tr-line" cx={30} cy={30} r={7} /><circle className="tr-wood tr-line" cx={30} cy={8} r={5} /></svg></div>
      </div>
      <div className="tr-seats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tr-seatslot">
            {seats[i] ? <Gear idea={seats[i] as 1 | 2 | 3 | 4} size={34} className="is-seated" /> : seatSlot?.(i)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Quiet weeks: a balance, a quiet week on one pan against a busy one on the other. */
export function Balance({ tip = 0 }: { tip?: number }) {
  return (
    <div className="demo-balance" style={{ "--tip": `${tip}deg` } as CSSProperties} data-theme="folio" aria-hidden="true">
      <svg viewBox="0 0 160 120"><path className="tr-brass tr-line" d="M76 114H84L82 30H78Z" /><path className="tr-line" fill="none" d="M56 114H104" /></svg>
      <div className="demo-beam">
        <svg viewBox="0 0 160 60"><path className="tr-brass tr-line" d="M14 8H146V12H14Z" /><circle className="tr-brass tr-line" cx={80} cy={10} r={4} /><path className="tr-ink-line" d="M20 12L10 44M20 12L30 44M140 12L130 44M140 12L150 44" /><path className="tr-brass tr-line" d="M6 44H34C32 52 8 52 6 44ZM126 44H154C152 52 128 52 126 44Z" /></svg>
      </div>
    </div>
  );
}

/** The calendar: a volvelle of twelve months, a paper disc pinned at its centre. */
export function Volvelle({ turn = 0, months }: { turn?: number; months: string[] }) {
  return (
    <div className="demo-volvelle" data-theme="folio" aria-hidden="true">
      <div className="demo-disc" style={{ "--a": `${-turn * 30}deg` } as CSSProperties}>
        <svg viewBox="0 0 200 200">
          <circle className="tr-face tr-line" cx={100} cy={100} r={92} />
          <circle className="tr-rule" cx={100} cy={100} r={64} />
          {months.map((m, i) => (
            <text key={m} className={`demo-month${i >= 7 && i <= 9 ? " is-burn" : ""}`} x={100} y={30} textAnchor="middle" transform={`rotate(${i * 30} 100 100)`}>{m}</text>
          ))}
        </svg>
      </div>
      <svg className="demo-pin" viewBox="0 0 200 200"><path className="tr-brass" d="M100 0L107 16H93Z" /><circle className="tr-brass tr-line" cx={100} cy={100} r={6} /></svg>
    </div>
  );
}

/** Fire heat: two fires side by side, one small and cool, one big and hot. */
export function TwoFires() {
  return (
    <div className="demo-fires" aria-hidden="true">
      <span className="demo-fire is-cool"><Flame w={14} h={20} seed={51} /></span>
      <span className="demo-fire is-hot"><Flame w={30} h={46} seed={52} /></span>
    </div>
  );
}

/** Busy years: a brass lever on a rule, from a quiet year to a busy one. */
export function YearLever({ at = 0 }: { at?: number }) {
  return (
    <div className="demo-lever" style={{ "--at": at } as CSSProperties} data-theme="folio" aria-hidden="true">
      <svg viewBox="0 0 200 40"><path className="tr-line" fill="none" d="M10 20H190M10 12V28M190 12V28M55 16V24M100 16V24M145 16V24" /></svg>
      <span className="demo-knob"><svg viewBox="0 0 24 40"><path className="tr-brass tr-line" d="M4 2H20V30L12 38L4 30Z" /></svg></span>
    </div>
  );
}
