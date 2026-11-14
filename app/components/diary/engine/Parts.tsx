"use client";

// The game's own instruments: the marginal note Hudhud speaks in, answers on a slip (a wrong one is
// an erratum, struck through in ink, never red), the folded note for grown-ups, a wax seal to press,
// and the end of a level, its stars rising into the sky.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { WaxSeal, Constellation, type SealKind } from "../art/Things";
import { useGame, type Who } from "./context";

/** Bring a newly shown step into view inside the play area, without jumping the page. */
export function useIntoView<T extends HTMLElement>(again?: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [again]);
  return ref;
}

/**
 * Your turn: what to do now, in a few words, on a slip with a brass rule. It writes itself in and
 * brings itself into view, so the next step is never off screen or left to guess.
 */
export function Task({ id }: { id: string }) {
  const { L } = useGame();
  const ref = useIntoView<HTMLDivElement>(id);
  return (
    <div ref={ref} key={id} className="task slip" data-theme="folio" role="status">
      <span className="task-turn">{L["ui.turn"]}</span>
      <span className="task-text">{L[id]}</span>
    </div>
  );
}

/** The marginal note: a paper slip in italic, joined to its speaker by a hairline. Lines are written in. */
export function Note({ lines, still, names }: { lines: { id: string; who: Who; text: string }[]; still: boolean; names: { modis: string; viirs: string; mona: string } }) {
  return (
    <div className={`note-slip slip${lines.length ? " is-open" : ""}`} data-theme="folio" aria-live="polite" role="status">
      {lines.map((l, i) => (
        <p key={`${l.id}-${i}`} className={`note-line is-${l.who}`} style={{ animationDelay: still ? "0ms" : `${i * 360}ms` }}>
          {l.who !== "hudhud" && <span className="note-who">{names[l.who]}</span>}
          {l.text}
        </p>
      ))}
    </div>
  );
}

export type Option = { id: string; right?: boolean };

/**
 * Answers on a paper slip, each a catchword. A wrong answer is struck through and stays struck;
 * `onPick` says which was pressed.
 */
export function Choice({ question, options, onPick, done = false }: { question?: string; options: Option[]; onPick: (o: Option) => void; done?: boolean }) {
  const { L } = useGame();
  const [struck, setStruck] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const ref = useIntoView<HTMLDivElement>();
  return (
    <div ref={ref} className="choice slip" data-theme="folio">
      {question && <p className="choice-q">{question}</p>}
      <div className="choice-list" role="group" aria-label={question}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`catchword choice-a${struck.includes(o.id) ? " is-struck" : ""}${chosen === o.id ? " is-chosen" : ""}`}
            disabled={done || struck.includes(o.id) || chosen != null}
            onClick={() => {
              if (o.right === false) setStruck((s) => [...s, o.id]);
              else setChosen(o.id);
              onPick(o);
            }}
          >
            {L[o.id]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The folded slip in the margin, marked For grown-ups, opened by a tap. Shut by default. */
export function Folded({ text }: { text: string }) {
  const { L } = useGame();
  return (
    <details className="folded slip" data-theme="folio">
      <summary className="catchword">{L["ui.grownups"]}</summary>
      <p className="folded-text">{text}</p>
    </details>
  );
}

/** A wax seal waiting to be pressed into the diary. Pressing lifts it, sets it down, and the wax spreads. */
export function SealPress({ kind, label, onPressed }: { kind: SealKind; label: string; onPressed: () => void }) {
  const { still } = useGame();
  const [pressed, setPressed] = useState(false);
  const ref = useIntoView<HTMLDivElement>();
  return (
    <div ref={ref} className="seal-press">
      <button
        type="button"
        className={`seal-button${pressed ? " is-done" : ""}`}
        disabled={pressed}
        onClick={() => {
          setPressed(true);
          window.setTimeout(onPressed, still ? 0 : 900);
        }}
        aria-label={label}
      >
        <span className={pressed ? "seal is-pressing-wrap" : "seal-hover"}><WaxSeal kind={kind} /></span>
      </button>
      <span className="seal-word">{label}</span>
    </div>
  );
}

/** The end of a level: its stars brighten in the hoopoe constellation, a shooting star, the note, Go on. */
export function LevelEnd({ level, stars, allStars, note, word, onGoOn }: { level: number; stars: number; allStars: number[]; note: string; word: string; onGoOn: () => void }) {
  const { L } = useGame();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  // Levels played so far: their kept stars bright, the rest dimmed. Levels to come: not yet lit.
  const lit = allStars.flatMap((s, i) => [0, 1, 2].map((k): "on" | "dim" | "off" => {
    if (i > level - 1) return "off";
    const kept = i === level - 1 ? stars : s;
    return k < kept ? "on" : "dim";
  }));
  return (
    <div className="level-end" role="dialog" aria-label={word}>
      <div className="level-end-sheet slip" data-theme="folio">
        <p className="t-eyebrow">{word}</p>
        <div className="level-end-sky" data-theme="night">
          <i className="shooting" aria-hidden="true" />
          <Constellation lit={lit} label={L["ui.stars"]} />
        </div>
        <Folded text={note} />
        <button ref={ref} type="button" className="stamp" onClick={onGoOn}>{L["ui.goon"]}</button>
      </div>
    </div>
  );
}

/** A satellite the player taps to hear it speak. */
export function TapToSpeak({ children, label, onTap, className = "" }: { children: ReactNode; label: string; onTap: () => void; className?: string }) {
  return (
    <button type="button" className={`tap-sat ${className}`} onClick={onTap} aria-label={label}>
      {children}
    </button>
  );
}
