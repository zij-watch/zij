"use client";

// Level 4 · Translate, on the desk. Six parts, one after the other:
//   4.1 the fake jump: the record as it was joined jumps tenfold when VIIRS starts; why? False.
//   4.2 one grid: a square counts once a day, however many dots are in it (an illustration)
//   4.3 the magic number: one × dial, the needle on the how-close scale, from the data
//   4.4 four gears, each tried then seated; the needle takes the real error at each step
//   4.5 the fair exam: hide a year (the real errors of each year held out), then the sealed envelope
//   4.6 one diary: the crank translates the MODIS years with their doubt bands; the lever
// Every number shown comes from the data (GameData); only 4.2 and the in-between lines of 4.4 are
// drawings, and they say so.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { closeness, errAt, fmt } from "@/lib/diary/game";
import { Chart, HowClose } from "../art/Chart";
import DiaryBook, { type Bar } from "../art/DiaryBook";
import { Satellite } from "../art/Satellite";
import { Envelope, IllusTag, RumourSlip } from "../art/Things";
import Translator, { Balance, Gear, TwoFires, Volvelle, YearLever } from "../art/Translator";
import { useGame } from "../engine/context";
import { Draggable, DropZone } from "../engine/Drag";
import { Choice, SealPress, TapToSpeak } from "../engine/Parts";

type Part = "jump" | "grid" | "magic" | "gears" | "exam" | "one";

export default function Translate() {
  const g = useGame();
  const [part, setPart] = useState<Part>("jump");
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    g.say("t40.hard");
  }, [g]);
  return (
    <div className="lv lv-translate">
      {part === "jump" && <FakeJump onDone={() => setPart("grid")} />}
      {part === "grid" && <OneGrid onDone={() => setPart("magic")} />}
      {part === "magic" && <Magic onDone={() => setPart("gears")} />}
      {part === "gears" && <Gears onDone={() => setPart("exam")} />}
      {part === "exam" && <Exam onDone={() => setPart("one")} />}
      {part === "one" && <OneDiary />}
    </div>
  );
}

const scaleLabels = (L: Record<string, string>) => ({ far: L["t43.far"], close: L["t43.close"], spot: L["t43.spot"] });

/** The record as joined: MODIS's own counts, then VIIRS's. */
function rawBars(seasons: ReturnType<typeof useGame>["data"]["seasons"], upTo: number, show: { modis: boolean; viirs: boolean }): Bar[] {
  return seasons.filter((s) => s.year <= upTo).map((s) => s.source === "MODIS"
    ? { year: s.year, value: show.modis ? (s.modis ?? 0) : 0, kind: "modis" as const }
    : { year: s.year, value: show.viirs ? (s.viirs ?? s.value) : 0, kind: "viirs" as const });
}

// ================================================================ 4.1 the fake jump
function FakeJump({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const [inBook, setInBook] = useState({ modis: false, viirs: false });
  const [stage, setStage] = useState<"drag" | "why" | "rumour" | "struck">("drag");
  const last = data.test[1];
  const max = Math.max(...data.seasons.filter((s) => s.year <= last).map((s) => s.viirs ?? 0));

  function drop(which: "modis" | "viirs", zone: string) {
    if (zone !== "book") return;
    const next = { ...inBook, [which]: true };
    setInBook(next);
    if (next.modis && next.viirs) g.wait(900).then(() => setStage("why"));
  }

  return (
    <>
      <DropZone id="book" label={L["ui.diary"]} className="lv-bookzone">
        <DiaryBook title={L["ui.diary"]} bars={rawBars(data.seasons, last, inBook)} max={max} copying label={L["ui.diary"]} />
      </DropZone>
      {stage === "drag" && (
        <div className="lv-row">
          {!inBook.modis && <Draggable id="modis-years" label={L["t41.modis"]} onDrop={(z) => drop("modis", z)}><span className="lv-yeartoken is-modis">{L["t41.modis"]}</span></Draggable>}
          {!inBook.viirs && <Draggable id="viirs-years" label={L["t41.viirs"]} onDrop={(z) => drop("viirs", z)}><span className="lv-yeartoken is-viirs">{L["t41.viirs"]}</span></Draggable>}
          <p className="lv-keys">{L["ui.keys"]}</p>
        </div>
      )}
      {stage === "why" && (
        <Choice
          question={L["t41.why"]}
          options={[{ id: "t41.farmers", right: false }, { id: "t41.sharper", right: true }, { id: "t41.river", right: false }]}
          onPick={(o) => {
            if (o.id === "t41.farmers") g.hint("t41.if.farmers");
            else if (o.id === "t41.river") g.hint("t41.if.river");
            else { g.say("t41.if.sharper"); g.cheer(); g.wait(1200).then(() => setStage("rumour")); }
          }}
        />
      )}
      {(stage === "rumour" || stage === "struck") && (
        <div className="lv-row">
          <RumourSlip text={L["t41.rumour"]} struck={stage === "struck"} stamp={L["t41.false"]} />
          {stage === "rumour" && (
            <button type="button" className="stamp" onClick={() => {
              setStage("struck");
              g.wait(2400).then(() => { g.say("t41.language"); return g.wait(1400); }).then(onDone);
            }}>{L["t41.false"]}</button>
          )}
        </div>
      )}
    </>
  );
}

// ================================================================ 4.2 one grid (an illustration)
// Two days of a few fields. On the left MODIS's big squares, on the right VIIRS's dots. Laid over
// both, the grid lights each square with fire once, however many dots it holds.
const DAYS: { modis: number[]; viirs: number[][] }[] = [
  { modis: [1, 4, 6], viirs: [[1, 3], [4, 4], [6, 2], [9, 1]] },
  { modis: [2, 7], viirs: [[2, 5], [7, 1], [10, 3]] },
];
const CELLS = 12;

function OneGrid({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { L } = g;
  const [laid, setLaid] = useState(false);
  const [day, setDay] = useState(0);
  // Kept in a ref as well, so two quick taps never light from a stale copy.
  const litRef = useRef<{ modis: number[]; viirs: number[] }>({ modis: [], viirs: [] });
  const [lit, setLitState] = useState<{ modis: number[]; viirs: number[] }>({ modis: [], viirs: [] });
  const setLit = (v: { modis: number[]; viirs: number[] }) => { litRef.current = v; setLitState(v); };
  const today = DAYS[day];
  const fireCells = { modis: today.modis, viirs: today.viirs.map(([c]) => c) };
  const total = fireCells.modis.length + fireCells.viirs.length;
  const done = lit.modis.length + lit.viirs.length === total;

  function light(side: "modis" | "viirs", c: number) {
    if (!fireCells[side].includes(c)) return;
    const now = litRef.current;
    if (now[side].includes(c)) return;
    const next = { ...now, [side]: [...now[side], c] };
    setLit(next);
    if (next.modis.length + next.viirs.length === total) {
      g.cheer();
      if (day === 0) g.say("t42.once");
      else { g.say("t42.ruler"); g.wait(1800).then(onDone); }
    }
  }

  const half = (side: "modis" | "viirs") => (
    <div className={`lv-half is-${side}`}>
      <span className={`lv-halfname is-${side}`}>{L[`ui.${side}`]}</span>
      <div className="lv-cells">
        {Array.from({ length: CELLS }, (_, c) => {
          const dots = side === "viirs" ? today.viirs.find(([cc]) => cc === c)?.[1] ?? 0 : 0;
          const big = side === "modis" && today.modis.includes(c);
          return (
            <button key={c} type="button" className={`plain lv-cell${lit[side].includes(c) ? " is-lit" : ""}`} disabled={!laid} onClick={() => light(side, c)} aria-label={`${L[`ui.${side}`]} ${c + 1}`}>
              {big && <i className="lv-bigsq" aria-hidden="true" />}
              {Array.from({ length: dots }, (_, k) => <i key={k} className="lv-dot" style={{ "--k": k } as CSSProperties} aria-hidden="true" />)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div className={`lv-grid slip${laid ? " is-laid" : ""}`} data-theme="folio">
        <IllusTag text={L["ui.illus"]} />
        <div className="lv-halves">{half("modis")}{half("viirs")}</div>
        <span className="lv-days" aria-hidden="true">{"|".repeat(day + 1)}</span>
      </div>
      <div className="lv-row">
        {!laid && <button type="button" className="catchword" onClick={() => setLaid(true)}>{L["t42.lay"]}</button>}
        {laid && done && day === 0 && <button type="button" className="catchword" onClick={() => { setDay(1); setLit({ modis: [], viirs: [] }); g.quiet(); }}>{L["t42.nextday"]}</button>}
      </div>
    </>
  );
}

// ================================================================ 4.3 the magic number
function useTrainChart() {
  const { data } = useGame();
  return useMemo(() => {
    const train = data.seasons.filter((s) => s.year >= data.train[0] && s.year <= data.train[1]);
    const viirs = train.map((s) => s.viirs ?? 0), modis = train.map((s) => s.modis ?? 0);
    const m4 = data.hide.map((h) => h.guess);
    return { years: train.map((s) => s.year), viirs, modis, m4, max: Math.max(...viirs) * 1.15 };
  }, [data]);
}

/** The × dial as a slider: arrow keys turn it, a click on its left or right half turns it back or on. */
function dialProps(k: number, setK: (f: (v: number) => number) => void, label: string) {
  return {
    role: "slider", tabIndex: 0, "aria-label": label, "aria-valuemin": 1, "aria-valuemax": 20, "aria-valuenow": k, "aria-valuetext": `×${k}`,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { setK((v) => Math.min(20, v + 1)); e.preventDefault(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setK((v) => Math.max(1, v - 1)); e.preventDefault(); }
    },
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setK((v) => (e.clientX - r.left < r.width / 2 ? Math.max(1, v - 1) : Math.min(20, v + 1)));
    },
  } as const;
}

function Magic({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const c = useTrainChart();
  const [k, setKState] = useState(1);
  const [reached, setReached] = useState(false);
  const once = useRef(false);
  useEffect(() => { if (!once.current) { once.current = true; g.say("t43.learns"); } }, [g]);
  const setK = (f: (v: number) => number) => {
    const n = f(k);
    setKState(n);
    if (n === data.magic && !reached) {
      setReached(true);
      g.say("t43.closer");
      g.cheer();
      g.wait(2200).then(onDone);
    }
  };
  return (
    <>
      <Chart years={c.years} max={c.max} label={L["t43.learns"]} lines={[
        { kind: "viirs", label: L["ui.viirs"], values: c.viirs },
        { kind: "guess", label: L["t43.guess"], values: c.modis.map((m) => m * k) },
      ]} />
      <Translator closeness={closeness(errAt(data.kCurve, k))} labels={scaleLabels(L)} k={k} dialAngle={k * 18} dialProps={dialProps(k, setK, L["t43.dial"])} />
      <p className="lv-keys">{L["t43.dial"]}</p>
    </>
  );
}

// ================================================================ 4.4 four gears
const GEAR_LINES = ["t44.quiet", "t44.month", "t44.heat", "t44.busy"] as const;
const GEAR_NEEDLE = ["M1", "M2", "M3", "M4"] as const;

function Gears({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const c = useTrainChart();
  const [seated, setSeated] = useState(0); // gears in their seats
  const [tried, setTried] = useState(false);
  const [asked, setAsked] = useState(false);
  const err = seated === 0 ? data.needle.M0 : data.needle[GEAR_NEEDLE[seated - 1]];
  // How far the dashed line has come from one number (M0) to the real translator (M4), by its error.
  const t = Math.min(1, Math.max(0, (data.needle.M0 - err) / (data.needle.M0 - data.needle.M4)));
  const guess = c.modis.map((m, i) => m * data.magic * (1 - t) + c.m4[i] * t);
  const idea = (seated + 1) as 1 | 2 | 3 | 4;
  const months = Array.from({ length: 12 }, (_, i) => L[`ui.m${i + 1}`]);

  function seat(zone: string) {
    if (zone !== `seat-${seated}`) { g.slip(); return; }
    const n = seated + 1;
    setSeated(n);
    setTried(false);
    g.cheer();
    if (n === 4) { g.say(["t44.m4", "t44.fair"]); setAsked(true); }
    else g.quiet();
  }

  return (
    <>
      <Chart years={c.years} max={c.max} label={L["t43.learns"]} lines={[
        { kind: "viirs", label: L["ui.viirs"], values: c.viirs },
        { kind: "guess", label: L["t43.guess"], values: guess },
      ]} />
      {seated > 0 && seated < 4 && <IllusTag text={L["ui.illus"]} />}
      <Translator
        closeness={closeness(err)}
        labels={scaleLabels(L)}
        k={data.magic}
        dialAngle={data.magic * 18}
        seats={[0, 1, 2, 3].map((i) => (i < seated ? ((i + 1) as 1 | 2 | 3 | 4) : null))}
        seatSlot={(i) => <DropZone id={`seat-${i}`} label={L[`t44.g${i + 1}`]} className="lv-seat" />}
      />
      {seated < 4 && (
        <div className="lv-trial slip" data-theme="folio">
          <p className="t-eyebrow">{L[`t44.g${idea}`]}</p>
          <div className="lv-trialart">
            {idea === 1 && <Balance tip={tried ? -9 : 0} />}
            {idea === 2 && <Volvelle months={months} turn={tried ? 9 : 0} />}
            {idea === 3 && <TwoFires />}
            {idea === 4 && <YearLever at={tried ? 1 : 0} />}
          </div>
          {!tried ? (
            <button type="button" className="catchword" onClick={() => { setTried(true); g.say(GEAR_LINES[seated]); }}>{L["t44.try"]}</button>
          ) : (
            <Draggable id={`gear-${idea}`} label={L[`t44.g${idea}`]} onDrop={seat}><Gear idea={idea} size={56} /></Draggable>
          )}
        </div>
      )}
      {asked && (
        <Choice options={[{ id: "t45.fair" }, { id: "t45.notfair" }]} onPick={() => onDone()} />
      )}
    </>
  );
}

// ================================================================ 4.5 the fair exam
function Exam({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const [turned, setTurned] = useState<number[]>([]); // years turned back with their guess
  const [hidden, setHidden] = useState<number | null>(null);
  const [env, setEnv] = useState<"none" | "sealed" | "open">("none");
  const [sealed, setSealed] = useState(false);
  const once = useRef(false);
  useEffect(() => { if (!once.current) { once.current = true; g.say("t45.hide"); } }, [g]);
  const labels = { far: L["t43.far"], spot: L["t43.spot"] };

  function hide(year: number) {
    if (hidden != null || turned.includes(year)) return;
    setHidden(year);
    g.wait(1100).then(() => {
      setHidden(null);
      const next = [...turned, year];
      setTurned(next);
      const lines: string[] = [];
      if (year === data.worstYear) lines.push("t45.worst");
      if (next.length === 3) { lines.push("t45.never"); setEnv("sealed"); }
      if (lines.length) g.say(lines);
    });
  }

  return (
    <>
      <ol className="lv-cards">
        {data.hide.map((h) => {
          const up = turned.includes(h.year), down = hidden === h.year;
          return (
            <li key={h.year}>
              <button type="button" className={`plain lv-card${down ? " is-down" : ""}${up ? " is-up" : ""}`} onClick={() => hide(h.year)} disabled={up || hidden != null} aria-label={`${h.year}`}>
                <span className="lv-card-face slip" data-theme="folio">
                  <b className="t-figure">{h.year}</b>
                  {up && (
                    <>
                      <span className="lv-card-row"><span>{L["t45.guess"]}</span><span className="t-figure">{fmt(h.guess)}</span></span>
                      <span className="lv-card-row"><span>{L["t45.real"]}</span><span className="t-figure">{fmt(h.viirs)}</span></span>
                      <HowClose closeness={closeness(h.errPct)} labels={labels} small />
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {env !== "none" && (
        <div className="lv-row lv-envelope">
          <button type="button" className="plain" onClick={() => { if (env === "sealed") { setEnv("open"); g.say("t45.close"); g.cheer(); } }} disabled={env === "open"} aria-label={L["t45.envelope"]}>
            <Envelope label={L["t45.envelope"]} open={env === "open"} />
          </button>
          {env === "open" && (
            <div className="lv-counts slip" data-theme="folio">
              <p className="t-eyebrow">{L["t45.real"]}</p>
              <ol>{data.testCounts.map((t) => <li key={t.year}><span className="t-figure">{t.year}</span><span className="t-figure">{fmt(t.viirs)}</span></li>)}</ol>
              <HowClose closeness={closeness(data.needle.outOfTime)} labels={labels} />
            </div>
          )}
        </div>
      )}
      {env === "open" && !sealed && (
        <SealPress kind="honest" label={L["t45.seal"]} onPressed={() => { setSealed(true); g.seal("honest"); onDone(); }} />
      )}
    </>
  );
}

// ================================================================ 4.6 one diary
function OneDiary() {
  const g = useGame();
  const { data, L } = g;
  const [cranked, setCranked] = useState(false);
  const [band, setBand] = useState(false);
  const [one, setOne] = useState(true);
  const [flips, setFlips] = useState(0);
  const [spoke, setSpoke] = useState({ modis: false, viirs: false });
  const [unfolded, setUnfolded] = useState(0);
  const last = data.test[1];
  const max = Math.max(...data.seasons.filter((s) => s.year <= last).map((s) => s.hi));
  const translated = cranked && one;
  const bars: Bar[] = data.seasons.filter((s) => s.year <= last).map((s) => s.source === "MODIS"
    ? (translated ? { year: s.year, value: s.value, lo: s.lo, hi: s.hi, kind: "ink" as const } : { year: s.year, value: s.modis ?? 0, kind: "modis" as const })
    : { year: s.year, value: s.viirs ?? s.value, kind: "viirs" as const });
  const lineIds = ["t46.b1", "t46.b2", "t46.b3", "t46.b4"];

  return (
    <>
      <div className="lv-onebook">
        <DiaryBook title={L["ui.diary"]} bars={bars} max={max} bands label={L["ui.diary"]} onPick={translated && !band ? () => { setBand(true); g.say("t46.band"); } : undefined} />
      </div>
      {!cranked && (
        <div className="lv-row">
          <Translator closeness={closeness(data.needle.M4)} labels={scaleLabels(L)} k={data.magic} dialAngle={data.magic * 18} seats={[1, 2, 3, 4]} crankAngle={0} className="is-small" />
          <button type="button" className="catchword" onClick={() => { setCranked(true); g.cheer(); }}>{L["t46.crank"]}</button>
        </div>
      )}
      {band && (
        <label className="lever lv-lever">
          <input type="checkbox" role="switch" checked={one} aria-label={`${L["t46.two"]} / ${L["t46.one"]}`} onChange={(e) => {
            const v = e.target.checked;
            setOne(v);
            const n = flips + 1;
            setFlips(n);
            if (v && n >= 2 && !spoke.modis) g.say("t46.gone");
          }} />
          <span className="track" aria-hidden="true"><span className="knob" /></span>
          <span className="off" aria-hidden="true">{L["t46.two"]}</span>
          <span className="on" aria-hidden="true">{L["t46.one"]}</span>
        </label>
      )}
      {band && flips >= 2 && one && (
        <div className="lv-row">
          <TapToSpeak label={L["ui.modis"]} onTap={() => { g.say("t46.modis"); setSpoke((s) => ({ ...s, modis: true })); }}><Satellite kind="modis" name={L["ui.modis"]} /></TapToSpeak>
          {spoke.modis && <TapToSpeak label={L["ui.viirs"]} onTap={() => { g.say("t46.viirs"); setSpoke((s) => ({ ...s, viirs: true })); }}><Satellite kind="viirs" name={L["ui.viirs"]} /></TapToSpeak>}
        </div>
      )}
      {spoke.viirs && (
        <div className="lv-built slip" data-theme="folio">
          <p className="t-eyebrow">{L["t46.built"]}</p>
          <ul>{lineIds.slice(0, unfolded).map((id) => <li key={id}>{L[id]}</li>)}</ul>
          {unfolded < 4 ? (
            <button type="button" className="catchword" onClick={() => { const n = unfolded + 1; setUnfolded(n); if (n === 4) g.wait(1600).then(() => g.finish()); }}>{L["ui.next"]}</button>
          ) : null}
        </div>
      )}
    </>
  );
}
