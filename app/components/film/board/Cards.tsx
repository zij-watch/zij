"use client";

// Papers 6 and 7 of the board: take it, and the Seal card.
//   6  A sheet with its title, on which the drawn area's monthly CSV and calendar picture are
//      stamped, and beside it the app's season brief for the Nile Delta (/brief?area=nile-delta, in
//      a frame, without its buttons). The two
//      files are the ones the Downloads page saves: it is mounted out of sight, its buttons are
//      pressed once, and the files are caught on their way to disk (components/film/Take.tsx).
//   7  The Seal, written with the landing page's brush, then the team and the credits.

import { useEffect, useRef, useState } from "react";
import { BEATS, STORY } from "@/lib/film/board";
import { arrive, clamp, lerp } from "@/lib/film/timeline";
import Downloads from "../../Downloads";
import Paper from "../../Paper";
import { inked, Sheet, frame, useDriver, useFilm, useReady, useT } from "../kit";
import { BRIEF, BRIEF_STYLE, BRIEF_URL, catchDownloads } from "../Take";
import { PaperTitle } from "./Title";

export interface Files { csv: { name: string; lines: string[]; rows: number }; picture: { name: string; url: string } }

/** The Downloads page, out of sight: its "Monthly CSV" and "Calendar PNG", caught once. */
export function OffstageDownloads({ onFiles }: { onFiles: (files: Files) => void }) {
  const { warn } = useFilm();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const element = root.current;
      if (!element) return;
      for (let i = 0; i < 3600 && live && ![...element.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Monthly CSV"); i++) await frame();
      await document.fonts.ready;
      if (!live) return;
      const [monthly, calendar] = await catchDownloads(element, ["Monthly CSV", "Calendar PNG"]);
      if (!live) return;
      const lines = (await monthly.blob.text()).split("\n").filter(Boolean);
      onFiles({
        csv: { name: monthly.name, lines, rows: lines.filter((line) => !line.startsWith("#")).length - 1 },
        picture: { name: calendar.name, url: URL.createObjectURL(calendar.blob) },
      });
    })().catch((error: Error) => warn(`downloads: ${error.message}`));
    return () => {
      live = false;
    };
  }, [warn, onFiles]);
  return <div ref={root} className="film-offstage" aria-hidden="true"><Downloads /></div>;
}

// ---------------------------------------------------------------- 6. take it

export function TakePaper({ files }: { files: Files | null }) {
  const t = useT();
  const { warn } = useFilm();
  const s = STORY[6], B = BEATS.take;
  const brief = useRef<HTMLIFrameElement>(null);
  const [briefH, setBriefH] = useState(1400);
  const [briefReady, setBriefReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      let page: Document | null = null;
      for (let i = 0; i < 3600 && live; i++) {
        const doc = brief.current?.contentDocument;
        if (doc?.readyState === "complete" && doc.querySelector(".brief-page h1") && doc.querySelector(".brief-calendar svg")) {
          page = doc;
          break;
        }
        await frame();
      }
      if (!live) return;
      if (!page) throw new Error(`${BRIEF_URL} did not finish loading`);
      const style = page.createElement("style");
      style.textContent = BRIEF_STYLE;
      page.head.appendChild(style);
      await page.fonts.ready;
      await frame();
      setBriefH(Math.ceil(page.querySelector(".brief-page")!.getBoundingClientRect().bottom + BRIEF.bottom));
      setBriefReady(true);
    })().catch((error: Error) => warn(`brief: ${error.message}`));
    return () => {
      live = false;
    };
  }, [warn]);
  useReady("take", files !== null && briefReady);

  const stamped = (at: number) => {
    const k = arrive(t, at);
    return { opacity: Math.min(1, k * 5), k: 1 + 0.12 * (1 - k), hidden: t < at };
  };
  const a = stamped(s + B.csv), b = stamped(s + B.picture);
  const head = files ? files.csv.lines.filter((line) => line.startsWith("#")) : [];
  const body = files ? files.csv.lines.filter((line) => !line.startsWith("#")).slice(0, 7) : [];

  return (
    <>
      <Sheet className="film-brief" x={980} y={0} w={BRIEF.w + BRIEF.right} k={0.8}>
        <iframe ref={brief} src={BRIEF_URL} title="Season brief" tabIndex={-1} aria-hidden="true" scrolling="no" width={BRIEF.w + BRIEF.right} height={briefH} />
      </Sheet>
      <Sheet x={0} y={0} w={940} h={700}>
        <Paper as="div" kind="sheet" seed="board-take" className="board-take">
          <PaperTitle n={6} />
        </Paper>
      </Sheet>
      <Sheet x={30} y={142} w={520} k={1.12 * a.k} rot={-1.2} style={{ ...(a.hidden ? { visibility: "hidden" } : {}), opacity: a.opacity, transformOrigin: "50% 50%" }}>
        <Paper as="div" kind="card" seed="board-csv" className="film-file">
          <p className="plate-mark">{files?.csv.name}</p>
          <pre className="film-csv">{[...head, ...body].join("\n")}</pre>
          <p className="film-file-note">{files ? `${files.csv.rows.toLocaleString("en-US")} months, one row each` : ""}</p>
        </Paper>
      </Sheet>
      <Sheet x={612} y={174} w={300} k={1.02 * b.k} rot={1.8} style={{ ...(b.hidden ? { visibility: "hidden" } : {}), opacity: b.opacity, transformOrigin: "50% 50%" }}>
        <Paper as="div" kind="card" seed="board-picture" className="film-file">
          <p className="plate-mark">{files?.picture.name}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {files && <img className="film-picture" src={files.picture.url} alt="" />}
        </Paper>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- 7. the Seal card

/** cubic-bezier(0.3, 0.1, 0.25, 1): the brush's own pace, from the landing's stylesheet. */
function brush(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * 0.3, bx = 3 * (0.25 - 0.3) - cx, ax = 1 - cx - bx;
  const cy = 3 * 0.1, by = 3 * (1 - 0.1) - cy, ay = 1 - cy - by;
  let u = x;
  for (let i = 0; i < 8; i++) {
    const d = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(d) < 1e-6) break;
    u -= (((ax * u + bx) * u + cx) * u - x) / d;
  }
  return ((ay * u + by) * u + cy) * u;
}
const seconds = (element: Element, name: string) => parseFloat((element as SVGElement).style.getPropertyValue(name)) || 0;

/** The Seal card. The third film (v3) gives its own times, absolute, and its own line for the team. */
export function SealCard({ seal, at, team = "Team Zij · zij.watch" }: { seal: string; at?: { seal: number; team: number; credit: number }; team?: string }) {
  const t = useT();
  const s = at ? 0 : STORY[7], B = at ?? BEATS.seal;
  const holder = useRef<HTMLDivElement>(null);

  // The landing page's keyframes (seal-write, seal-dot, seal-tip, seal-dry), worked out for the frame's time.
  useDriver((time) => {
    const svg = holder.current?.querySelector("svg");
    if (!svg) return;
    const now = time - (s + B.seal);
    svg.querySelectorAll<SVGPathElement>(".seal-stroke").forEach((path) => {
      path.style.strokeDasharray = "1";
      path.style.strokeDashoffset = String(1 - brush((now - seconds(path, "--at")) / (seconds(path, "--dur") || 0.4)));
    });
    svg.querySelectorAll<SVGPathElement>(".seal-dot").forEach((path) => {
      path.style.opacity = String(clamp((now - seconds(path, "--at")) / 0.08));
    });
    svg.querySelectorAll<SVGPathElement>(".seal-wet-stroke").forEach((path) => {
      const at = seconds(path, "--at"), dur = seconds(path, "--dur") || 0.4, tip = seconds(path, "--tip") || 0.1;
      const k = brush((now - at) / dur), dry = clamp((now - at) / (dur + 0.3));
      path.style.strokeDasharray = `${tip} 2`;
      path.style.strokeDashoffset = String(lerp(tip, tip - 1, k));
      path.style.opacity = String(dry <= 0 || dry >= 1 ? 0 : dry < 0.08 ? dry / 0.08 : dry <= 0.62 ? 1 : 1 - (dry - 0.62) / 0.38);
    });
  });

  return (
    <Paper as="div" kind="card" seed="board-seal" className="board-sealcard">
      <div ref={holder} className="film-seal board-seal" dangerouslySetInnerHTML={{ __html: seal }} />
      <p className="board-team" style={inked(t, s + B.team)}>{team}</p>
      <p className="board-credit" style={inked(t, s + B.credit)}>Data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth</p>
    </Paper>
  );
}
