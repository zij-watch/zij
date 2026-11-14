"use client";

// The engine's test: two short chapters that use each piece of it once, for /studio/diary?engine.
// Not part of the game.

import { useState } from "react";
import { closeness, errAt } from "@/lib/diary/game";
import { FieldFire } from "../art/Fire";
import { Tray } from "../art/Things";
import Translator from "../art/Translator";
import { useGame } from "../engine/context";
import { Draggable, DropZone } from "../engine/Drag";
import { Choice, SealPress } from "../engine/Parts";

export function TestSky() {
  const g = useGame();
  const [step, setStep] = useState(0);
  const [placed, setPlaced] = useState<string | null>(null);
  return (
    <div className="lv lv-test">
      {step === 0 && (
        <button type="button" className="catchword" onClick={() => { g.say(["spot.start", "spot.modis"]); setStep(1); }}>{g.L["ui.next"]}</button>
      )}
      {step === 1 && (
        <div className="lv-row">
          {!placed && (
            <Draggable id="fire" label={g.L["sort.tray.field"]} onDrop={(z) => { if (z === "not") g.hint("sort.wrong"); else { setPlaced(z); g.cheer(); setStep(2); } }}>
              <FieldFire seed={5} scale={1.4} />
            </Draggable>
          )}
          <DropZone id="field" label={g.L["sort.tray.field"]}><Tray label={g.L["sort.tray.field"]} lit={placed === "field"} /></DropZone>
          <DropZone id="not" label={g.L["sort.tray.not"]}><Tray label={g.L["sort.tray.not"]} /></DropZone>
        </div>
      )}
      {step === 2 && (
        <Choice
          question={g.L["t41.why"]}
          options={[{ id: "t41.farmers", right: false }, { id: "t41.sharper", right: true }, { id: "t41.river", right: false }]}
          onPick={(o) => { if (o.right) { g.say("t41.if.sharper"); g.cheer(); g.finish(); } else g.hint(o.id === "t41.river" ? "t41.if.river" : "t41.if.farmers"); }}
        />
      )}
    </div>
  );
}

export function TestDesk() {
  const g = useGame();
  const [k, setK] = useState(1);
  const err = errAt(g.data.kCurve, k);
  const near = Math.abs(k - g.data.magic) < 0.5;
  return (
    <div className="lv lv-test">
      <Translator
        closeness={closeness(err)}
        labels={{ far: g.L["t43.far"], close: g.L["t43.close"], spot: g.L["t43.spot"] }}
        k={k}
        dialAngle={k * 18}
        dialProps={{
          role: "slider", tabIndex: 0, "aria-label": g.L["t43.dial"], "aria-valuemin": 1, "aria-valuemax": 20, "aria-valuenow": k,
          onKeyDown: (e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") { setK((v) => Math.min(20, v + 1)); e.preventDefault(); }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setK((v) => Math.max(1, v - 1)); e.preventDefault(); }
          },
          onClick: () => setK((v) => (v >= 20 ? 1 : v + 1)),
        }}
      />
      {near && <SealPress kind="honest" label={g.L["t45.seal"]} onPressed={() => { g.seal("honest"); g.finish(); }} />}
    </div>
  );
}
