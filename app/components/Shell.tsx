// What the server sends before any script runs, so a slow connection never shows a blank page:
// what Zij is, the preset areas as plain links, and, for a preset URL, that area's headline facts.
// No hooks: it renders on the server, and Explore and Downloads show it until their own data is in.

import type { AreaIndexEntry } from "@/lib/data";
import type { AreaFacts } from "@/lib/facts";

export const INTRO = [
  "Zij puts 26 years of satellite fire detections on one scale. MODIS has watched fires since 2000 and VIIRS since 2012, and VIIRS sees many more of them.",
  "Both records are counted in one unit, hotspot-days (VIIRS-equivalent), so a year before 2012 can be read against a year after it: the busiest months, the critical period, and how this month compares with the past.",
];

export function AreaLinks({ areas, base = "/" }: { areas: AreaIndexEntry[]; base?: string }) {
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

export function FactsBlock({ facts }: { facts: AreaFacts }) {
  return (
    <div className="panel-body shell-facts">
      <p className="eyebrow">{facts.country}</p>
      <h2>{facts.name}</h2>
      <p className="note">Unit: {facts.unitLabel}. Data to {facts.lastFullDay}. The calendar and charts are loading.</p>
      <section className="block">
        <h3>Busiest months</h3>
        <p>{facts.busiestMonths.join(", ")}. Season: {facts.season}.</p>
      </section>
      {facts.thisMonth && (
        <section className="block">
          <h3>This month against the median</h3>
          <p>{facts.thisMonth}</p>
        </section>
      )}
      {facts.anomalies.length > 0 && (
        <section className="block">
          <h3>Most unusual seasons</h3>
          <ul className="plain">
            {facts.anomalies.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

export function IntroBlock({ areas, base = "/" }: { areas: AreaIndexEntry[]; base?: string }) {
  return (
    <div className="panel-body">
      <p className="eyebrow">Zij</p>
      <h2>26 years of fire, on one scale</h2>
      {INTRO.map((text) => <p key={text}>{text}</p>)}
      <p>Choose an area:</p>
      <AreaLinks areas={areas} base={base} />
    </div>
  );
}

/** The whole Explore page as the server sends it, before scripts: used as the Suspense fallback. */
export function ExploreShell({ areas, facts }: { areas: AreaIndexEntry[]; facts: AreaFacts | null }) {
  return (
    <main className={`explore${facts ? " has-area" : ""}`}>
      <div className="toolbar">
        <h1 className="shell-title">Zij: fire on one scale</h1>
      </div>
      <div className="stage">
        <div className="map map-waiting" role="status">Loading the map…</div>
        <aside className="panel">{facts ? <FactsBlock facts={facts} /> : <IntroBlock areas={areas} />}</aside>
      </div>
    </main>
  );
}
