// The film's captions come from a subtitle file (docs/event/zij-demo30.en.srt), read as it is:
// the words and the times on screen are the file's, never typed again here.

export interface Cue { n: number; from: number; to: number; lines: string[] }

const STAMP = /(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/;

const seconds = (h: string, m: string, s: string, ms: string) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;

/** The cues of an SRT file, in order. A cue with no time line or no words is left out. */
export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/^﻿/, "").replace(/\r/g, "").split(/\n{2,}/)) {
    const rows = block.split("\n").map((row) => row.trim()).filter(Boolean);
    const at = rows.findIndex((row) => STAMP.test(row));
    if (at < 0) continue;
    const m = rows[at].match(STAMP)!;
    const lines = rows.slice(at + 1);
    if (lines.length === 0) continue;
    cues.push({ n: cues.length + 1, from: seconds(m[1], m[2], m[3], m[4]), to: seconds(m[5], m[6], m[7], m[8]), lines });
  }
  return cues.sort((a, b) => a.from - b.from);
}
