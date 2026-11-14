"use client";

// Dragging things onto places, three ways, all doing the same:
//   - the pointer: press, drag (the thing follows by transform), let go over a place;
//   - a tap: tap the thing (it is picked up), then tap the place;
//   - the keyboard: Enter or Space picks it up, the arrow keys go from place to place (each named
//     aloud), Enter sets it down, Escape puts it back.
// Places are found under the pointer with elementsFromPoint, so nothing is measured in a frame.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Zone = { id: string; label: string; el: HTMLElement | null };
type Held = { id: string; label: string; onDrop: (zone: string) => void } | null;

type DragApi = {
  held: Held;
  target: string | null;
  register: (z: Zone) => () => void;
  pick: (h: NonNullable<Held>) => void;
  drop: (zone: string) => void;
  cancel: () => void;
  move: (dir: 1 | -1) => void;
  announce: string;
};

const Ctx = createContext<DragApi | null>(null);

export function DragProvider({ children, hint }: { children: ReactNode; hint: string }) {
  const zones = useRef(new Map<string, Zone>());
  const [held, setHeld] = useState<Held>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const register = useCallback((z: Zone) => {
    zones.current.set(z.id, z);
    return () => { zones.current.delete(z.id); };
  }, []);
  const order = () => [...zones.current.values()].filter((z) => z.el && z.el.isConnected);

  const heldRef = useRef<Held>(null);
  const pick = useCallback((h: NonNullable<Held>) => {
    heldRef.current = h;
    setHeld(h);
    const first = order()[0];
    setTarget(first?.id ?? null);
    setAnnounce(`${h.label}. ${hint}${first ? `. ${first.label}` : ""}`);
  }, [hint]);
  const drop = useCallback((zone: string) => {
    const h = heldRef.current;
    heldRef.current = null;
    setHeld(null);
    setTarget(null);
    h?.onDrop(zone);
  }, []);
  const cancel = useCallback(() => { heldRef.current = null; setHeld(null); setTarget(null); }, []);
  const move = useCallback((dir: 1 | -1) => {
    const list = order();
    if (!list.length) return;
    setTarget((t) => {
      const i = Math.max(0, list.findIndex((z) => z.id === t));
      const next = list[(i + dir + list.length) % list.length];
      setAnnounce(next.label);
      return next.id;
    });
  }, []);

  // Keys while something is held: arrows go from place to place, Enter sets down, Escape cancels.
  useEffect(() => {
    if (!held) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { move(1); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { move(-1); e.preventDefault(); }
      else if (e.key === "Escape") { cancel(); e.preventDefault(); }
      else if ((e.key === "Enter" || e.key === " ") && target) { drop(target); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [held, target, move, cancel, drop]);

  const api = useMemo(() => ({ held, target, register, pick, drop, cancel, move, announce }), [held, target, register, pick, drop, cancel, move, announce]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <p className="sr-only" aria-live="assertive">{announce}</p>
    </Ctx.Provider>
  );
}

function useDrag(): DragApi {
  const d = useContext(Ctx);
  if (!d) throw new Error("drag outside its provider");
  return d;
}

/** A thing that can be carried. `onDrop` gets the place it was set down on. */
export function Draggable({ id, label, onDrop, children, className = "", disabled = false, style }: { id: string; label: string; onDrop: (zone: string) => void; children: ReactNode; className?: string; disabled?: boolean; style?: CSSProperties }) {
  const d = useDrag();
  const ref = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number; moved: boolean; pid: number } | null>(null);
  const isHeld = d.held?.id === id;

  const finishAt = (x: number, y: number) => {
    const el = ref.current;
    if (el) el.style.transform = "";
    const hit = document.elementsFromPoint(x, y).map((n) => (n as HTMLElement).closest?.("[data-zone]") as HTMLElement | null).find((z) => z && !el?.contains(z));
    if (hit?.dataset.zone) onDrop(hit.dataset.zone);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`drag${isHeld ? " is-held" : ""} ${className}`}
      style={style}
      disabled={disabled}
      aria-pressed={isHeld}
      aria-label={label}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY, moved: false, pid: e.pointerId };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.pid !== e.pointerId) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (!s.moved && Math.hypot(dx, dy) < 6) return;
        if (!s.moved) {
          s.moved = true;
          try { ref.current?.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
          ref.current?.classList.add("is-dragging");
        }
        if (ref.current) ref.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        ref.current?.classList.remove("is-dragging");
        if (s.moved) {
          const el = ref.current;
          el?.classList.add("was-dragged");
          window.setTimeout(() => el?.classList.remove("was-dragged"), 0);
          d.cancel();
          finishAt(e.clientX, e.clientY);
        }
      }}
      onPointerCancel={() => { start.current = null; if (ref.current) { ref.current.style.transform = ""; ref.current.classList.remove("is-dragging"); } }}
      onClick={(e) => {
        // a tap or Enter: pick it up, or put it back if it is already held
        if (e.detail > 0 && ref.current?.classList.contains("was-dragged")) return;
        if (isHeld) d.cancel();
        else d.pick({ id, label, onDrop });
      }}
    >
      {children}
    </button>
  );
}

/** A place things can be set down on. */
export function DropZone({ id, label, children, className = "", as: As = "div" }: { id: string; label: string; children?: ReactNode; className?: string; as?: "div" | "li" }) {
  const d = useDrag();
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => d.register({ id, label, el: ref.current }), [d, id, label]);
  const live = !!d.held;
  return (
    <As
      ref={(el: HTMLElement | null) => { ref.current = el; }}
      data-zone={id}
      className={`zone${live ? " is-open" : ""}${d.target === id ? " is-target" : ""} ${className}`}
      onClick={() => { if (d.held) d.drop(id); }}
      aria-label={live ? label : undefined}
      role={live ? "button" : undefined}
    >
      {children}
    </As>
  );
}
