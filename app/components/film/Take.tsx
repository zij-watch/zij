"use client";

// Scene 6: take it. The season brief is the app's own page for the Nile Delta preset,
// /brief?area=nile-delta, held in a frame on the desk without its buttons (the film's own address
// carries the drawn polygon, which the brief would otherwise show). The CSV and the calendar picture
// are the very files the Downloads page saves for the drawn area: the page is mounted out of sight,
// its "Monthly CSV" and "Calendar PNG" buttons are pressed once, and the two files are caught on
// their way to disk, with their names.

import { useEffect, useRef, useState } from "react";
import { arrive, move, PRESET, RULE_FOR, SLIDE, T } from "@/lib/film/timeline";
import Downloads from "../Downloads";
import Paper from "../Paper";
import { frame, ruledOut, Sheet, shown, useFilm, useReady, useT } from "./kit";

interface Saved { name: string; blob: Blob }

export const BRIEF_URL = `/brief?area=${PRESET}`;
export const BRIEF = { w: 820, right: 34, bottom: 40 }; // the page, and room inside the frame for its shadow
/** What the film changes in the brief's own page: no buttons, no ground behind the sheet, nothing that moves. */
export const BRIEF_STYLE = `
  *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }
  html, body { background: transparent !important; overflow: hidden !important; margin: 0 !important; }
  nextjs-portal { display: none !important; }
  .brief { padding: 0 ${BRIEF.right}px ${BRIEF.bottom}px 0 !important; background: none !important; }
  .brief-actions { display: none !important; }
  .brief-page { width: ${BRIEF.w}px; max-width: none !important; margin: 0 !important;
    box-shadow: 7px 14px 16px color-mix(in srgb, var(--shadow) 70%, transparent), inset 0 0 60px color-mix(in srgb, var(--shadow) 9%, transparent) !important; }
`;

/** Press the Downloads page's buttons and keep what they would have saved. Nothing reaches the disk. */
export async function catchDownloads(root: HTMLElement, labels: string[]): Promise<Saved[]> {
  const saved: Saved[] = [];
  const made = new Map<string, Blob>();
  const createObjectURL = URL.createObjectURL;
  const click = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (object: Blob | MediaSource) => {
    const url = createObjectURL.call(URL, object);
    if (object instanceof Blob) made.set(url, object);
    return url;
  };
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const blob = made.get(this.href);
    if (this.download && blob) saved.push({ name: this.download, blob });
    else click.call(this);
  };
  try {
    for (const label of labels) {
      const button = [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
      if (!button) throw new Error(`Downloads has no "${label}" button`);
      const before = saved.length;
      button.click();
      // The picture is drawn off screen before it is saved: wait for it, frame by frame.
      for (let i = 0; i < 900 && saved.length === before; i++) await frame();
      if (saved.length === before) throw new Error(`"${label}" saved nothing`);
    }
  } finally {
    URL.createObjectURL = createObjectURL;
    HTMLAnchorElement.prototype.click = click;
  }
  return saved;
}

export default function Take() {
  const t = useT();
  const { warn } = useFilm();
  const downloads = useRef<HTMLDivElement>(null);
  const brief = useRef<HTMLIFrameElement>(null);
  const [briefH, setBriefH] = useState(1400);
  const [csv, setCsv] = useState<{ name: string; lines: string[]; rows: number } | null>(null);
  const [picture, setPicture] = useState<{ name: string; url: string } | null>(null);
  const [briefReady, setBriefReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const root = downloads.current;
      if (!root) return;
      // Downloads fits the drawn area first; its buttons appear when the area is ready.
      for (let i = 0; i < 3600 && live && ![...root.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Monthly CSV"); i++) await frame();
      await document.fonts.ready;
      if (!live) return; // an effect that was undone (React runs effects twice in development) presses nothing
      const [monthly, calendar] = await catchDownloads(root, ["Monthly CSV", "Calendar PNG"]);
      if (!live) return;
      const lines = (await monthly.blob.text()).split("\n").filter(Boolean);
      setCsv({ name: monthly.name, lines, rows: lines.filter((line) => !line.startsWith("#")).length - 1 });
      setPicture({ name: calendar.name, url: URL.createObjectURL(calendar.blob) });
    })().catch((error: Error) => warn(`downloads: ${error.message}`));
    return () => {
      live = false;
    };
  }, [warn]);

  useEffect(() => {
    let live = true;
    (async () => {
      // The brief's page loads its area and draws its calendar; then the film's style goes in.
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
      const sheet = page.querySelector(".brief-page")!.getBoundingClientRect();
      setBriefH(Math.ceil(sheet.bottom + BRIEF.bottom));
      setBriefReady(true);
    })().catch((error: Error) => warn(`brief: ${error.message}`));
    return () => {
      live = false;
    };
  }, [warn]);
  useReady("take", csv !== null && picture !== null && briefReady);

  const end = T.endRule + RULE_FOR;
  const briefIn = move(t, T.briefIn, SLIDE);
  const stamped = (at: number) => {
    const k = arrive(t, at);
    return { opacity: Math.min(1, k * 5), k: 1 + 0.12 * (1 - k) };
  };
  const a = stamped(T.csv), b = stamped(T.picture);
  const head = csv ? csv.lines.filter((line) => line.startsWith("#")) : [];
  const body = csv ? csv.lines.filter((line) => !line.startsWith("#")).slice(0, 7) : [];

  return (
    <>
      <div ref={downloads} className="film-offstage" aria-hidden="true"><Downloads /></div>
      <div className="film-group" style={{ ...shown(t, T.briefIn, end), ...ruledOut(t, T.endRule) }}>
        {/* The brief slides out over Results, on the right; the two files are stamped on the left. */}
        <Sheet className="film-brief" x={1148} y={60} w={BRIEF.w + BRIEF.right} k={0.8} rot={0.7} dx={(1 - briefIn) * 1000}>
          <iframe ref={brief} src={BRIEF_URL} title="Season brief" tabIndex={-1} aria-hidden="true" scrolling="no"
            width={BRIEF.w + BRIEF.right} height={briefH} />
        </Sheet>

        <Sheet x={176} y={118} w={520} k={1.3 * a.k} rot={-1.2} style={{ ...shown(t, T.csv), opacity: a.opacity, transformOrigin: "50% 50%" }}>
          <Paper as="div" kind="card" seed="film-csv" className="film-file">
            <p className="plate-mark">{csv?.name}</p>
            <pre className="film-csv">{[...head, ...body].join("\n")}</pre>
            <p className="film-file-note">{csv ? `${csv.rows.toLocaleString("en-US")} months, one row each` : ""}</p>
          </Paper>
        </Sheet>

        <Sheet x={742} y={196} w={300} k={1.22 * b.k} rot={1.8} style={{ ...shown(t, T.picture), opacity: b.opacity, transformOrigin: "50% 50%" }}>
          <Paper as="div" kind="card" seed="film-picture" className="film-file">
            <p className="plate-mark">{picture?.name}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {picture && <img className="film-picture" src={picture.url} alt="" />}
          </Paper>
        </Sheet>
      </div>
    </>
  );
}
