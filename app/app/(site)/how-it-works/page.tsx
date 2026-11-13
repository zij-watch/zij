// Placeholder page: the structure and the numbers. The final text is still to be written.
// Every number comes from public/data/method.json, which the pipeline writes.

import Link from "next/link";
import method from "@/public/data/method.json";
import findings from "@/public/data/findings.json";
import { MONTHS, num } from "@/lib/format";
import { checkRamp, VISIONS } from "@/lib/cvd";
import { COLOURS, heatRamp } from "@/lib/tokens";

export const metadata = { title: "Zij: how it works" };

type Scheme = { season_err_abs_pct: number; spearman: number };
type AreaRow = (typeof method.areas)[number] & { validation: Record<string, Record<string, Scheme>> };

const MODEL_WORDS: Record<string, string> = {
  raw: "Raw MODIS, no calibration",
  M0: "One fixed multiplier",
  M1: "c + a M^b",
  M2: "M1 with a background per month",
  M3: "M2 with fire size",
  M4: "M3 with the background scaled by the year's activity",
};

const REASON_WORDS: Record<string, string> = {
  kept: "Kept",
  low_confidence: "Low confidence",
  static_source: "Static source (type 2)",
  static_source_masked: "In a static-source cell",
  offshore: "Offshore (type 3)",
  volcano: "Volcano (type 1)",
};

const REQUIREMENTS: { ask: string; where: string; link: string; href: string }[] = [
  { ask: "A web application with a burning activity calendar based on active fire hotspots", where: "Explore, Calendar tab: years as rows, months as columns", link: "Nile Delta calendar", href: "/explore?area=nile-delta" },
  { ask: "Harmonize MODIS and VIIRS so the sensor of origin no longer matters", where: "One unit for both sensors; before 2012 MODIS is converted with the M4 fit. Method and validation on this page", link: "Models and validation", href: "#models" },
  { ask: "A consistent time series from the early 2000s to the present", where: "November 2000 to yesterday, weekly, monthly and by season", link: "Seasons, 2001 to 2026", href: "/explore?area=nile-delta&view=series" },
  { ask: "Select a region", where: "10 preset areas; draw a box or a polygon; or type latitude and longitude", link: "A drawn box", href: "/explore?box=30.5,30.6,31.5,31.4" },
  { ask: "Select a specific date range", where: "From and To on Explore and on Downloads; a single day with the Day picker", link: "2010 to 2020", href: "/explore?area=nile-delta&from=2010-01&to=2020-12" },
  { ask: "Which months and years had the highest fire activity", where: "Busiest tab: calendar months and whole years, ranked", link: "Busiest", href: "/explore?area=nile-delta&view=ranked" },
  { ask: "Compare the current month against the historical median", where: "\u201cThis month against the median\u201d, on the same days of past years", link: "This month", href: "/explore?area=nile-delta&view=typical" },
  { ask: "Anticipate critical periods", where: "Typical year tab: the fewest weeks holding 80% of a typical year, shaded", link: "Typical year", href: "/explore?area=nile-delta&view=typical" },
  { ask: "Unusual conditions; anomalies against multi-year averages", where: "Anomalies tab in plain words; the strongest are boxed on the calendar", link: "Anomalies", href: "/explore?area=nile-delta&view=anomalies" },
  { ask: "How a current fire compares with previous ones", where: "Day view: the day\u2019s hotspots on the map, and its week and month against the median", link: "Chilecito, 29 July 2026", href: "/explore?area=chilecito&day=2026-07-29" },
  { ask: "Number of fires detected and reported", where: "Detections per sensor and per satellite: per day in the day view, per week in the month detail", link: "A month, week by week", href: "/explore?area=nile-delta&month=2018-10" },
  { ask: "Download analytics and visualizations", where: "Weekly and monthly series as CSV; the calendar as PNG and SVG", link: "Downloads", href: "/downloads?area=nile-delta" },
  { ask: "A downloadable CSV file of hot spots detected during a search", where: "Hotspots CSV for the chosen area and dates, both sensors", link: "Downloads", href: "/downloads?area=nile-delta&from=2018-08&to=2018-10" },
  { ask: "Colour ramps for the number of hotspots across months; accessible colour ramps", where: "One 5-step heat ramp, checked for three kinds of colour blindness and in greyscale", link: "Colour check", href: "#colour" },
  { ask: "An interactive map where users can draw the area of interest, or enter latitude and longitude", where: "Draw box, Draw polygon and Type coordinates on Explore", link: "Explore", href: "/explore" },
  { ask: "Use NASA Earthdata FIRMS hotspots", where: "FIRMS MODIS Collection 6.1 and VIIRS 375 m, yearly archives and the FIRMS API for 2026", link: "Sources", href: "#sources" },
];

/** "+97" or "-53": a change with its sign. */
const signed = (x: number) => `${x > 0 ? "+" : ""}${num(x)}`;

export default function Page() {
  const areas = method.areas as unknown as AreaRow[];
  const models = method.models.all_areas;
  const error = (model: string, scheme: string) => models.find((r) => r.model === model && r.scheme === scheme)?.season_err_abs_pct;
  const countries = [...new Set(method.filters.counts.map((r) => r.country))];
  const reasons = Object.keys(REASON_WORDS);
  const count = (country: string, reason: string) => method.filters.counts.find((r) => r.country === country && r.reason === reason)?.n ?? 0;
  const delta = areas.find((a) => a.id === "nile-delta")!;
  const gap2018 = method.raw_gap.rows.find((r) => r.year === 2018);

  return (
    <main className="page">
      <div className="page-inner">
        <p className="eyebrow">How it works</p>
        <h1>Two sensors, one scale</h1>
        <p className="placeholder">
          Placeholder page: the numbers are final for this build ({method.built_at_utc.slice(0, 10)}, data to {method.last_full_day}); the text is not written yet.
        </p>

        <h2 id="requirements">What the challenge asks for, and where it is</h2>
        <p>The challenge is NASA Space Apps 2026, &ldquo;Harmonization of MODIS and VIIRS Hot Spots&rdquo;. Each line is something its text asks for.</p>
        <div className="table-scroll">
          <table className="wrap">
            <thead><tr><th>The challenge asks for</th><th>In Zij</th><th>Open it</th></tr></thead>
            <tbody>
              {REQUIREMENTS.map((r) => (
                <tr key={r.ask}><td>{r.ask}</td><td>{r.where}</td><td><a href={r.href}>{r.link}</a></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>1. The raw gap</h2>
        <p>
          {method.raw_gap.area}, {method.raw_gap.months}: {method.raw_gap.what} per satellite. VIIRS on Suomi NPP reports many times
          what MODIS on Aqua reports, and the gap changes from year to year: {gap2018 ? `${num(gap2018["NPP/Aqua"], 1)} times in 2018` : ""}.
        </p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Year</th><th>Terra</th><th>Aqua</th><th>Suomi NPP</th><th>NOAA-20</th><th>Suomi NPP / Aqua</th></tr></thead>
            <tbody>
              {method.raw_gap.rows.map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td><td>{num(r.Terra)}</td><td>{num(r.Aqua)}</td><td>{num(r["Suomi NPP"])}</td><td>{num(r["NOAA-20"])}</td>
                  <td><strong>{num(r["NPP/Aqua"], 1)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>2. Filters and the unit</h2>
        <p>
          Kept: vegetation fires (type 0), MODIS confidence {method.filters.kept_confidence.MODIS}, VIIRS {method.filters.kept_confidence.VIIRS}.
          A {method.filters.static_mask.cell_deg}&deg; cell with static sources on {method.filters.static_mask.min_days} or more days loses every detection.
          The unit is the fire cell-day: a {method.filters.grid_deg}&deg; cell with a detection on one day, for one satellite, averaged over the
          satellites of a sensor. On screen: {method.unit_label}. {method.filters.known_gaps} known satellite outages count as no data, never zero.
        </p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Detections</th>{countries.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {reasons.map((reason) => (
                <tr key={reason}><td>{REASON_WORDS[reason]}</td>{countries.map((c) => <td key={c}>{num(count(c, reason))}</td>)}</tr>
              ))}
              <tr><td>Static-source cells</td>{countries.map((c) => <td key={c}>{num((method.filters.static_mask.cells as Record<string, number>)[c])}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Satellite</th><th>Sensor</th><th>First day</th><th>Last day</th></tr></thead>
            <tbody>
              {method.satellites.map((s) => <tr key={s.satellite}><td>{s.satellite}</td><td>{s.family}</td><td>{s.first_day}</td><td>{s.last_day}</td></tr>)}
            </tbody>
          </table>
        </div>

        <h2 id="models">3. Models</h2>
        <p>
          Weekly VIIRS is predicted from weekly MODIS, fitted on {method.models.train_years[0]} to {method.models.train_years[1]}, when both flew.
          Six ways were tested. Error is the season total, averaged over {method.models.research_areas} areas in Egypt and Portugal.
        </p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Model</th><th>What it is</th><th>Leave one year out</th><th>{method.models.test_years[0]} to {method.models.test_years[1]}</th></tr></thead>
            <tbody>
              {Object.keys(MODEL_WORDS).map((model) => (
                <tr key={model}>
                  <td><strong>{model}</strong></td><td>{MODEL_WORDS[model]}</td>
                  <td>{num(error(model, "LOYO"), 1)}%</td><td>{num(error(model, "out-of-time"), 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>4. Validation per area</h2>
        <p>M4, the model in use. Season error leaving one year out, and for {method.models.test_years[0]} to {method.models.test_years[1]} from the earlier fit.</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Area</th><th>Season</th><th>MODIS fire weeks</th><th>Leave one year out</th><th>Out of time</th><th>Weekly rank correlation</th></tr></thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{MONTHS[a.season[0] - 1].slice(0, 3)} to {MONTHS[a.season[2] - 1].slice(0, 3)}</td>
                  <td>{num(a.n_fire_weeks)}</td>
                  <td>{num(a.validation.M4?.LOYO?.season_err_abs_pct, 1)}%</td>
                  <td>{num(a.validation.M4?.["out-of-time"]?.season_err_abs_pct, 1)}%</td>
                  <td>{num(a.validation.M4?.LOYO?.spearman, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>5. Bands</h2>
        <div className="facts">
          <div><p className="figure">{num(delta.bands.season_pct[0])}% to +{num(delta.bands.season_pct[1])}%</p><p className="note">Nile Delta, a converted season</p></div>
          <div><p className="figure">x{num(delta.bands.month_mult[0], 2)} to x{num(delta.bands.month_mult[1], 2)}</p><p className="note">Nile Delta, a converted month (on value + 1)</p></div>
          <div><p className="figure">x{num(delta.bands.week_mult[0], 2)} to x{num(delta.bands.week_mult[1], 2)}</p><p className="note">Nile Delta, a converted week (on value + 1)</p></div>
        </div>
        <p>Each band holds 8 in 10 of the errors made when a year is left out of the fit. Before July 2002 MODIS is Terra alone, corrected by month and area.</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Area</th><th>Season</th><th>Terra-only season</th><th>Month</th><th>Week</th><th>Terra-only bias, before</th><th>After</th></tr></thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{num(a.bands.season_pct[0])}% to +{num(a.bands.season_pct[1])}%</td>
                  <td>{num(a.bands.terra_only_season_pct[0])}% to +{num(a.bands.terra_only_season_pct[1])}%</td>
                  <td>x{num(a.bands.month_mult[0], 2)} to x{num(a.bands.month_mult[1], 2)}</td>
                  <td>x{num(a.bands.week_mult[0], 2)} to x{num(a.bands.week_mult[1], 2)}</td>
                  <td>{num(a.terra_only_test.mean_bias_before_pct, 1)}%</td>
                  <td>{num(a.terra_only_test.mean_bias_after_pct, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>6. Limits</h2>
        <ul>
          <li>A satellite sees a fire only if it burns as the satellite passes, under a clear sky. Hotspot-days are detections, not fires and not burned area.</li>
          <li>Converted values (before 2012) are estimates. Read them with their band.</li>
          <li>The fit is made on {method.models.train_years[0]} to {method.models.train_years[1]}. In Portugal it runs high afterwards (see the out-of-time column).</li>
          <li>2026 uses near-real-time data for the latest months, which NASA later replaces with standard processing.</li>
          <li>NOAA-21 joins the VIIRS average in 2026. Suomi NPP&rsquo;s data ends on 2 November 2026.</li>
          <li>Single hotspots (the day view and the hotspots CSV) are shipped for Egypt and Portugal, and in Argentina only around Chilecito and the Parana Delta.</li>
          <li>Drawn areas work in Egypt, mainland Portugal and Argentina. An area with fewer than 100 MODIS fire weeks in 2012 to 2020 leans on its country&rsquo;s fit and gets a wide band; under 30 it gets raw counts only.</li>
        </ul>

        <h2 id="colour">7. Colour</h2>
        <p>
          One heat ramp: zero, then five steps. Each row below shows it as it looks with a common kind of colour blindness
          (simulated after Machado, Oliveira and Fernandes, 2009, full severity) and in greyscale. The ramp passes when lightness
          runs one way through all the steps and neighbouring steps stay clearly apart: a colour difference of 10 or more, measured as CIE76 (the distance between two colours in CIELAB).
        </p>
        {(["folio"] as const).map((theme) => {
          const checks = checkRamp([COLOURS["heat-0"], ...heatRamp()]);
          return (
            <div key={theme} className="table-scroll">
              <table>
                <thead><tr><th>Vision</th><th>Ramp</th><th>Lightness L*</th><th>Smallest step (CIE76)</th><th>Result</th></tr></thead>
                <tbody>
                  {checks.map((check) => (
                    <tr key={check.vision}>
                      <td>{VISIONS.find((v) => v.id === check.vision)?.label}</td>
                      <td><div className="swatches">{check.colours.map((hex, k) => <span key={k} style={{ background: hex }} />)}</div></td>
                      <td>{check.lightness.join(", ")}</td>
                      <td>{check.minStep}</td>
                      <td>{check.ordered && check.minStep >= 10 ? "passes" : "fails"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <p className="note">Anomalies and converted values are also marked with a shape (a box, a corner), never by colour alone.</p>

        <h2 id="findings">8. Findings</h2>
        <p>
          Three questions asked of the harmonized record. Every number here is written by the pipeline&rsquo;s <code>findings</code> step
          (<code>docs/event/FINDINGS.md</code>), and every comparison that was made is shown, none dropped for looking weaker.
          The values are burning seen from space, in {findings.unit_label}. The 2026 seasons are preliminary: their latest months are
          near-real-time data, which NASA later replaces with standard processing.
        </p>
        <p className="note">{findings.band_note}</p>

        <h3>The Nile Delta and the 2004 ban on burning rice straw</h3>
        <p>{findings.ban.answer}</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Season (Aug to Oct)</th><th>Seen from space</th><th>Likely range</th><th>Recorded by</th></tr></thead>
            <tbody>
              {findings.ban.seasons.map((s) => (
                <tr key={s.year}>
                  <td>{s.year}{s.year === findings.ban.ban_year ? " (ban year)" : ""}</td>
                  <td>{num(s.value)}</td>
                  <td>{s.source !== "VIIRS" && s.lo !== null && s.hi !== null ? `${num(s.lo)} to ${num(s.hi)}` : "measured"}</td>
                  <td>{s.source === "VIIRS" ? "VIIRS" : s.terra_only ? "MODIS, Terra alone, converted" : "MODIS, converted"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Before against after, every way it was cut:</p>
        <div className="table-scroll">
          <table className="wrap">
            <thead><tr><th>Before</th><th>Mean (range)</th><th>After</th><th>Mean (range)</th><th>Change (range)</th><th>Why this cut</th></tr></thead>
            <tbody>
              {findings.ban.comparisons.map((c) => (
                <tr key={`${c.before.years}-${c.after.years}`}>
                  <td>{c.before.years[0]} to {c.before.years[1]}</td>
                  <td>{num(c.before.mean)} ({num(c.before.lo)} to {num(c.before.hi)})</td>
                  <td>{c.after.years[0]} to {c.after.years[1]}</td>
                  <td>{num(c.after.mean)} ({num(c.after.lo)} to {num(c.after.hi)})</td>
                  <td>{signed(c.change.pct)}% ({signed(c.change.lo_pct)}% to {signed(c.change.hi_pct)}%)</td>
                  <td>{c.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Day and night, per MODIS satellite ({findings.ban.day_night.unit}):</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Period</th><th>Satellite</th><th>Years</th><th>Day</th><th>Night</th><th>Night share (95% interval)</th></tr></thead>
            <tbody>
              {findings.ban.day_night.shares.map((s) => (
                <tr key={`${s.period}-${s.satellite}-${s.years}`}>
                  <td>{s.period}</td><td>{s.satellite}</td><td>{s.years[0]} to {s.years[1]}</td><td>{num(s.day)}</td><td>{num(s.night)}</td>
                  <td>{num(s.night_share_pct, 1)}% ({num(s.ci95_pct[0], 1)}% to {num(s.ci95_pct[1], 1)}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>The Delta since 2018</h3>
        <p>{findings.since_2018.answer}</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Area</th><th>{findings.since_2018.reference_years[0]} to {findings.since_2018.reference_years[1]} (range)</th><th>{findings.since_2018.recent_years[0]} to {findings.since_2018.recent_years[1]}</th><th>Change (range)</th><th>Without 2026</th></tr></thead>
            <tbody>
              {findings.since_2018.areas.map((a) => (
                <tr key={a.area}>
                  <td>{a.name}</td>
                  <td>{num(a.reference.mean)} ({num(a.reference.lo)} to {num(a.reference.hi)})</td>
                  <td>{num(a.recent.mean)}</td>
                  <td>{signed(a.change.pct)}% ({signed(a.change.lo_pct)}% to {signed(a.change.hi_pct)}%)</td>
                  <td>{signed(a.without_last_season.change.pct)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>One sentence per area</h3>
        <div className="table-scroll">
          <table className="wrap">
            <thead><tr><th>Area</th><th>What the record shows</th></tr></thead>
            <tbody>
              {findings.areas.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/explore?area=${a.id}`}>{a.name}</Link>, {a.country}</td>
                  <td>{a.sentence}{"note" in a && a.note ? ` ${a.note}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>What this cannot show</h3>
        <ul>
          <li><strong>The intensity of a single fire.</strong> The unit measures spread and duration: how many places burned, on how many days. One fierce fire in a few cells counts little. The Chilecito fire of July 2026 gave about 900 detections and counts as an ordinary season. The panel adds an intensity line when a month&rsquo;s detections per burning cell are unusual.</li>
          <li><strong>Whether the ban had any effect.</strong> There is no record of what would have burned without it. A ban that slowed a rise and a ban that did nothing look the same here. Rice area, harvest dates and how the straw was handled are not in satellite fire data.</li>
          <li><strong>A level before the ban worth the name.</strong> Three seasons, one of them Terra alone, on a record that was already climbing.</li>
          <li><strong>Burning between overpasses.</strong> MODIS looks four times a day. A fire lit after the early-afternoon pass and out before the late-evening one is never counted.</li>
          <li><strong>Whether the bands hold before 2012.</strong> They are measured on 2012 to 2020. Nothing can test the conversion on 2001 to 2011, because VIIRS was not flying.</li>
          <li><strong>How much straw burned.</strong> Hotspot-days count cells and days, not hectares or tonnes. Small, short or smoke-covered fires are missed by both sensors.</li>
          <li><strong>The final 2026 figures.</strong> The latest months are near-real-time data and will change a little when NASA reprocesses them.</li>
        </ul>

        <h2 id="sources">9. Sources</h2>
        <ul>
          <li>NASA FIRMS active fire detections: MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21).</li>
          <li>NASA GIBS true-colour imagery, for the satellite basemap.</li>
          <li>Natural Earth country outlines.</li>
          <li>Code, decisions and validation tables: the project repository (Apache-2.0).</li>
        </ul>
        <p className="note">
          We acknowledge the use of data and imagery from NASA&rsquo;s Fire Information for Resource Management System (FIRMS) and
          Global Imagery Browse Services (GIBS), part of NASA&rsquo;s Earth Science Data and Information System (ESDIS).
          Zij is not affiliated with or endorsed by NASA.
        </p>
      </div>
    </main>
  );
}
