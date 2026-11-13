"use client";

import type { Area } from "@/lib/data";
import { MONTHS, againstNormal, num, sourceWords, ymLabel } from "@/lib/format";
import type { Theme } from "@/lib/tokens";
import { VIEWS, type View } from "@/lib/url";
import Calendar from "./Calendar";
import TypicalYear from "./TypicalYear";

const VIEW_LABELS: Record<View, string> = { calendar: "Calendar", typical: "Typical year", ranked: "Busiest", anomalies: "Anomalies" };

interface Props {
  area: Area;
  theme: Theme;
  from: string;
  to: string;
  view: View;
  month: string | null;
  onView: (view: View) => void;
  onMonth: (ym: string | null) => void;
}

function seasonWords(season: number[]): string {
  return `${MONTHS[season[0] - 1]} to ${MONTHS[season[season.length - 1] - 1]}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length === 0 ? NaN : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function band(lo: number | null, hi: number | null): string {
  return lo === null || hi === null ? "" : `${num(lo)} to ${num(hi)}`;
}

// ------------------------------------------------------------------ this month

function ThisMonth({ area }: { area: Area }) {
  const t = area.this_month;
  if (t.value_to_date === null || t.median_to_date === undefined) return null;
  const top = Math.max(t.value_to_date, t.p75_to_date ?? 0, t.median_to_date) * 1.15 || 1;
  const pct = (x: number) => `${Math.min(100, (100 * x) / top)}%`;
  return (
    <section className="block">
      <h3>This month against the median</h3>
      <p>
        {MONTHS[t.month - 1]} {t.year}, first {t.days_so_far} days: <strong>{num(t.value_to_date, 1)}</strong> {area.unit_label}.
        The median for the same days of {area.climatology.baseline_years[0]} to {area.climatology.baseline_years[1]} is{" "}
        {num(t.median_to_date, 1)}, so this month is <strong>{againstNormal(t.value_to_date, t.median_to_date)}</strong>.
        Half of the years fall between {num(t.p25_to_date, 1)} and {num(t.p75_to_date, 1)}.
      </p>
      <div className="gauge" aria-hidden="true">
        <span className="gauge-range" style={{ left: pct(t.p25_to_date ?? 0), width: `calc(${pct(t.p75_to_date ?? 0)} - ${pct(t.p25_to_date ?? 0)})` }} />
        <span className="gauge-median" style={{ left: pct(t.median_to_date) }} />
        <span className="gauge-now" style={{ width: pct(t.value_to_date) }} />
      </div>
      <p className="note">Bar: this month so far. Line: the median. Shaded: the middle half of past years.</p>
    </section>
  );
}

// ------------------------------------------------------------------ weekly detail

function WeekDetail({ area, ym, onClose }: { area: Area; ym: string; onClose: () => void }) {
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
  return (
    <section className="block detail">
      <div className="detail-head">
        <h3>{ymLabel(ym)}, week by week</h3>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {mi >= 0 && (
        <p>
          Month total: <strong>{num(m.value[mi])}</strong> {area.unit_label}, {sourceWords(m.source[mi])}
          {m.lo[mi] !== null ? ` (likely between ${band(m.lo[mi], m.hi[mi])})` : ""}.
          {m.flag[mi] ? ` Unusually ${m.flag[mi]} for ${MONTHS[m.month[mi] - 1]}.` : ""}
          {m.complete[mi] ? "" : ` Only ${m.days_with_data[mi]} days have data.`}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Week of</th>
              <th>Harmonized</th>
              <th>Band</th>
              <th>Source</th>
              {satellites.map(([name]) => <th key={name}>{name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={w.week_start[i]}>
                <td>{w.week_start[i]}</td>
                <td><strong>{num(w.value[i], 1)}</strong></td>
                <td>{band(w.lo[i], w.hi[i]) || "measured"}</td>
                <td>{w.source[i] === "MODIS" ? "MODIS, converted" : w.source[i]}</td>
                {satellites.map(([name, s]) => (
                  <td key={name}>
                    {s.days[i] === null ? "not flying" : `${num(s.fire_days[i])} (${num(s.hotspots[i])})`}
                    {s.days[i] !== null && (s.days[i] as number) < 7 ? `, ${s.days[i]} d` : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Per satellite: raw fire cell-days that week, with FIRMS detections in brackets. &ldquo;d&rdquo; is days flown when fewer than 7.
        A converted week&rsquo;s band holds the true value 8 times in 10.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ ranked

function Ranked({ area, from, to }: { area: Area; from: string; to: string }) {
  const m = area.months;
  const clim = area.climatology.months;
  const months = clim.month.map((k, i) => ({ k, median: clim.median[i], p25: clim.p25[i], p75: clim.p75[i] })).sort((a, b) => b.median - a.median);
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
    <>
      <section className="block">
        <h3>Busiest months of the year</h3>
        <p className="note">Median {area.unit_label} per calendar month, {area.climatology.baseline_years[0]} to {area.climatology.baseline_years[1]}.</p>
        <ol className="bars">
          {months.map((row) => (
            <li key={row.k}>
              <span className="bars-label">{MONTHS[row.k - 1]}</span>
              <span className="bars-track"><span className="bars-fill" style={{ width: `${(100 * row.median) / topMonth}%` }} /></span>
              <span className="bars-value">{num(row.median)}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="block">
        <h3>Busiest years</h3>
        <p className="note">Whole calendar years in the chosen dates, by yearly total. A mark means the year holds values converted from MODIS.</p>
        <ol className="bars">
          {years.map((row) => (
            <li key={row.year}>
              <span className="bars-label">{row.year}{row.converted ? <span className="converted-mark" title="converted from MODIS" /> : null}</span>
              <span className="bars-track"><span className="bars-fill" style={{ width: `${(100 * row.total) / topYear}%` }} /></span>
              <span className="bars-value">{num(row.total)}</span>
            </li>
          ))}
        </ol>
        {years.length === 0 && <p>No whole year in the chosen dates.</p>}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ anomalies

function Anomalies({ area, from, to, onMonth }: { area: Area; from: string; to: string; onMonth: (ym: string) => void }) {
  const s = area.seasons;
  const [b0, b1] = area.climatology.baseline_years;
  const normalSeason = median(s.value.filter((_, i) => s.year[i] >= b0 && s.year[i] <= b1));
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const seasons = s.year
    .map((year, i) => ({ year, i }))
    .filter(({ year, i }) => s.flag[i] && year >= fromYear && year <= toYear)
    .sort((a, b) => b.year - a.year);
  const m = area.months;
  const clim = area.climatology.months;
  const busiest = Math.max(...clim.median);
  const months = m.year
    .map((year, i) => ({ ym: `${year}-${String(m.month[i]).padStart(2, "0")}`, i }))
    .filter(({ ym, i }) => m.flag[i] && ym >= from && ym <= to && clim.median[m.month[i] - 1] >= 0.1 * busiest)
    .sort((a, b) => Math.abs(m.anomaly_pct[b.i] ?? 0) - Math.abs(m.anomaly_pct[a.i] ?? 0))
    .slice(0, 12);
  return (
    <>
      <section className="block">
        <h3>Unusual seasons</h3>
        <p className="note">
          Season: {seasonWords(area.fit.season)}. Normal is the median season of {b0} to {b1}: {num(normalSeason)} {area.unit_label}.
          A season is unusual when it falls outside what 8 in 10 seasons reach.
        </p>
        <ul className="plain">
          {seasons.map(({ year, i }) => (
            <li key={year}>
              <strong>{year}</strong>: {num(s.value[i])}, {againstNormal(s.value[i], normalSeason)}
              {s.source[i] !== "VIIRS" ? ` (converted from MODIS, likely ${band(s.lo[i], s.hi[i])})` : ""}.
            </li>
          ))}
        </ul>
        {seasons.length === 0 && <p>No unusual season in the chosen dates.</p>}
      </section>
      <section className="block">
        <h3>Unusual months</h3>
        <p className="note">The 12 largest departures in the chosen dates, among the months that normally have fires. Normal is that month&rsquo;s median.</p>
        <ul className="plain">
          {months.map(({ ym, i }) => (
            <li key={ym}>
              <button type="button" className="link" onClick={() => onMonth(ym)}>{ymLabel(ym)}</button>: {num(m.value[i])},{" "}
              {againstNormal(m.value[i], clim.median[m.month[i] - 1])} (normal {num(clim.median[m.month[i] - 1])})
              {m.source[i] !== "VIIRS" ? `, converted from MODIS, likely ${band(m.lo[i], m.hi[i])}` : ""}.
            </li>
          ))}
        </ul>
        {months.length === 0 && <p>No unusual month in the chosen dates.</p>}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ panel

export default function Panel({ area, theme, from, to, view, month, onView, onMonth }: Props) {
  const weekBand = area.bands.week_mult;
  const seasonBand = area.bands.season_pct;
  return (
    <div className="panel-body">
      <header className="panel-head">
        <p className="eyebrow">{area.country}</p>
        <h2>{area.name}</h2>
        <p className="note">
          {num(area.n_cells)} cells of 0.1&deg;. Unit: {area.unit_label}. Before 2012 the values are MODIS converted to VIIRS terms
          {seasonBand[0] !== null ? `; a converted season is likely within ${num(seasonBand[0])}% to +${num(seasonBand[1])}% of the truth` : ""}.
          Data to {area.last_full_day}.
        </p>
      </header>

      <nav className="tabs" aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v} type="button" className={v === view ? "is-active" : ""} aria-pressed={v === view} onClick={() => onView(v)}>
            {VIEW_LABELS[v]}
          </button>
        ))}
      </nav>

      {view === "calendar" && (
        <>
          <section className="block">
            <div className="calendar-scroll">
              <Calendar area={area} from={from} to={to} theme={theme} selected={month} onSelect={(ym) => onMonth(ym === month ? null : ym)} />
            </div>
            <p className="note">Click a month for its weeks and the raw counts per satellite.</p>
          </section>
          {month && <WeekDetail area={area} ym={month} onClose={() => onMonth(null)} />}
          <ThisMonth area={area} />
        </>
      )}

      {view === "typical" && (
        <>
          <section className="block">
            <h3>Typical year</h3>
            <TypicalYear area={area} theme={theme} year={Number(area.last_full_day.slice(0, 4))} />
            <p className="note">
              Dark line: the median week over {area.climatology.baseline_years[0]} to {area.climatology.baseline_years[1]}. Band: what 8 in 10 years reach.
              Red line: {area.last_full_day.slice(0, 4)} so far. Shaded: the critical period, the {area.climatology.critical_weeks.length} weeks
              that hold {Math.round(area.climatology.critical_share * 100)}% of a typical year&rsquo;s {area.unit_label}.
            </p>
          </section>
          <ThisMonth area={area} />
        </>
      )}

      {view === "ranked" && <Ranked area={area} from={from} to={to} />}

      {view === "anomalies" && (
        <>
          <Anomalies area={area} from={from} to={to} onMonth={(ym) => { onMonth(ym); onView("calendar"); }} />
          {month && <WeekDetail area={area} ym={month} onClose={() => onMonth(null)} />}
        </>
      )}

      <footer className="panel-foot">
        <p className="note">
          Converted weeks carry a band of x{num(weekBand[0], 2)} to x{num(weekBand[1], 2)} on the value + 1.
          Fit: M4, {area.fit.mode === "own" ? "this area's own" : area.fit.mode}, from {num(area.fit.n_fire_weeks)} MODIS fire weeks in 2012 to 2020.
        </p>
      </footer>
    </div>
  );
}
