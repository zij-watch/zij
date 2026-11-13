// Placeholder page: the structure and the numbers. The final text is still to be written.
// Every number comes from public/data/method.json, which the pipeline writes.

import method from "@/public/data/method.json";
import { MONTHS, num } from "@/lib/format";
import { heatRamp } from "@/lib/tokens";

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

/** Greyscale lightness (CIE L*) of a hex colour. */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

function grey(hex: string): string {
  const v = Math.round((lightness(hex) / 100) * 255);
  return `rgb(${v},${v},${v})`;
}

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
    <main className="page" data-theme="folio">
      <div className="page-inner">
        <p className="eyebrow">How it works</p>
        <h1>Two sensors, one scale</h1>
        <p className="placeholder">
          Placeholder page: the numbers are final for this build ({method.built_at_utc.slice(0, 10)}, data to {method.last_full_day}); the text is not written yet.
        </p>

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

        <h2>3. Models</h2>
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
          <li>Only the preset areas are available. Areas with fewer than 30 MODIS fire weeks could not be converted.</li>
        </ul>

        <h2>7. Colour</h2>
        <p>One heat ramp, five steps. In greyscale the steps still run in order (lightness L* shown), so the calendar reads without colour.</p>
        {(["night", "folio"] as const).map((theme) => (
          <div key={theme}>
            <div className="swatches">{heatRamp(theme).map((hex) => <span key={hex} style={{ background: hex }} />)}</div>
            <div className="swatches">{heatRamp(theme).map((hex) => <span key={hex} style={{ background: grey(hex) }} />)}</div>
            <p className="note">{theme === "night" ? "Night" : "Folio"}: L* {heatRamp(theme).map((hex) => Math.round(lightness(hex))).join(", ")}</p>
          </div>
        ))}

        <h2>8. Sources</h2>
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
