"use client";

// Fire drawn as flame and the light it throws, never as a glowing disc. A field fire is a ragged
// line of flame along the ground; a factory flame stands steady on its chimney; a ghost dot is a
// fire too faint to be sure of. Each flame is the landing page's flipbook: eight drawings of one fire
// painted once into a canvas, stepped through by CSS, so it flickers by changing shape.

import { useEffect, useRef, type CSSProperties } from "react";
import { flameStrip, whenIdle } from "@/lib/diary/paint";

const FRAMES = 8;

export function Flame({ w, h, seed, lean = 0, className = "" }: { w: number; h: number; seed: number; lean?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    return whenIdle(() => flameStrip(cv, w, h, FRAMES, seed, lean));
  }, [w, h, seed, lean]);
  return (
    <span className={`flame ${className}`} style={{ width: w, height: h, "--beat": `${1 + (seed % 7) * 0.06}s`, "--off": `${-(seed % 11) * 0.09}s` } as CSSProperties} aria-hidden="true">
      <canvas ref={ref} />
    </span>
  );
}

/** A burning field: three to five tongues along a ragged line, the scorched ground behind them. */
export function FieldFire({ seed, scale = 1, className = "" }: { seed: number; scale?: number; className?: string }) {
  const n = 3 + (seed % 3);
  return (
    <span className={`fire-field ${className}`} style={{ "--k": scale } as CSSProperties} aria-hidden="true">
      <svg className="fire-scorch" viewBox="0 0 60 12"><path d="M2 8C10 4 18 9 28 6C38 3 46 9 58 6L58 10C46 12 36 9 28 11C18 12 10 10 2 11Z" /></svg>
      {Array.from({ length: n }, (_, i) => (
        <Flame key={i} w={Math.round((9 + ((seed + i * 5) % 5)) * scale)} h={Math.round((15 + ((seed * 3 + i * 7) % 9)) * scale)} seed={seed * 13 + i} lean={0.15} />
      ))}
    </span>
  );
}

/** A factory: a brick chimney, hatched, with a steady flame at its top. It burns every night. */
export function FactoryFlame({ seed = 3, className = "" }: { seed?: number; className?: string }) {
  return (
    <span className={`fire-factory ${className}`} aria-hidden="true">
      <Flame w={10} h={16} seed={seed} className="is-steady" />
      <svg viewBox="0 0 30 60" data-theme="folio">
        <path className="chim-body" d="M10 4H20L23 58H7Z" />
        <path className="chim-hatch" d="M9 14H21M8.6 22H21.4M8.2 30H21.8M7.8 38H22.2M7.4 46H22.6M15 4V14M12 14V22M18 22V30M12 30V38M18 38V46M12 46V58" />
        <path className="chim-line" d="M10 4H20L23 58H7Z" />
        <path className="chim-line" d="M2 58H28" />
      </svg>
    </span>
  );
}

/** A ghost dot: too faint to be sure of. A small flame almost gone, in a dotted ring. */
export function GhostDot({ seed = 9, className = "" }: { seed?: number; className?: string }) {
  return (
    <span className={`fire-ghost ${className}`} aria-hidden="true">
      <Flame w={7} h={10} seed={seed} />
      <svg viewBox="0 0 30 30"><circle cx={15} cy={15} r={12} /></svg>
    </span>
  );
}
