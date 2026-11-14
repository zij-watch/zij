"use client";

// The scene: one room, two halves. Above, the night sky and the Delta's fields from above, where the
// satellites watch; below, the scholar's desk under the lamp, where the diary is made. Moving from
// one to the other the camera tilts down, as on the landing page; between levels the lamp goes out
// and lights up again. The layers are canvases painted once; the camera moves them by transform.

import { useEffect, useRef, type ReactNode } from "react";
import { FieldsCanvas, SkyCanvas, WoodCanvas } from "../Textures";

export type Scene = "sky" | "desk";

/** A token's value from the page, read once: durations and easings live in the design system only. */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The book's running head: the Seal, then the five chapters, the current one ruled in brass. */
export function RunningHead({ words, current, sealAlt }: { words: string[]; current: number; sealAlt: string }) {
  return (
    <header className="dd-head" data-theme="night">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href="/" className="dd-seal"><img src="/landing/logo/zij-seal-small-night.svg" alt={sealAlt} width={306} height={255} /></a>
      <ol className="dd-chapters">
        {words.map((w, i) => (
          <li key={w} className={i + 1 < current ? "is-done" : i + 1 === current ? "is-now" : current > words.length ? "is-done" : ""} aria-current={i + 1 === current ? "step" : undefined}>
            <span>{w}</span>
            <i className="dd-rule" aria-hidden="true" />
          </li>
        ))}
      </ol>
    </header>
  );
}

/** A date palm against the sky, in ink: where Hudhud lands. */
function Palm() {
  return (
    <svg className="dd-palm" viewBox="0 0 120 260" aria-hidden="true">
      <path d="M62 260C60 210 58 160 64 110C66 92 70 80 72 70L77 71C74 84 71 96 70 112C66 160 68 212 70 260Z" />
      <path d="M60 236H72M60 214H71M60 192H70M61 170H70M62 148H70M63 126H71M65 104H72M67 86H74" className="dd-palm-ring" />
      <path d="M74 70C56 54 30 52 6 66C30 58 52 62 70 74ZM74 70C66 46 46 30 20 28C44 36 60 50 70 72ZM74 70C80 46 96 32 116 30C98 40 86 54 78 74ZM74 70C92 58 108 60 120 74C104 66 90 66 78 76ZM74 70C72 50 74 30 86 14C80 34 80 52 78 72ZM74 70C60 74 44 90 36 112C48 94 60 84 76 78ZM74 70C88 78 100 92 104 112C94 96 84 86 72 80Z" />
    </svg>
  );
}

export function Stage({ scene, still, dark, sky, children }: { scene: Scene; still: boolean; dark: boolean; sky?: ReactNode; children: ReactNode }) {
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
          <div className="dd-land"><FieldsCanvas className="dd-fields" /></div>
          <Palm />
          {sky}
        </div>
        <div ref={deskRef} className="dd-layer is-desk" data-on={String(scene === "desk")} data-theme="night">
          <WoodCanvas className="dd-wood" />
          <i className="dd-pool" aria-hidden="true" />
        </div>
      </div>
      <div className="dd-play">{children}</div>
      <i className={`dd-dark${dark ? " is-out" : ""}`} aria-hidden="true" />
    </div>
  );
}
