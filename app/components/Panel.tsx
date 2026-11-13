"use client";

// Results: one sheet of paper per answer, stacked, each numbered with an abjad letter like the
// chapters of a zij. Figures, charts with their keys, and the actions; the long explanations are in
// the full report (the brief) and on How it works. The tables are always last.
//
//   verdict       the badge and its sentence, the intensity line, the area's finding
//   day           (a day chosen) its detections, per sensor
//   this month    so far, against the median of the same days
//   calendar      years down, months across; a month opens its weeks in the tables
//   typical year  the weekly median, the usual range, a chosen year, the critical period
//   seasons       as recorded, or on one scale
//   busiest       months and years, ranked
//   unusual       the seasons and months outside the usual range
//   tables        the weeks of the chosen month, the day per satellite, the seasons

import Link from "next/link";
import type { ReactNode } from "react";
import type { Area } from "@/lib/data";
import type { DayResult } from "@/lib/dayData";
import { rawByMonth } from "@/lib/derive";
import { MONTHS_SHORT, num, ymLabel } from "@/lib/format";
import type { View } from "@/lib/url";
import type { Verdict } from "@/lib/verdict";
import Calendar from "./Calendar";
import { DayFigures, DayTable } from "./DayPanel";
import Paper from "./Paper";
import SeriesChart from "./SeriesChart";
import { VerdictLine } from "./Shell";
import TypicalYear from "./TypicalYear";
import { Lever, Select, UnitTerm } from "./ui";

const ABJAD = ["أ", "ب", "ج", "د", "ه", "و", "ز", "ح", "ط", "ي", "ك"];

/** The anchor of each paper: `view` in the address brings it into view. */
export const paperId = (view: View | "verdict" | "day" | "month" | "tables") => `paper-${view}`;

export function ResultPaper({ letter, title, id, children, extra }: { letter: string; title: ReactNode; id: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <Paper as="section" kind="sheet" id={id} seed={id} className="result" aria-labelledby={`${id}-title`}>
      <header className="result-head">
        <span className="abjad" aria-hidden="true">{letter}</span>
        <h3 className="plate-mark" id={`${id}-title`}>{title}</h3>
        {extra}
      </header>
      {children}
    </Paper>
  );
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length === 0 ? NaN : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const band = (lo: number | null, hi: number | null) => (lo === null || hi === null ? "measured" : `${num(lo)}–${num(hi)}`);
/** "+38%", "−52%", "×2.4": a value against its normal, as a figure. */
function against(value: number, normal: number): string {
  if (!(normal > 0)) return value > 0 ? "above 0" : "0";
  const pct = (100 * (value - normal)) / normal;
  if (pct >= 100) return `×${num(value / normal, 1)}`;
  return `${pct >= 0 ? "+" : "−"}${num(Math.abs(pct))}%`;
}
const seasonWords = (season: number[]) => (season.length ? `${MONTHS_SHORT[season[0] - 1]}–${MONTHS_SHORT[season[season.length - 1] - 1]}` : "");
const Key = ({ items }: { items: { mark: string; label: ReactNode }[] }) => (
  <ul className="key">{items.map((item, k) => <li key={k}><i className={`key-${item.mark}`} aria-hidden="true" />{item.label}</li>)}</ul>
);

// ------------------------------------------------------------------ this month

function ThisMonth({ area }: { area: Area }) {
  const t = area.this_month;
  if (t.value_to_date === null || t.median_to_date === undefined) return null;
  const top = Math.max(t.value_to_date, t.p75_to_date ?? 0, t.median_to_date) * 1.15 || 1;
  const pct = (x: number) => `${Math.min(100, (100 * x) / top)}%`;
  return (
    <>
      <dl className="figures">
        <div className="figure-main"><dt>{MONTHS_SHORT[t.month - 1]} {t.year}, days 1–{t.days_so_far}</dt><dd>{num(t.value_to_date, 1)}</dd></div>
        <div><dt>Median, same days</dt><dd>{num(t.median_to_date, 1)}</dd><dd className="figure-sub">{area.climatology.baseline_years[0]}–{area.climatology.baseline_years[1]}</dd></div>
        <div><dt>Against it</dt><dd>{against(t.value_to_date, t.median_to_date)}</dd></div>
      </dl>
      <div className="gauge" role="img" aria-label={`${num(t.value_to_date, 1)} so far; median ${num(t.median_to_date, 1)}; middle half of past years ${num(t.p25_to_date, 1)} to ${num(t.p75_to_date, 1)}`}>
        <span className="gauge-range" style={{ left: pct(t.p25_to_date ?? 0), width: `calc(${pct(t.p75_to_date ?? 0)} - ${pct(t.p25_to_date ?? 0)})` }} />
        <span className="gauge-median" style={{ left: pct(t.median_to_date) }} />
        <span className="gauge-now" style={{ width: pct(t.value_to_date) }} />
      </div>
      <Key items={[{ mark: "now", label: "so far" }, { mark: "median", label: "median" }, { mark: "range", label: `middle half of past years (${num(t.p25_to_date, 1)}–${num(t.p75_to_date, 1)})` }]} />
    </>
  );
}

// ------------------------------------------------------------------ busiest

function Busiest({ area, from, to }: { area: Area; from: string; to: string }) {
  const m = area.months;
  const clim = area.climatology.months;
  const [b0, b1] = area.climatology.baseline_years;
  const months = clim.month.map((k, i) => ({ k, median: clim.median[i] })).sort((a, b) => b.median - a.median);
  const topMonth = months[0]?.median || 1;
  const byYear = new Map<number, { total: number; n: number; converted: boolean }>();
  m.year.forEach((y, i) => {
    const ym = `${y}-${String(m.month[i]).padStart(2, "0")}`;
    if (ym < from || ym > to || !m.complete[i]) return;
    const row = byYear.get(y) ?? { total: 0, n: 0, converted: false };
    row.total += m.value[i];
    row.n += 1;
    row.converted ||= m.source[i] !== "VIIRS";
    byYear.set(y, row);
  });
  const years = [...byYear.entries()].filter(([, r]) => r.n === 12).map(([year, r]) => ({ year, ...r })).sort((a, b) => b.total - a.total);
  const topYear = years[0]?.total || 1;
  return (
    <div className="two-up">
      <div>
        <p className="t-label sub-head">Months · median {b0}–{b1}</p>
        <ol className="bars">
          {months.map((row) => (
            <li key={row.k}>
              <span className="bars-label">{MONTHS_SHORT[row.k - 1]}</span>
              <span className="bars-track"><span className="bars-fill" style={{ width: `${(100 * row.median) / topMonth}%` }} /></span>
              <span className="bars-value">{num(row.median)}</span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="t-label sub-head">Whole years · total</p>
        {years.length === 0 ? <p className="marginal">No whole year in the chosen dates.</p> : (
          <ol className="bars">
            {years.map((row) => (
              <li key={row.year}>
                <span className="bars-label">{row.year}{row.converted ? <span className="converted-mark" title="holds months converted from MODIS" /> : null}</span>
                <span className="bars-track"><span className="bars-fill" style={{ width: `${(100 * row.total) / topYear}%` }} /></span>
                <span className="bars-value">{num(row.total)}</span>
              </li>
            ))}
          </ol>
        )}
        {years.some((y) => y.converted) && <Key items={[{ mark: "converted", label: "holds months converted from MODIS" }]} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ unusual

function Unusual({ area, from, to, onMonth }: { area: Area; from: string; to: string; onMonth: (ym: string) => void }) {
  const s = area.seasons;
  const [b0, b1] = area.climatology.baseline_years;
  const normalSeason = median(s.value.filter((_, i) => s.year[i] >= b0 && s.year[i] <= b1));
  const fromYear = Number(from.slice(0, 4)), toYear = Number(to.slice(0, 4));
  const seasons = s.year.map((year, i) => ({ year, i })).filter(({ year, i }) => s.flag[i] && year >= fromYear && year <= toYear).sort((a, b) => b.year - a.year);
  const m = area.months;
  const clim = area.climatology.months;
  const busiest = Math.max(...clim.median);
  const months = m.year
    .map((year, i) => ({ ym: `${year}-${String(m.month[i]).padStart(2, "0")}`, i }))
    .filter(({ ym, i }) => m.flag[i] && ym >= from && ym <= to && clim.median[m.month[i] - 1] >= 0.1 * busiest)
    .sort((a, b) => Math.abs(m.anomaly_pct[b.i] ?? 0) - Math.abs(m.anomaly_pct[a.i] ?? 0))
    .slice(0, 12);
  return (
    <div className="two-up">
      <div>
        <p className="t-label sub-head">Seasons · normal {num(normalSeason)}</p>
        {seasons.length === 0 ? <p className="marginal">None in the chosen dates.</p> : (
          <table className="figure-rows">
            <tbody>
              {seasons.map(({ year, i }) => (
                <tr key={year} className={s.value[i] >= normalSeason ? "is-high" : "is-low"}>
                  <th scope="row">{year}{s.source[i] !== "VIIRS" ? <span className="converted-mark" title="converted from MODIS" /> : null}</th>
                  <td>{num(s.value[i])}</td>
                  <td>{against(s.value[i], normalSeason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <p className="t-label sub-head">Months · against their median</p>
        {months.length === 0 ? <p className="marginal">None in the chosen dates.</p> : (
          <table className="figure-rows">
            <tbody>
              {months.map(({ ym, i }) => {
                const normal = clim.median[m.month[i] - 1];
                return (
                  <tr key={ym} className={m.value[i] >= normal ? "is-high" : "is-low"}>
                    <th scope="row"><button type="button" className="catchword" onClick={() => onMonth(ym)} title="Its weeks, in the tables">{MONTHS_SHORT[m.month[i] - 1]} {m.year[i]}</button></th>
                    <td>{num(m.value[i])}</td>
                    <td>{against(m.value[i], normal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the tables

function WeeksTable({ area, ym, onClose }: { area: Area; ym: string; onClose: () => void }) {
  const w = area.weeks;
  const rows: number[] = [];
  w.week_start.forEach((start, i) => {
    const thursday = new Date(`${start}T00:00:00Z`);
    thursday.setUTCDate(thursday.getUTCDate() + 3);
    if (thursday.toISOString().slice(0, 7) === ym) rows.push(i);
  });
  const m = area.months;
  const mi = m.year.findIndex((y, i) => `${y}-${String(m.month[i]).padStart(2, "0")}` === ym);
  const satellites = Object.entries(area.satellites).filter(([, s]) => rows.some((i) => s.days[i] !== null));
  const raw = rawByMonth(area).get(ym);
  return (
    <div className="table-block">
      <div className="table-head">
        <p className="t-label">{ymLabel(ym)}, week by week</p>
        <button type="button" className="catchword" onClick={onClose}>Close</button>
      </div>
      {mi >= 0 && (
        <dl className="figures is-small">
          <div><dt>Month</dt><dd>{num(m.value[mi])}</dd><dd className="figure-sub">{m.source[mi] === "VIIRS" ? "measured" : `likely ${band(m.lo[mi], m.hi[mi])}`}</dd></div>
          <div><dt>Raw MODIS</dt><dd>{num(raw?.modis)}</dd></div>
          <div><dt>Raw VIIRS</dt><dd>{num(raw?.viirs)}</dd></div>
          {!m.complete[mi] && <div><dt>Days with data</dt><dd>{m.days_with_data[mi]}</dd></div>}
        </dl>
      )}
      <div className="table-scroll jadwal-box">
        <table>
          <thead>
            <tr><th>Week of</th><th>Value</th><th>Likely</th><th>Source</th>{satellites.map(([name]) => <th key={name}>{name}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={w.week_start[i]}>
                <td>{w.week_start[i]}</td>
                <td><strong>{num(w.value[i], 1)}</strong></td>
                <td>{band(w.lo[i], w.hi[i])}</td>
                <td>{w.source[i] === "MODIS" ? "MODIS, converted" : w.source[i]}</td>
                {satellites.map(([name, s]) => (
                  <td key={name}>{s.days[i] === null ? "not flying" : `${num(s.fire_days[i])} (${num(s.hotspots[i])})${(s.days[i] as number) < 7 ? `, ${s.days[i]} d` : ""}`}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-foot">Per satellite: fire cell-days (FIRMS detections); d = days flown, when under 7.</p>
    </div>
  );
}

function SeasonsTable({ area, from, to }: { area: Area; from: string; to: string }) {
  const s = area.seasons;
  const fromYear = Number(from.slice(0, 4)), toYear = Number(to.slice(0, 4));
  const rows = s.year.map((_, i) => i).filter((i) => s.year[i] >= fromYear && s.year[i] <= toYear).reverse();
  return (
    <div className="table-block">
      <div className="table-head"><p className="t-label">Seasons, {seasonWords(area.fit.season)}</p></div>
      <div className="table-scroll jadwal-box">
        <table>
          <thead><tr><th>Year</th><th>On one scale</th><th>Likely</th><th>Source</th><th>Raw MODIS</th><th>Raw VIIRS</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={s.year[i]}>
                <td>{s.year[i]}</td>
                <td><strong>{num(s.value[i])}</strong></td>
                <td>{band(s.lo[i], s.hi[i])}</td>
                <td>{s.source[i] === "MODIS" ? (s.terra_only[i] ? "MODIS (Terra), converted" : "MODIS, converted") : s.source[i]}</td>
                <td>{num(s.modis[i])}</td>
                <td>{num(s.viirs[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RawTable({ area }: { area: Area }) {
  const w = area.weeks;
  const byYear = new Map<number, { modis: number; viirs: number | null; modisHot: number; viirsHot: number | null }>();
  w.year.forEach((year, i) => {
    const row = byYear.get(year) ?? { modis: 0, viirs: null, modisHot: 0, viirsHot: null };
    row.modis += w.modis[i] ?? 0;
    row.modisHot += w.modis_hotspots[i] ?? 0;
    if (w.viirs[i] !== null) {
      row.viirs = (row.viirs ?? 0) + (w.viirs[i] as number);
      row.viirsHot = (row.viirsHot ?? 0) + (w.viirs_hotspots[i] ?? 0);
    }
    byYear.set(year, row);
  });
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  return (
    <div className="table-block">
      <div className="table-head"><p className="t-label">Raw counts per year, not on one scale</p></div>
      <div className="table-scroll jadwal-box">
        <table>
          <thead><tr><th>Year</th><th>MODIS</th><th>VIIRS</th></tr></thead>
          <tbody>
            {years.map(([year, row]) => (
              <tr key={year}>
                <td>{year}</td>
                <td>{num(row.modis, 1)} ({num(row.modisHot)})</td>
                <td>{row.viirs === null ? "no data" : `${num(row.viirs, 1)} (${num(row.viirsHot)})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-foot">Fire cell-days per sensor (FIRMS detections).</p>
    </div>
  );
}

// ------------------------------------------------------------------ results

interface Props {
  area: Area;
  verdict: Verdict | null; // the area's, when no day is chosen
  day: string | null;
  dayVerdict: { week: Verdict | null; month: Verdict | null };
  dayResult: DayResult | null;
  dayLoading: boolean;
  loadingText?: string | null;
  onCloseDay: () => void;
  finding?: { sentence: string; note?: string } | null; // the area's one sentence from the findings
  note?: string;
  drawn?: boolean; // a drawn area, fitted in the browser
  draft?: boolean; // still being drawn: no bands yet
  recorded: boolean; // the Seasons paper: as recorded, or on one scale
  onRecorded: (recorded: boolean) => void;
  from: string;
  to: string;
  month: string | null; // the month whose weeks are in the tables
  year: number | null; // the year drawn over the typical year
  onMonth: (ym: string | null) => void;
  onYear: (year: number | null) => void;
  reportHref: string | null;
}

export default function Panel({ area, verdict, day, dayVerdict, dayResult, dayLoading, loadingText, onCloseDay, finding = null, note, draft,
  recorded, onRecorded, from, to, month, year, onMonth, onYear, reportHref }: Props) {
  let k = 0;
  const letter = () => ABJAD[k++ % ABJAD.length];
  const [b0, b1] = area.climatology.baseline_years;
  const lastYear = Number(area.last_full_day.slice(0, 4));
  const firstYear = area.weeks.year[0] ?? lastYear;
  const chartYear = year && year >= firstYear && year <= lastYear ? year : lastYear;
  const seasonBand = area.bands.season_pct;
  const fitted = area.fit.mode !== "none";
  const s = area.seasons;
  const normal = median(s.value.filter((_, i) => s.year[i] >= b0 && s.year[i] <= b1));
  const dayResultNow = day && dayResult && dayResult.view.date === day ? dayResult : null;
  const showMonth = (ym: string) => {
    onMonth(ym);
    setTimeout(() => document.getElementById(paperId("tables"))?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };

  return (
    <>
      <ResultPaper letter={letter()} id={paperId(day ? "day" : "verdict")} title={day ? `The day · ${Number(day.slice(8, 10))} ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}` : "Verdict"}
        extra={day ? <button type="button" className="catchword result-close" onClick={onCloseDay}>Close the day</button> : undefined}>
        {!day && verdict && <VerdictLine verdict={verdict} />}
        {day && dayVerdict.week && <VerdictLine verdict={dayVerdict.week} />}
        {day && dayVerdict.month && <VerdictLine verdict={dayVerdict.month} />}
        {day && <DayFigures area={area} result={dayResultNow} loading={dayLoading} loadingText={loadingText} />}
        {!day && finding && <p className="finding-line">{finding.sentence}</p>}
        {!day && finding?.note && <p className="marginal">{finding.note}</p>}
        {!day && note && <p className="marginal is-fire">{note}</p>}
        {!fitted && <p className="erratum">Too few fires here to convert MODIS ({num(area.fit.n_fire_weeks)} fire weeks of the 30 needed): raw counts only.</p>}
        {area.fit.mode === "blend" && (
          <p className="erratum">Small area: before 2012 its values lean on {area.country}&rsquo;s fit{seasonBand[0] !== null ? `, a season within ${num(seasonBand[0])}% to +${num(seasonBand[1])}%` : ""}.</p>
        )}
        {draft && <p className="erratum">Still drawing: the bands come when the shape is finished.</p>}
        <dl className="figures is-small is-quiet">
          <div><dt>Cells of 0.1°</dt><dd>{num(area.n_cells)}</dd></div>
          <div><dt>Unit</dt><dd><UnitTerm /></dd></div>
          <div><dt>Data to</dt><dd>{area.last_full_day}</dd></div>
        </dl>
      </ResultPaper>

      {fitted && area.this_month.value_to_date !== null && area.this_month.median_to_date !== undefined && (
        <ResultPaper letter={letter()} id={paperId("month")} title="This month so far">
          <ThisMonth area={area} />
        </ResultPaper>
      )}

      {fitted && (
        <>
          <ResultPaper letter={letter()} id={paperId("calendar")} title={<>Calendar · <UnitTerm /> per month</>}>
            <div className="calendar-scroll">
              <Calendar area={area} from={from} to={to} labelSize={17} selected={month} onSelect={(ym) => (ym === month ? onMonth(null) : showMonth(ym))} />
            </div>
          </ResultPaper>

          <ResultPaper letter={letter()} id={paperId("typical")} title={<>Typical year · <UnitTerm /> per week</>}
            extra={<Select small label="Year drawn in red" value={String(chartYear)} onChange={(v) => onYear(Number(v) === lastYear ? null : Number(v))}
              options={Array.from({ length: lastYear - firstYear + 1 }, (_, n) => ({ value: String(lastYear - n), label: String(lastYear - n) }))} />}>
            <TypicalYear area={area} year={chartYear} />
            <Key items={[
              { mark: "median", label: `median week, ${b0}–${b1}` },
              { mark: "band", label: "8 in 10 years" },
              { mark: "year", label: `${chartYear}${chartYear === lastYear ? ", so far" : ""}` },
              { mark: "critical", label: `critical period: ${area.climatology.critical_weeks.length} weeks, ${Math.round(area.climatology.critical_share * 100)}% of a year` },
            ]} />
          </ResultPaper>

          <ResultPaper letter={letter()} id={paperId("series")} title={<>Seasons · {seasonWords(area.fit.season)}</>}
            extra={<Lever label="Which record" off="As recorded" on="On one scale" checked={!recorded} onChange={(on) => onRecorded(!on)} />}>
            <SeriesChart area={area} fromYear={Number(from.slice(0, 4))} toYear={Number(to.slice(0, 4))} normal={normal} recorded={recorded} />
            {recorded
              ? <Key items={[{ mark: "modis", label: "MODIS, as recorded" }, { mark: "viirs", label: "VIIRS, as recorded" }]} />
              : <Key items={[{ mark: "viirs", label: "on one scale, VIIRS terms" }, { mark: "whisker", label: "likely range, converted year" }, { mark: "dashed", label: `median season ${b0}–${b1}` }]} />}
          </ResultPaper>

          <ResultPaper letter={letter()} id={paperId("ranked")} title="Busiest">
            <Busiest area={area} from={from} to={to} />
          </ResultPaper>

          <ResultPaper letter={letter()} id={paperId("anomalies")} title="Unusual · outside 8 in 10 years">
            <Unusual area={area} from={from} to={to} onMonth={showMonth} />
          </ResultPaper>
        </>
      )}

      <ResultPaper letter={letter()} id={paperId("tables")} title="Tables">
        {day && <DayTable result={dayResultNow} />}
        {fitted && month && <WeeksTable area={area} ym={month} onClose={() => onMonth(null)} />}
        {fitted ? <SeasonsTable area={area} from={from} to={to} /> : <RawTable area={area} />}
      </ResultPaper>

      {reportHref && !draft && (
        <p className="report">
          <Link className="stamp" href={reportHref}>View full report</Link>
        </p>
      )}
    </>
  );
}

