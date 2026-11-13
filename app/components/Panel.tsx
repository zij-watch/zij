"use client";

import { areaFacts } from "@/lib/facts";
import { Select, Tabs, UnitTerm } from "./ui";
import type { Area } from "@/lib/data";
import { COVERED } from "@/lib/drawnArea";
import { rawByMonth, type RawMonth } from "@/lib/derive";
import { MONTHS, againstNormal, num, sourceWords, ymLabel, UNIT } from "@/lib/format";
import { VIEWS, type View } from "@/lib/url";
import Calendar from "./Calendar";
import SeriesChart from "./SeriesChart";
import TypicalYear from "./TypicalYear";

const VIEW_LABELS: Record<View, string> = { calendar: "Calendar", typical: "Typical year", series: "Seasons", ranked: "Busiest", anomalies: "Anomalies" };

interface Props {
  simple?: boolean; // Simple: the calendar, this month, three anomalies in words, and a way to the rest
  onExpert?: () => void;
  named?: boolean; // the country and name at the top; off where the panel head already shows them
  area: Area;
  from: string;
  to: string;
  view: View;
  month: string | null;
  year: number | null; // the year drawn over the typical year
  note?: string;
  drawn?: boolean; // a drawn area, fitted in the browser
  draft?: boolean; // still being drawn: no bands yet
  onView: (view: View) => void;
  onMonth: (ym: string | null) => void;
  onYear: (year: number | null) => void;
}

/** "Raw counts: MODIS 20 (31 detections), VIIRS 537 (1,877 detections)". */
function rawWords(modis: number | null | undefined, viirs: number | null | undefined, modisHot?: number | null, viirsHot?: number | null): string {
  const one = (name: string, v: number | null | undefined, hot?: number | null) =>
    v === null || v === undefined ? `${name} no data` : `${name} ${num(v, v < 10 ? 1 : 0)}${hot === null || hot === undefined ? "" : ` (${num(hot)} detections)`}`;
  return `Raw counts: ${one("MODIS", modis, modisHot)}, ${one("VIIRS", viirs, viirsHot)}`;
}

function rawMonthWords(raw: RawMonth | undefined): string {
  return rawWords(raw?.modis, raw?.viirs, raw?.modis_hotspots, raw?.viirs_hotspots);
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
        {MONTHS[t.month - 1]} {t.year}, first {t.days_so_far} days: <strong>{num(t.value_to_date, 1)}</strong> {UNIT}.
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
          Month total: <strong>{num(m.value[mi])}</strong> {UNIT}, {sourceWords(m.source[mi])}
          {m.lo[mi] !== null ? ` (likely between ${band(m.lo[mi], m.hi[mi])})` : ""}.
          {m.flag[mi] ? ` Unusually ${m.flag[mi]} for ${MONTHS[m.month[mi] - 1]}.` : ""}
          {m.complete[mi] ? "" : ` Only ${m.days_with_data[mi]} days have data.`}
          <br /><span className="raw-line">{rawMonthWords(rawByMonth(area).get(ym))}.</span>
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
        <p className="note">Median {UNIT} per calendar month, {area.climatology.baseline_years[0]} to {area.climatology.baseline_years[1]}.</p>
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
  const raw = rawByMonth(area);
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
          Season: {seasonWords(area.fit.season)}. Normal is the median season of {b0} to {b1}: {num(normalSeason)} {UNIT}.
          A season is unusual when it falls outside what 8 in 10 seasons reach (the 10th to 90th percentile).
        </p>
        <ul className="plain">
          {seasons.map(({ year, i }) => (
            <li key={year}>
              <strong>{year}</strong>: {num(s.value[i])}, {againstNormal(s.value[i], normalSeason)}
              {s.source[i] !== "VIIRS" ? ` (converted from MODIS, likely ${band(s.lo[i], s.hi[i])})` : ""}.
              <br /><span className="raw-line">{rawWords(s.modis[i], s.viirs[i])}.</span>
            </li>
          ))}
        </ul>
        {seasons.length === 0 && <p>No unusual season in the chosen dates.</p>}
      </section>
      <section className="block">
        <h3>Unusual months</h3>
        <p className="note">The 12 largest departures in the chosen dates, among the months that normally have fires and fall outside the 10th to 90th percentile. Normal is that month&rsquo;s median. The calendar boxes only the strongest (outside the 5th to 95th).</p>
        <ul className="plain">
          {months.map(({ ym, i }) => (
            <li key={ym}>
              <button type="button" className="link" onClick={() => onMonth(ym)}>{ymLabel(ym)}</button>: {num(m.value[i])},{" "}
              {againstNormal(m.value[i], clim.median[m.month[i] - 1])} (normal {num(clim.median[m.month[i] - 1])})
              {m.source[i] !== "VIIRS" ? `, converted from MODIS, likely ${band(m.lo[i], m.hi[i])}` : ""}.
              <br /><span className="raw-line">{rawMonthWords(raw.get(ym))}.</span>
            </li>
          ))}
        </ul>
        {months.length === 0 && <p>No unusual month in the chosen dates.</p>}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ seasons

function SeasonsView({ area, from, to }: { area: Area; from: string; to: string }) {
  const s = area.seasons;
  const [b0, b1] = area.climatology.baseline_years;
  const normal = median(s.value.filter((_, i) => s.year[i] >= b0 && s.year[i] <= b1));
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const rows = s.year.map((_, i) => i).filter((i) => s.year[i] >= fromYear && s.year[i] <= toYear).reverse();
  return (
    <section className="block">
      <h3>Season by season</h3>
      <SeriesChart area={area} fromYear={fromYear} toYear={toYear} normal={normal} />
      <p className="note">
        Season: {seasonWords(area.fit.season)}. Red line: the harmonized season total. Blue bars: the likely range of a year converted from MODIS.
        Dotted blue: raw MODIS, before conversion. Dashed: the median season of {b0} to {b1}.
      </p>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Year</th><th>Harmonized</th><th>Band</th><th>Source</th><th>Raw MODIS</th><th>Raw VIIRS</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={s.year[i]}>
                <td>{s.year[i]}</td>
                <td><strong>{num(s.value[i])}</strong></td>
                <td>{band(s.lo[i], s.hi[i]) || "measured"}</td>
                <td>{s.source[i] === "MODIS" ? (s.terra_only[i] ? "MODIS (Terra only), converted" : "MODIS, converted") : s.source[i]}</td>
                <td>{num(s.modis[i])}</td>
                <td>{num(s.viirs[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ no fit: raw counts only

function RawOnly({ area }: { area: Area }) {
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
    <>
      <div className="warning" role="note">
        <h3>Too few fires here to convert MODIS</h3>
        <p>
          This area has {num(area.fit.n_fire_weeks)} weeks with a MODIS fire in 2012 to 2020. Zij needs at least 30 to relate MODIS to VIIRS,
          so there are no harmonized values, no calendar and no anomalies here: only the raw counts of each sensor, which cannot be compared with each other.
        </p>
        <p><strong>Try a bigger area</strong>, or one with more fires. Drawn areas work in {COVERED}.</p>
      </div>
      <section className="block">
        <h3>Raw counts per year</h3>
        <p className="note">Fire cell-days per sensor (average over its satellites), with FIRMS detections in brackets. Not harmonized.</p>
        <div className="table-scroll">
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
      </section>
    </>
  );
}

/** Simple mode: the three most unusual seasons, in words. */
function SimpleAnomalies({ area }: { area: Area }) {
  const lines = areaFacts(area).anomalies.slice(0, 3);
  if (lines.length === 0) return null;
  return (
    <section className="block">
      <h3>Most unusual seasons</h3>
      <ul className="plain">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
    </section>
  );
}

// ------------------------------------------------------------------ panel

export default function Panel({ area, simple = false, onExpert, named = true, from, to, view, month, year, note, drawn, draft, onView, onMonth, onYear }: Props) {
  const weekBand = area.bands.week_mult;
  const seasonBand = area.bands.season_pct;
  const lastYear = Number(area.last_full_day.slice(0, 4));
  const firstYear = area.weeks.year[0] ?? lastYear;
  const chartYear = year && year >= firstYear && year <= lastYear ? year : lastYear;
  const head = (
    <header className="panel-head">
      {named && <p className="eyebrow">{drawn ? `Your area, ${area.country}` : area.country}</p>}
      {named && <h2>{area.name}</h2>}
      {note && <p className="area-note">{note}</p>}
    </header>
  );
  if (area.fit.mode === "none") {
    return (
      <div className="panel-body">
        {head}
        <p className="note">{num(area.n_cells)} cells of 0.1&deg;. Data to {area.last_full_day}.</p>
        <RawOnly area={area} />
      </div>
    );
  }
  return (
    <div className="panel-body">
      {head}
      <div className="panel-head">
        <p className="note">
          {num(area.n_cells)} cells of 0.1&deg;. Unit: <UnitTerm />. Before 2012 the values are MODIS converted to VIIRS terms
          {seasonBand[0] !== null ? `; a converted season is likely within ${num(seasonBand[0])}% to +${num(seasonBand[1])}% of the truth` : ""}.
          Data to {area.last_full_day}.
        </p>
      </div>
      {draft && <p className="note">Still drawing: bands and anomalies are worked out when the shape is finished.</p>}
      {area.fit.mode === "blend" && (
        <div className="warning" role="note">
          <h3>Small area: read with care</h3>
          <p>
            Only {num(area.fit.n_fire_weeks)} weeks had a MODIS fire here in 2012 to 2020 (100 are needed for a fit of its own).
            Values before 2012 mix this area&rsquo;s fit with {area.country}&rsquo;s, scaled down.
            {seasonBand[0] !== null ? ` A converted season can be off by ${num(seasonBand[0])}% to +${num(seasonBand[1])}%: a wide band, measured on small test areas.` : ""}
          </p>
        </div>
      )}

      {simple && (
        <>
          <section className="block">
            <div className="calendar-scroll">
              <Calendar area={area} from={from} to={to} labelSize={17} selected={null} onSelect={() => undefined} />
            </div>
            <p className="note">Years run down, months run across. Darker means more {UNIT}. A blue corner marks a month converted from MODIS.</p>
          </section>
          <ThisMonth area={area} />
          <SimpleAnomalies area={area} />
          <p className="evidence">
            <button type="button" className="link" onClick={onExpert}>Show the evidence</button>
            <span className="note"> The weeks behind each month, the raw counts per satellite, the typical year, the seasons with their bands, and how sure each number is.</span>
          </p>
        </>
      )}
      {!simple && <ThisMonth area={area} />}

      {!simple && <Tabs.Root value={view} onValueChange={(v) => onView(v as View)}>
      <Tabs.List className="tabs" aria-label="Views">
        {VIEWS.map((v) => <Tabs.Trigger key={v} value={v} className="tab">{VIEW_LABELS[v]}</Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value={view} className="tab-panel">

      {view === "calendar" && (
        <>
          <section className="block">
            <div className="calendar-scroll">
              <Calendar area={area} from={from} to={to} labelSize={17} selected={month} onSelect={(ym) => onMonth(ym === month ? null : ym)} />
            </div>
            <p className="note">Click a month for its weeks and the raw counts per satellite.</p>
          </section>
          {month && <WeekDetail area={area} ym={month} onClose={() => onMonth(null)} />}
        </>
      )}

      {view === "typical" && (
        <>
          <section className="block">
            <h3>Typical year</h3>
            <div className="year-pick">
              Year on top
              <Select small label="Year on top" value={String(chartYear)} onChange={(v) => onYear(Number(v) === lastYear ? null : Number(v))}
                options={Array.from({ length: lastYear - firstYear + 1 }, (_, k) => ({ value: String(lastYear - k), label: String(lastYear - k) }))} />
            </div>
            <TypicalYear area={area} year={chartYear} />
            <p className="note">
              Light line: the median week over {area.climatology.baseline_years[0]} to {area.climatology.baseline_years[1]}. Grey band: what 8 in 10 years reach.
              Red line: {chartYear}{chartYear === lastYear ? " so far" : ""}; where it was converted from MODIS, the red band is its likely range. Brass shading: the critical period, the {area.climatology.critical_weeks.length} weeks
              that hold {Math.round(area.climatology.critical_share * 100)}% of a typical year&rsquo;s {UNIT}.
            </p>
          </section>
        </>
      )}

      {view === "series" && <SeasonsView area={area} from={from} to={to} />}

      {view === "ranked" && <Ranked area={area} from={from} to={to} />}

      {view === "anomalies" && (
        <>
          <Anomalies area={area} from={from} to={to} onMonth={(ym) => { onMonth(ym); onView("calendar"); }} />
          {month && <WeekDetail area={area} ym={month} onClose={() => onMonth(null)} />}
        </>
      )}

      </Tabs.Content>
      </Tabs.Root>}

      {!simple && <footer className="panel-foot">
        <p className="note">
          Converted weeks carry a band of x{num(weekBand[0], 2)} to x{num(weekBand[1], 2)} on the value + 1.
          Fit: M4, {area.fit.mode === "own" ? "this area's own" : "blended with the country's"}, from {num(area.fit.n_fire_weeks)} MODIS fire weeks in 2012 to 2020.
        </p>
      </footer>}
    </div>
  );
}
