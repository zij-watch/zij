"use client";

// Level 1 · Spot: two cameras. The same village fields, the same night, photographed by an old
// camera (MODIS: big squares) and a new one (VIIRS: small squares, sharp enough for tiny fires).
// The player taps each fire in each photo and the camera records it: one big square, or several small
// ones. Same fires, very different counts: the reason a joined record jumps (level 4). An illustration.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FieldFire } from "../art/Fire";
import { IllusTag } from "../art/Things";
import { useGame } from "../engine/context";
import { Task } from "../engine/Parts";
import { FieldsCanvas } from "../Textures";

type Cam = "modis" | "viirs";
// The fires, where they are in the photo (x, y in %), and how big: tiny ones only the new camera sees.
const FIRES = [
  { x: 22, y: 34, k: 1.3, tiny: false, foot: 4 },
  { x: 58, y: 26, k: 1.1, tiny: false, foot: 3 },
  { x: 40, y: 66, k: 1.2, tiny: false, foot: 4 },
  { x: 77, y: 64, k: 1, tiny: false, foot: 3 },
  { x: 16, y: 78, k: 0.45, tiny: true, foot: 1 },
  { x: 86, y: 32, k: 0.45, tiny: true, foot: 1 },
];
// MODIS's photo is ruled in 4 by 3 big squares, VIIRS's in 12 by 9 small ones.
const GRID = { modis: [4, 3], viirs: [12, 9] } as const;

/** The squares a camera lights for one fire: one big square, or a small patch round it. */
function squares(cam: Cam, f: (typeof FIRES)[number]) {
  const [cols, rows] = GRID[cam];
  const c = Math.floor((f.x / 100) * cols), r = Math.floor((f.y / 100) * rows);
  if (cam === "modis") return [{ c, r }];
  const patch = [{ c, r }, { c, r: r - 1 }, { c: c - 1, r }, { c: c + 1, r }];
  return patch.slice(0, f.foot);
}

function Photo({ cam, active, seen, onFire, caption, tally }: { cam: Cam; active: boolean; seen: boolean[]; onFire: (i: number) => void; caption: string; tally: number }) {
  const { L } = useGame();
  const [cols, rows] = GRID[cam];
  return (
    <figure className={`lv-photo is-${cam}${active ? " is-active" : ""}`}>
      <div className="lv-photo-pic">
        <FieldsCanvas className="lv-photo-fields" />
        {FIRES.map((f, i) => (
          <button key={i} type="button" className={`plain lv-photo-fire${f.tiny ? " is-tiny" : ""}${active && !seen[i] ? " is-next" : ""}`}
            style={{ left: `${f.x}%`, top: `${f.y}%` }} disabled={!active || seen[i]} onClick={() => onFire(i)} aria-label={`${caption}: ${i + 1}`}>
            <FieldFire seed={i * 9 + 4} scale={f.k} />
          </button>
        ))}
        <div className="lv-photo-grid" style={{ "--cols": cols, "--rows": rows } as CSSProperties} aria-hidden="true">
          {FIRES.flatMap((f, i) => (seen[i] && !(cam === "modis" && f.tiny) ? squares(cam, f) : []).map((s, k) => (
            <i key={`${i}-${k}`} className="lv-photo-sq" style={{ gridColumn: s.c + 1, gridRow: s.r + 1 }} />
          )))}
        </div>
      </div>
      <figcaption className="lv-photo-cap">
        <span className={`lv-tally is-${cam}`}>{caption}</span>
        <span className="lv-photo-count"><span>{L[`spot.tally.${cam}`]}</span> <b className="t-figure">{tally}</b></span>
      </figcaption>
    </figure>
  );
}

export default function Spot() {
  const g = useGame();
  const [cam, setCam] = useState<Cam>("modis");
  const [seen, setSeen] = useState({ modis: FIRES.map(() => false), viirs: FIRES.map(() => false) });
  const seenRef = useRef(seen);
  const once = useRef({ start: false, modis: false, viirs: false, tiny: false, done: false });
  useEffect(() => {
    if (once.current.start) return;
    once.current.start = true;
    g.say("spot.start");
  }, [g]);

  const tally = (c: Cam) => FIRES.reduce((n, f, i) => n + (seen[c][i] && !(c === "modis" && f.tiny) ? squares(c, f).length : 0), 0);
  // In MODIS's photo the tiny fires can be tapped, but it records nothing there: the point of the level.
  const needed = (c: Cam) => FIRES.map((f) => !(c === "modis" && f.tiny));

  function tap(c: Cam, i: number) {
    const now = seenRef.current;
    if (now[c][i]) return;
    const next = { ...now, [c]: now[c].map((v, j) => v || j === i) };
    seenRef.current = next;
    setSeen(next);
    const f = FIRES[i];
    if (c === "modis" && f.tiny) {
      if (!once.current.tiny) { once.current.tiny = true; g.say("spot.tiny"); }
    } else if (!once.current[c]) {
      once.current[c] = true;
      g.say(c === "modis" ? "spot.modis" : "spot.viirs");
      g.cheer();
    }
    const done = needed(c).every((need, j) => !need || next[c][j]);
    if (done && c === "modis") g.wait(900).then(() => setCam("viirs"));
    if (done && c === "viirs" && !once.current.done) {
      once.current.done = true;
      g.say("spot.end");
      g.wait(2200).then(() => g.finish());
    }
  }

  return (
    <div className="lv lv-spot2">
      <Task id={cam === "modis" ? "spot.task.modis" : "spot.task.viirs"} />
      <div className="lv-photos">
        <Photo cam="modis" active={cam === "modis"} seen={seen.modis} onFire={(i) => tap("modis", i)} caption={g.L["spot.photo.modis"]} tally={tally("modis")} />
        <Photo cam="viirs" active={cam === "viirs"} seen={seen.viirs} onFire={(i) => tap("viirs", i)} caption={g.L["spot.photo.viirs"]} tally={tally("viirs")} />
      </div>
      <IllusTag text={g.L["ui.illus"]} />
    </div>
  );
}
