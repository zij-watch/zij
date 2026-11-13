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

mkdirSync(here("../public/landing/reference/"), { recursive: true });
for (const dir of ["logo", "assets"]) cpSync(here(`../landing-src/${dir}/`), here(`../public/landing/${dir}/`), { recursive: true });
for (const file of ["tokens.css", "reference/materials.css", "additions.css"]) cpSync(here(`../landing-src/${file}`), here(`../public/landing/${file}`));

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

// The record and its findings sit before chapter one, outside every chapter, so nothing spread their
// ink: each now gets its drop when it comes into view, as the chapters' sheets do.
js = swap(js, "  lineStops.forEach((s) => stopIO.observe(s));", `  lineStops.forEach((s) => stopIO.observe(s));
  const recordIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { recordIO.unobserve(e.target); later(() => inkIn(e.target), still ? 0 : 350); }
  }, { threshold: 0.2 });
  document.querySelectorAll('.desk > .record [data-ink]').forEach((s) => recordIO.observe(s));`, "the record's ink");

// The record lies above the lantern (additions.css), so the thread from the spool to chapter one ran
// under it. It is drawn again inside each record section, cut to that section's box: on top of the
// sheet, still under nothing it shouldn't be. The copies are added to each thread's elements, so they
// are drawn in the same stroke as the thread itself.
js = swap(js, "    layThreads();", `    layThreads();
    threadsOverRecord();`, "the thread over the record");
js = swap(js, "  function drawThread(t) {", `  function threadsOverRecord() {
    const src = $('desk-threads'), dr = desk.getBoundingClientRect();
    desk.querySelectorAll(':scope > .record').forEach((sec) => {
      let svg = sec.querySelector(':scope > .record-threads');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'desk-threads record-threads'); svg.setAttribute('aria-hidden', 'true');
        sec.appendChild(svg);
      }
      const r = sec.getBoundingClientRect(), w = sec.offsetWidth, h = sec.offsetHeight;
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      svg.setAttribute('viewBox', \`\${n1(r.left - dr.left)} \${n1(r.top - dr.top)} \${n1(w)} \${n1(h)}\`);
      svg.innerHTML = src.innerHTML;
      const copies = svg.querySelectorAll('.t');
      threads.forEach((t, i) => { const path = copies[i]; if (path) t.els.push(path.previousElementSibling, path); });
    });
  }
  function drawThread(t) {`, "drawThread");

// ---- the page ---------------------------------------------------------------------------------
const head0 = html.indexOf('<link rel="preconnect" href="https://fonts.googleapis.com">');
const head1 = html.indexOf('<link rel="stylesheet" href="../tokens.css">');
if (head0 < 0 || head1 < 0) throw new Error("build-landing: the reference's head changed");
html = html.slice(0, head0) + html.slice(head1); // no font service: the faces are served from /atlas/fonts
const edits = [
  ["<title>Zij · Landing reference</title>", "<title>Zij: 26 years of fire on one scale</title>", "the title"],
  ['content="Design reference for Zij: how a page should look and feel. Every map, table and figure on it is an illustration, not data."', 'content="Satellite fire detections from MODIS and VIIRS, 2000 to today, harmonized into one record per area."', "the description"],
  ['<link rel="icon" href="../logo/zij-impression.svg" type="image/svg+xml">', '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">\n<link rel="manifest" href="/manifest.webmanifest">', "the icon"],
  ['<link rel="stylesheet" href="../tokens.css">', '<link rel="stylesheet" href="/landing/tokens.css">', "tokens.css"],
  ['<link rel="stylesheet" href="materials.css">', '<link rel="stylesheet" href="/landing/reference/materials.css">\n<link rel="stylesheet" href="/landing/additions.css">', "materials.css"],
  ['<script src="landing.js"></script>', `<script>window.ZIJ_TABLE = ${JSON.stringify(table)};</script>\n<script src="/landing/reference/landing.js"></script>`, "the script"],
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
  ['<a class="stamp" href="#top">Open the tables</a>', '<a class="stamp" href="/explore">Open the map</a>\n        <a class="catchword" href="/explore?area=nile-delta&amp;tour=1">Take the 60-second tour</a>', "the closing button"],
  ['<a class="catchword" href="#ch-2">How it works</a>', '<a class="catchword" href="/how-it-works">How it works</a>\n        <a class="catchword" href="/downloads">Download the numbers</a>', "the closing link"],
  ['<div class="acts">', `<div class="numbers">
        <div><p class="fig">${Math.round(loyo("raw"))}% <span aria-hidden="true">→</span><span class="sr-only">to</span> ${Math.round(loyo("M4"))}%</p><p>Typical error of a season total across ${method.models.research_areas} test areas: raw MODIS read as VIIRS, then after Zij. Each year was predicted without being used to fit.</p></div>
        <div><p class="fig">${Math.round(delta)}%</p><p>The same error in the Nile Delta, where the autumn rice-straw burning is the largest signal.</p></div>
        <div><p class="fig">${years} years</p><p>One record per area, from the first MODIS season to yesterday, by week, month and season.</p></div>
      </div>
      <p class="numbers-note">The numbers are the pipeline’s own, from its validation. <a href="/how-it-works#models">How they were measured</a>.</p>
      <p class="sub t-reading whom">For anyone who has to say whether this season is unusual: environment and air-quality teams, agricultural advisers, fire agencies, journalists, students. Zij answers for 10 areas in Egypt, Portugal and Argentina, and for any area you draw inside them.</p>
      <div class="acts">`, "the closing"],
  ["<p>Fire records: NASA FIRMS (MODIS Collection 6.1, VIIRS 375 m). Imagery: NASA GIBS. Set in Cormorant Garamond, Amiri and Reem Kufi.</p>", '<p>Fire records: NASA FIRMS (MODIS Collection 6.1, VIIRS 375 m). Imagery: NASA GIBS. Map: made with Natural Earth. Set in Cormorant Garamond, Amiri and Reem Kufi. <a href="/how-it-works#sources">All sources</a>.</p>\n      <p>Zij is not affiliated with or endorsed by NASA.</p>', "the credits"],
  ["<p>This page is a design reference. Its maps, tables and figures are illustrations, not data.</p>", "<p>The season chart, the calendar and every number on this page come from the record. The two pixel grids and the map of the Delta are drawings, each marked “illustration”. The sky and the desk are the page’s setting.</p>", "the colophon's last line"],
];
for (const [from, to, what] of edits) html = swap(html, from, to, what);
html = html.replaceAll('"../logo/', '"/landing/logo/');
// The page's own styles point at the patterns beside the reference; here they are under /landing.
html = html.replaceAll('"../assets/', '"/landing/assets/');
// The two files that change with the data or the styles carry a stamp, so a cached copy is never stale.
const stamp = createHash("sha1").update(js).update(read("../landing-src/additions.css")).digest("hex").slice(0, 8);
html = html.replace('/landing/additions.css"', `/landing/additions.css?v=${stamp}"`).replace('/landing/reference/landing.js"', `/landing/reference/landing.js?v=${stamp}"`);
if (/fonts\.g(oogleapis|static)|\.\.\//.test(html)) throw new Error("build-landing: an outside or relative reference is left in the page");

writeFileSync(here("../public/landing.html"), html);
writeFileSync(here("../public/landing/reference/landing.js"), js);
console.log(`landing: ${years} seasons, jump x${times} in ${firstViirs.year}, boxed autumn ${odd.y} (${oddPct}% ${odd.v < median ? "below" : "above"}), ${Math.round(loyo("raw"))}% -> ${Math.round(loyo("M4"))}%, Delta ${Math.round(delta)}%`);
