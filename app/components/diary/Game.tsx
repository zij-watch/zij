"use client";

// Hudhud's Fire Diary: the game. It holds where the player is (chapter, stars, seals), gives each
// level what it needs (useGame: words, data, Hudhud's note and poses, hints, the end), and moves
// between chapters: the lamp goes out and lights up within a scene, the camera tilts between the
// sky and the desk. Progress is kept in the browser (lib/diary/progress.ts) so a visitor can carry on.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import type { GameData } from "@/lib/diary/game";
import { useRemembered } from "@/lib/remember";
import { clearProgress, fresh, loadProgress, saveProgress, starsFor, type Progress, type SealId } from "@/lib/diary/progress";
import Hudhud from "./art/Hudhud";
import { GameContext, type GameApi, type Pose, type Who } from "./engine/context";
import { DragProvider } from "./engine/Drag";
import { LevelEnd, Note } from "./engine/Parts";
import { RunningHead, Stage, type Scene } from "./engine/Stage";

export type ChapterDef = {
  /** 0 the opening, 1 to 5 the levels, 6 the ending: which word of the running head is current */
  level: number;
  scene: Scene;
  /** the chapter's id in the script, for its note for grown-ups */
  id: string;
  Level: ComponentType;
};

// Reduced motion, from the system or from ?still in the address: everything already in place.
const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia(motionQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const noop = () => () => {};
const readStill = () => window.matchMedia(motionQuery).matches || /[?&]still\b/.test(window.location.search);

export default function Game({ data, chapters, keep = true, startAt = 0 }: { data: GameData; chapters: ChapterDef[]; keep?: boolean; startAt?: number }) {
  const L = data.lines;
  const still = useSyncExternalStore(subscribeMotion, readStill, () => false);
  const savedRaw = useRemembered("zij.diary.v1");
  // Nothing plays until the browser has read what it kept: a level must not start and be replaced.
  const client = useSyncExternalStore(noop, () => true, () => false);
  const saved = useMemo(() => (savedRaw ? loadProgress() : null), [savedRaw]);

  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState<Progress>(fresh);
  const [chapter, setChapter] = useState(startAt);
  const [phase, setPhase] = useState<"play" | "end">("play");
  const [mistakes, setMistakes] = useState(0);
  const [note, setNote] = useState<{ id: string; who: Who; text: string }[]>([]);
  const [pose, setPose] = useState<Pose>({ crest: false, tilt: false, fly: false, stone: false });
  const [stepKey, setStepKey] = useState(0);
  const [dark, setDark] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);

  const def = chapters[Math.min(chapter, chapters.length - 1)];
  const resume = keep && !started && saved != null && saved.chapter > 0 && saved.chapter < chapters.length;

  const store = useCallback((p: Progress) => { setProgress(p); if (keep) saveProgress(p); }, [keep]);

  const goTo = useCallback((next: number, p: Progress) => {
    const from = chapters[chapter], to = chapters[next];
    // Once the player has moved on, the progress being saved is this visit's, not one to resume.
    setStarted(true);
    const swap = () => {
      setChapter(next);
      setPhase("play");
      setMistakes(0);
      setNote([]);
      setPose({ crest: false, tilt: false, fly: false, stone: false });
      store({ ...p, chapter: next });
    };
    // Between scenes the camera tilts; within one, the lamp goes out and lights up again.
    if (still || !from || !to || from.scene !== to.scene) { swap(); return; }
    setDark(true);
    later(() => { swap(); setDark(false); }, 1200);
  }, [chapter, chapters, still, store, later]);

  const api: GameApi = useMemo(() => ({
    data,
    L,
    still,
    say: (ids) => {
      const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => L[id]);
      setNote(list.map((id) => ({ id, who: data.speakers[id] ?? "hudhud", text: L[id] })));
    },
    quiet: () => setNote([]),
    hint: (id) => {
      setMistakes((m) => m + 1);
      setPose((p) => ({ ...p, tilt: true, crest: false }));
      setNote([{ id, who: "hudhud", text: L[id] }]);
      later(() => setPose((p) => ({ ...p, tilt: false })), 1800);
    },
    slip: () => {
      setMistakes((m) => m + 1);
      setPose((p) => ({ ...p, tilt: true }));
      later(() => setPose((p) => ({ ...p, tilt: false })), 1400);
    },
    cheer: () => {
      setPose((p) => ({ ...p, crest: true, tilt: false }));
      setStepKey((k) => k + 1);
      later(() => setPose((p) => ({ ...p, crest: false })), 1600);
    },
    pose: (p) => setPose((q) => ({ ...q, ...p })),
    finish: () => {
      if (def.level >= 1 && def.level <= 5) setPhase("end");
      else if (chapter < chapters.length - 1) goTo(chapter + 1, progress);
    },
    seal: (id: SealId) => store({ ...progress, seals: progress.seals.includes(id) ? progress.seals : [...progress.seals, id] }),
    wait: (ms) => new Promise<void>((res) => { if (still) res(); else later(res, ms); }),
  }), [data, L, still, later, def, chapter, chapters.length, goTo, progress, store]);

  const Level = def.Level;
  const level = def.level;

  return (
    <GameContext.Provider value={api}>
      <DragProvider hint={L["ui.keys"]}>
        <div className={`dd${still ? " is-still" : ""}`} data-theme="night">
          <RunningHead words={data.runningHead} current={level} sealAlt="Zij" />
          <Stage scene={def.scene} still={still} dark={dark}>
            {resume && saved ? (
              <div className="dd-resume slip" data-theme="folio">
                <button type="button" className="stamp" onClick={() => { setStarted(true); setProgress(saved); setChapter(saved.chapter); }}>{L["ui.carry"]}</button>
                <button type="button" className="catchword" onClick={() => { setStarted(true); clearProgress(); setProgress(fresh()); setChapter(0); }}>{L["ui.again"]}</button>
              </div>
            ) : (
              <>
                <div className="dd-level" key={chapter}>
                  {client && <Level />}
                </div>
                {phase === "end" && (
                  <LevelEnd
                    level={level}
                    stars={starsFor(mistakes)}
                    allStars={progress.stars}
                    note={data.notes[def.id] ?? ""}
                    word={data.runningHead[level - 1]}
                    onGoOn={() => {
                      const stars = [...progress.stars];
                      stars[level - 1] = starsFor(mistakes);
                      goTo(chapter + 1, { ...progress, stars });
                    }}
                  />
                )}
              </>
            )}
            <div className="dd-guide">
              <Hudhud key={stepKey} className={stepKey ? "is-step" : ""} crest={pose.crest} tilt={pose.tilt} fly={pose.fly} stone={pose.stone} label={L["ui.hudhud"]} />
              <Note lines={note} still={still} names={{ modis: L["ui.modis"], viirs: L["ui.viirs"] }} />
            </div>
          </Stage>
        </div>
      </DragProvider>
    </GameContext.Provider>
  );
}

/** Start the game over from the opening: used by the ending's Play again. */
export function usePlayAgain(): () => void {
  return () => {
    clearProgress();
    window.location.reload();
  };
}
