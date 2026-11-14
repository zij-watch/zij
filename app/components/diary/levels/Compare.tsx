"use client";

// Level 5 · Compare, on the desk, with Roro holding the reading stone: now Mona's question is answered,
// one step at a time, saying only what the diary shows.
//   5.1 is this autumn unusual? It stands at the end of the row, marked; the player answers
//   5.2 when Mona was little, and now: the two averages draw themselves; the year that bounced back
//   5.3 did the 2004 law work? Before and after; the diary can't tell
//   5.4 (bonus) the missing fires: a fire moved round a clock of passes (an illustration)
//   5.5 (bonus) around the world: three pins on the globe, then Mona's district's own diary
//   5.6 who else needs the diary: five people, Mona among them, tied to their questions
// Every figure is from the record (GameData); the clock is a drawing and says so.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { fmt, type GameData } from "@/lib/diary/game";
import DiaryBook, { type Bar } from "../art/DiaryBook";
import { Globe, IllusTag, PassClock, PersonToken, threadPath } from "../art/Things";
import { useGame } from "../engine/context";
import { Draggable, DropZone } from "../engine/Drag";
import { Choice, SealPress, Task } from "../engine/Parts";

type Part = "this" | "quiet" | "ban" | "missing" | "world" | "who";

/** One diary: translated MODIS years in ink with their doubt bands, VIIRS years in rubric. */
function oneDiary(data: GameData, from: number, to: number, mark?: number): Bar[] {
  return data.seasons.filter((s) => s.year >= from && s.year <= to).map((s) => ({
    year: s.year, value: s.value, lo: s.lo, hi: s.hi, kind: s.source === "MODIS" ? ("ink" as const) : ("viirs" as const), mark: s.year === mark,
  }));
}
const span = (bars: Bar[], y0: number, y1: number) => {
  const i0 = bars.findIndex((b) => b.year >= y0), i1 = bars.findLastIndex((b) => b.year <= y1);
  return { left: `${(i0 / bars.length) * 100}%`, width: `${((i1 - i0 + 1) / bars.length) * 100}%` };
};

export default function Compare() {
  const g = useGame();
  const [part, setPart] = useState<Part>("this");
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    g.pose({ stone: true });
    g.say("c50.rule");
  }, [g]);
  const skip = (next: Part) => <button type="button" className="catchword lv-skip" onClick={() => { g.quiet(); setPart(next); }}>{g.L["ui.skip"]}</button>;
  return (
    <div className="lv lv-compare">
      {part === "this" && <ThisYear onDone={() => setPart("quiet")} />}
      {part === "quiet" && <Quiet onDone={() => setPart("ban")} />}
      {part === "ban" && <Ban onDone={() => setPart("missing")} />}
      {part === "missing" && <><Missing onDone={() => setPart("world")} />{skip("world")}</>}
      {part === "world" && <><World onDone={() => setPart("who")} />{skip("who")}</>}
      {part === "who" && <Who />}
    </div>
  );
}

// ================================================================ 5.1 is this autumn unusual?
function ThisYear({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const year = data.thisYear.year;
  const bars = oneDiary(data, data.seasons[0].year, year, year);
  const max = Math.max(...data.seasons.map((s) => s.hi));
  const right = { lower: "c51.lower", usual: "c51.usual", higher: "c51.higher" }[data.thisYear.verdict];
  return (
    <>
      <div className="lv-bookzone">
        <DiaryBook title={L["ui.diary"]} bars={bars} max={max} bands label={L["ui.diary"]} />
      </div>
      <Choice
        question={L["c51.ask"]}
        options={[{ id: "c51.higher", right: right === "c51.higher" }, { id: "c51.usual", right: right === "c51.usual" }, { id: "c51.lower", right: right === "c51.lower" }]}
        onPick={(o) => {
          if (!o.right) { g.hint("c51.wrong"); return; }
          g.say(["c51.right", "c51.fresh"]);
          g.cheer();
          g.wait(3400).then(onDone);
        }}
      />
    </>
  );
}

// ================================================================ 5.2 when Mona was little, and now
function Quiet({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const { since } = data;
  const [answered, setAnswered] = useState(false);
  const bars = oneDiary(data, data.seasons[0].year, data.thisYear.year);
  const max = Math.max(...data.seasons.map((s) => s.hi));
  const answer = { same: "c52.same", half: "c52.half", double: "c52.double" }[since.answer];

  // The two brackets lay themselves over the diary, each with its water line at its average.
  const bracket = (years: [number, number], mean: number, caption: string, i: number) => (
    <div className="lv-bracket is-laid" style={{ ...span(bars, years[0], years[1]), "--m": Math.min(1, mean / max), "--i": i } as CSSProperties}>
      <div className="lv-bracket-zone">
        <i className="lv-water" aria-hidden="true" />
        <span className="lv-bracket-cap">{caption}</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="lv-bookzone">
        <DiaryBook title={L["ui.diary"]} bars={bars} max={max} bands label={L["ui.diary"]}
          canPick={(b) => answered && b.year >= since.recent[0]}
          onPick={answered ? (y) => { if (y === since.bounceYear) { g.cheer(); g.quiet(); g.wait(900).then(onDone); } else g.slip(); } : undefined}>
          {bracket(since.reference, since.referenceMean, L["c52.before"], 0)}
          {bracket(since.recent, since.recentMean, L["c52.after"], 1)}
        </DiaryBook>
      </div>
      {!answered ? (
        <Choice
          question={L["c52.ask"]}
          options={(["c52.same", "c52.half", "c52.double"] as const).map((id) => ({ id, right: id === answer }))}
          onPick={(o) => {
            if (!o.right) { g.hint("c52.wrong"); return; }
            g.say(["c52.right", "c52.bounce"]);
            g.cheer();
            setAnswered(true);
          }}
        />
      ) : (
        <Task id="c52.task.pick" />
      )}
    </>
  );
}

// ================================================================ 5.3 did the 2004 law work?
function Ban({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const { ban } = data;
  const [read, setRead] = useState({ before: false, after: false });
  const [asked, setAsked] = useState(false);
  const [turned, setTurned] = useState(false);
  const bars = oneDiary(data, data.seasons[0].year, ban.after[1]);
  const max = Math.max(...bars.map((b) => b.hi ?? b.value));
  const flagAt = span(bars, ban.year, ban.year);

  function look(which: "before" | "after") {
    const next = { ...read, [which]: true };
    setRead(next);
    if (next.before && next.after && !asked) { g.say("c53.up"); setAsked(true); }
  }
  const lens = (which: "before" | "after", years: [number, number], mean: number) => (
    <div className={`lv-bracket is-lens${read[which] ? " is-laid" : ""}`} style={span(bars, years[0], years[1])}>
      <div className="lv-bracket-zone">{read[which] && <span className="lv-mean t-figure">{fmt(mean)}</span>}</div>
    </div>
  );

  return (
    <>
      {!asked && <Task id="c53.task" />}
      <div className="lv-bookzone">
        <DiaryBook title={L["ui.diary"]} bars={bars} max={max} bands label={L["ui.diary"]}>
          <span className="lv-flag" style={{ left: flagAt.left, width: flagAt.width }}><span className="lv-flag-cloth">{L["c53.flag"]}</span></span>
          {lens("before", ban.before, ban.beforeMean)}
          {lens("after", ban.after, ban.afterMean)}
        </DiaryBook>
      </div>
      {!asked && (
        <div className="lv-row">
          <button type="button" className={`catchword${!read.before ? " is-next" : ""}`} onClick={() => look("before")}>{L["c53.before"]}</button>
          <button type="button" className={`catchword${read.before && !read.after ? " is-next" : ""}`} onClick={() => look("after")}>{L["c53.after"]}</button>
        </div>
      )}
      {asked && !turned && (
        <Choice question={L["c53.fail"]} options={[{ id: "c53.yes" }, { id: "c53.no" }, { id: "c53.cant" }]} onPick={() => {
          setTurned(true);
          g.wait(1400).then(() => { g.say("c53.detective"); g.cheer(); return g.wait(2600); }).then(onDone);
        }} />
      )}
      {turned && (
        <ol className="lv-why">
          {["c53.k1", "c53.k2", "c53.k3"].map((id, i) => <li key={id} className="slip" data-theme="folio" style={{ "--i": i } as CSSProperties}>{L[id]}</li>)}
        </ol>
      )}
    </>
  );
}

// ================================================================ 5.4 the missing fires (bonus, an illustration)
// The satellites' usual passes over the Delta, by the hour: an illustration with no figures shown.
const PASSES = [1.5, 10.5, 13.5, 22.5];
const LASTS = 2.5;
const caughtAt = (h: number) => PASSES.some((p) => [p, p + 24].some((q) => q + 0.6 >= h && q - 0.6 <= h + LASTS));

function Missing({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { L } = g;
  const [h, setH] = useState(15);
  const [seen, setSeen] = useState({ caught: false, missed: false });
  const caught = caughtAt(h);
  const done = seen.caught && seen.missed;
  return (
    <>
      {!done && <Task id="c54.task" />}
      <IllusTag text={L["ui.illus"]} />
      <PassClock passes={PASSES} fire={{ from: h, to: h + LASTS, caught }} labels={{ day: L["c54.day"], night: L["c54.night"] }} />
      <label className={`ruled lv-alidade${!done ? " is-next" : ""}`}>
        <span>{L["c54.move"]}</span>
        <input className="alidade" type="range" min={0} max={23} step={0.5} value={h} onChange={(e) => {
          const v = Number(e.target.value);
          setH(v);
          const c = caughtAt(v);
          const next = { caught: seen.caught || c, missed: seen.missed || !c };
          setSeen(next);
          if (next.caught && next.missed && !done) g.say("c54.hours");
        }} />
      </label>
      <p className={`lv-verdict${caught ? " is-caught" : ""}`} aria-live="polite">{L["c54.fire"]}: {caught ? L["c54.caught"] : L["c54.missed"]}</p>
      {done && <button type="button" className="catchword is-next" onClick={onDone}>{L["ui.next"]}</button>}
    </>
  );
}

// ================================================================ 5.5 around the world (bonus)
function World({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const { data, L } = g;
  const { globe } = data;
  const [open, setOpen] = useState<string[]>([]);
  const all = open.length === 3;
  return (
    <>
      {!all && <Task id="c55.task" />}
      <div className="lv-world">
        <Globe size={globe.size} land={globe.land} graticule={globe.graticule}>
          {globe.pins.map((p) => (
            <button key={p.id} type="button" className={`plain lv-pin${open.includes(p.id) ? " is-open" : " is-next"}`} style={{ left: `${(p.x / globe.size) * 100}%`, top: `${(p.y / globe.size) * 100}%` }}
              onClick={() => { if (!open.includes(p.id)) setOpen((o) => [...o, p.id]); }} aria-label={L[`c55.${p.id}`]}>
              <i className="token-disc" aria-hidden="true" />
              <span className="lv-pin-word">{L[`c55.${p.id}`]}</span>
            </button>
          ))}
        </Globe>
        <ul className="lv-pinlines">
          {globe.pins.filter((p) => open.includes(p.id)).map((p) => (
            <li key={p.id} className="slip" data-theme="folio"><b>{L[`c55.${p.id}`]}</b> {L[`c55.${p.id}.line`]}</li>
          ))}
        </ul>
      </div>
      {all && (
        <div className="lv-tiny-book">
          <DiaryBook title={L["c55.kafr"]} max={Math.max(...data.kafr.map((s) => s.value))}
            bars={data.kafr.map((s) => ({ year: s.year, value: s.value, kind: s.source === "MODIS" ? "ink" : "viirs" }))} label={L["c55.kafr"]} copying />
          <button type="button" className="catchword is-next" onClick={onDone}>{L["ui.next"]}</button>
        </div>
      )}
    </>
  );
}

// ================================================================ 5.6 who else needs the diary
const PEOPLE = [1, 2, 3, 4, 5] as const;

function Who() {
  const g = useGame();
  const { L } = g;
  const [tied, setTied] = useState<number[]>([]);
  const [threads, setThreads] = useState<string[]>([]);
  const [sealed, setSealed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const all = tied.length === PEOPLE.length;

  // Thread from each person to their question, measured when a pair is tied and on resize only.
  useLayoutEffect(() => {
    const measure = () => {
      const root = box.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      setThreads(tied.map((i) => {
        const a = root.querySelector(`[data-person="${i}"]`)?.getBoundingClientRect();
        const b = root.querySelector(`[data-zone="q${i}"]`)?.getBoundingClientRect();
        if (!a || !b) return "";
        return threadPath([a.right - r.left - 8, a.top + a.height / 2 - r.top], [b.left - r.left + 6, b.top + b.height / 2 - r.top], 14);
      }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tied]);

  function tie(i: number, zone: string) {
    if (zone !== `q${i}`) { g.slip(); return; }
    const next = [...tied, i];
    setTied(next);
    if (next.length === PEOPLE.length) { g.say("c56.truth"); g.cheer(); }
  }

  return (
    <>
      <Task id={all ? "c56.task.seal" : "c56.task"} />
      <div className="lv-match" ref={box}>
        <svg className="lv-threads" aria-hidden="true">{threads.map((d, k) => d && <path key={k} className="lv-thread" d={d} />)}</svg>
        <ul className="lv-people">
          {PEOPLE.map((i) => (
            <li key={i} data-person={i}>
              {tied.includes(i) ? <PersonToken who={i} label={L[`c56.p${i}`]} /> : (
                <Draggable id={`p${i}`} label={L[`c56.p${i}`]} onDrop={(z) => tie(i, z)}><PersonToken who={i} label={L[`c56.p${i}`]} /></Draggable>
              )}
            </li>
          ))}
        </ul>
        <ul className="lv-questions">
          {[3, 1, 5, 2, 4].map((i) => (
            <li key={i}><DropZone id={`q${i}`} label={L[`c56.q${i}`]} className={`lv-question slip${tied.includes(i) ? " is-tied" : ""}`}><span>{L[`c56.q${i}`]}</span></DropZone></li>
          ))}
        </ul>
      </div>
      {!all && <p className="lv-keys">{L["ui.keys"]}</p>}
      {all && !sealed && <SealPress kind="detective" label={L["c56.seal"]} onPressed={() => { setSealed(true); g.seal("detective"); g.finish(); }} />}
    </>
  );
}
