"use client";

// The day scrubber along the bottom of the map, a slip of paper with an alidade on a brass rule: drag to a day, or play through the days at a
// steady pace. The pace and the stepping are the studio map's (components/StudioMap.tsx).

import { useEffect, useRef, useState } from "react";
import Paper from "./Paper";

const PACE_MS = 800;
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const shortDate = (iso: string) => SHORT.format(new Date(`${iso}T00:00:00Z`));

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to) && out.length < 400; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

interface Props {
  days: string[]; // every day of the range, in order
  day: string | null; // the day shown
  counts: Map<string, number> | null; // hotspots per day, once loaded
  note: string | null; // what is still loading, or why there are no marks
  onDay: (day: string) => void;
  onClose: () => void;
}

export default function Timeline({ days, day, counts, note, onDay, onClose }: Props) {
  const [playing, setPlaying] = useState(false);
  const at = Math.max(0, day ? days.indexOf(day) : days.length - 1);
  const latest = useRef({ at, days, onDay });
  latest.current = { at, days, onDay };

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const now = latest.current;
      if (now.at >= now.days.length - 1) return setPlaying(false);
      now.onDay(now.days[now.at + 1]);
    }, PACE_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const play = () => {
    // From the last day, play starts over.
    if (!playing && at >= days.length - 1) onDay(days[0]);
    setPlaying(!playing);
  };
  const top = counts ? Math.max(1, ...counts.values()) : 1;

  return (
    <Paper as="section" kind="slip" seed="timeline" className="timeline" aria-label="Timeline">
      <button type="button" className="timeline-play" onClick={play} aria-label={playing ? "Pause" : "Play"}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /> : <path d="M7 4l13 8-13 8z" fill="currentColor" />}
        </svg>
        <span>{playing ? "Pause" : "Play"}</span>
      </button>
      <div className="timeline-track">
        {counts && (
          <div className="timeline-bars" aria-hidden="true">
            {days.map((d) => <i key={d} style={{ height: `${(100 * (counts.get(d) ?? 0)) / top}%` }} />)}
          </div>
        )}
        <input type="range" className="alidade" min={0} max={days.length - 1} step={1} value={at} aria-label="Day"
          aria-valuetext={days[at] ? shortDate(days[at]) : undefined}
          onChange={(e) => { setPlaying(false); onDay(days[Number(e.target.value)]); }} />
        <div className="timeline-ends"><span>{shortDate(days[0])}</span><span>{shortDate(days[days.length - 1])}</span></div>
      </div>
      <p className="timeline-day">
        <strong>{days[at] ? shortDate(days[at]) : ""}</strong>
        <span>{note ?? (counts ? `${counts.get(days[at]) ?? 0} hotspots` : "")}</span>
      </p>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Close the timeline"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </Paper>
  );
}
