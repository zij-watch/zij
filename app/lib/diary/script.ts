// Every word of Hudhud's Fire Diary, in one place (the plan's section 4, version 3).
//
// Edit the words here. scripts/check-diary.mjs checks them before `dev` and `build`, and
// /studio/diary?script shows each one with its word count:
//   - a line from Hudhud, MODIS or VIIRS, or one on a slip or card: 12 words or fewer
//   - no more than 2 lines in a row before the player does something (an `act`)
//   - a button or label: 5 words or fewer
//   - one "For grown-ups" note per level, one sentence, 25 words or fewer
//   - at most one number in a line (the notes are exempt), no exclamation marks, no emoji, no Arabic,
//     and none of the words to avoid (the notes are exempt from those too)
//   - no figures typed in: a number is a {placeholder} filled from the data (lib/diary/numbers.ts).
//     Write {Name} to start a sentence with it. The one figure allowed is the 0 token of level 3.
//
// Every word the game shows has an `id`: the game takes its words from here by id, never its own.
// `act` is what the player does and `show` what happens on screen: neither is shown as text.
// `when` says what makes a line appear. `was` and `why` mark a line changed from the v3 script.
// Plain data, no imports at run time: Node reads this file directly in the checker.

export type Who = "hudhud" | "modis" | "viirs";
/** A line that depends on the data: `pick` names a choice in lib/diary/numbers.ts (picks). */
export type Variants = { pick: "heat" | "thisYear"; options: Record<string, string> };
export type Text = string | Variants;
type Edit = { was?: string; why?: string };

export type LabelRole =
  | "stamp" | "catchword" | "answer" | "tray" | "token" | "gear" | "seal" | "pin" | "flag"
  | "envelope" | "scale" | "lever" | "caption" | "slip-title" | "person";
export type LineRole = "slip" | "card" | "question" | "pin" | "rumour";

export type Beat =
  | ({ id: string; say: Who; text: Text; when?: string } & Edit)
  | ({ act: string } & Edit)
  | ({ show: string } & Edit)
  | ({ id: string; label: Text; role: LabelRole } & Edit)
  | ({ id: string; line: Text; role: LineRole; when?: string } & Edit);

export type Part = { id: string; title: string; bonus?: boolean; beats: Beat[] };
export type Chapter = { id: string; title: string; note?: { text: string } & Edit; parts: Part[] };

/** The running head: one word per level. */
export const RUNNING_HEAD = ["Spot", "Sort", "Count", "Translate", "Compare"];

/** Words on the game's own instruments, outside any one level's script. */
export const UI_LABELS: { id: string; label: string; role: LabelRole; what: string }[] = [
  { id: "ui.grownups", label: "For grown-ups", role: "catchword", what: "opens the folded note of a level" },
  { id: "ui.skip", label: "Skip this part", role: "catchword", what: "on a bonus part (5.4, 5.5)" },
  { id: "ui.goon", label: "Go on", role: "stamp", what: "at the end of a level, after its stars" },
  { id: "ui.next", label: "Next", role: "catchword", what: "moves a scene on when nothing else is to be done" },
  { id: "ui.carry", label: "Carry on", role: "stamp", what: "on return, goes back to the level reached" },
  { id: "ui.again", label: "Start again", role: "catchword", what: "on return, starts from the opening" },
  { id: "ui.keys", label: "Enter picks up, arrows move", role: "caption", what: "under anything that can be dragged" },
  { id: "ui.illus", label: "illustration · not data", role: "caption", what: "beside every scene that is a drawing, not the record" },
  { id: "ui.stars", label: "Stars in the sky", role: "caption", what: "names the constellation the player fills" },
  { id: "ui.diary", label: "The fire diary", role: "slip-title", what: "the title on the diary's page" },
  { id: "ui.modis", label: "MODIS", role: "caption", what: "the name beside the older satellite, always in words" },
  { id: "ui.viirs", label: "VIIRS", role: "caption", what: "the name beside the younger satellite, always in words" },
  { id: "ui.hudhud", label: "Hudhud, the hoopoe", role: "caption", what: "the guide's name for screen readers" },
  ...["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => ({ id: `ui.m${i + 1}`, label: m, role: "caption" as const, what: "a month on the calendar gear's volvelle" })),
  { id: "ui.landing", label: "Play Hudhud's Fire Diary", role: "catchword", what: "on the landing page, under Open the map" },
];

const TAP_TO_SPEAK = "Each satellite speaks when the player taps it, so no more than two lines run in a row.";

export const SCRIPT: Chapter[] = [
  {
    id: "opening",
    title: "Opening: The fire diary",
    parts: [
      {
        id: "0",
        title: "The fire diary",
        beats: [
          { show: "Night sky. The camera drifts down over the Delta's fields. Hudhud flies in and lands on a palm." },
          { id: "open.hello", say: "hudhud", text: "I'm Hudhud. I keep a diary of fires." },
          { id: "open.straw", say: "hudhud", text: "Each autumn, farmers burn the straw left after the rice harvest." },
          { show: "Two satellites glide in along their brass rings." },
          { act: "Tap MODIS.", was: "MODIS and VIIRS spoke straight after Hudhud's two lines.", why: TAP_TO_SPEAK },
          { id: "open.modis", say: "modis", text: "MODIS. Watching since {modisStart}." },
          { act: "Tap VIIRS." },
          { id: "open.viirs", say: "viirs", text: "VIIRS. Since {viirsStart}. Sharper eyes." },
          { id: "open.ready", say: "hudhud", text: "Five steps make the diary true. Ready?" },
          { show: "The running head is written in, word by word." },
          { id: "open.begin", label: "Begin", role: "stamp" },
          { act: "Press Begin." },
        ],
      },
    ],
  },
  {
    id: "spot",
    title: "Level 1 · Spot",
    note: {
      text: "MODIS sees squares about {modisKm} km wide, VIIRS {viirsM} m, so over the Delta VIIRS sees {pixelRange} times more fire pixels most years.",
      was: "MODIS sees squares about 1 km wide, VIIRS 375 m, so over the Delta in autumn VIIRS reports 11 to 20 times as many fire pixels.",
      why: "26 words, one over the limit; and the README says 11 to 20 times in most years (42 in 2018).",
    },
    parts: [
      {
        id: "1",
        title: "Spot",
        beats: [
          { show: "The fields pass below. MODIS and VIIRS cross in turn, each casting a beam (lapis, rubric)." },
          { id: "spot.start", say: "hudhud", text: "Tap a fire while a satellite looks.", when: "start" },
          { act: "Tap a fire inside MODIS's beam. MODIS logs the field as one big square." },
          { id: "spot.modis", say: "hudhud", text: "MODIS sees big squares.", when: "first MODIS catch" },
          { act: "Tap a fire inside VIIRS's beam. VIIRS logs it as several small squares, and a tiny fire MODIS missed." },
          { id: "spot.viirs", say: "hudhud", text: "VIIRS sees small squares. She caught a tiny one.", when: "first VIIRS catch" },
          { id: "spot.miss", say: "hudhud", text: "Wait for a beam, then tap.", when: "a tap outside every beam", was: "(none)", why: "The hint for a tap with no satellite looking." },
          { act: "Log ten fires in all. Three stars without help, fewer with hints." },
          { show: "The two tallies sit side by side, MODIS's and VIIRS's." },
          { id: "spot.tally.modis", label: "MODIS squares", role: "caption" },
          { id: "spot.tally.viirs", label: "VIIRS squares", role: "caption" },
          { id: "spot.end", say: "hudhud", text: "Same fires. Very different counts.", when: "end" },
        ],
      },
    ],
  },
  {
    id: "sort",
    title: "Level 2 · Sort",
    note: { text: "Zij keeps about {keptMillions} million fire detections, and leaves out about {leftOutMillions} million at factories and gas flares or too faint to trust." },
    parts: [
      {
        id: "2",
        title: "Sort",
        beats: [
          { id: "sort.start", say: "hudhud", text: "Not every hot spot is a field fire.", when: "start" },
          { id: "sort.tray.field", label: "Field fire", role: "tray" },
          { id: "sort.tray.not", label: "Not a field fire", role: "tray" },
          { id: "sort.is.field", label: "Hot spot on a field", role: "token", was: "(none)", why: "What each hot spot is, for anyone who cannot see it." },
          { id: "sort.is.factory", label: "Hot spot by a chimney", role: "token" },
          { id: "sort.is.ghost", label: "A very faint hot spot", role: "token" },
          { act: "Drag each hot spot into a tray as it arrives." },
          { act: "Tap the factory flame by its chimney: seven nights, lit in the same spot every night." },
          { id: "sort.factory", say: "hudhud", text: "It burns every night in one spot. A factory.", when: "first factory flame" },
          { act: "Sort a very faint ghost dot." },
          { id: "sort.ghost", say: "hudhud", text: "Too faint to be sure. Leave it out.", when: "first ghost dot" },
          { act: "Drop a hot spot into the wrong tray." },
          { id: "sort.wrong", say: "hudhud", text: "Look again. Every night? Very faint?", when: "wrong tray" },
          { act: "Sort twelve in all. Three stars with no mistakes." },
          { id: "sort.end", say: "hudhud", text: "Only real field fires now.", when: "end" },
        ],
      },
    ],
  },
  {
    id: "count",
    title: "Level 3 · Count",
    note: { text: "Zij knows {gaps} satellite gaps in {seasonCount} years and marks every one as “no data”, never as zero." },
    parts: [
      {
        id: "3",
        title: "Count",
        beats: [
          { show: "A week of seven boxes. Above each, the satellite is looking (eye open over a dark field) or asleep." },
          { id: "count.start", say: "hudhud", text: "Some nights it looked. Some nights it slept.", when: "start" },
          { id: "count.zero", label: "0", role: "token" },
          { id: "count.unknown", label: "?", role: "token" },
          { id: "count.day.looked", label: "It looked", role: "caption", was: "(none)", why: "Each night's state, for anyone who cannot see the eye." },
          { id: "count.day.asleep", label: "It slept", role: "caption" },
          { act: "Drag a 0 onto a night when the satellite was asleep." },
          { id: "count.asleep", say: "hudhud", text: "It was asleep. We don't know. That's a ?", when: "0 on an asleep night" },
          { id: "count.looked", say: "hudhud", text: "It looked and saw nothing. That's a 0.", when: "? on a night it looked", was: "(none)", why: "The hint for the opposite mistake." },
          { act: "Fill the rest of the week." },
          { show: "A real week from the record: one VIIRS satellite was switched off, the other kept looking." },
          { id: "count.real", label: "A real week: {realWeek}", role: "caption" },
          { id: "count.real.off", label: "{realOff}, switched off", role: "caption" },
          { id: "count.real.on", label: "{realOn}, still looking", role: "caption" },
          { act: "Fill the real week. Three stars with no mistakes." },
          { id: "count.end", say: "hudhud", text: "0 means none seen. ? means nobody looked.", when: "end" },
        ],
      },
    ],
  },
  {
    id: "translate",
    title: "Level 4 · Translate",
    note: {
      text: "A fire square is a hotspot-day, {gridDeg}° on one day; hiding each year, the translator is about {loyoPct}% off, and {outOfTimePct}% on {testYears}.",
      was: "Two notes: “Zij's unit is the hotspot-day: a 0.1° square, about 10 km, with fire on one day, counted per satellite.” (4.2) and “Hiding each year in turn, the translator is about 7% off on average; on 2021 to 2025, which it never saw, about 10%.” (4.5)",
      why: "One note per level: the two are joined in one sentence of 25 words.",
    },
    parts: [
      {
        id: "4.0",
        title: "To the desk",
        beats: [
          { show: "The camera tilts from the sky to the desk. The translator stands beside the open diary." },
          { id: "t40.hard", say: "hudhud", text: "This is the hard puzzle. It's why Zij exists." },
        ],
      },
      {
        id: "4.1",
        title: "The fake jump",
        beats: [
          { id: "t41.modis", label: "MODIS years", role: "token" },
          { id: "t41.viirs", label: "VIIRS years", role: "token" },
          { act: "Drag the MODIS years (lapis) and then the VIIRS years (rubric) into the diary." },
          { show: "The VIIRS bars are about ten times taller: a cliff where VIIRS begins." },
          { id: "t41.why", line: "Why the cliff?", role: "question", was: "(none)", why: "The question the three answers answer." },
          { id: "t41.farmers", label: "Farmers burned {timesWord} times more", role: "answer" },
          { id: "t41.sharper", label: "A sharper satellite started counting", role: "answer" },
          { id: "t41.river", label: "The river caught fire", role: "answer" },
          { act: "Press “Farmers burned…”." },
          {
            id: "t41.if.farmers",
            say: "hudhud",
            text: "{TimesWord} times, in one year? Who started counting then?",
            when: "if farmers",
            was: "Ten times in one year? Who started counting in 2012?",
            why: "Two numbers in one line.",
          },
          { act: "Press “The river caught fire”." },
          { id: "t41.if.river", say: "hudhud", text: "Rivers don't burn. Try again.", when: "if river" },
          { act: "Press “A sharper satellite started counting”." },
          { id: "t41.if.sharper", say: "hudhud", text: "Yes. The fields didn't change. The counter did.", when: "if satellite" },
          { show: "A rumour slip is pinned to the desk." },
          { id: "t41.rumour", line: "Fires {timesWord} times worse", role: "rumour" },
          { id: "t41.false", label: "False", role: "stamp" },
          { act: "Press the False stamp. One drop of ink spreads across the slip." },
          { id: "t41.language", say: "hudhud", text: "Let's make both satellites speak one language." },
        ],
      },
      {
        id: "4.2",
        title: "One grid",
        beats: [
          { show: "The camera pushes in over a few fields: MODIS's big squares on the left, VIIRS's dots on the right.", was: "Zoom into a few fields.", why: "No zooming in the design system: a push-in." },
          { id: "t42.lay", label: "Lay the grid", role: "catchword" },
          { act: "Lay the brass grid over both (it clicks square), then tap every grid square with fire. Each lights once." },
          { id: "t42.once", say: "hudhud", text: "Each square counts once a day. Dots don't matter." },
          { id: "t42.nextday", label: "Next day", role: "catchword" },
          { act: "The day counter steps on. Tap again." },
          { id: "t42.ruler", say: "hudhud", text: "Now both use the same ruler: fire squares." },
        ],
      },
      {
        id: "4.3",
        title: "The magic number",
        beats: [
          { show: "A chart of the years both flew: VIIRS as a solid rubric line, translated MODIS as a dashed ink line.", was: "Translated MODIS as a dashed lapis line.", why: "The design system draws the harmonized series in ink; lapis stays raw MODIS." },
          { id: "t43.learns", say: "hudhud", text: "Both flew in these years. The translator learns here." },
          { id: "t43.far", label: "far off", role: "scale" },
          { id: "t43.close", label: "close", role: "scale" },
          { id: "t43.spot", label: "spot on", role: "scale" },
          { id: "t43.dial", label: "Turn the dial", role: "caption" },
          { act: "Turn the × dial. The needle moves from far off towards close, and overshoots past ×{magic}." },
          { id: "t43.closer", say: "hudhud", text: "Closer. But one number can't fit every week.", when: "at ×{magic}" },
        ],
      },
      {
        id: "4.4",
        title: "Upgrade the translator",
        beats: [
          { id: "t44.g1", label: "Quiet weeks", role: "gear" },
          { id: "t44.g2", label: "The calendar", role: "gear" },
          { id: "t44.g3", label: "Fire heat", role: "gear" },
          { id: "t44.g4", label: "Busy years", role: "gear" },
          { id: "t44.try", label: "Try it", role: "catchword" },
          { act: "Try the balance: a quiet week against a busy one." },
          { id: "t44.quiet", say: "hudhud", text: "In quiet weeks, tiny fires matter more." },
          { act: "Seat the gear. The needle moves closer. Turn the volvelle of 12 months: autumn shows a cloud of tiny fires." },
          { id: "t44.month", say: "hudhud", text: "Each month has its own tiny fires." },
          { act: "Seat the gear. Compare two fires: small and cool, big and hot." },
          {
            id: "t44.heat",
            say: "hudhud",
            text: { pick: "heat", options: { cool: "Cool fires come with more tiny fires MODIS missed.", hot: "Hot fires come with more tiny fires MODIS missed." } },
            was: "Hot fires mean more fires nearby.",
            why: "The Delta's fit says the opposite: its heat term is negative, so cooler fires mean more extra squares. The data picks the line.",
          },
          { act: "Seat the gear. Move the lever from a quiet year to a busy year." },
          { id: "t44.busy", say: "hudhud", text: "Busy years have more tiny fires too." },
          { act: "Seat the last gear. The dashed line hugs the solid one." },
          { id: "t44.m4", say: "hudhud", text: "This is {model}, the translator Zij really uses.", when: "all four in" },
          { id: "t44.fair", say: "hudhud", text: "But it practised on these years. Is that a fair test?" },
        ],
      },
      {
        id: "4.5",
        title: "The fair exam",
        beats: [
          { id: "t45.fair", label: "Fair", role: "answer", was: "(none)", why: "The player answers “Is that a fair test?”, so three lines don't run in a row." },
          { id: "t45.notfair", label: "Not fair", role: "answer" },
          { act: "Press either answer." },
          { show: "Nine cards, one for each year both flew." },
          { id: "t45.hide", say: "hudhud", text: "Hide a year. The translator can't peek.", when: "start" },
          { id: "t45.guess", label: "Its guess", role: "caption" },
          { id: "t45.real", label: "The real count", role: "caption" },
          { act: "Turn a card face down. The translator learns from the other eight, writes its guess, and the card turns back." },
          { id: "t45.worst", say: "hudhud", text: "{worstYear} was its worst guess. Zij shows that too.", when: "after {worstYear}" },
          { act: "Hide three years in all (the rest are bonus)." },
          { id: "t45.envelope", label: "{testYears}, never seen", role: "envelope" },
          { id: "t45.never", say: "hudhud", text: "Now years it has never seen.", when: "the envelope" },
          { act: "Break the wax seal. The real counts slide out beside the guesses." },
          { id: "t45.close", say: "hudhud", text: "Close, every time. And Zij always says how close.", when: "end" },
          { id: "t45.seal", label: "Honest Scientist", role: "seal" },
          { act: "Press the seal into the diary." },
        ],
      },
      {
        id: "4.6",
        title: "One diary",
        beats: [
          { id: "t46.crank", label: "Turn the crank", role: "catchword" },
          { act: "Crank the translator: the MODIS years come out in VIIRS's language, each with a soft doubt band." },
          { act: "Tap a band." },
          { id: "t46.band", say: "hudhud", text: "A translated year can't be exact. The band shows how far off." },
          { id: "t46.two", label: "Two records", role: "lever" },
          { id: "t46.one", label: "One diary", role: "lever" },
          { act: "Move the before-and-after lever: the fake jump appears and vanishes." },
          { id: "t46.gone", say: "hudhud", text: "The fake jump is gone. One diary, {seasonCount} autumns." },
          { act: "Tap MODIS.", was: "MODIS and VIIRS spoke straight after Hudhud.", why: TAP_TO_SPEAK },
          { id: "t46.modis", say: "modis", text: "My old years count again." },
          { act: "Tap VIIRS." },
          { id: "t46.viirs", say: "viirs", text: "And I'm not alone." },
          { id: "t46.built", label: "What Zij built", role: "slip-title" },
          { act: "Unfold the slip, one line at a time." },
          { id: "t46.b1", line: "Two NASA records, one diary.", role: "slip" },
          { id: "t46.b2", line: "{SatelliteWord} satellites, read as one.", role: "slip", was: "26 years, five satellites.", why: "Two numbers in one line; the 26 years are said just before." },
          { id: "t46.b3", line: "Tested on years it never saw.", role: "slip" },
          { id: "t46.b4", line: "Any place you draw.", role: "slip" },
        ],
      },
    ],
  },
  {
    id: "compare",
    title: "Level 5 · Compare",
    note: {
      text: "Since {recentFrom}, the Delta's autumns average {recentMean} fire squares, against {referenceMean} in {referenceYears}: {sincePct}% fewer.",
      was: "(none)",
      why: "Every level has one note; this one carries the figures behind 5.2.",
    },
    parts: [
      {
        id: "5.0",
        title: "The detective",
        beats: [
          { show: "Hudhud picks up a reading stone from the desk.", was: "Hudhud puts on a tiny detective's cap.", why: "The design system never looks like a cartoon; the reading stone is already on its desk." },
          { id: "c50.rule", say: "hudhud", text: "Rule one: only say what the diary shows." },
        ],
      },
      {
        id: "5.1",
        title: "Is this year special?",
        beats: [
          { show: "The autumns stand as bars, translated years with their bands. Hudhud brings this autumn." },
          { id: "c51.this", label: "This autumn", role: "token" },
          { act: "Set this autumn at the end of the row." },
          { id: "c51.higher", label: "Higher than usual", role: "answer" },
          { id: "c51.usual", label: "Usual", role: "answer" },
          { id: "c51.lower", label: "Lower than usual", role: "answer" },
          { act: "Press a wrong answer." },
          { id: "c51.wrong", say: "hudhud", text: "Look at the tallest years, then this one.", when: "wrong" },
          { act: "Press “Lower than usual”." },
          {
            id: "c51.right",
            say: "hudhud",
            text: { pick: "thisYear", options: { first: "Lower. The quietest autumn in {seasonCount} years.", among: "Lower. Among the quietest autumns in {seasonCount} years." } },
            when: "right",
            was: "Lower. One of the two quietest autumns in 26 years.",
            why: "Two numbers in one line; and this year's rank can still move, so the data picks the line.",
          },
          { id: "c51.fresh", say: "hudhud", text: "This year's numbers are fresh. They may change a little.", when: "then" },
        ],
      },
      {
        id: "5.2",
        title: "The quiet autumns",
        beats: [
          { id: "c52.before", label: "{referenceYears}", role: "caption" },
          { id: "c52.after", label: "{recentYears}", role: "caption" },
          { act: "Lay one brass bracket over the earlier years and another over the recent ones. A water line rises in each to its average." },
          { id: "c52.same", label: "About the same", role: "answer" },
          { id: "c52.half", label: "About half", role: "answer" },
          { id: "c52.double", label: "About double", role: "answer" },
          { act: "Press “About half”." },
          { id: "c52.right", say: "hudhud", text: "The recent years burn {sinceShare} as much.", when: "right", was: "Since 2018, about half the burning.", why: "Two numbers in one line (2018 and half)." },
          { id: "c52.bounce", say: "hudhud", text: "One year bounced back. Find it." },
          { act: "Tap {bounceYear}." },
          { id: "c52.wrong", say: "hudhud", text: "Compare the two water lines.", when: "wrong", was: "(none)", why: "The hint for a wrong answer." },
        ],
      },
      {
        id: "5.3",
        title: "The ban",
        beats: [
          { id: "c53.flag", label: "{banYear}: Burning straw banned.", role: "flag" },
          { act: "Move the reading stone over the years before the ban, then the years after." },
          { id: "c53.up", say: "hudhud", text: "After the ban, the fires seen went up." },
          { id: "c53.fail", line: "So did the ban fail?", role: "question" },
          { id: "c53.yes", label: "Yes", role: "answer" },
          { id: "c53.no", label: "No", role: "answer" },
          { id: "c53.cant", label: "The diary can't tell", role: "answer" },
          { act: "Press any answer. Three cards turn over." },
          { id: "c53.k1", line: "It was already rising before {banYear}.", role: "card" },
          { id: "c53.k2", line: "Only {banBeforeWord} years before the ban.", role: "card" },
          { id: "c53.k3", line: "We can't see what would have happened without it.", role: "card" },
          { id: "c53.detective", say: "hudhud", text: "A good detective says “I can't tell.”" },
        ],
      },
      {
        id: "5.4",
        title: "The missing fires",
        bonus: true,
        beats: [
          { show: "A clock with the satellites' pass times." },
          { id: "c54.day", label: "Day", role: "caption" },
          { id: "c54.night", label: "Night", role: "caption" },
          { id: "c54.fire", label: "A fire", role: "token" },
          { id: "c54.caught", label: "Caught", role: "caption" },
          { id: "c54.missed", label: "Missed", role: "caption" },
          { act: "Drag a fire along the clock: caught while it overlaps a pass, missed between passes. Then a tiny fire and a smoky one." },
          { id: "c54.hours", say: "hudhud", text: "Fewer fires seen can mean smaller fires, or other hours." },
        ],
      },
      {
        id: "5.5",
        title: "Around the world",
        bonus: true,
        beats: [
          { show: "A globe with three pins." },
          { id: "c55.kafr", label: "Kafr El Sheikh, Egypt", role: "pin" },
          { id: "c55.portugal", label: "Portugal", role: "pin" },
          { id: "c55.chilecito", label: "Chilecito, Argentina", role: "pin" },
          { act: "Tap Kafr El Sheikh." },
          { id: "c55.kafr.line", line: "The quietest autumns VIIRS has ever seen.", role: "pin" },
          { act: "Tap Portugal." },
          { id: "c55.portugal.line", line: "{PortugalShare} the burning it once had.", role: "pin", was: "Since 2018, less than half the summer burning.", why: "Two numbers in one line; and the season is August to October." },
          { act: "Tap Chilecito." },
          { id: "c55.chilecito.line", line: "So many dots. Only {chilecitoCells} fire squares.", role: "pin", was: "900 dots, only 8 squares. Squares, not dots.", why: "Two numbers in one line." },
          { id: "c55.pen", label: "Draw a loop", role: "caption" },
          { id: "c55.draw", label: "Draw it for me", role: "catchword" },
          { act: "Take Hudhud's brass pen and draw a loop round a field. A tiny diary appears." },
        ],
      },
      {
        id: "5.6",
        title: "Who needs the diary?",
        beats: [
          { show: "Five engraved figures on tokens on the left, five questions on the right." },
          { id: "c56.p1", label: "Air-quality officer", role: "person" },
          { id: "c56.p2", label: "Farm adviser", role: "person" },
          { id: "c56.p3", label: "Fire chief", role: "person" },
          { id: "c56.p4", label: "Journalist", role: "person" },
          { id: "c56.p5", label: "Student", role: "person" },
          { id: "c56.q1", line: "Is smoke season early this year?", role: "question" },
          { id: "c56.q2", line: "Did burning fall in my district?", role: "question" },
          { id: "c56.q3", line: "Is this week unusual here?", role: "question" },
          { id: "c56.q4", line: "Did fires really double?", role: "question" },
          { id: "c56.q5", line: "How has my region changed?", role: "question" },
          { act: "Tie each person to their question with brass thread." },
          { id: "c56.truth", say: "hudhud", text: "They all need one thing: a diary that tells the truth." },
          { id: "c56.seal", label: "Detective", role: "seal" },
          { act: "Press the seal into the diary." },
        ],
      },
    ],
  },
  {
    id: "ending",
    title: "Ending · Diary Keeper",
    parts: [
      {
        id: "6",
        title: "Diary Keeper",
        beats: [
          { show: "The stars are joined by brass thread into the hoopoe constellation. The running head is written over in full ink." },
          { id: "end.every", say: "hudhud", text: "Spot, sort, count, translate, compare. Zij does this every day." },
          { act: "Tap MODIS.", was: "All four lines ran in a row.", why: TAP_TO_SPEAK },
          { id: "end.modis", say: "modis", text: "Thanks for translating me." },
          { act: "Tap VIIRS." },
          { id: "end.viirs", say: "viirs", text: "See you in the sky." },
          { id: "end.credit", say: "hudhud", text: "Made in Cairo by Team Zij, for NASA Space Apps." },
          { id: "end.seal", label: "Diary Keeper", role: "seal" },
          { act: "Press the last seal. The Keeper's page: the three seals, the constellation and the five chapters." },
          { id: "end.page", label: "The Keeper's page", role: "slip-title" },
          { id: "end.save", label: "Save this page", role: "catchword" },
          { id: "end.map", label: "See the real map", role: "stamp" },
          { id: "end.again", label: "Play again", role: "catchword" },
          { id: "end.night", label: "Ride the night", role: "catchword" },
        ],
      },
    ],
  },
];
