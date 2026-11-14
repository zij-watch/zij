"use client";

// Level 1 · Spot. The fields pass below; MODIS and VIIRS cross in turn, each casting a beam. Tap a
// fire while a satellite looks to log it. MODIS logs a field as one big square; VIIRS as several
// small squares, and she catches tiny fires MODIS misses. An illustration, not the record.
// The beam moves in steps and rests over each part of the fields, so a fire can be reached from the
// keyboard; Next moves it on at once, and with reduced motion only Next moves it.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FieldFire } from "../art/Fire";
import { Satellite, type Sat } from "../art/Satellite";
import { IllusTag } from "../art/Things";
import { useGame } from "../engine/context";

const STEPS = [0.1, 0.3, 0.5, 0.7, 0.9];
const REACH = 0.11;
const GOAL = 10;
// The fields' fires, by their place on the land (x and y from 0 to 1) and how big they are.
const FIRES = [
  { x: 0.24, y: 0.3, k: 1.2 }, { x: 0.36, y: 0.72, k: 1 }, { x: 0.46, y: 0.22, k: 1.3 }, { x: 0.55, y: 0.58, k: 1.1 },
  { x: 0.64, y: 0.28, k: 0.9 }, { x: 0.72, y: 0.76, k: 1.2 }, { x: 0.8, y: 0.42, k: 1 }, { x: 0.9, y: 0.66, k: 1.1 }, { x: 0.44, y: 0.9, k: 0.9 },
];

type Mark = { modis: boolean; viirs: boolean };

export default function Spot() {
  const g = useGame();
  const [sat, setSat] = useState<Sat>("modis");
  const [step, setStep] = useState(0);
  // The marks are kept in a ref as well, so two quick taps never count from a stale copy.
  const marksRef = useRef<Mark[]>(FIRES.map(() => ({ modis: false, viirs: false })));
  const [marks, setMarks] = useState<Mark[]>(() => FIRES.map(() => ({ modis: false, viirs: false })));
  const [over, setOver] = useState(false);
  const started = useRef(false);
  const squares = { modis: marks.filter((m) => m.modis).length, viirs: marks.filter((m) => m.viirs).length * 4 };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    g.say("spot.start");
  }, [g]);

  // The satellite rests over each part of the fields in turn; MODIS slowly, VIIRS quicker.
  useEffect(() => {
    if (g.still || over) return;
    const t = window.setTimeout(() => advance(), sat === "modis" ? 2600 : 2000);
    return () => window.clearTimeout(t);
  });

  function advance() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else { setStep(0); setSat(sat === "modis" ? "viirs" : "modis"); }
  }

  const beam = STEPS[step];
  const inBeam = (x: number) => Math.abs(x - beam) <= REACH;

  function tap(i: number) {
    if (over) return;
    const f = FIRES[i];
    if (!inBeam(f.x)) { g.hint("spot.miss"); return; }
    const before = marksRef.current;
    if (before[i][sat]) return;
    const first = !before.some((m) => m[sat]);
    const next = before.map((m, j) => (j === i ? { ...m, [sat]: true } : m));
    marksRef.current = next;
    setMarks(next);
    const n = next.reduce((c, m) => c + (m.modis ? 1 : 0) + (m.viirs ? 1 : 0), 0);
    if (first) {
      g.say(sat === "modis" ? "spot.modis" : "spot.viirs");
      g.cheer();
    }
    // Ten logs, and each satellite has to have logged at least three: the two counts must be seen.
    const each = (k: Sat) => next.filter((m) => m[k]).length;
    if (n >= GOAL && each("modis") >= 3 && each("viirs") >= 3) {
      setOver(true);
      g.say("spot.end");
      g.wait(1400).then(() => g.finish());
    }
  }

  const tiny = useMemo(() => FIRES.map((f, i) => ({ x: f.x + (i % 2 ? 0.035 : -0.035), y: f.y + 0.09 })), []);

  return (
    <div className="lv-full lv-spot" style={{ "--beam": beam } as CSSProperties}>
      <div className="lv-tallies" aria-live="polite">
        <span className="lv-tally is-modis">{g.L["spot.tally.modis"]} <b className="t-figure">{squares.modis}</b></span>
        <span className="lv-tally is-viirs">{g.L["spot.tally.viirs"]} <b className="t-figure">{squares.viirs}</b></span>
        <IllusTag text={g.L["ui.illus"]} />
      </div>
      <div className="lv-track">
        <div className={`lv-beam is-${sat}`}>
          <Satellite kind={sat} name={g.L[`ui.${sat}`]} beam />
        </div>
      </div>
      <div className="lv-land">
        {FIRES.map((f, i) => (
          <div key={i} className="lv-fire" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}>
            {marks[i].modis && <i className="lv-square is-modis" aria-hidden="true" />}
            {marks[i].viirs && <span className="lv-smalls" aria-hidden="true"><i /><i /><i /><i /></span>}
            <button type="button" className="plain lv-firebtn" onClick={() => tap(i)} aria-label={`${g.L["sort.tray.field"]} ${i + 1}`}>
              <FieldFire seed={i * 7 + 3} scale={f.k} />
            </button>
          </div>
        ))}
        {tiny.map((t, i) => marks[i].viirs && (
          <span key={`t${i}`} className="lv-tiny" style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }} aria-hidden="true">
            <i className="lv-small" /><FieldFire seed={i * 11 + 1} scale={0.5} />
          </span>
        ))}
      </div>
      {!over && <button type="button" className="catchword lv-next" onClick={advance}>{g.L["ui.next"]}</button>}
    </div>
  );
}
