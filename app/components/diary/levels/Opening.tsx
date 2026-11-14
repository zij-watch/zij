"use client";

// The opening: Roro flies in over the Delta at night and lands by the palm. Mona, at the edge of
// her village, asks the question the whole game answers. Two satellites glide in on their brass
// rings; each speaks when tapped. Then Begin.

import { useEffect, useState } from "react";
import { OrbitRing, Satellite } from "../art/Satellite";
import { PersonToken } from "../art/Things";
import { useGame } from "../engine/context";
import { Task, TapToSpeak } from "../engine/Parts";

export default function Opening() {
  const g = useGame();
  // 0 Roro arrives · 1 Mona waits · 2 the satellites · 3 VIIRS next · 4 Begin
  const [step, setStep] = useState(0);

  useEffect(() => {
    let live = true;
    g.pose({ fly: true });
    g.wait(900).then(() => {
      if (!live) return;
      g.pose({ fly: false });
      g.say(["open.hello", "open.straw"]);
      return g.wait(g.still ? 0 : 1800);
    }).then(() => { if (live) setStep(1); });
    return () => { live = false; };
    // the opening plays once, when the chapter starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="lv lv-opening">
      {step >= 1 && (
        <TapToSpeak className={`lv-mona${step === 1 ? " is-next" : ""}`} label={g.L["ui.mona"]} onTap={() => { if (step === 1) { g.say("open.mona"); setStep(2); } }}>
          <PersonToken who={5} label={g.L["ui.mona"]} />
        </TapToSpeak>
      )}
      {step === 1 && <Task id="open.task.mona" />}
      <div className={`lv-orbits${step >= 2 ? " is-in" : ""}`}>
        <div className="lv-orbit is-modis">
          <div className="lv-ring"><OrbitRing kind="modis" /></div>
          <TapToSpeak className={`lv-glide is-slow${step === 2 ? " is-next" : ""}`} label={g.L["ui.modis"]} onTap={() => { if (step === 2) { g.say("open.modis"); setStep(3); } }}>
            <Satellite kind="modis" name={g.L["ui.modis"]} />
          </TapToSpeak>
        </div>
        <div className="lv-orbit is-viirs">
          <div className="lv-ring"><OrbitRing kind="viirs" /></div>
          <TapToSpeak className={`lv-glide is-quick${step === 3 ? " is-next" : ""}`} label={g.L["ui.viirs"]} onTap={() => { if (step === 3) { g.say(["open.viirs", "open.ready"]); setStep(4); } }}>
            <Satellite kind="viirs" name={g.L["ui.viirs"]} />
          </TapToSpeak>
        </div>
      </div>
      {(step === 2 || step === 3) && <Task id="open.task" />}
      {step >= 4 && <button type="button" className="stamp lv-begin is-next" onClick={() => g.finish()}>{g.L["open.begin"]}</button>}
    </div>
  );
}
