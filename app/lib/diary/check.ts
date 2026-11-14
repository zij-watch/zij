// The word budget of Hudhud's Fire Diary (the plan's section 2), checked line by line.
// Used by scripts/check-diary.mjs (which fails the build) and by /studio/diary?script (which shows it).
// Type imports only: Node runs this file directly, and the caller passes in the filled numbers.

import type { Beat, Chapter, LabelRole, Text } from "./script";
import type { Fill } from "./numbers";

export const LIMITS = { line: 12, run: 2, label: 5, note: 25, numbers: 1 };

/** Words to avoid on screen (section 2). The grown-up notes may use them. */
const AVOID: [RegExp, string][] = [
  [/hotspot[- ]?days?/i, "hotspot-day: say fire square"],
  [/cell[- ]?days?/i, "cell-day: say fire square"],
  [/0\.1\s?°/, "0.1° cell: say fire square"],
  [/harmoni[sz]/i, "harmonize: say translate"],
  [/calibrat/i, "calibrate: say translate"],
  [/\bmodel(s|led|ling)?\b/i, "model: say the translator"],
  [/leave one year out/i, "leave one year out: say hide a year"],
  [/out[- ]of[- ]time|validat/i, "validation: say the sealed envelope"],
  [/uncertaint/i, "uncertainty band: say the doubt band"],
  [/%|per ?cent/i, "a percentage: say how close"],
  [/near real[- ]time/i, "near real time: say fresh numbers"],
  [/confidence/i, "confidence filter: say too faint to be sure"],
  [/static source/i, "static source: say a factory flame"],
];

const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|half|double|twice|triple|dozens?)\b/gi;
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

export type Segment = { text: string } | { text: string; fill: Fill & { name: string } };

export type Checked = {
  option?: string;
  inUse: boolean;
  template: string;
  segments: Segment[];
  plain: string;
  words: number;
  limit: number;
  numbers: number;
  problems: string[];
};

export type Row = { chapter: string; part: string; bonus: boolean; beat: Beat; texts: Checked[] };
export type Report = { rows: Row[]; notes: { chapter: string; texts: Checked[] }[]; runningHead: Checked[]; ui: Checked[]; issues: string[] };

const lookup = (ph: Record<string, Fill>, name: string): (Fill & { name: string }) | null => {
  if (ph[name]) return { ...ph[name], name };
  const lower = name[0].toLowerCase() + name.slice(1);
  if (lower !== name && ph[lower]) return { ...ph[lower], value: ph[lower].value[0].toUpperCase() + ph[lower].value.slice(1), name };
  return null;
};

/** Fill a template's {placeholders}, keeping track of what came from where. */
export function fill(template: string, ph: Record<string, Fill>): { segments: Segment[]; plain: string; unknown: string[] } {
  const segments: Segment[] = [], unknown: string[] = [];
  let at = 0;
  for (const m of template.matchAll(PLACEHOLDER)) {
    if (m.index > at) segments.push({ text: template.slice(at, m.index) });
    const f = lookup(ph, m[1]);
    if (f) segments.push({ text: f.value, fill: f });
    else { segments.push({ text: m[0] }); unknown.push(m[1]); }
    at = m.index + m[0].length;
  }
  if (at < template.length) segments.push({ text: template.slice(at) });
  return { segments, plain: segments.map((s) => s.text).join(""), unknown };
}

const countWords = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}?]/u.test(w)).length;

type Kind = "line" | "label" | "note";

function checkText(template: string, kind: Kind, ph: Record<string, Fill>): Omit<Checked, "option" | "inUse"> {
  const { segments, plain, unknown } = fill(template, ph);
  const problems: string[] = [];
  const limit = kind === "line" ? LIMITS.line : kind === "label" ? LIMITS.label : LIMITS.note;
  const words = countWords(plain);
  if (words > limit) problems.push(`${words} words, over ${limit}`);
  for (const u of unknown) problems.push(`no number called {${u}}`);

  // Figures come from the data. Outside the placeholders the only figure allowed is the 0 token.
  const bare = template.replace(PLACEHOLDER, " ");
  const typed = (bare.match(/\d(?:[\d,.]*\d)?/g) ?? []).filter((d) => d !== "0");
  if (typed.length) problems.push(`a figure typed in (${typed.join(", ")}): use a {placeholder}`);

  // Numbers in one line: placeholders that hold numbers, number words, and the 0 token.
  const fills = segments.filter((s): s is Extract<Segment, { fill: unknown }> => "fill" in s && s.fill.kind === "number").length;
  const numbers = fills + (bare.match(NUMBER_WORDS) ?? []).length + (bare.match(/(^|[^\d,.])0(?![\d,.])/g) ?? []).length;
  if (kind !== "note" && numbers > LIMITS.numbers) problems.push(`${numbers} numbers in one line, over ${LIMITS.numbers}`);

  if (/[!¡]/.test(plain)) problems.push("an exclamation mark");
  if (/\p{Extended_Pictographic}/u.test(plain)) problems.push("an emoji");
  if (/\p{Script=Arabic}/u.test(plain)) problems.push("Arabic text");
  if (kind !== "note") for (const [re, say] of AVOID) if (re.test(plain)) problems.push(`a word to avoid (${say})`);
  if (kind === "note") {
    if (!/[.?]$/.test(plain.trim())) problems.push("a note is one sentence, ending in a full stop");
    if (/[.?!]\s+\S/.test(plain.trim())) problems.push("more than one sentence");
  }
  return { template, segments, plain, words, limit, numbers, problems };
}

function checkVariants(text: Text, kind: Kind, ph: Record<string, Fill>, picks: Record<string, string>): Checked[] {
  if (typeof text === "string") return [{ ...checkText(text, kind, ph), inUse: true }];
  const chosen = picks[text.pick];
  const out = Object.entries(text.options).map(([option, t]) => ({ ...checkText(t, kind, ph), option, inUse: option === chosen }));
  if (!out.some((c) => c.inUse)) out.forEach((c) => c.problems.push(`no version for "${chosen}" (${text.pick})`));
  return out;
}

const shown = (b: Beat): { text: Text; kind: Kind } | null =>
  "say" in b ? { text: b.text, kind: "line" } : "line" in b ? { text: b.line, kind: "line" } : "label" in b ? { text: b.label, kind: "label" } : null;

/** Check every line, label and note, and the runs of lines between the player's actions. */
export function checkScript(
  script: { chapters: Chapter[]; runningHead: string[]; ui: { label: string; role: LabelRole }[] },
  ph: Record<string, Fill>,
  picks: Record<string, string>,
  claims: { claim: string; holds: boolean }[],
): Report {
  const issues: string[] = [];
  const rows: Row[] = [];
  const notes: Report["notes"] = [];

  for (const ch of script.chapters) {
    const isLevel = ch.id !== "opening" && ch.id !== "ending";
    if (isLevel && !ch.note) issues.push(`${ch.title}: no "For grown-ups" note`);
    if (ch.note) notes.push({ chapter: ch.title, texts: [{ ...checkText(ch.note.text, "note", ph), inUse: true }] });
    for (const part of ch.parts)
      for (const beat of part.beats) {
        const s = shown(beat);
        rows.push({ chapter: ch.title, part: part.id, bonus: !!part.bonus, beat, texts: s ? checkVariants(s.text, s.kind, ph, picks) : [] });
      }
  }

  // Runs: lines from Hudhud, MODIS or VIIRS with no action of the player between them. Checked on
  // the full path and on the short one (bonus parts skipped), across the whole game.
  for (const path of ["full", "short"] as const) {
    let run: Row[] = [];
    for (const r of rows) {
      if (path === "short" && r.bonus) continue;
      if ("act" in r.beat) run = [];
      else if ("say" in r.beat) {
        run.push(r);
        if (run.length === LIMITS.run + 1) issues.push(`${r.chapter}, ${r.part}: ${run.length} lines in a row before the player acts (${path} path), from “${run[0].texts[0].plain}”`);
      }
    }
  }

  const runningHead = script.runningHead.map((w) => ({ ...checkText(w, "label", ph), inUse: true }));
  const ui = script.ui.map((u) => ({ ...checkText(u.label, "label", ph), inUse: true }));

  const all = [...rows.flatMap((r) => r.texts.map((t) => [`${r.chapter}, ${r.part}`, t] as const)), ...notes.flatMap((n) => n.texts.map((t) => [`${n.chapter}, note`, t] as const)), ...runningHead.map((t) => ["running head", t] as const), ...ui.map((t) => ["labels", t] as const)];
  for (const [where, t] of all) for (const p of t.problems) issues.push(`${where}: “${t.plain}”: ${p}`);
  for (const c of claims) if (!c.holds) issues.push(`the data no longer supports: ${c.claim}`);

  // Every word the game shows has an id, and each id is used once.
  const seen = new Set<string>();
  const ids = [...rows.map((r) => ("id" in r.beat ? r.beat.id : null)), ...script.ui.map((u) => (u as { id?: string }).id ?? "")];
  for (const id of ids) {
    if (id === null) continue;
    if (!id) issues.push("a label without an id");
    else if (seen.has(id)) issues.push(`the id ${id} is used twice`);
    else seen.add(id);
  }

  return { rows, notes, runningHead, ui, issues };
}

/** Every word the game shows, by id, filled with the data and with the data's version picked. */
export function resolveLines(
  script: { chapters: Chapter[]; ui: { id: string; label: string }[] },
  ph: Record<string, Fill>,
  picks: Record<string, string>,
): { lines: Record<string, string>; notes: Record<string, string>; speakers: Record<string, "hudhud" | "modis" | "viirs" | "mona"> } {
  const lines: Record<string, string> = {}, notes: Record<string, string> = {};
  const speakers: Record<string, "hudhud" | "modis" | "viirs" | "mona"> = {};
  const pick = (t: Text) => (typeof t === "string" ? t : t.options[picks[t.pick]] ?? Object.values(t.options)[0]);
  for (const ch of script.chapters) {
    if (ch.note) notes[ch.id] = fill(ch.note.text, ph).plain;
    for (const part of ch.parts)
      for (const b of part.beats) {
        const s = shown(b);
        if (s && "id" in b) lines[b.id] = fill(pick(s.text), ph).plain;
        if ("say" in b) speakers[b.id] = b.say;
      }
  }
  for (const u of script.ui) lines[u.id] = fill(u.label, ph).plain;
  return { lines, notes, speakers };
}
