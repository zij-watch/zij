// Builds the landing page, public/landing.html, served at "/" (see next.config.ts).
//
// The page is the landing page of the Zij design system (landing-src/landing.html and landing.js,
// copied unchanged from the team's design repository, where it was a reference whose figures were
// illustrations). This script puts the real record into it, from the files the pipeline exports:
//   - the Nile Delta season totals with a two-state switch (as recorded / harmonized, with the band)
//   - the calendar of chapter three, drawn from the Nile Delta's months instead of a seeded sketch
//   - the VIIRS-to-MODIS pixel ratio of chapter one, the three numbers, the links into the app
// It is plain HTML: readable with scripts off. Run by predev and prebuild.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), "utf8");
const area = JSON.parse(read("../public/data/areas/nile-delta.json"));
const method = JSON.parse(read("../public/data/method.json"));
const findings = JSON.parse(read("../public/data/findings.json"));
const num = (n) => Math.round(n).toLocaleString("en");

// The link to Hudhud's Fire Diary takes its words from the game's own script, like every word of
// the game (lib/diary/script.ts, read by Node directly; it notes the file has no module type).
process.removeAllListeners("warning");
process.on("warning", (w) => { if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(w); });
const { UI_LABELS } = await import(here("../lib/diary/script.ts").href);
const playWords = UI_LABELS.find((u) => u.id === "ui.landing").label;

mkdirSync(here("../public/landing/reference/"), { recursive: true });
for (const dir of ["logo", "assets"]) cpSync(here(`../landing-src/${dir}/`), here(`../public/landing/${dir}/`), { recursive: true });
for (const file of ["tokens.css", "reference/materials.css", "additions.css", "life.js"]) cpSync(here(`../landing-src/${file}`), here(`../public/landing/${file}`));

let html = read("../landing-src/landing.html");
let js = read("../landing-src/landing.js");
const swap = (text, from, to, what) => {
  if (!text.includes(from)) throw new Error(`build-landing: the reference changed, could not find ${what}`);
  return text.replace(from, to);
};

// ---- the numbers ----------------------------------------------------------------------------
const s = area.seasons;
const rows = s.year.map((year, i) => {
  const converted = s.source[i] !== "VIIRS";
  return { year, converted, raw: (converted ? s.modis[i] : s.viirs[i]) ?? 0, value: s.value[i], lo: s.lo[i], hi: s.hi[i] };
});
const top = Math.max(...rows.map((r) => Math.max(r.raw, r.value, r.hi ?? 0))) * 1.04;
const pct = (v) => `${((100 * v) / top).toFixed(2)}%`;
const firstViirs = rows.find((r) => !r.converted);
const lastModis = [...rows].reverse().find((r) => r.converted);
const lowest = rows.filter((r) => !r.converted).reduce((a, b) => (b.value < a.value ? b : a));
const times = Math.round(firstViirs.raw / lastModis.raw);
const band = area.bands.season_pct;
const loyo = (model) => method.models.all_areas.find((r) => r.model === model && r.scheme === "LOYO").season_err_abs_pct;
const delta = method.areas.find((a) => a.id === "nile-delta").validation.M4.LOYO.season_err_abs_pct;
const ratios = method.raw_gap.rows.map((r) => r["NPP/Aqua"]).filter((v) => typeof v === "number");
// Most years sit in a narrow range and one stands far out: say both, not one wide range.
const byRatio = method.raw_gap.rows.filter((r) => typeof r["NPP/Aqua"] === "number").map((r) => ({ year: r.year, ratio: r["NPP/Aqua"] })).sort((a, b) => a.ratio - b.ratio);
const peak = byRatio[byRatio.length - 1];
const usual = byRatio.slice(0, -1).map((r) => r.ratio);
const years = rows.length;
const [train0, train1] = method.models.train_years;

// ---- the record: the two-state chart ----------------------------------------------------------
const record = `
    <section class="record" id="record" aria-labelledby="h-record">
      <div class="sheet" data-theme="folio" data-paper="sheet" data-ink>
        <i class="anchor pin-in" data-anchor="rec-in" aria-hidden="true"></i><i class="anchor pin-out" data-anchor="rec-out" aria-hidden="true"></i>
        <p class="t-eyebrow">The Nile Delta, fire seasons ${rows[0].year} to ${rows[years - 1].year} · from the record</p>
        <h2 id="h-record">The satellites changed in ${firstViirs.year}. The fires did not.</h2>
        <input type="radio" name="rec" id="rec-raw" class="sr-only" checked>
        <input type="radio" name="rec" id="rec-true" class="sr-only">
        <div class="rec-switch">
          <label for="rec-raw">What the satellites recorded</label>
          <label for="rec-true">What actually happened</label>
        </div>
        <figure class="rec-figure">
          <div class="rec-chart" role="img" aria-label="Season totals for the Nile Delta. As recorded, the record jumps about ${times} times in ${firstViirs.year}, when VIIRS replaces MODIS. Harmonized, ${lastModis.year} and ${firstViirs.year} are level.">
${rows.map((r) => `            <div class="rec-col ${r.converted ? "is-modis" : "is-viirs"}${r.year === firstViirs.year ? " is-first-viirs" : ""}" style="--raw:${pct(r.raw)};--true:${pct(r.value)};--lo:${pct(r.lo ?? r.value)};--hi:${pct(r.hi ?? r.value)}" title="${r.year}: ${r.converted ? "MODIS" : "VIIRS"} recorded ${num(r.raw)}. Harmonized: ${num(r.value)}${r.lo !== null && r.hi !== null ? ` (likely ${num(r.lo)} to ${num(r.hi)})` : ""}."><span class="rec-bar"></span>${r.converted ? '<span class="rec-band"></span>' : ""}${r.year % 5 === 0 || r.year === firstViirs.year ? `<span class="rec-year">${r.year}</span>` : ""}</div>`).join("\n")}
          </div>
          <figcaption>
            <p class="rec-legend">
              <span class="when-raw"><i class="key key-modis"></i> MODIS, as recorded <i class="key key-viirs"></i> VIIRS, as recorded</span>
              <span class="when-true"><i class="key key-viirs"></i> One scale (VIIRS terms) <i class="key key-band"></i> Likely range of a year converted from MODIS</span>
            </p>
            <p class="rec-line when-raw">In ${lastModis.year} MODIS recorded <strong>${num(lastModis.raw)}</strong>. In ${firstViirs.year} VIIRS recorded <strong>${num(firstViirs.raw)}</strong>. The burning did not grow ${times} times in a year: the instrument changed, and VIIRS sees much smaller fires.</p>
            <p class="rec-line when-true">On one scale ${lastModis.year} and ${firstViirs.year} are level, <strong>${num(lastModis.value)}</strong> and <strong>${num(firstViirs.value)}</strong>, and the real story shows: the peak years, then the fall to <strong>${num(lowest.value)}</strong> in ${lowest.year}. A converted season is likely within ${band[0]}% to +${band[1]}% of the truth.</p>
            <p class="rec-unit">Unit: fire cell-days per season (August to October), on a 0.1° grid, averaged over the satellites of each instrument. Harmonized values are ${area.unit_label}. Data to ${area.last_full_day}.</p>
          </figcaption>
        </figure>
        <details class="rec-table">
          <summary>The numbers behind the chart</summary>
          <div class="rec-scroll"><table>
            <thead><tr><th>Season</th><th>Recorded by</th><th>As recorded</th><th>Harmonized</th><th>Likely range</th></tr></thead>
            <tbody>
${rows.map((r) => `              <tr><td>${r.year}</td><td>${r.converted ? "MODIS" : "VIIRS"}</td><td>${num(r.raw)}</td><td>${num(r.value)}</td><td>${r.lo !== null && r.hi !== null ? `${num(r.lo)} to ${num(r.hi)}` : "measured"}</td></tr>`).join("\n")}
            </tbody>
          </table></div>
        </details>
      </div>
    </section>
`;

// ---- what 26 years show: three findings, each with its number, its band and its caveat ----------
// The numbers are findings.json's (the pipeline's findings step). Wording limits: it is burning
// seen from space; nothing here says what the ban did; 2026 is preliminary data.
const signed = (x) => `${x > 0 ? "+" : "\u2212"}${Math.abs(Math.round(x))}%`;
const cut = findings.ban.comparisons.find((c) => c.before.years[0] === 2001 && c.before.years[1] === 2003 && c.after.years[0] === 2005 && c.after.years[1] === 2011);
const deltaSince = findings.since_2018.areas.find((a) => a.area === "nile-delta");
const upper = findings.areas.find((a) => a.id === "upper-egypt-sugarcane-belt").numbers;
const y2023 = deltaSince.years.find((y) => y.year === 2023);
if (!cut || !deltaSince || !upper || !y2023) throw new Error("build-landing: findings.json changed shape");
const shows = [
  {
    fig: `${num(cut.before.mean)} \u2192 ${num(cut.after.mean)}`,
    head: `Burning seen from space did not fall after the ${findings.ban.ban_year} ban. It rose until 2018.`,
    line: `A Nile Delta season averaged ${num(cut.before.mean)} in ${cut.before.years[0]} to ${cut.before.years[1]} and ${num(cut.after.mean)} in ${cut.after.years[0]} to ${cut.after.years[1]}: ${signed(cut.change.pct)} (band ${signed(cut.change.lo_pct)} to ${signed(cut.change.hi_pct)}). The rise had begun before the ban and only three seasons precede it, so this cannot show what the ban did.`,
  },
  {
    fig: signed(deltaSince.change.pct),
    head: `Since 2018 the Delta's season is about half below ${deltaSince.reference.years[0]} to ${deltaSince.reference.years[1]}.`,
    line: `${num(deltaSince.recent.mean)} a season in ${deltaSince.recent.years[0]} to ${deltaSince.recent.years[1]} against ${num(deltaSince.reference.mean)}: ${signed(deltaSince.change.pct)} (band ${signed(deltaSince.change.lo_pct)} to ${signed(deltaSince.change.hi_pct)}). It is not a steady low: 2023 came back to ${num(y2023.value)}. 2026 is preliminary data.`,
  },
  {
    fig: signed(upper.change_pct),
    head: "Upper Egypt's sugarcane burning seen from space did not fall.",
    line: `${num(upper.recent_mean)} a season (February to April) in ${upper.recent_years[0]} to ${upper.recent_years[1]} against ${num(upper.reference_mean)} in ${upper.reference_years[0]} to ${upper.reference_years[1]}: ${signed(upper.change_pct)} (band ${signed(upper.change_range_pct[0])} to ${signed(upper.change_range_pct[1])}). The count is of places and days with fire, not of cane burned. 2026 is preliminary data.`,
  },
];
const showsSection = `
    <section class="record shows" id="shows" aria-labelledby="h-shows">
      <div class="sheet" data-theme="folio" data-paper="sheet" data-ink>
        <i class="anchor pin-in" data-anchor="shows-in" aria-hidden="true"></i><i class="anchor pin-out" data-anchor="shows-out" aria-hidden="true"></i>
        <p class="t-eyebrow">From the record · ${rows[0].year} to ${rows[years - 1].year}</p>
        <h2 id="h-shows">What ${years} years show</h2>
        <ol class="shows-list">
${shows.map((f) => `          <li><p class="shows-fig">${f.fig}</p><div><h3>${f.head}</h3><p>${f.line}</p></div></li>`).join("\n")}
        </ol>
        <p class="rec-unit">Seasons are counted in ${area.unit_label}: places and days with fire, as the satellites saw them. <a href="/how-it-works#findings">The full tables, and what this cannot show</a>.</p>
      </div>
    </section>
`;

// ---- the table of chapter three, from the Nile Delta's months --------------------------------
const m = area.months;
const nonZero = m.value.filter((v) => v > 0).sort((a, b) => a - b);
const breaks = [0.2, 0.4, 0.6, 0.8].map((q) => nonZero[Math.min(nonZero.length - 1, Math.floor(q * nonZero.length))]); // as lib/heat.ts
const heat = (v) => (!(v > 0) ? 0 : Math.min(1 + breaks.filter((b) => v >= b).length, 5));
const byKey = new Map(m.year.map((y, i) => [`${y}-${m.month[i]}`, m.value[i]]));
const firstYear = Math.min(...m.year), lastYear = Math.max(...m.year);
const tableRows = [];
for (let y = firstYear; y <= lastYear; y++) tableRows.push({ year: y, cells: Array.from({ length: 12 }, (_, k) => (byKey.has(`${y}-${k + 1}`) ? `h${heat(byKey.get(`${y}-${k + 1}`))}` : "nd")) });
const values = [...s.value].sort((a, b) => a - b);
const median = (values[Math.floor((values.length - 1) / 2)] + values[Math.ceil((values.length - 1) / 2)]) / 2;
const flagged = s.year.map((y, i) => ({ y, v: s.value[i], f: s.flag[i] })).filter((r) => r.f);
const odd = flagged.reduce((a, b) => (Math.abs(b.v - median) > Math.abs(a.v - median) ? b : a), flagged[0] ?? { y: lowest.year, v: lowest.value, f: "low" });
const season = area.fit.season;
const table = { rows: tableRows, box: { year: odd.y, from: season[0] - 1, months: season.length } };
const oddPct = Math.round((100 * Math.abs(odd.v - median)) / median);

js = swap(js, js.slice(js.indexOf("  // Chapter three: the table, a seeded illustration, not data"), js.indexOf("  // ================================================================ 6. Textures")), `  // Chapter three: the table, drawn from the Nile Delta's months (window.ZIJ_TABLE, put in the page
  // by scripts/build-landing.mjs). Colour classes are the app's: quintiles of the non-zero months.
  (function table() {
    const data = window.ZIJ_TABLE, cal = $('cal'); if (!cal || !data) return;
    const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const div = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text !== undefined) d.textContent = text; return d; };
    const headRow = div('cal-row mh-row'), headCells = div('cells');
    headRow.append(div('mh'), headCells);
    months.forEach((m) => headCells.appendChild(div('mh', m)));
    cal.appendChild(headRow);
    for (const r of data.rows) {
      const row = div('cal-row'), cells = div('cells');
      row.append(div('yr' + (r.year % 5 === 0 ? ' decade' : ''), r.year), cells);
      for (const cls of r.cells) cells.appendChild(div('cell ' + cls));
      cal.appendChild(row);
    }
    const box = div('anomaly'); cal.appendChild(box);
    const place = () => {
      const row = cal.children[1 + data.box.year - data.rows[0].year], yr = row.firstChild, cellW = (row.offsetWidth - yr.offsetWidth) / 12;
      Object.assign(box.style, { top: row.offsetTop + 'px', left: yr.offsetWidth + cellW * data.box.from + 'px', width: cellW * data.box.months + 'px', height: row.offsetHeight + 'px' });
      $('margin-note').style.marginTop = innerWidth > 760 ? Math.max(0, row.offsetTop - 10) + 'px' : '';
    };
    place(); addEventListener('resize', place); document.fonts && document.fonts.ready.then(place);
  })();

`, "the table of chapter three");
js = swap(js, "'../assets/marks/dial-night.svg'", "'/landing/assets/marks/dial-night.svg'", "the dial");

// The globe at the heart of the orbits turns: slowly, one turn in 160 s, west to east, under a
// terminator that stays put, as the Earth turns under the Sun. All the continents are drawn now,
// each cut to the near side (a point behind the limb is laid on it, so a coast running round the
// back follows the edge). Fires come and go on the land: places that burn, the three countries of
// the record among them (the Nile Delta and Upper Egypt, Portugal, Chilecito and the Parana Delta),
// each kindling, burning a few seconds and dying, out of step with the others; Cairo's keeps
// burning, as it did. It is drawn only while the opening is on screen and the tab is visible, and
// with reduced motion it stands still as it was, Africa turned to face us.
const globeFrom = js.indexOf("  // An engraved globe in orthographic projection");
const globeTo = js.indexOf("  // ================================================================ Fire");
if (globeFrom < 0 || globeTo < globeFrom) throw new Error("build-landing: the reference changed, could not find the globe");
js = js.slice(0, globeFrom) + `  // An engraved globe in orthographic projection that turns (scripts/build-landing.mjs): graticule,
  // the continents, the night half hatched (the terminator seen edge on, a straight line), and fires
  // that come and go on the land.
  (function globe() {
    const g = $('globe'), R = 36, lat0 = 14 * RAD, PERIOD = 160, START = 24;
    const sinL = Math.sin(lat0), cosL = Math.cos(lat0);
    const LAND = [
      [[-17, 21], [-17, 14.7], [-12, 8], [-8, 4.5], [0, 5.5], [9, 4], [9.5, 1], [12, -6], [13.5, -12], [12, -17], [15, -27], [18.5, -34.4], [25, -34], [32, -29], [35, -24], [35, -18], [40.5, -15], [39.5, -6], [42, -1], [48, 5], [51, 11.8], [43.5, 11.5], [39, 15.5], [37.5, 18.5], [35.5, 23.8], [33.5, 27.5], [32.5, 29.9], [32, 31.3], [30, 31.4], [25, 31.6], [20, 32], [15.5, 31.5], [10.5, 34], [10, 37], [3, 36.8], [-2, 35.1], [-6, 35.8], [-9.8, 31], [-13, 27.5], [-17, 21]],
      [[34.6, 29.5], [35, 28], [38.5, 24], [39, 21.5], [42.5, 16.5], [43.4, 12.7], [45, 12.8], [52, 15.5], [57, 18.8], [59.5, 22.5], [56.4, 26.3], [51.5, 24.2], [50, 26.5], [48, 29.9], [44, 33], [40, 34.5], [36, 34], [34.8, 32], [34.6, 29.5]],
      [[-9, 37], [-6, 36.5], [-2, 37], [3, 42.5], [9, 44], [12.5, 41.5], [16, 38], [18.5, 40], [15, 44], [13.5, 45.5], [19, 42], [23, 38], [26, 40.5], [29, 41], [36, 36.5], [36, 41], [41, 41.5], [41, 50], [30, 60], [30, 70], [20, 70], [5, 62], [10, 58], [10, 54], [5, 52], [-4, 48], [-1.5, 46], [-9, 43], [-9, 37]],
      [[-5, 50], [1.5, 51], [1.7, 53], [-3, 56], [-2, 58.5], [-5, 58.5], [-6, 55], [-3, 54], [-5, 52], [-5, 50]],
      [[44, -25], [47, -25], [50, -15], [49.5, -12], [44, -17], [44, -25]],
      [[36, 36.5], [36, 41], [41, 41.5], [41, 50], [30, 60], [30, 70], [60, 68], [70, 73], [90, 76], [110, 77], [140, 72], [160, 70], [180, 68], [180, 65], [170, 60], [162, 57], [156, 51], [155, 59], [143, 59], [140, 54], [135, 43], [129, 35], [127, 39.5], [121, 40], [122, 37], [119, 35], [121, 31], [122, 25], [117, 23], [110, 21], [108, 16], [109, 12], [105, 9], [103, 10.5], [100, 13.5], [100, 8], [103, 1.5], [98, 8], [98, 16], [94, 17], [92, 22], [88, 21.5], [86.5, 20], [80, 15], [80, 10], [77, 8], [73, 16], [72.5, 21], [68, 23.5], [61, 25], [57, 26], [54, 27], [50, 30], [48, 30], [44, 33], [40, 34.5], [36, 36.5]],
      [[130, 31], [135, 34], [140, 36], [141, 41], [142, 45], [139, 40], [136, 36], [132, 34], [130, 31]],
      [[109, 1], [117, 7], [119, 5], [118, 1], [116, -4], [110, -3], [109, 1]],
      [[95, 5.5], [104, -2], [106, -6], [101, -3], [95, 5.5]],
      [[114, -22], [114, -27], [115, -34], [118, -35], [124, -34], [129, -32], [135, -35], [138, -35], [141, -38], [147, -38], [150, -37], [153, -31], [153, -25], [146, -19], [142, -11], [140, -17], [136, -12], [131, -11], [126, -14], [122, -18], [114, -22]],
      [[-80, 9], [-77, 8.5], [-72, 12], [-63, 10.7], [-60, 8.5], [-52, 5], [-50, 0], [-44, -2.5], [-35, -5.5], [-35, -9], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-62, -41], [-65, -45], [-68, -50], [-69, -55], [-74, -52], [-73, -45], [-73, -37], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, -1], [-78, 2], [-77, 7], [-80, 9]],
      [[-168, 66], [-160, 70], [-140, 70], [-125, 70], [-110, 73], [-95, 72], [-82, 73], [-78, 63], [-94, 59], [-90, 57], [-80, 55], [-77, 62], [-65, 60], [-60, 55], [-56, 52], [-66, 45], [-70, 43], [-74, 40], [-76, 35], [-81, 31], [-80, 25.5], [-82, 27], [-84, 30], [-90, 29.5], [-97, 27], [-97, 22], [-92, 18.5], [-88, 21], [-87, 16], [-83, 15], [-83, 10], [-79, 9], [-80, 7.5], [-85, 10], [-92, 15], [-105, 20], [-110, 23], [-114, 30], [-117, 32.5], [-121, 35], [-124, 40], [-124, 48], [-130, 54], [-140, 60], [-150, 60], [-158, 57], [-165, 60], [-168, 66]],
      [[-73, 78], [-60, 82], [-30, 83], [-20, 80], [-20, 70], [-35, 65], [-45, 60], [-52, 65], [-55, 70], [-60, 76], [-73, 78]],
    ];
    // Places that burn, as the satellites see them, the record's own areas first.
    const FIRES = [
      [31.0, 30.8], [32.8, 26.2], [-8.2, 39.6], [-7.9, 38.1], [-67.7, -29.2], [-59.5, -33.5],
      [-1, 11], [8, 9.5], [20, 9], [15, 6.5], [38, 9.5], [22, -9], [27, -12], [18, -12.5], [31, -15], [46.5, -18.5],
      [-55, -9], [-62, -11], [-48, -14], [-92, 17], [-82, 32], [-115, 57], [-105, 62],
      [36, 48], [45, 52], [70, 51], [115, 58], [130, 52], [75.5, 30.5], [80, 22], [102, 18], [97, 20],
      [133, -14], [125, -17], [145, -18], [113.5, 0.5], [103, -1.5],
    ];
    const r = rng(2026);
    const fires = FIRES.map(([lon, lat]) => ({ lon, lat, period: 8 + r() * 7, phase: r(), on: 0.3 + r() * 0.2 }));
    const term = 14 * RAD, tx = Math.sin(term) * R, ty = Math.cos(term) * R;
    g.setAttribute('transform', 'rotate(-23.4)');
    g.innerHTML =
      \`<line class="axis" x1="0" y1="\${-R * 1.32}" x2="0" y2="\${R * 1.32}"/>\` +
      \`<circle class="sea" r="\${R}"/>\` +
      '<path class="land"/><path class="grat"/>' +
      \`<path class="night" d="M\${n1(-tx)} \${n1(-ty)} A\${R} \${R} 0 0 1 \${n1(tx)} \${n1(ty)} Z" transform="rotate(180)"/>\` +
      '<g class="fires"></g>' +
      \`<circle r="\${R}" style="fill:none; stroke: var(--brass); stroke-width: 1.3"/>\`;
    const landEl = g.querySelector('.land'), gratEl = g.querySelector('.grat'), fireBox = g.querySelector('.fires');
    const dots = [{ lon: 31.2, lat: 30, cairo: true }, ...fires].map((f) => {
      const glow = el('circle', { class: 'cairo-glow', r: 7 }, fireBox), dot = el('circle', { class: 'cairo', r: 1.5 }, fireBox);
      return { ...f, glow, dot };
    });
    const r2 = (v) => Math.round(v * 100) / 100;
    function draw(lon0deg, t) {
      const lon0 = lon0deg * RAD;
      const proj = (lon, lat) => {
        lon *= RAD; lat *= RAD;
        const cl = Math.cos(lat), sl = Math.sin(lat), d = lon - lon0, cd = Math.cos(d);
        return [R * cl * Math.sin(d), -R * (cosL * sl - sinL * cl * cd), sinL * sl + cosL * cl * cd];
      };
      // a line on the sphere: lifted where it goes round the back
      const line = (pairs) => { let d = '', pen = false; for (const [lo, la] of pairs) { const [x, y, c] = proj(lo, la); if (c < 0) { pen = false; continue; } d += (pen ? 'L' : 'M') + r2(x) + ' ' + r2(y); pen = true; } return d; };
      // a shape on the sphere: what lies behind is laid on the limb, so the fill follows the edge
      const shape = (pairs) => {
        const pts = pairs.map(([lo, la]) => proj(lo, la));
        if (pts.every((p) => p[2] < 0)) return '';
        return pts.map(([x, y, c], i) => { if (c < 0) { const k = R / (Math.hypot(x, y) || 1); x *= k; y *= k; } return (i ? 'L' : 'M') + r2(x) + ' ' + r2(y); }).join('') + 'Z';
      };
      let grat = '';
      for (const la of [-60, -30, 0, 30, 60]) { const p = []; for (let lo = -180; lo <= 180; lo += 6) p.push([lo, la]); grat += line(p); }
      for (let lo = -180; lo < 180; lo += 30) { const p = []; for (let la = -90; la <= 90; la += 6) p.push([lo, la]); grat += line(p); }
      landEl.setAttribute('d', LAND.map(shape).join(''));
      gratEl.setAttribute('d', grat);
      for (const f of dots) {
        const [x, y, c] = proj(f.lon, f.lat);
        // seen only on the near side, fading out towards the limb
        const face = Math.min(1, Math.max(0, (c - 0.04) / 0.22));
        let b;
        if (f.cairo) b = 0.82 + 0.18 * Math.sin(t * 1.7);
        else { const u = ((t / f.period + f.phase) % 1) / f.on; b = u < 1 ? Math.pow(Math.sin(Math.PI * u), 1.6) : 0; }
        const a = b * face;
        if (a < 0.01) { f.dot.setAttribute('opacity', 0); f.glow.setAttribute('opacity', 0); continue; }
        f.dot.setAttribute('cx', r2(x)); f.dot.setAttribute('cy', r2(y)); f.dot.setAttribute('r', r2(f.cairo ? 1.5 : 0.8 + 0.6 * b)); f.dot.setAttribute('opacity', r2(a));
        f.glow.setAttribute('cx', r2(x)); f.glow.setAttribute('cy', r2(y)); f.glow.setAttribute('r', r2(f.cairo ? 7 : 2.4 + 3.6 * b)); f.glow.setAttribute('opacity', r2(a));
      }
    }
    if (still) { draw(START, 0); return; }
    // turning: only while the opening is in view and the tab is shown
    // its clock runs only while it is drawn, so it never jumps ahead after a pause
    let seen = true, raf = 0, last = 0, t = 0;
    const frame = (now) => {
      raf = 0;
      if (!seen || document.hidden) { last = 0; return; }
      if (last) t += Math.min(now - last, 50) / 1000;
      last = now;
      draw(START - (t / PERIOD) * 360, t);
      raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && seen && !document.hidden) raf = requestAnimationFrame(frame); };
    new IntersectionObserver((entries) => { seen = entries.some((e) => e.isIntersecting); kick(); }).observe(g.ownerSVGElement || g);
    document.addEventListener('visibilitychange', kick);
    draw(START, 0); kick();
  })();

` + js.slice(globeTo);

// The thread runs pin to pin, as it does lower down: from the spool to a pin at the top of the record,
// from a pin at the record's foot to one at the top of the findings, and from the findings' foot to
// the two tokens of chapter one. It never crosses a sheet's text: the pins sit in the margins
// (additions.css, .record .anchor).
js = swap(js, "const THREADS = [['spool', 'modis1'], ['spool', 'viirs1'], ", "const THREADS = [['spool', 'rec-in'], ['rec-out', 'shows-in'], ['shows-out', 'modis1'], ['shows-out', 'viirs1'], ", "the threads to chapter one");

// The record and its findings sit before chapter one, outside every chapter, so nothing spread their
// ink or drew their thread: each sheet now gets its drop when it comes into view, as the chapters'
// sheets do, and once the ink is dry the thread is run to its pins.
js = swap(js, "  lineStops.forEach((s) => stopIO.observe(s));", `  lineStops.forEach((s) => stopIO.observe(s));
  const recordIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const sheet = e.target, sec = sheet.closest('.record');
      recordIO.unobserve(sheet);
      later(() => inkIn(sheet), still ? 0 : 350);
      const mine = threads.filter((t) => { const end = desk.querySelector('[data-anchor="' + t.end + '"]'); return end && sec.contains(end); });
      mine.forEach((t, k) => later(() => drawThread(t), still ? 0 : 350 + (sheet._inkT || 2) * 1000 + 300 + k * 320));
    }
  }, { threshold: 0.2 });
  document.querySelectorAll('.desk > .record [data-ink]').forEach((s) => recordIO.observe(s));`, "the record's ink");

// The chapters' letters (أ ب ج د) are written in with the same brush as the seal, right to left,
// in the order a hand writes each: the stroke of the letter, then its hamza or dot. They stay
// text (the face, the layout and what a reader hears are untouched): a mask of brush strokes, made
// for each letter from where its ink actually lies (measured in its own font), uncovers it, and is
// taken off once written, so nothing can be left hidden. A letter's separate marks (its dot, its
// hamza) are found where they really lie and kept covered until their own turn: the body's stroke
// never shows a piece of a dot on the way past, and a dot is uncovered whole, at once. A letter on a
// sheet waits for that sheet's ink to dry. With reduced motion they are simply there.
js = swap(js, "  document.querySelectorAll('.desk > .record [data-ink]').forEach((s) => recordIO.observe(s));", `  document.querySelectorAll('.desk > .record [data-ink]').forEach((s) => recordIO.observe(s));
  (function abjadInk() {
    if (still) return;
    // each stroke: points across the letter's ink box (0,0 its top left, 1,1 its bottom right),
    // the brush's width in ems, how long it takes (0: a dot, set down whole), and its wet tip as a share.
    // The first stroke is the letter's body; the others are its separate marks (a hamza, a dot).
    const DUCTUS = {
      'أ': [[[[0.5, 0.42], [0.5, 1.06]], 0.26, 0.45, 0.3], [[[0.9, 0], [0.3, 0.06], [0.62, 0.16], [0.2, 0.24]], 0.22, 0.32, 0.4]],
      'ب': [[[[1.02, 0], [0.98, 0.45], [0.75, 0.62], [0.25, 0.62], [0, 0.5], [-0.02, 0.15]], 0.34, 0.6, 0.16], [[[0.5, 0.78], [0.5, 1]], 0.26, 0, 0]],
      'ج': [[[[0.92, 0.04], [0.2, 0.1], [0.62, 0.34], [0.12, 0.58], [0.22, 0.92], [0.72, 1], [1, 0.84]], 0.3, 0.8, 0.12], [[[0.6, 0.56], [0.55, 0.68]], 0.22, 0, 0]],
      'د': [[[[0.4, 0], [0.9, 0.58], [0.7, 0.95], [-0.02, 0.95]], 0.34, 0.5, 0.2]],
    };
    const ctx = document.createElement('canvas').getContext('2d');
    // Where a letter's separate marks lie: the letter is drawn once, off screen, and every piece of
    // ink that is not joined to the largest one is a mark. Boxes in the ink box's own pixels.
    function marksOf(ch, font, m) {
      const edge = 3, w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2 * edge, h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2 * edge;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.font = font; g.fillText(ch, edge + m.actualBoundingBoxLeft, edge + m.actualBoundingBoxAscent);
      const a = g.getImageData(0, 0, w, h).data, seen = new Uint8Array(w * h), pieces = [];
      const ink = (i) => a[i * 4 + 3] > 40;
      for (let i = 0; i < w * h; i++) {
        if (seen[i] || !ink(i)) continue;
        const piece = { x0: w, y0: h, x1: 0, y1: 0, n: 0 }, stack = [i];
        seen[i] = 1;
        while (stack.length) {
          const j = stack.pop(), x = j % w, y = (j - x) / w;
          piece.n++; piece.x0 = Math.min(piece.x0, x); piece.x1 = Math.max(piece.x1, x + 1); piece.y0 = Math.min(piece.y0, y); piece.y1 = Math.max(piece.y1, y + 1);
          for (const [k, ok] of [[j - 1, x > 0], [j + 1, x < w - 1], [j - w, y > 0], [j + w, y < h - 1]]) if (ok && !seen[k] && ink(k)) { seen[k] = 1; stack.push(k); }
        }
        pieces.push(piece);
      }
      pieces.sort((p, q) => q.n - p.n);
      return pieces.slice(1).filter((p) => p.n > 6).map((p) => ({ x: p.x0 - edge, y: p.y0 - edge, w: p.x1 - p.x0, h: p.y1 - p.y0 }));
    }
    function write(letterEl, k) {
      const ch = letterEl.textContent.trim(), strokes = DUCTUS[ch];
      if (!strokes) { letterEl.classList.remove('ab-wait'); return; }
      const cs = getComputedStyle(letterEl), fs = parseFloat(cs.fontSize);
      ctx.font = \`\${cs.fontStyle} \${cs.fontWeight} \${fs}px \${cs.fontFamily}\`;
      const m = ctx.measureText(ch), range = document.createRange();
      range.selectNodeContents(letterEl);
      const rr = range.getBoundingClientRect(), er = letterEl.getBoundingClientRect();
      const left = rr.left - er.left, base = rr.top - er.top + m.fontBoundingBoxAscent;
      const x0 = left - m.actualBoundingBoxLeft, x1 = left + m.actualBoundingBoxRight;
      const y0 = base - m.actualBoundingBoxAscent, y1 = base + m.actualBoundingBoxDescent;
      const pad = 0.14 * fs, iw = x1 - x0, ih = y1 - y0, W = iw + 2 * pad, H = ih + 2 * pad;
      const P = ([u, v]) => n1(pad + u * iw) + ' ' + n1(pad + v * ih);
      // The marks, where they really are. A mark stays covered until its own turn, so the body's
      // stroke can never show a piece of it on the way past; a dot is then uncovered whole, at once.
      let marks = marksOf(ch, ctx.font, m);
      if (marks.length !== strokes.length - 1) marks = [];
      const box = (b, grow) => \`x="\${n1(pad + b.x - grow)}" y="\${n1(pad + b.y - grow)}" width="\${n1(b.w + 2 * grow)}" height="\${n1(b.h + 2 * grow)}"\`;
      const keep = marks.map((b) => \`<rect \${box(b, 2)} fill="black"/>\`).join('');
      let t = 0.15, body = '', bodyWet = '', late = '', lateWet = '';
      strokes.forEach(([pts, w, dur, tip], i) => {
        const d = \`M\${pts.map(P).join(' L')}\`, timing = \`--at:\${n1(t)}s;--dur:\${dur}s;--tip:\${tip}\`, sw = n1(w * fs);
        const mark = i > 0 && marks.length ? marks[i - 1] : null;
        if (!dur) late += mark ? \`<rect class="ab-dot" \${box(mark, 3)} style="\${timing}"/>\` : \`<path class="ab-dot is-stroke" d="\${d}" stroke-width="\${sw}" style="\${timing}"/>\`;
        else {
          const ink = \`<path class="ab-stroke" pathLength="1" d="\${d}" stroke-width="\${sw}" style="\${timing}"/>\`, wet = \`<path class="ab-wet-stroke" pathLength="1" d="\${d}" stroke-width="\${sw}" style="\${timing}"/>\`;
          if (i > 0) { late += ink; lateWet += wet; } else { body += ink; bodyWet += wet; }
        }
        t += (dur || 0.05) + 0.1;
      });
      // the letter, drawn again exactly where it stands, in its own face, for the brush to uncover
      const glyph = \`x="\${n1(left - x0 + pad)}" y="\${n1(base - y0 + pad)}" style="font: \${cs.fontStyle} \${cs.fontWeight} \${fs}px \${cs.fontFamily.replace(/"/g, "'")}"\`;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ab-ink'); svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', n1(W)); svg.setAttribute('height', n1(H)); svg.setAttribute('viewBox', \`0 0 \${n1(W)} \${n1(H)}\`);
      svg.style.left = n1(x0 - pad) + 'px'; svg.style.top = n1(y0 - pad) + 'px';
      const area = \`x="0" y="0" width="\${n1(W)}" height="\${n1(H)}"\`, f = \`filter="url(#ab-brush-\${k})"\`;
      const brush = \`<filter id="ab-brush-\${k}" filterUnits="userSpaceOnUse" \${area}><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="\${7 + k}"/><feDisplacementMap in="SourceGraphic" scale="\${n1(fs * 0.045)}" xChannelSelector="R" yChannelSelector="G"/></filter>\`;
      svg.innerHTML = \`<defs>\${brush}\` +
        \`<mask id="ab-ink-\${k}" maskUnits="userSpaceOnUse" \${area}><g \${f}>\${body}</g>\${keep}<g \${f}>\${late}</g><rect class="ab-settle" width="100%" height="100%" style="--at:\${n1(t)}s"/></mask>\` +
        \`<mask id="ab-wet-\${k}" maskUnits="userSpaceOnUse" \${area}><g \${f}>\${bodyWet}</g>\${keep}<g \${f}>\${lateWet}</g></mask></defs>\` +
        \`<text class="ab-glyph" \${glyph} mask="url(#ab-ink-\${k})">\${ch}</text><text class="ab-glyph is-wet" \${glyph} mask="url(#ab-wet-\${k})">\${ch}</text>\`;
      if (getComputedStyle(letterEl).position === 'static') letterEl.style.position = 'relative';
      letterEl.appendChild(svg);
      letterEl.classList.remove('ab-wait'); letterEl.classList.add('ab-writing');
      // once written, the text takes its place again: nothing can be left hidden
      setTimeout(() => { svg.remove(); letterEl.classList.remove('ab-writing'); }, (t + 0.35 + 0.5) * 1000);
    }
    const letters = [...document.querySelectorAll('.chapter-head .abjad')];
    letters.forEach((l) => l.classList.add('ab-wait'));
    letters.forEach((letterEl, k) => {
      let seen = false, begun = false;
      const sheet = letterEl.closest('[data-ink]');
      const go = () => {
        if (begun || !seen || (sheet && !sheet.classList.contains('is-dry'))) return;
        begun = true;
        (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => write(letterEl, k)).catch(() => letterEl.classList.remove('ab-wait', 'ab-writing'));
      };
      new IntersectionObserver((entries, io) => { if (entries.some((e) => e.isIntersecting)) { seen = true; io.disconnect(); go(); } }, { threshold: 0.6 }).observe(letterEl);
      if (sheet) new MutationObserver(go).observe(sheet, { attributes: true, attributeFilter: ['class'] });
    });
  })();`, "the chapters' letters");

// The record lies above the lantern (additions.css), so the thread layer and its pins are under it.
// Inside each record section they are drawn again, cut to that section's box: the last stretch of
// thread to a pin in the sheet's margin, and the pin itself. The thread copies join each thread's
// elements, so they are drawn in the same stroke; each pin copy follows its pin's opacity.
js = swap(js, "    layThreads();", `    layThreads();
    threadsOverRecord();`, "the thread over the record");
js = swap(js, "  function drawThread(t) {", `  function threadsOverRecord() {
    const src = $('desk-threads'), dr = desk.getBoundingClientRect();
    desk.querySelectorAll(':scope > .record').forEach((sec) => {
      let svg = sec.querySelector(':scope > .record-threads'), box = sec.querySelector(':scope > .record-pins');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'desk-threads record-threads'); svg.setAttribute('aria-hidden', 'true');
        sec.appendChild(svg);
        box = document.createElement('div'); box.className = 'desk-pins record-pins'; box.setAttribute('aria-hidden', 'true');
        sec.appendChild(box);
      }
      const r = sec.getBoundingClientRect(), w = sec.offsetWidth, h = sec.offsetHeight, x0 = r.left - dr.left, y0 = r.top - dr.top;
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      svg.setAttribute('viewBox', \`\${n1(x0)} \${n1(y0)} \${n1(w)} \${n1(h)}\`);
      svg.innerHTML = src.innerHTML;
      const copies = svg.querySelectorAll('.t');
      threads.forEach((t, i) => { const path = copies[i]; if (path) t.els.push(path.previousElementSibling, path); });
      (box._watch || []).forEach((o) => o.disconnect());
      box.innerHTML = ''; box._watch = [];
      $('desk-pins').querySelectorAll('.pin').forEach((pin) => {
        const x = parseFloat(pin.style.left) - x0, y = parseFloat(pin.style.top) - y0;
        if (x < -8 || y < -8 || x > w + 8 || y > h + 8) return;
        const copy = pin.cloneNode(); copy.style.left = n1(x) + 'px'; copy.style.top = n1(y) + 'px';
        box.appendChild(copy);
        const o = new MutationObserver(() => { copy.style.opacity = pin.style.opacity; });
        o.observe(pin, { attributes: true, attributeFilter: ['style'] }); box._watch.push(o);
      });
    });
  }
  function drawThread(t) {`, "drawThread");

// ---- the seal of the opening, written with a reed pen ----------------------------------------
// The same shapes as logo/zij-seal-night.svg, inline, so they can be written in. The pen is a reed
// cut square and held at 45 degrees, the pen that makes the seal's own diamond dots: its edge is
// the slanted line that leads every stroke. It writes زيج, right to left, each letter in the order
// a hand writes it: the ز (down the stem and round the hook, then its dot), the ي (its stem, the
// ring, then both dots together), the ج (along the top, down the diagonal, along the foot, then
// the bar and its dot), in about two and a quarter seconds (PACE below). The dots come one by one,
// each as its letter is finished.
//
// Each shape has a mask of its own, so a stroke can only uncover its own shape: no stroke shows a
// piece of a dot or of its neighbour on the way past. A stroke is one parallelogram per straight
// run of the pen, swept by the nib; a dot is not swept at all: it is one press of the nib, set
// down whole. The runs start and end a little outside the shape, so the slanted edge clears every
// corner, and the build checks that the swept runs cover each shape entirely: at rest the seal is
// the logo, exactly. With reduced motion nothing is animated and it is simply there.
const SEAL_PARTS = [
  // ز
  { d: "M299,200L333,200L333,349.22L299.02,390L258,390L258,362L282,362L299,341.6Z", nib: 40, dur: 0.25, gap: 0.1,
    runs: [[[316, 179], [316, 345.4]], [[316, 345.4], [290.5, 376]], [[290.5, 376], [240, 376]]] },
  { d: "M316,144L333,161L316,178L299,161Z", stamp: true, gap: 0.03 },
  // ي
  { d: "M226,200L260,200L260,300L226,300Z", nib: 40, dur: 0.12, gap: 0.06, runs: [[[243, 179], [243, 321]]] },
  { d: "M227,161a16,16 0 1,0 32,0a16,16 0 1,0 -32,0ZM235.5,161a7.5,7.5 0 1,1 15,0a7.5,7.5 0 1,1 -15,0Z", stamp: true, gap: 0.03 },
  { d: "M226,314L240.5,328.5L226,343L211.5,328.5ZM260,314L274.5,328.5L260,343L245.5,328.5Z", stamp: true, gap: 0.06 },
  // ج
  { d: "M46,200L198,200L198,228L86.35,362L198,362L198,390L46,390L46,362L157.65,228L46,228Z", nib: 34, dur: 0.38, gap: 0.08,
    runs: [[[28, 214], [216, 214]], [[189.5, 214], [54.5, 376]], [[28, 376], [216, 376]]] },
  { d: "M179.56,272L212,272L212,300L156.23,300Z", nib: 34, dur: 0.08, gap: 0.03, runs: [[[230, 286], [138, 286]]] },
  { d: "M145,316.5L159.5,331L145,345.5L130.5,331Z", stamp: true, gap: 0.03 },
];

// a run of the pen as a parallelogram: along the run, and across it the nib's edge (1, 1). Each run
// is a unit and a half longer at both ends than it is given, so two runs that meet at a corner
// overlap there: no hairline shows between them.
const penFrame = ([[x0, y0], [x1, y1]], nib) => {
  const len = Math.hypot(x1 - x0, y1 - y0), ex = (1.5 * (x1 - x0)) / len, ey = (1.5 * (y1 - y0)) / len;
  return [x1 - x0 + 2 * ex, y1 - y0 + 2 * ey, nib, nib, x0 - ex - nib / 2, y0 - ey - nib / 2];
};

// The check: every point of a written shape, and the points 1.5 units around it, lies inside one of
// that shape's runs. So no corner is left unwritten, and no edge is trimmed by its mask.
for (const part of SEAL_PARTS.filter((p) => p.runs)) {
  const poly = part.d.replace(/[MZ]/g, "").split("L").map((p) => p.split(",").map(Number));
  const inside = (x, y) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const frames = part.runs.map((run) => penFrame(run, part.nib));
  const swept = (x, y) => frames.some(([a, b, c, d, e, f]) => {
    const det = a * d - b * c, u = ((x - e) * d - (y - f) * c) / det, v = ((y - f) * a - (x - e) * b) / det;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  });
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.5) {
      if (!inside(x, y)) continue;
      for (const [dx, dy] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
        if (!swept(x + dx, y + dy)) throw new Error(`build-landing: the pen does not cover the seal at ${x + dx}, ${y + dy}`);
      }
    }
  }
}

// The times. A stroke of several runs moves as one: it gathers speed on its first run, holds it,
// and lands softly on its last (the first and last run take 5/3 as long for their length, which is
// what keeps the speed the same across each corner). A dot is pressed as its letter is finished, so
// the dots come one by one: the ز's after its hook, the ي's pair after its ring, the ج's last.
// PACE stretches the times set out in SEAL_PARTS: the opening is unhurried, a hand writing carefully.
const round3 = (v) => Math.round(v * 1000) / 1000;
const PACE = 1.8;
let sealClock = 0;
const SEAL_TIMED = SEAL_PARTS.map((part0) => {
  const part = { ...part0, gap: part0.gap * PACE, dur: part0.dur && part0.dur * PACE };
  sealClock += part.gap;
  if (part.stamp) return { ...part, at: round3(sealClock) };
  const n = part.runs.length;
  const weights = part.runs.map(([a, b], i) => Math.hypot(b[0] - a[0], b[1] - a[1]) * (n > 1 && (i === 0 || i === n - 1) ? 5 / 3 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const runs = part.runs.map((run, i) => {
    const dur = (part.dur * weights[i]) / total, at = sealClock;
    sealClock += dur;
    const ease = n === 1 ? "cubic-bezier(.4,0,.6,1)" : i === 0 ? "cubic-bezier(.4,0,1,1)" : i === n - 1 ? "cubic-bezier(0,0,.6,1)" : "linear";
    return { frame: penFrame(run, part.nib).map((v) => Math.round(v * 100) / 100).join(" "), at: round3(at), dur: round3(dur), ease };
  });
  return { ...part, runs };
});
const SEAL_END = round3(sealClock + 0.24);
const SEAL_WRITTEN = `<svg class="seal-written" viewBox="46 144 287 246" width="287" height="246" role="img" aria-label="Zij · زيج" style="--seal-end:${SEAL_END}s">
        <defs>
${SEAL_TIMED.map((part, i) => (part.stamp ? "" : `          <mask id="seal-pen-${i}" maskUnits="userSpaceOnUse" x="20" y="120" width="340" height="300">
${part.runs.map((run) => `            <g transform="matrix(${run.frame})"><path class="seal-pen" pathLength="1" d="M0 .5H1" style="--at:${run.at}s;--dur:${run.dur}s;--ease:${run.ease}"/></g>`).join("\n")}
          </mask>
`)).join("")}        </defs>
        <g class="seal-ink">
${SEAL_TIMED.map((part, i) => (part.stamp ? `          <path class="seal-stamp" d="${part.d}" style="--at:${part.at}s"/>` : `          <path d="${part.d}" mask="url(#seal-pen-${i})"/>`)).join("\n")}
        </g>
      </svg>`;

// ---- the page ---------------------------------------------------------------------------------
const head0 = html.indexOf('<link rel="preconnect" href="https://fonts.googleapis.com">');
const head1 = html.indexOf('<link rel="stylesheet" href="../tokens.css">');
if (head0 < 0 || head1 < 0) throw new Error("build-landing: the reference's head changed");
html = html.slice(0, head0) + html.slice(head1); // no font service: the faces are served from /atlas/fonts
const edits = [
  ["<title>Zij · Landing reference</title>", "<title>Zij: 26 years of fire on one scale</title>", "the title"],
  ['content="Design reference for Zij: how a page should look and feel. Every map, table and figure on it is an illustration, not data."', 'content="Satellite fire detections from MODIS and VIIRS, 2000 to today, harmonized into one record per area.">\n<link rel="canonical" href="https://zij.watch/">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Zij">\n<meta property="og:url" content="https://zij.watch/">\n<meta property="og:title" content="Zij: 26 years of fire on one scale">\n<meta property="og:description" content="Satellite fire detections from MODIS and VIIRS, 2000 to today, harmonized into one record per area.">\n<meta property="og:image" content="https://zij.watch/og.jpg">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="The Zij seal over a desert night sky: Satellites do the watching. We make the tables.">\n<meta name="twitter:card" content="summary_large_image"', "the description"],
  ['<link rel="icon" href="../logo/zij-impression.svg" type="image/svg+xml">', '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">\n<link rel="manifest" href="/manifest.webmanifest">', "the icon"],
  ['<link rel="stylesheet" href="../tokens.css">', '<link rel="stylesheet" href="/landing/tokens.css">', "tokens.css"],
  ['<link rel="stylesheet" href="materials.css">', '<link rel="stylesheet" href="/landing/reference/materials.css">\n<link rel="stylesheet" href="/landing/additions.css">', "materials.css"],
  ['<script src="landing.js"></script>', `<script>window.ZIJ_TABLE = ${JSON.stringify(table)};</script>\n<script src="/landing/reference/landing.js"></script>\n<script src="/landing/life.js"></script>`, "the script"],
  ['<p class="line">Satellites do the watching.<br>We make the tables.</p>', '<p class="line">1,000 years ago, a zij charted the sky.<br>Ours charts a safer Earth.</p>', "the hero's line"],
  ['<h1><img src="../logo/zij-seal-night.svg" alt="Zij · زيج" width="287" height="246"></h1>', `<h1>${SEAL_WRITTEN}</h1>`, "the hero's seal"],
  // the words under the seal take their times from it (additions.css, the entrance)
  ['<div class="hero" id="hero">', `<div class="hero" id="hero" style="--seal-end:${SEAL_END}s">`, "the hero"],
  // The entrance (additions.css): set before anything is drawn, so the first frame already waits.
  // Only with motion; landing.js lets it in, and should it never run, this does after nine seconds.
  ['<meta name="viewport" content="width=device-width, initial-scale=1">', `<meta name="viewport" content="width=device-width, initial-scale=1">
<script>(function () { var r = document.documentElement; if (/[?&](still|wallpaper)\\b/.test(location.search) || matchMedia('(prefers-reduced-motion: reduce)').matches) return; r.classList.add('intro'); setTimeout(function () { r.classList.add('go'); }, 9000); })();</script>`, "the head"],
  ["from 25 years of NASA satellite records.", `from ${years} years of NASA satellite records.`, "the dek"],
  ['<a class="catchword begin" id="begin" href="#ch-1">Begin reading</a>', '<a class="catchword enter" href="/explore">Open the map</a>\n      <a class="scroll-cue" id="begin" href="#record" aria-label="Scroll down to the record"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v15M5 13l7 7 7-7"/></svg></a>', "the hero's link"],
  ["Over the Nile Delta, VIIRS sees 11 to 20 times more fire pixels than MODIS, and the gap changes from year to year.", `Over the Nile Delta in autumn, VIIRS on Suomi NPP records ${Math.round(usual[0])} to ${Math.round(usual[usual.length - 1])} times more fire pixels than MODIS on Aqua in most years, and ${Math.round(peak.ratio)} times in ${peak.year}. The gap changes from year to year.`, "the pixel ratio"],
  // The record comes first, directly under the opening: it is the reason to keep reading.
  ['<section class="chapter ch1" id="ch-1"', `${record}${showsSection}\n    <section class="chapter ch1" id="ch-1"`, "chapter one"],
  ["Thread ties the two records where both flew, 2012 to 2020; the fit is then tested on years held back.", `Thread ties the two records where both flew, ${train0} to ${train1}; the fit is then tested on years held back.`, "the training years"],
  ['<p class="t-eyebrow" style="margin:0">fire days per month</p>', `<p class="t-eyebrow" style="margin:0">${area.unit_label} per month</p>`, "the table's unit"],
  ["<h3>Any area, 2000 to 2025</h3>", `<h3>The Nile Delta, ${firstYear} to ${lastYear}</h3>`, "the table's title"],
  ['<span class="plate-mark jadwal-box">illustration · not data</span>', '<span class="plate-mark jadwal-box">from the record</span>', "the table's mark"],
  ['aria-label="Illustrative calendar: years 2000 to 2025 down, months across, coloured from fewer to more fire days. Autumn is the burning season. One quiet autumn is boxed in red."', `aria-label="Calendar of the Nile Delta: years ${firstYear} to ${lastYear} down, months across, coloured from fewer to more fire. Autumn is the burning season. The autumn of ${odd.y} is boxed in red."`, "the table's label"],
  ["A quiet autumn, boxed and noted in the margin the way a scribe would. Placeholder.", `Autumn ${odd.y}: ${oddPct}% ${odd.v < median ? "below" : "above"} the median season. Boxed and noted in the margin the way a scribe would.`, "the margin note"],
  ["more fire days</span>", "more fire</span>", "the legend"],
  // Every drawing that is not data says so beside itself, not only in a note elsewhere.
  ['<p class="note map-note">', '<p class="illus-tag"><span class="plate-mark jadwal-box">illustration · not data</span></p><p class="note map-note">', "the map's tag"],
  ['<span class="t-label modis">MODIS · 1 km pixels</span><span class="t-eyebrow">illustration</span>', '<span class="t-label modis">MODIS · 1 km pixels</span><span class="plate-mark jadwal-box">illustration · not data</span>', "the MODIS grid's tag"],
  ['<span class="t-label viirs">VIIRS · 375 m pixels</span><span class="t-eyebrow">illustration</span>', '<span class="t-label viirs">VIIRS · 375 m pixels</span><span class="plate-mark jadwal-box">illustration · not data</span>', "the VIIRS grid's tag"],
  ['<span class="ramp"><span class="sw-nd"></span> no satellite yet</span>', '<span class="ramp"><span class="sw-nd"></span> no data</span>', "the legend's last key"],
  ['<a class="stamp" href="#top">Open the tables</a>', '<a class="stamp" href="/explore">Open the map</a>\n        <a class="catchword" href="/explore?area=nile-delta&amp;tour=1">Take the tour</a>', "the closing button"],
  ['<a class="catchword" href="#ch-2">How it works</a>', '<a class="catchword" href="/how-it-works">How it works</a>\n        <a class="catchword" href="/downloads">Download the numbers</a>', "the closing link"],
  ['<div class="acts">', `<div class="numbers">
        <div><p class="fig">${Math.round(loyo("raw"))}% <span aria-hidden="true">→</span><span class="sr-only">to</span> ${Math.round(loyo("M4"))}%</p><p>Typical error of a season total across ${method.models.research_areas} test areas: raw MODIS read as VIIRS, then after Zij. Each year was predicted without being used to fit.</p></div>
        <div><p class="fig">${Math.round(delta)}%</p><p>The same error in the Nile Delta, where the autumn rice-straw burning is the largest signal.</p></div>
        <div><p class="fig">${years} years</p><p>One record per area, from the first MODIS season to yesterday, by week, month and season.</p></div>
      </div>
      <p class="numbers-note">The numbers are the pipeline’s own, from its validation. <a href="/how-it-works#models">How they were measured</a>.</p>
      <p class="sub t-reading whom">For anyone who has to say whether this season is unusual: environment and air-quality teams, agricultural advisers, fire agencies, journalists, students. Zij answers for 10 areas in Egypt, Portugal and Argentina, and for any area you draw inside them.</p>
      <div class="acts">`, "the closing"],
  ["<p>Made in Cairo for the 2026 NASA International Space Apps Challenge.</p>", '<p>Made in Cairo for the 2026 NASA International Space Apps Challenge. The code is open, at <a href="https://github.com/zij-watch">github.com/zij-watch</a>.</p>', "the colophon's first line"],
  ["<p>Fire records: NASA FIRMS (MODIS Collection 6.1, VIIRS 375 m). Imagery: NASA GIBS. Set in Cormorant Garamond, Amiri and Reem Kufi.</p>", '<p>Fire records: NASA FIRMS (MODIS Collection 6.1, VIIRS 375 m). Imagery: NASA GIBS. Map: made with Natural Earth. Set in Cormorant Garamond, Amiri and Reem Kufi. <a href="/how-it-works#sources">All sources</a>.</p>\n      <p>Zij is not affiliated with or endorsed by NASA.</p>', "the credits"],
  ["<p>This page is a design reference. Its maps, tables and figures are illustrations, not data.</p>", "<p>The season chart, the calendar and every number on this page come from the record. The two pixel grids and the map of the Delta are drawings, each marked “illustration”. The sky and the desk are the page’s setting.</p>", "the colophon's last line"],
];
for (const [from, to, what] of edits) html = swap(html, from, to, what);
// Hudhud's Fire Diary, the game, under the hero's link to the map.
html = swap(html, '<a class="catchword enter" href="/explore">Open the map</a>', `<a class="catchword enter" href="/explore">Open the map</a>\n      <a class="catchword play" href="/diary">${playWords}</a>`, "the hero's link to the game");
html = html.replaceAll('"../logo/', '"/landing/logo/');
// The page's own styles point at the patterns beside the reference; here they are under /landing.
html = html.replaceAll('"../assets/', '"/landing/assets/');
// The two files that change with the data or the styles carry a stamp, so a cached copy is never stale.
const stamp = createHash("sha1").update(js).update(read("../landing-src/additions.css")).update(read("../landing-src/life.js")).digest("hex").slice(0, 8);
html = html.replace('/landing/additions.css"', `/landing/additions.css?v=${stamp}"`).replace('/landing/reference/landing.js"', `/landing/reference/landing.js?v=${stamp}"`).replace('/landing/life.js"', `/landing/life.js?v=${stamp}"`);
if (/fonts\.g(oogleapis|static)|\.\.\//.test(html)) throw new Error("build-landing: an outside or relative reference is left in the page");

writeFileSync(here("../public/landing.html"), html);
writeFileSync(here("../public/landing/reference/landing.js"), js);
console.log(`landing: ${years} seasons, jump x${times} in ${firstViirs.year}, boxed autumn ${odd.y} (${oddPct}% ${odd.v < median ? "below" : "above"}), ${Math.round(loyo("raw"))}% -> ${Math.round(loyo("M4"))}%, Delta ${Math.round(delta)}%`);
