"use client";

// Level 4 · Translate, on the desk. Mona's question needs the old years, and they are MODIS's: the
// old camera's counts must be turned into the new camera's, the way an old price is turned into
// today's money.
//   4.1 the fake jump: joined as they were, the records jump tenfold where VIIRS begins. Why? The
//       camera changed, not the fields; the headline is stamped False.
//   4.3 the exchange rate: one × dial, the needle on the how-close scale, from the data
//   4.4 the fine print: four gears, each tapped to fit; the needle takes the real error at each step
//   4.5 the fair exam: each year hidden in turn (the real errors), then the sealed envelope
//   4.6 one diary: the crank translates the old years with their doubt bands; the lever compares
// Every figure is from the record (GameData); the in-between lines of 4.4 are drawings and say so.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { closeness, errAt, fmt } from "@/lib/diary/game";
import { Chart, HowClose } from "../art/Chart";
import DiaryBook, { type Bar } from "../art/DiaryBook";
import { Envelope, IllusTag, RumourSlip } from "../art/Things";
import Translator, { Balance, Gear, TwoFires, Volvelle, YearLever } from "../art/Translator";
import { useGame } from "../engine/context";
import { Choice, SealPress, Task } from "../engine/Parts";

type Part = "jump" | "magic" | "gears" | "exam" | "one";

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
      {part === "jump" && <FakeJump onDone={() => setPart("magic")} />}
      {part === "magic" && <Magic onDone={() => setPart("gears")} />}
      {part === "gears" && <Gears onDone={() => setPart("exam")} />}
      {part === "exam" && <Exam onDone={() => setPart("one")} />}
      {part === "one" && <OneDiary />}
    </div>
  );
}

const scaleLabels = (L: Record<string, string>) => ({ far: L["t43.far"], close: L["t43.close"], spot: L["t43.spot"] });

// ================================================================ 4.1 the fake jump
function FakeJump({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const [joined, setJoined] = useState(false);
  const [stage, setStage] = useState<"join" | "why" | "rumour" | "struck">("join");
  const last = data.test[1];
  const max = Math.max(...data.seasons.filter((s) => s.year <= last).map((s) => s.viirs ?? 0));
  const bars: Bar[] = data.seasons.filter((s) => s.year <= last).map((s) => s.source === "MODIS"
    ? { year: s.year, value: joined ? (s.modis ?? 0) : 0, kind: "modis" as const }
    : { year: s.year, value: joined ? (s.viirs ?? s.value) : 0, kind: "viirs" as const });

  return (
    <>
      {stage === "join" && <Task id="t41.task" />}
      <div className="lv-bookzone">
        <DiaryBook title={L["ui.diary"]} bars={bars} max={max} copying={joined} label={L["ui.diary"]} />
      </div>
      {stage === "join" && (
        <button type="button" className="stamp is-next" disabled={joined} onClick={() => { setJoined(true); g.wait(2200).then(() => setStage("why")); }}>{L["t41.join"]}</button>
      )}
      {stage === "why" && (
        <Choice
          question={L["t41.why"]}
          options={[{ id: "t41.farmers", right: false }, { id: "t41.sharper", right: true }, { id: "t41.river", right: false }]}
          onPick={(o) => {
            if (o.id === "t41.farmers") g.hint("t41.if.farmers");
            else if (o.id === "t41.river") g.hint("t41.if.river");
            else { g.say("t41.if.sharper"); g.cheer(); g.wait(1400).then(() => setStage("rumour")); }
          }}
        />
      )}
      {(stage === "rumour" || stage === "struck") && (
        <>
          {stage === "rumour" && <Task id="t41.task.false" />}
          <div className="lv-row">
            <RumourSlip text={L["t41.rumour"]} struck={stage === "struck"} stamp={L["t41.false"]} />
            {stage === "rumour" && (
              <button type="button" className="stamp is-next" onClick={() => {
                setStage("struck");
                g.wait(2400).then(() => { g.say("t41.language"); return g.wait(1800); }).then(onDone);
              }}>{L["t41.false"]}</button>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ================================================================ 4.3 the exchange rate
function useTrainChart() {
  const { data } = useGame();
  return useMemo(() => {
    const train = data.seasons.filter((s) => s.year >= data.train[0] && s.year <= data.train[1]);
    const viirs = train.map((s) => s.viirs ?? 0), modis = train.map((s) => s.modis ?? 0);
    const m4 = data.hide.map((h) => h.guess);
    return { years: train.map((s) => s.year), viirs, modis, m4, max: Math.max(...viirs) * 1.15 };
  }, [data]);
}

/** The × dial as a slider: arrow keys turn it, a click on its left or right half turns it down or up. */
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
      g.wait(2600).then(onDone);
    }
  };
  return (
    <>
      {!reached && <Task id="t43.task" />}
      <div className="lv-row lv-bench">
        <div className={reached ? "" : "is-next"}>
          <Translator closeness={closeness(errAt(data.kCurve, k))} labels={scaleLabels(L)} k={k} dialAngle={k * 18} dialProps={dialProps(k, setK, L["t43.dial"])} />
        </div>
        <Chart years={c.years} max={c.max} label={L["t43.learns"]} lines={[
          { kind: "viirs", label: L["ui.viirs"], values: c.viirs },
          { kind: "guess", label: L["t43.guess"], values: c.modis.map((m) => m * k) },
        ]} />
      </div>
    </>
  );
}

// ================================================================ 4.4 the fine print: four gears
const GEAR_LINES = ["t44.quiet", "t44.month", "t44.heat", "t44.busy"] as const;
const GEAR_NEEDLE = ["M1", "M2", "M3", "M4"] as const;

function Gears({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const c = useTrainChart();
  const [seated, setSeated] = useState(0);
  const err = seated === 0 ? data.needle.M0 : data.needle[GEAR_NEEDLE[seated - 1]];
  // How far the dashed line has come from one rate (M0) to the real translator (M4), by its error.
  const t = Math.min(1, Math.max(0, (data.needle.M0 - err) / (data.needle.M0 - data.needle.M4)));
  const guess = c.modis.map((m, i) => m * data.magic * (1 - t) + c.m4[i] * t);
  const months = Array.from({ length: 12 }, (_, i) => L[`ui.m${i + 1}`]);

  function fit() {
    if (seated >= 4) return;
    const n = seated + 1;
    setSeated(n);
    g.cheer();
    if (n < 4) g.say(GEAR_LINES[n - 1]);
    else g.say([GEAR_LINES[3], "t44.m4"]);
  }

  return (
    <>
      {seated < 4 && <Task id="t44.task" />}
      <div className="lv-row lv-bench">
        <Translator
          closeness={closeness(err)}
          labels={scaleLabels(L)}
          k={data.magic}
          dialAngle={data.magic * 18}
          seats={[0, 1, 2, 3].map((i) => (i < seated ? ((i + 1) as 1 | 2 | 3 | 4) : null))}
        />
        <div className="lv-gears">
          {([1, 2, 3, 4] as const).map((i) => (
            <button key={i} type="button" className={`plain lv-gear${i <= seated ? " is-fitted" : ""}${i === seated + 1 ? " is-next" : ""}`} disabled={i !== seated + 1} onClick={fit}>
              <Gear idea={i} size={56} />
              <span>{L[`t44.g${i}`]}</span>
            </button>
          ))}
        </div>
      </div>
      {seated > 0 && (
        <div className="lv-trial slip" data-theme="folio" key={seated}>
          <p className="t-eyebrow">{L[`t44.g${seated}`]}</p>
          <div className="lv-trialart">
            {seated === 1 && <Balance tip={-9} />}
            {seated === 2 && <Volvelle months={months} turn={9} />}
            {seated === 3 && <TwoFires />}
            {seated === 4 && <YearLever at={1} />}
          </div>
        </div>
      )}
      <Chart years={c.years} max={c.max} label={L["t43.learns"]} lines={[
        { kind: "viirs", label: L["ui.viirs"], values: c.viirs },
        { kind: "guess", label: L["t43.guess"], values: guess },
      ]} />
      {seated > 0 && seated < 4 && <IllusTag text={L["ui.illus"]} />}
      {seated === 4 && <Choice question={L["t44.fair"]} options={[{ id: "t45.fair" }, { id: "t45.notfair" }]} onPick={() => onDone()} />}
    </>
  );
}

// ================================================================ 4.5 the fair exam
function Exam({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const [turned, setTurned] = useState<number[]>([]);
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
      {env === "none" && <Task id="t45.task" />}
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
      {env === "sealed" && <Task id="t45.task.env" />}
      {env !== "none" && (
        <div className="lv-row lv-envelope">
          <button type="button" className={`plain${env === "sealed" ? " is-next" : ""}`} onClick={() => { if (env === "sealed") { setEnv("open"); g.say("t45.close"); g.cheer(); } }} disabled={env === "open"} aria-label={L["t45.envelope"]}>
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
        <>
          <Task id="t45.task.seal" />
          <SealPress kind="honest" label={L["t45.seal"]} onPressed={() => { setSealed(true); g.seal("honest"); onDone(); }} />
        </>
      )}
    </>
  );
}

// ================================================================ 4.6 one diary
function OneDiary() {
  const g = useGame();
  const { data, L } = g;
  const [cranked, setCranked] = useState(false);
  const [one, setOne] = useState(true);
  const [flips, setFlips] = useState(0);
  const [done, setDone] = useState(false);
  const last = data.test[1];
  const max = Math.max(...data.seasons.filter((s) => s.year <= last).map((s) => s.hi));
  const translated = cranked && one;
  const bars: Bar[] = data.seasons.filter((s) => s.year <= last).map((s) => s.source === "MODIS"
    ? (translated ? { year: s.year, value: s.value, lo: s.lo, hi: s.hi, kind: "ink" as const } : { year: s.year, value: s.modis ?? 0, kind: "modis" as const })
    : { year: s.year, value: s.viirs ?? s.value, kind: "viirs" as const });

  return (
    <>
      {!cranked && <Task id="t46.task.crank" />}
      {cranked && !done && <Task id="t46.task.lever" />}
      <div className="lv-onebook">
        <DiaryBook title={L["ui.diary"]} bars={bars} max={max} bands label={L["ui.diary"]} />
      </div>
      {!cranked && (
        <button type="button" className="catchword is-next" onClick={() => { setCranked(true); g.cheer(); g.say("t46.band"); }}>{L["t46.crank"]}</button>
      )}
      {cranked && (
        <label className={`lever lv-lever${!done ? " is-next" : ""}`}>
          <input type="checkbox" role="switch" checked={one} aria-label={`${L["t46.two"]} / ${L["t46.one"]}`} onChange={(e) => {
            const v = e.target.checked;
            setOne(v);
            const n = flips + 1;
            setFlips(n);
            if (v && n >= 2 && !done) { setDone(true); g.say(["t46.gone", "t46.modis"]); g.cheer(); }
          }} />
          <span className="track" aria-hidden="true"><span className="knob" /></span>
          <span className="off" aria-hidden="true">{L["t46.two"]}</span>
          <span className="on" aria-hidden="true">{L["t46.one"]}</span>
        </label>
      )}
      {done && (
        <div className="lv-built slip" data-theme="folio">
          <p className="t-eyebrow">{L["t46.built"]}</p>
          <ul>{["t46.b1", "t46.b2", "t46.b3", "t46.b4"].map((id, i) => <li key={id} style={{ animationDelay: `${i * 300}ms` }}>{L[id]}</li>)}</ul>
          <button type="button" className="catchword is-next" onClick={() => g.finish()}>{L["ui.next"]}</button>
        </div>
      )}
    </>
  );
}
