// The frame every error page shares: the top strip, the drawing, what happened in plain words, a
// pass report in the satellites' terms, and the ways on. No hooks, so it renders in error
// boundaries, in not-found and in global-error alike. Styles: app/errors.css.

import type { ReactNode } from "react";
import { Seal } from "./Shell";

export type LogRow = { label: string; value: ReactNode; bad?: boolean };

export function ErrorStrip() {
  return (
    <header className="strip paper">
      {/* Plain links: an error page should not depend on the client router to get out of it. */}
      <a href="/" className="brand" aria-label="Zij, home"><Seal /></a>
      <nav aria-label="Pages"><a href="/explore">Explore</a><a href="/downloads">Downloads</a><a href="/how-it-works">How it works</a></nav>
    </header>
  );
}

export function ErrorCredits() {
  return (
    <footer className="credits">
      Fire data: NASA FIRMS (MODIS and VIIRS active fires). Imagery: NASA GIBS. Map: made with Natural Earth.
      Zij is not affiliated with or endorsed by NASA.
    </footer>
  );
}

export default function ErrorPage({ code, title, art, children, log, actions, strip = true, credits = true, variant }: {
  code: string;
  title: string;
  art: ReactNode;
  children: ReactNode;
  log: LogRow[];
  actions: ReactNode;
  /** The top strip. Off where a layout already draws one. */
  strip?: boolean;
  /** The credits line. Off inside the site layout, which already prints it. */
  credits?: boolean;
  variant: "cut" | "ink" | "cloud" | "loose";
}) {
  return (
    <>
      {strip && <ErrorStrip />}
      <main className={`err err-${variant}`}>
        <div className="err-inner">
          <figure className="err-art">{art}</figure>
          <div className="err-text">
            <p className="err-code">{code}</p>
            <h1>{title}</h1>
            {children}
            <section className="err-log" aria-label="Pass report">
              <p className="err-log-head">Pass report</p>
              <dl>
                {log.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd className={row.bad ? "is-bad" : undefined}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <div className="err-actions">{actions}</div>
          </div>
        </div>
      </main>
      {credits && <ErrorCredits />}
    </>
  );
}
