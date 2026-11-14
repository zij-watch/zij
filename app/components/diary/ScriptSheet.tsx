// /studio/diary?script: every line of Hudhud's Fire Diary by level, filled with the real numbers,
// with its word count and anything the checker would fail. A server component: no script on the page.

import type { ReactNode } from "react";
import { checkScript, type Checked, type Row, type Segment } from "@/lib/diary/check";
import { claims, picks, placeholders, type DiaryNumbers, type Fill } from "@/lib/diary/numbers";
import { RUNNING_HEAD, SCRIPT, UI_LABELS, type Beat } from "@/lib/diary/script";

const WHO = { hudhud: "Hudhud", modis: "MODIS", viirs: "VIIRS" } as const;

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}, ${iso.slice(11, 16)} UTC`;
};

function Segments({ segments }: { segments: Segment[] }) {
  return segments.map((s, i) =>
    "fill" in s ? <span key={i} className="ds-fill" title={`{${s.fill.name}} from ${s.fill.from}`}>{s.text}</span> : <span key={i}>{s.text}</span>,
  );
}

/** Stage directions get their {placeholders} filled too, as plain text. */
const plainFill = (t: string, ph: Record<string, Fill>) => t.replace(/\{([A-Za-z]+)\}/g, (m, k: string) => ph[k]?.value ?? m);

function Count({ t }: { t: Checked }) {
  return (
    <span className={`ds-count t-figure${t.problems.length ? " is-over" : ""}`}>
      {t.words}/{t.limit}
    </span>
  );
}

function Problems({ t }: { t: Checked }) {
  if (!t.problems.length) return null;
  return <p className="erratum ds-problem">{t.problems.join("; ")}</p>;
}

function Edited({ beat }: { beat: { was?: string; why?: string } }) {
  if (!beat.was && !beat.why) return null;
  return (
    <p className="ds-was">
      <span className="t-eyebrow">changed</span> {beat.was && beat.was !== "(none)" ? <>v3: &ldquo;{beat.was}&rdquo; </> : beat.was === "(none)" ? <>new. </> : null}
      {beat.why}
    </p>
  );
}

function Texts({ texts, pick }: { texts: Checked[]; pick?: string }) {
  return texts.map((t, i) => (
    <div key={i} className={`ds-text${t.inUse ? "" : " is-unused"}`}>
      <p className="ds-words">
        <Segments segments={t.segments} />
        {t.option && <span className="ds-option"> {t.inUse ? `in use: the data says ${t.option}` : `if the data says ${t.option}`}{pick ? ` (${pick})` : ""}</span>}
      </p>
      <Problems t={t} />
    </div>
  ));
}

function BeatRow({ row, ph }: { row: Row; ph: Record<string, Fill> }) {
  const b: Beat = row.beat;
  const count = row.texts.find((t) => t.inUse) ?? row.texts[0];
  const pick = "say" in b && typeof b.text !== "string" ? b.text.pick : "line" in b && typeof b.line !== "string" ? b.line.pick : undefined;
  let who: ReactNode, body: ReactNode, cls = "";
  if ("say" in b) {
    who = <span className={`ds-who is-${b.say}`}>{WHO[b.say]}</span>;
    body = (
      <>
        {b.when && <p className="ds-when">{plainFill(b.when, ph)}</p>}
        <Texts texts={row.texts} pick={pick} />
      </>
    );
    cls = "is-say";
  } else if ("line" in b) {
    who = <span className="ds-role">{b.role}</span>;
    body = <Texts texts={row.texts} pick={pick} />;
    cls = "is-line";
  } else if ("label" in b) {
    who = <span className="ds-role">{b.role}</span>;
    body = <Texts texts={row.texts} />;
    cls = "is-label";
  } else {
    who = <span className="ds-role">{"act" in b ? "player" : "scene"}</span>;
    body = <p className="ds-direction">{plainFill("act" in b ? b.act : b.show, ph)}</p>;
    cls = "act" in b ? "is-act" : "is-show";
  }
  return (
    <li className={`ds-beat ${cls}`}>
      {who}
      <div>
        {body}
        <Edited beat={b} />
      </div>
      {count ? <Count t={count} /> : <span />}
    </li>
  );
}

export default function ScriptSheet({ numbers }: { numbers: DiaryNumbers }) {
  const ph = placeholders(numbers);
  const report = checkScript({ chapters: SCRIPT, runningHead: RUNNING_HEAD, ui: UI_LABELS }, ph, picks(numbers), claims(numbers));
  const lines = report.rows.reduce((s, r) => s + r.texts.length, 0) + report.notes.length + RUNNING_HEAD.length + UI_LABELS.length;
  const changed = report.rows.filter((r) => r.beat.was || r.beat.why).length + SCRIPT.filter((c) => c.note?.why).length;

  return (
    <main className="ds" data-theme="folio">
      <header className="ds-head">
        <p className="t-eyebrow">studio · hudhud&rsquo;s fire diary</p>
        <h1>The script</h1>
        <p className="ds-lede">
          Every word the game shows, by level, with its word count. Edit them in <code>app/lib/diary/script.ts</code>. Numbers are filled from the data of {when(numbers.builtAt)}: hover one to see where it comes from.
        </p>
        {report.issues.length ? (
          <div className="ds-issues">
            <p className="t-eyebrow">the checker would fail the build</p>
            <ul>{report.issues.map((i, k) => <li key={k} className="erratum">{i}</li>)}</ul>
          </div>
        ) : (
          <p className="ds-pass jadwal-box">
            {lines} lines and labels within the word budget. {changed} changed from the v3 script, each marked <span className="t-eyebrow">changed</span>.
          </p>
        )}
        <dl className="ds-budget">
          <div><dt>a line</dt><dd>12 words</dd></div>
          <div><dt>lines in a row</dt><dd>2, then the player acts</dd></div>
          <div><dt>a label</dt><dd>5 words</dd></div>
          <div><dt>for grown-ups</dt><dd>1 sentence, 25 words</dd></div>
          <div><dt>numbers in a line</dt><dd>1</dd></div>
        </dl>
      </header>

      <section className="ds-chapter">
        <h2>The running head</h2>
        <p className="ds-head-words">{RUNNING_HEAD.join(" · ")}</p>
      </section>

      {SCRIPT.map((ch) => {
        const note = report.notes.find((n) => n.chapter === ch.title);
        return (
          <section key={ch.id} className="ds-chapter">
            <h2>{ch.title}</h2>
            {ch.parts.map((part) => (
              <div key={part.id} className="ds-part">
                {ch.parts.length > 1 && (
                  <h3>
                    <span className="t-figure">{part.id}</span> {part.title} {part.bonus && <span className="t-eyebrow ds-bonus">bonus</span>}
                  </h3>
                )}
                <ol className="ds-beats">
                  {report.rows.filter((r) => r.chapter === ch.title && r.part === part.id).map((r, i) => <BeatRow key={i} row={r} ph={ph} />)}
                </ol>
              </div>
            ))}
            {ch.note && note && (
              <div className="ds-note slip">
                <p className="t-eyebrow">for grown-ups</p>
                {note.texts.map((t, i) => (
                  <div key={i} className="ds-note-row">
                    <p className="ds-words"><Segments segments={t.segments} /></p>
                    <Count t={t} />
                  </div>
                ))}
                {note.texts.map((t, i) => <Problems key={i} t={t} />)}
                <Edited beat={ch.note} />
              </div>
            )}
          </section>
        );
      })}

      <section className="ds-chapter">
        <h2>Labels outside the levels</h2>
        <ol className="ds-beats">
          {UI_LABELS.map((u, i) => (
            <li key={i} className="ds-beat is-label">
              <span className="ds-role">{u.role}</span>
              <div><p className="ds-words">{u.label}</p><p className="ds-direction">{u.what}</p></div>
              <Count t={report.ui[i]} />
            </li>
          ))}
        </ol>
      </section>

      <section className="ds-chapter">
        <h2>What the data must still say</h2>
        <p className="ds-lede">The script makes these claims. If a rebuild of the data takes one back, the check fails and the line has to change.</p>
        <ul className="ds-claims">
          {claims(numbers).map((c, i) => <li key={i} className={c.holds ? "" : "erratum"}><span className="t-eyebrow">{c.holds ? "holds" : "no longer"}</span> {c.claim}</li>)}
        </ul>
      </section>

      <section className="ds-chapter">
        <h2>The numbers</h2>
        <table className="ds-numbers">
          <thead><tr><th>Placeholder</th><th>Shows</th><th>From</th></tr></thead>
          <tbody>
            {Object.entries(ph).map(([k, f]) => (
              <tr key={k}><td><code>{`{${k}}`}</code></td><td className="t-figure">{f.value}</td><td>{f.from}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
