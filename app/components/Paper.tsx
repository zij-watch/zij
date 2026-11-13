"use client";

// A piece of paper. <PaperBack> paints the sheet on a canvas behind whatever holds it (the holder
// needs the .paper class, which gives it a flat paper look until the canvas is painted, and with
// scripts off). <Paper> is a holder with its back already in it.

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { paintPaper, type PaperKind, type Side } from "@/lib/paper";

export function PaperBack({ kind = "sheet", torn, seed }: { kind?: PaperKind; torn?: Side; seed?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const holder = c?.parentElement;
    if (!c || !holder) return;
    let painted = "";
    let frame = 0;
    const paint = () => {
      frame = 0;
      const w = Math.round(holder.offsetWidth), h = Math.round(holder.offsetHeight);
      if (!w || !h || painted === `${w}x${h}`) return;
      painted = `${w}x${h}`;
      paintPaper(c, w, h, { kind, torn, seed: seed ?? `${kind}-${holder.className}` });
      holder.classList.add("is-painted");
    };
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(paint);
    });
    observer.observe(holder);
    paint();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      holder.classList.remove("is-painted");
    };
  }, [kind, torn, seed]);
  return <canvas ref={canvas} className="paper-back" aria-hidden="true" />;
}

type Tag = "div" | "section" | "header" | "aside" | "article" | "form" | "nav";

export default function Paper({ as: Element = "section", kind = "sheet", torn, seed, className, children, ...rest }:
  { as?: Tag; kind?: PaperKind; torn?: Side; seed?: string; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <Element className={`paper is-${kind}${className ? ` ${className}` : ""}`} {...rest}>
      <PaperBack kind={kind} torn={torn} seed={seed} />
      {children}
    </Element>
  );
}
