"use client";

// The ending: under the sky again, Mona gets her answer, written from the real diary. The stars the
// player kept are joined into the hoopoe constellation; MODIS and VIIRS say goodbye; the last seal
// opens the Keeper's page: what each chapter taught, the seals and the stars. It can be saved as an image.

import { useEffect, useRef, useState } from "react";
import { saveBlob } from "@/lib/capture";
import { paintPaper } from "@/lib/paper";
import { COLOURS, FONT_DISPLAY, FONT_TEXT } from "@/lib/tokens";
import { Satellite } from "../art/Satellite";
import { Constellation, constellationPath, PersonToken, SEAL, STARS, WaxSeal, type SealKind } from "../art/Things";
import { useGame } from "../engine/context";
import { SealPress, TapToSpeak, Task } from "../engine/Parts";

type Lit = "on" | "dim" | "off";
const litFrom = (stars: number[]): Lit[] => stars.flatMap((s) => [0, 1, 2].map((k): Lit => (k < s ? "on" : s > 0 ? "dim" : "off")));

/** The Keeper's page, drawn once into a canvas: paper, title, seals, constellation, chapters. */
async function drawKeeper(o: { title: string; chapters: string[]; lit: Lit[]; seals: SealKind[]; credit: string }): Promise<Blob | null> {
  const W = 1200, H = 900;
  const cv = document.createElement("canvas");
  paintPaper(cv, W, H, { kind: "sheet", seed: "keeper" });
  const g = cv.getContext("2d");
  if (!g) return null;
  try { await document.fonts.ready; } catch { /* fonts may not be ready: the fallbacks still draw */ }
  const dpr = cv.width / W;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = COLOURS;
  // a jadwal: brass outside, rule inside
  g.strokeStyle = C.brass; g.lineWidth = 1.5; g.strokeRect(48, 48, W - 96, H - 96);
  g.strokeStyle = C.rule; g.lineWidth = 1; g.strokeRect(56, 56, W - 112, H - 112);
  g.fillStyle = C.ink; g.textAlign = "center";
  g.font = `600 64px ${FONT_DISPLAY}`; g.fillText(o.title, W / 2, 150);
  // the constellation
  g.save(); g.translate(W / 2 - 231, 200); g.scale(3, 3);
  g.strokeStyle = C.brass; g.lineWidth = 0.6; g.stroke(new Path2D(constellationPath));
  STARS.forEach(([x, y], i) => { g.fillStyle = o.lit[i] === "on" ? C.ink : C["ink-muted"]; g.beginPath(); g.arc(x, y, o.lit[i] === "on" ? 2.4 : 1.3, 0, Math.PI * 2); g.fill(); });
  g.restore();
  // the seals
  o.seals.forEach((kind, i) => {
    g.save(); g.translate(W / 2 - 230 + i * 180, 560); g.scale(1.2, 1.2);
    g.fillStyle = C.brass; g.globalAlpha = 0.9; g.fill(new Path2D(SEAL.wax)); g.globalAlpha = 1;
    g.strokeStyle = C.shadow; g.lineWidth = 2.6; g.lineCap = "round"; g.stroke(new Path2D(SEAL[kind]));
    g.beginPath(); g.arc(50, 50, 33, 0, Math.PI * 2); g.lineWidth = 1.6; g.stroke();
    g.restore();
  });
  // the five chapters, as a running head
  g.font = `600 30px ${FONT_DISPLAY}`; g.fillStyle = C.ink;
  g.fillText(o.chapters.join("  ·  ").toLowerCase(), W / 2, 760);
  g.font = `italic 400 22px ${FONT_TEXT}`; g.fillStyle = C["ink-muted"];
  g.fillText(o.credit, W / 2, 810);
  return new Promise((res) => cv.toBlob((b) => res(b), "image/png"));
}

export default function Ending() {
  const g = useGame();
  const { L, data, progress } = g;
  // 0 Mona waits · 1 her answer · 2 MODIS next · 3 VIIRS spoke · 4 the Keeper's page
  const [step, setStep] = useState(0);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    g.pose({ stone: false, crest: true });
    g.say("end.every");
  }, [g]);
  const lit = litFrom(progress.stars);
  const kept = progress.stars.reduce((a, b) => a + b, 0);
  const seals: SealKind[] = (["honest", "detective", "keeper"] as const).filter((s) => s === "keeper" || progress.seals.includes(s));

  return (
    <div className="lv lv-ending">
      <Constellation lit={lit} threaded label={L["ui.stars"]} />
      {step === 0 && <Task id="end.task" />}
      {step < 4 && (
        <TapToSpeak className={`lv-mona${step === 0 ? " is-next" : ""}`} label={L["ui.mona"]} onTap={() => { if (step === 0) { setStep(1); g.quiet(); g.wait(2600).then(() => { g.say("end.mona"); setStep(2); }); } }}>
          <PersonToken who={5} label={L["ui.mona"]} />
        </TapToSpeak>
      )}
      {step >= 1 && step < 4 && (
        <div className="lv-letter slip" data-theme="folio">
          <span className="jadwal" aria-hidden="true" />
          <p className="t-eyebrow">{L["ui.mona"]}</p>
          <p className="lv-letter-q">{L["open.mona"]}</p>
          <ul>{["end.a1", "end.a2", "end.a3"].map((id, i) => <li key={id} style={{ animationDelay: `${300 + i * 700}ms` }}>{L[id]}</li>)}</ul>
        </div>
      )}
      {(step === 2 || step === 3) && <Task id="end.task2" />}
      {(step === 2 || step === 3) && (
        <div className="lv-row">
          <TapToSpeak className={step === 2 ? "is-next" : ""} label={L["ui.modis"]} onTap={() => { if (step === 2) { g.say("end.modis"); setStep(3); } }}><Satellite kind="modis" name={L["ui.modis"]} /></TapToSpeak>
          <TapToSpeak className={step === 3 ? "is-next" : ""} label={L["ui.viirs"]} onTap={() => { if (step === 3) { g.say(["end.viirs", "end.credit"]); setStep(35); } }}><Satellite kind="viirs" name={L["ui.viirs"]} /></TapToSpeak>
        </div>
      )}
      {step === 35 && (
        <>
          <Task id="end.task.seal" />
          <SealPress kind="keeper" label={L["end.seal"]} onPressed={() => { g.seal("keeper"); g.cheer(); g.pose({ fly: true }); setStep(4); }} />
        </>
      )}
      {step === 4 && (
        <div className="keeper slip" data-theme="folio">
          <span className="jadwal" aria-hidden="true" />
          <h2 className="keeper-title">{L["end.page"]}</h2>
          <div className="keeper-sky" data-theme="night"><Constellation lit={lit} /></div>
          <p className="keeper-kept"><span>{L["ui.kept"]}</span> <b className="t-figure">{kept}</b></p>
          <ol className="keeper-learned">{["end.r1", "end.r2", "end.r3", "end.r4", "end.r5"].map((id, i) => <li key={id} style={{ animationDelay: `${i * 250}ms` }}>{L[id]}</li>)}</ol>
          <div className="keeper-seals">
            {seals.map((s) => (
              <figure key={s} className="keeper-seal"><WaxSeal kind={s} size={84} /><figcaption>{L[s === "honest" ? "t45.seal" : s === "detective" ? "c56.seal" : "end.seal"]}</figcaption></figure>
            ))}
          </div>
          <div className="keeper-acts">
            <a className="stamp" href="/explore?area=nile-delta">{L["end.map"]}</a>
            <button type="button" className="catchword" onClick={async () => {
              const blob = await drawKeeper({ title: L["end.page"], chapters: data.runningHead, lit, seals, credit: L["end.credit"] });
              if (blob) saveBlob(blob, "roro-keepers-page.png");
            }}>{L["end.save"]}</button>
            <button type="button" className="catchword" onClick={() => g.playAgain()}>{L["end.again"]}</button>
            <a className="catchword" href="/">{L["end.night"]}</a>
          </div>
        </div>
      )}
    </div>
  );
}
