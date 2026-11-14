"use client";

// The scene: one room, two halves. Above, the night sky and the Delta's fields from above, where the
// satellites watch; below, the scholar's desk under the lamp, where the diary is made. Moving from
// one to the other the camera tilts down, as on the landing page; between levels the lamp goes out
// and lights up again. The layers are canvases painted once; the camera moves them by transform.

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { FAR_FIRES, HORIZON } from "@/lib/diary/land";
import { Flame } from "../art/Fire";
import { LandCanvas, SkyCanvas, WoodCanvas } from "../Textures";

export type Scene = "sky" | "desk";

/** A token's value from the page, read once: durations and easings live in the design system only. */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The letters the chapters are numbered with: abjad, as the landing page numbers its own. */
export const ABJAD = ["أ", "ب", "ج", "د", "ه"];

/** The eight-pointed star, two squares laid across each other: a star kept, or one let go. */
export function Star8({ dim = false }: { dim?: boolean }) {
  return (
    <svg className={`star8${dim ? " is-dim" : ""}`} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 2L25.3 7.3H32.7V14.7L38 20L32.7 25.3V32.7H25.3L20 38L14.7 32.7H7.3V25.3L2 20L7.3 14.7V7.3H14.7Z" />
    </svg>
  );
}

/**
 * The book's running head, lying on the sky: the Seal (the way back), the five chapters on a brass
 * thread, each under its abjad letter, and the stars kept so far.
 */
export function RunningHead({ words, current, sealAlt, kept, keptLabel }: { words: string[]; current: number; sealAlt: string; kept: number; keptLabel: string }) {
  const done = Math.min(1, Math.max(0, (current - 1) / (words.length - 1)));
  return (
    <header className="dd-head" data-theme="night">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href="/" className="dd-seal"><img src="/landing/logo/zij-seal-small-night.svg" alt={sealAlt} width={306} height={255} /></a>
      <ol className="dd-chapters" style={{ "--done": done } as CSSProperties}>
        {words.map((w, i) => (
          <li key={w} className={i + 1 < current || current > words.length ? "is-done" : i + 1 === current ? "is-now" : ""} aria-current={i + 1 === current ? "step" : undefined}>
            <b className="abjad" aria-hidden="true"><span>{ABJAD[i]}</span></b>
            <span>{w}</span>
          </li>
        ))}
      </ol>
      <p className="dd-kept" data-n={kept} aria-label={`${keptLabel}: ${kept}`}><Star8 /><span aria-hidden="true">{kept}</span></p>
    </header>
  );
}

/** The straw fires far across the fields: small flames where the land canvas has lit the ground. */
function FarFires() {
  return (
    <div className="dd-farfires" aria-hidden="true">
      {FAR_FIRES.map((f, i) => (
        <span key={i} className="dd-farfire" style={{ left: `${f.x * 100}%`, top: `${(HORIZON + (1 - HORIZON) * f.depth) * 100}%`, "--k": f.k } as CSSProperties}>
          <Flame w={Math.round(9 * f.k)} h={Math.round(13 * f.k)} seed={31 + i * 7} lean={0.3} />
          <Flame w={Math.round(7 * f.k)} h={Math.round(10 * f.k)} seed={47 + i * 5} lean={0.3} />
          <Flame w={Math.round(8 * f.k)} h={Math.round(12 * f.k)} seed={12 + i * 3} lean={0.3} />
        </span>
      ))}
    </div>
  );
}

export function Stage({ scene, still, dark, sky, guide, children }: { scene: Scene; still: boolean; dark: boolean; sky?: ReactNode; guide?: ReactNode; children: ReactNode }) {
  const skyRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const shown = useRef<Scene>(scene);

  // The camera: tilt down from the sky to the desk (or back up), on the compositor.
  useEffect(() => {
    const s = skyRef.current, d = deskRef.current;
    if (!s || !d || shown.current === scene) return;
    shown.current = scene;
    const toDesk = scene === "desk";
    const settle = () => {
      s.dataset.on = String(!toDesk);
      d.dataset.on = String(toDesk);
    };
    if (still) { settle(); return; }
    const duration = parseFloat(token("--dur-camera", "2400ms")), easing = token("--ease-lamp", "ease-in-out");
    const up = [{ transform: "none", opacity: 1 }, { transform: "translateY(-62%) perspective(900px) rotateX(16deg)", opacity: 0 }];
    const down = [{ transform: "translateY(62%) perspective(900px) rotateX(-10deg)", opacity: 0 }, { transform: "none", opacity: 1 }];
    s.dataset.on = d.dataset.on = "true";
    const a = s.animate(toDesk ? up : [...up].reverse(), { duration, easing, fill: "both" });
    const b = d.animate(toDesk ? down : [...down].reverse(), { duration, easing, fill: "both" });
    const done = () => { settle(); a.cancel(); b.cancel(); };
    b.onfinish = done;
    // A page in the background may never run the animation to its end: settle on time regardless.
    const t = window.setTimeout(done, duration + 200);
    return () => { window.clearTimeout(t); done(); };
  }, [scene, still]);

  return (
    <div className="dd-stage">
      <div className="dd-camera">
        <div ref={skyRef} className="dd-layer is-sky" data-on={String(scene === "sky")} data-theme="night">
          <SkyCanvas className="dd-sky" />
          <i className="dd-meteor" aria-hidden="true" /><i className="dd-meteor" aria-hidden="true" />
          <LandCanvas className="dd-land" />
          <FarFires />
          <i className="dd-shade" aria-hidden="true" />
          {sky}
        </div>
        <div ref={deskRef} className="dd-layer is-desk" data-on={String(scene === "desk")} data-theme="night">
          <WoodCanvas className="dd-wood" />
          <i className="dd-pool" aria-hidden="true" />
        </div>
      </div>
      <div className="dd-play">{children}</div>
      {guide}
      <i className={`dd-dark${dark ? " is-out" : ""}`} aria-hidden="true" />
    </div>
  );
}
