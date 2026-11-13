// What the server sends before any script runs, so a slow connection never shows a blank page:
// what Zij is, the preset areas as plain links, and, for a preset URL, that area's headline facts.
// No hooks: it renders on the server, and Explore and Downloads show it until their own data is in.

import type { ReactNode } from "react";
import type { AreaIndexEntry } from "@/lib/data";
import type { AreaFacts } from "@/lib/facts";
import type { Verdict } from "@/lib/verdict";
import Paper from "./Paper";

export const INTRO = [
  "Zij puts 26 years of satellite fire detections on one scale. MODIS has watched fires since 2000 and VIIRS since 2012, and VIIRS sees many more of them.",
  "Both records are counted in one unit, hotspot-days (VIIRS-equivalent), so a year before 2012 can be read against a year after it: the busiest months, the critical period, and how this month compares with the past.",
];

export function AreaLinks({ areas, base = "/explore" }: { areas: AreaIndexEntry[]; base?: string }) {
  return (
    <ul className="plain">
      {areas.map((a) => (
        <li key={a.id}>
          <a href={`${base}?area=${a.id}`}>{a.name}</a>, {a.country}
        </li>
      ))}
    </ul>
  );
}

/** The verdict: a badge and one plain sentence. Rules in lib/verdict.ts. */
export function VerdictLine({ verdict }: { verdict: Verdict }) {
  return (
    <p className="verdict">
      <span className={`badge badge-${verdict.level}`}>{verdict.badge}</span>
      <span>{verdict.sentence}</span>
      {verdict.intensity && <strong className="verdict-intensity">{verdict.intensity}</strong>}
    </p>
  );
}

/** One paper of Results, as the server sends it (the same markup as ResultPaper in Panel.tsx). */
function ShellPaper({ letter, title, id, children }: { letter: string; title: string; id: string; children: ReactNode }) {
  return (
    <Paper as="section" kind="sheet" id={id} seed={id} className="result">
      <header className="result-head"><span className="abjad" aria-hidden="true">{letter}</span><h3 className="plate-mark">{title}</h3></header>
      {children}
    </Paper>
  );
}

/** A preset's headline facts as papers: what the server can say before the charts load. */
export function FactsPapers({ facts }: { facts: AreaFacts }) {
  return (
    <>
      <ShellPaper letter="أ" id="paper-verdict" title="Verdict">
        {facts.verdict ? <VerdictLine verdict={facts.verdict} /> : <p className="marginal">No verdict for this area.</p>}
        <p className="marginal" role="status">The calendar and charts are loading. Data to {facts.lastFullDay}.</p>
      </ShellPaper>
      {facts.thisMonth && <ShellPaper letter="ب" id="paper-month" title="This month so far"><p>{facts.thisMonth}</p></ShellPaper>}
      <ShellPaper letter="ج" id="paper-ranked" title="Busiest months">
        <p>{facts.busiestMonths.join(", ")}. Season: {facts.season}.</p>
      </ShellPaper>
      {facts.anomalies.length > 0 && (
        <ShellPaper letter="د" id="paper-anomalies" title="Unusual seasons">
          <ul className="plain">{facts.anomalies.map((line) => <li key={line}>{line}</li>)}</ul>
        </ShellPaper>
      )}
    </>
  );
}

/**
 * The Seal: one word that reads Zij from the left and زيج from the right. The small drawing, for
 * running heads, from the Zij design system (docs/design/logo in the team's design repository).
 * One colour, ink.
 */
export function Seal() {
  return (
    <svg className="seal" viewBox="44 135 306 255" height="26" role="img" aria-label="Zij · زيج" fill="currentColor">
      <path d="M44,200L196,200L196,225L81.47,365L196,365L196,390L44,390L44,365L158.53,225L44,225Z" /><path d="M173.18,275L218,275L218,300L152.73,300Z" /><path d="M232,200L264,200L264,300L232,300Z" /><path d="M314,200L346,200L346,349.68L313.02,390L270,390L270,365L296,365L314,343Z" /><path d="M227,156a21,21 0 1,0 42,0a21,21 0 1,0 -42,0ZM235.5,156a12.5,12.5 0 1,1 25,0a12.5,12.5 0 1,1 -25,0Z" /><path d="M330,136L350,156L330,176L310,156Z" /><path d="M140,316L156.5,332.5L140,349L123.5,332.5Z" /><path d="M227,314L243.5,330.5L227,347L210.5,330.5ZM269,314L285.5,330.5L269,347L252.5,330.5Z" />
    </svg>
  );
}

/** The whole Explore page as the server sends it, before scripts: used as the Suspense fallback. */
export function ExploreShell({ areas, facts }: { areas: AreaIndexEntry[]; facts: AreaFacts | null }) {
  return (
    <main className="explore panel-open">
      <header className="strip">
        <a className="brand" href="/"><Seal /><h1 className="sr-only">Zij: fire on one scale</h1></a>
        <p className="readout"><span className="readout-area">{facts?.name ?? "Fire on one scale"}</span></p>
        <nav aria-label="Pages"><a href="/downloads">Downloads</a><a href="/how-it-works">How it works</a></nav>
      </header>
      <div className="mapwrap"><div className="map map-waiting" role="status">Loading the map…</div></div>
      <aside className="results" aria-label="Results">
        <header className="results-head slip"><div className="results-title"><p className="eyebrow">Results</p><h2>{facts?.name ?? "Zij"}</h2>{facts && <span className="results-country">{facts.country}</span>}</div></header>
        {facts ? <FactsPapers facts={facts} /> : (
          <ShellPaper letter="أ" id="paper-intro" title="26 years of fire, on one scale">
            {INTRO.map((text) => <p key={text}>{text}</p>)}
            <AreaLinks areas={areas} />
          </ShellPaper>
        )}
      </aside>
    </main>
  );
}
