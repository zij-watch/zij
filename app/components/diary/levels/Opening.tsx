"use client";

// The opening: Hudhud flies in over the Delta at night and lands by the palm. Two satellites glide in
// on their brass rings; each speaks when the player taps it. Then Begin.

import { useEffect, useState } from "react";
import { OrbitRing, Satellite } from "../art/Satellite";
import { useGame } from "../engine/context";
import { TapToSpeak } from "../engine/Parts";

export default function Opening() {
  const g = useGame();
  const [step, setStep] = useState(0);

  useEffect(() => {
    let live = true;
    g.pose({ fly: true });
    g.wait(900).then(() => {
      if (!live) return;
      g.pose({ fly: false });
      g.say(["open.hello", "open.straw"]);
      return g.wait(g.still ? 0 : 1600);
    }).then(() => { if (live) setStep(1); });
    return () => { live = false; };
    // the opening plays once, when the chapter starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="lv lv-opening">
      <div className={`lv-orbits${step >= 1 ? " is-in" : ""}`}>
        <div className="lv-orbit is-modis">
          <div className="lv-ring"><OrbitRing kind="modis" /></div>
          <TapToSpeak className="lv-glide is-slow" label={g.L["ui.modis"]} onTap={() => { if (step >= 1) { g.say("open.modis"); setStep((s) => Math.max(s, 2)); } }}>
            <Satellite kind="modis" name={g.L["ui.modis"]} />
          </TapToSpeak>
        </div>
        <div className="lv-orbit is-viirs">
          <div className="lv-ring"><OrbitRing kind="viirs" /></div>
          <TapToSpeak className="lv-glide is-quick" label={g.L["ui.viirs"]} onTap={() => { if (step >= 2) { g.say(["open.viirs", "open.ready"]); setStep(3); } }}>
            <Satellite kind="viirs" name={g.L["ui.viirs"]} />
          </TapToSpeak>
        </div>
      </div>
      {step >= 3 && <button type="button" className="stamp lv-begin" onClick={() => g.finish()}>{g.L["open.begin"]}</button>}
    </div>
  );
}
