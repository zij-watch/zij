"use client";

// Level 3 · Count. A week of seven boxes; above each the satellite was looking or asleep. A night it
// looked and saw nothing is 0; a night it slept is ?, because nobody looked. Then a real week from
// the record: one VIIRS satellite switched off for a whole week while the other kept looking.

import { useEffect, useRef, useState } from "react";
import { IllusTag } from "../art/Things";
import { useGame } from "../engine/context";
import { Draggable, DropZone } from "../engine/Drag";

type Mark = "0" | "?";
const WEEK = [true, true, false, true, false, false, true]; // looking or asleep, an illustration

function Eye({ open }: { open: boolean }) {
  return (
    <svg className={`lv-eye${open ? " is-open" : ""}`} viewBox="0 0 40 24" aria-hidden="true">
      {open ? (
        <><path d="M3 12C10 3 30 3 37 12C30 21 10 21 3 12Z" /><circle cx={20} cy={12} r={5} /><circle className="lv-pupil" cx={20} cy={12} r={2.2} /></>
      ) : (
        <path d="M3 10C10 18 30 18 37 10M8 14L5 19M14 16L13 21M20 17V22M26 16L27 21M32 14L35 19" />
      )}
    </svg>
  );
}

function Week({ looking, marks, label }: { looking: boolean[]; marks: (Mark | null)[]; label: (day: number) => string }) {
  return (
    <ol className="lv-week">
      {looking.map((on, d) => (
        <li key={d} className="lv-day">
          <span className={`lv-above${on ? " is-on" : ""}`}><Eye open={on} /></span>
          <DropZone id={`day-${d}`} label={label(d)} className={`lv-box${marks[d] ? " is-full" : ""}`}>
            {marks[d] && <span className="lv-mark t-figure">{marks[d]}</span>}
          </DropZone>
        </li>
      ))}
    </ol>
  );
}

export default function Count() {
  const g = useGame();
  const [part, setPart] = useState<"week" | "real">("week");
  const [marks, setMarks] = useState<(Mark | null)[]>(() => WEEK.map(() => null));
  const [real, setReal] = useState<(Mark | null)[]>(() => WEEK.map(() => null));
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) { started.current = true; g.say("count.start"); }
  }, [g]);

  const dayLabel = (looking: boolean[]) => (d: number) => `${d + 1}: ${looking[d] ? g.L["count.day.looked"] : g.L["count.day.asleep"]}`;

  function place(m: Mark, zone: string) {
    const d = Number(zone.replace("day-", ""));
    if (Number.isNaN(d)) return;
    if (part === "week") {
      if (marks[d]) return;
      const right = WEEK[d] ? "0" : "?";
      if (m !== right) { g.hint(m === "0" ? "count.asleep" : "count.looked"); return; }
      const next = marks.map((x, i) => (i === d ? m : x));
      setMarks(next);
      if (next.every(Boolean)) { g.cheer(); g.quiet(); setPart("real"); }
    } else {
      if (m !== "?") { g.hint("count.asleep"); return; }
      // the first one is placed by hand; the rest are copied in after it, night by night
      setReal(WEEK.map(() => "?"));
      g.say("count.end");
      g.cheer();
      g.wait(1600).then(() => g.finish());
    }
  }

  const tokens = (
    <div className="lv-tokens">
      <Draggable id="tok-0" label={g.L["count.zero"]} onDrop={(z) => place("0", z)}><span className="lv-token t-figure">{g.L["count.zero"]}</span></Draggable>
      <Draggable id="tok-q" label={g.L["count.unknown"]} onDrop={(z) => place("?", z)}><span className="lv-token t-figure">{g.L["count.unknown"]}</span></Draggable>
      <p className="lv-keys">{g.L["ui.keys"]}</p>
    </div>
  );

  if (part === "week") {
    return (
      <div className="lv lv-count">
        <IllusTag text={g.L["ui.illus"]} />
        <Week looking={WEEK} marks={marks} label={dayLabel(WEEK)} />
        {tokens}
      </div>
    );
  }
  const off = WEEK.map(() => false), on = WEEK.map(() => true);
  return (
    <div className="lv lv-count">
      <p className="lv-caption t-eyebrow">{g.L["count.real"]}</p>
      <div className="lv-realrow">
        <p className="lv-who">{g.L["count.real.off"]}</p>
        <Week looking={off} marks={real.some(Boolean) ? real : off.map(() => null)} label={dayLabel(off)} />
      </div>
      <div className="lv-realrow is-other" aria-hidden="true">
        <p className="lv-who">{g.L["count.real.on"]}</p>
        <ol className="lv-week">{on.map((_, d) => <li key={d} className="lv-day"><span className="lv-above is-on"><Eye open /></span><span className="lv-box is-seen" /></li>)}</ol>
      </div>
      {!real.some(Boolean) && tokens}
    </div>
  );
}
