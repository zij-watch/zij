"use client";

// Level 2 · Sort. Hot spots arrive one at a time; the player carries each into one of two wooden
// trays. A factory flame burns every night in one spot (seven nights are shown beside it); a ghost
// dot is too faint to be sure of. Both belong in "Not a field fire". An illustration.

import { useEffect, useRef, useState } from "react";
import { FactoryFlame, FieldFire, GhostDot } from "../art/Fire";
import { IllusTag, Tray } from "../art/Things";
import { useGame } from "../engine/context";
import { Draggable, DropZone } from "../engine/Drag";

type Kind = "field" | "factory" | "ghost";
const ARRIVALS: Kind[] = ["field", "field", "factory", "field", "ghost", "field", "field", "factory", "field", "ghost", "factory", "field"];

function Spot({ kind, seed }: { kind: Kind; seed: number }) {
  if (kind === "factory") return <FactoryFlame seed={seed} />;
  if (kind === "ghost") return <GhostDot seed={seed} />;
  return <FieldFire seed={seed} scale={1.2} />;
}

/** Seven nights over the same spot: the flame is there every night. */
function SevenNights() {
  return (
    <div className="lv-nights" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => <span key={i} className="lv-night"><i /></span>)}
    </div>
  );
}

export default function Sort() {
  const g = useGame();
  const [i, setI] = useState(0);
  const [inTray, setInTray] = useState<{ field: Kind[]; not: Kind[] }>({ field: [], not: [] });
  const seen = useRef({ factory: false, ghost: false, start: false });
  const kind = ARRIVALS[i];

  useEffect(() => {
    if (!seen.current.start) { seen.current.start = true; g.say("sort.start"); }
  }, [g]);

  function drop(zone: string) {
    if (zone !== "field" && zone !== "not") return;
    const right = (kind === "field") === (zone === "field");
    if (!right) { g.hint("sort.wrong"); return; }
    setInTray((t) => ({ ...t, [zone]: [...t[zone], kind] }));
    const n = i + 1;
    setI(n);
    if (n >= ARRIVALS.length) {
      g.say("sort.end");
      g.cheer();
      g.wait(1200).then(() => g.finish());
      return;
    }
    const next = ARRIVALS[n];
    if (next === "factory" && !seen.current.factory) { seen.current.factory = true; g.say("sort.factory"); }
    else if (next === "ghost" && !seen.current.ghost) { seen.current.ghost = true; g.say("sort.ghost"); }
  }

  return (
    <div className="lv lv-sort">
      <IllusTag text={g.L["ui.illus"]} />
      <div className="lv-arrive">
        {i < ARRIVALS.length && (
          <div className="lv-arrival" key={i}>
            <Draggable id={`spot-${i}`} label={g.L[`sort.is.${kind}`]} onDrop={drop}>
              <Spot kind={kind} seed={i * 5 + 2} />
            </Draggable>
            {kind === "factory" && <SevenNights />}
          </div>
        )}
        <p className="lv-keys">{g.L["ui.keys"]}</p>
      </div>
      <div className="lv-row lv-trays">
        <DropZone id="field" label={g.L["sort.tray.field"]}>
          <Tray label={g.L["sort.tray.field"]} lit={inTray.field.length > 0}>
            {inTray.field.map((k, j) => <span key={j} className="lv-held"><Spot kind={k} seed={j + 40} /></span>)}
          </Tray>
        </DropZone>
        <DropZone id="not" label={g.L["sort.tray.not"]}>
          <Tray label={g.L["sort.tray.not"]} lit={inTray.not.length > 0}>
            {inTray.not.map((k, j) => <span key={j} className="lv-held"><Spot kind={k} seed={j + 60} /></span>)}
          </Tray>
        </DropZone>
      </div>
    </div>
  );
}
