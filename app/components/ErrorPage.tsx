// The frame every error page shares, in the design system's Night, as the landing page opens: the
// sky with its stars and the lamp's glow, the words in light ink on the night, and the drawing on a
// sheet of Folio paper pinned beside them (the landing's plates: "illustration · not data"). Then
// a pass report in the satellites' terms, and the ways on. No hooks, so it renders in error
// boundaries, in not-found and in global-error alike. Styles: app/errors.css; colours: lib/tokens.ts.

import type { ReactNode } from "react";
import { Seal } from "./Shell";

export type LogRow = { label: string; value: ReactNode; bad?: boolean };

export function ErrorStrip() {
  return (
    <header className="strip paper err-strip">
      {/* Plain links: an error page should not depend on the client router to get out of it. */}
      <a href="/" className="brand" aria-label="Zij, home"><Seal /></a>
      <nav aria-label="Pages"><a href="/explore">Explore</a><a href="/downloads">Downloads</a><a href="/how-it-works">How it works</a></nav>
    </header>
  );
}

export function ErrorCredits() {
  return (
    <footer className="credits err-credits">
      Fire data: NASA FIRMS (MODIS and VIIRS active fires). Imagery: NASA GIBS. Map: made with Natural Earth.
      Zij is not affiliated with or endorsed by NASA.
    </footer>
  );
}

export default function ErrorPage({ code, title, art, plate, children, log, actions, strip = true, credits = true, variant }: {
  code: string;
  title: string;
  art: ReactNode;
  /** The plate's own small caption, under the drawing. */
  plate: string;
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
    <div className={`err-night err-${variant}`} data-theme="night">
      {strip && <ErrorStrip />}
      <main className="err">
        <div className="err-sky" aria-hidden="true"><i className="err-stars" /><i className="err-stars is-far" /><i className="err-lamp" /></div>
        <div className="err-inner">
          <figure className="err-plate paper" data-theme="folio">
            <i className="err-pin is-left" aria-hidden="true" />
            <i className="err-pin is-right" aria-hidden="true" />
            <span className="err-plate-mark">illustration · not data</span>
            {art}
            <figcaption className="err-plate-caption">{plate}</figcaption>
          </figure>
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
    </div>
  );
}
