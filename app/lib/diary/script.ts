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
  | ({ say: Who; text: Text; when?: string } & Edit)
  | ({ act: string } & Edit)
  | ({ show: string } & Edit)
  | ({ label: Text; role: LabelRole } & Edit)
  | ({ line: Text; role: LineRole; when?: string } & Edit);

export type Part = { id: string; title: string; bonus?: boolean; beats: Beat[] };
export type Chapter = { id: string; title: string; note?: { text: string } & Edit; parts: Part[] };

/** The running head: one word per level. */
export const RUNNING_HEAD = ["Spot", "Sort", "Count", "Translate", "Compare"];

/** Words on the game's own instruments, outside any one level. */
export const UI_LABELS: { label: string; role: LabelRole; what: string }[] = [
  { label: "For grown-ups", role: "catchword", what: "opens the folded note of a level" },
  { label: "Skip this part", role: "catchword", what: "on a bonus part (5.4, 5.5)" },
  { label: "Go on", role: "stamp", what: "at the end of a level, after its stars" },
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
          { say: "hudhud", text: "I'm Hudhud. I keep a diary of fires." },
          { say: "hudhud", text: "Each autumn, farmers burn the straw left after the rice harvest." },
          { show: "Two satellites glide in along their brass rings." },
          { act: "Tap MODIS.", was: "MODIS and VIIRS spoke straight after Hudhud's two lines.", why: TAP_TO_SPEAK },
          { say: "modis", text: "MODIS. Watching since {modisStart}." },
          { act: "Tap VIIRS." },
          { say: "viirs", text: "VIIRS. Since {viirsStart}. Sharper eyes." },
          { say: "hudhud", text: "Five steps make the diary true. Ready?" },
          { show: "The running head is written in, word by word." },
          { label: "Begin", role: "stamp" },
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
          { say: "hudhud", text: "Tap a fire while a satellite looks.", when: "start" },
          { act: "Tap a fire inside MODIS's beam. MODIS logs the field as one big square." },
          { say: "hudhud", text: "MODIS sees big squares.", when: "first MODIS catch" },
          { act: "Tap a fire inside VIIRS's beam. VIIRS logs it as several small squares, and a tiny fire MODIS missed." },
          { say: "hudhud", text: "VIIRS sees small squares. She caught a tiny one.", when: "first VIIRS catch" },
          { act: "Log ten fires in all. Three stars without help, fewer with hints." },
          { show: "The two tallies sit side by side, MODIS's and VIIRS's." },
          { say: "hudhud", text: "Same fires. Very different counts.", when: "end" },
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
          { say: "hudhud", text: "Not every hot spot is a field fire.", when: "start" },
          { label: "Field fire", role: "tray" },
          { label: "Not a field fire", role: "tray" },
          { act: "Drag each hot spot into a tray as it arrives." },
          { act: "Tap the factory flame by its chimney: seven nights, lit in the same spot every night." },
          { say: "hudhud", text: "It burns every night in one spot. A factory.", when: "first factory flame" },
          { act: "Sort a very faint ghost dot." },
          { say: "hudhud", text: "Too faint to be sure. Leave it out.", when: "first ghost dot" },
          { act: "Drop a hot spot into the wrong tray." },
          { say: "hudhud", text: "Look again. Every night? Very faint?", when: "wrong tray" },
          { act: "Sort twelve in all. Three stars with no mistakes." },
          { say: "hudhud", text: "Only real field fires now.", when: "end" },
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
          { say: "hudhud", text: "Some nights it looked. Some nights it slept.", when: "start" },
          { label: "0", role: "token" },
          { label: "?", role: "token" },
          { act: "Drag a 0 onto a night when the satellite was asleep." },
          { say: "hudhud", text: "It was asleep. We don't know. That's a ?", when: "0 on an asleep night" },
          { act: "Fill the rest of the week." },
          { show: "A real week from the record: one VIIRS satellite was switched off, the other kept looking." },
          { label: "A real week: {realWeek}", role: "caption" },
          { act: "Fill the real week. Three stars with no mistakes." },
          { say: "hudhud", text: "0 means none seen. ? means nobody looked.", when: "end" },
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
          { say: "hudhud", text: "This is the hard puzzle. It's why Zij exists." },
        ],
      },
      {
        id: "4.1",
        title: "The fake jump",
        beats: [
          { act: "Drag the MODIS years (lapis) and then the VIIRS years (rubric) into the diary." },
          { show: "The VIIRS bars are about ten times taller: a cliff where VIIRS begins." },
          { label: "Farmers burned {timesWord} times more", role: "answer" },
          { label: "A sharper satellite started counting", role: "answer" },
          { label: "The river caught fire", role: "answer" },
          { act: "Press “Farmers burned…”." },
          {
            say: "hudhud",
            text: "{TimesWord} times, in one year? Who started counting then?",
            when: "if farmers",
            was: "Ten times in one year? Who started counting in 2012?",
            why: "Two numbers in one line.",
          },
          { act: "Press “The river caught fire”." },
          { say: "hudhud", text: "Rivers don't burn. Try again.", when: "if river" },
          { act: "Press “A sharper satellite started counting”." },
          { say: "hudhud", text: "Yes. The fields didn't change. The counter did.", when: "if satellite" },
          { show: "A rumour slip is pinned to the desk." },
          { line: "Fires {timesWord} times worse", role: "rumour" },
          { label: "False", role: "stamp" },
          { act: "Press the False stamp. One drop of ink spreads across the slip." },
          { say: "hudhud", text: "Let's make both satellites speak one language." },
        ],
      },
      {
        id: "4.2",
        title: "One grid",
        beats: [
          { show: "The camera pushes in over a few fields: MODIS's big squares on the left, VIIRS's dots on the right.", was: "Zoom into a few fields.", why: "No zooming in the design system: a push-in." },
          { act: "Lay the brass grid over both (it clicks square), then tap every grid square with fire. Each lights once." },
          { say: "hudhud", text: "Each square counts once a day. Dots don't matter." },
          { act: "The day counter steps on. Tap again." },
          { say: "hudhud", text: "Now both use the same ruler: fire squares." },
        ],
      },
      {
        id: "4.3",
        title: "The magic number",
        beats: [
          { show: "A chart of the years both flew: VIIRS as a solid rubric line, translated MODIS as a dashed ink line.", was: "Translated MODIS as a dashed lapis line.", why: "The design system draws the harmonized series in ink; lapis stays raw MODIS." },
          { say: "hudhud", text: "Both flew in these years. The translator learns here." },
          { label: "far off", role: "scale" },
          { label: "close", role: "scale" },
          { label: "spot on", role: "scale" },
          { act: "Turn the × dial. The needle moves from far off towards close, and overshoots past ×{magic}." },
          { say: "hudhud", text: "Closer. But one number can't fit every week.", when: "at ×{magic}" },
        ],
      },
      {
        id: "4.4",
        title: "Upgrade the translator",
        beats: [
          { label: "Quiet weeks", role: "gear" },
          { label: "The calendar", role: "gear" },
          { label: "Fire heat", role: "gear" },
          { label: "Busy years", role: "gear" },
          { act: "Try the balance: a quiet week against a busy one." },
          { say: "hudhud", text: "In quiet weeks, tiny fires matter more." },
          { act: "Seat the gear. The needle moves closer. Turn the volvelle of 12 months: autumn shows a cloud of tiny fires." },
          { say: "hudhud", text: "Each month has its own tiny fires." },
          { act: "Seat the gear. Compare two fires: small and cool, big and hot." },
          {
            say: "hudhud",
            text: { pick: "heat", options: { cool: "Cool fires come with more tiny fires MODIS missed.", hot: "Hot fires come with more tiny fires MODIS missed." } },
            was: "Hot fires mean more fires nearby.",
            why: "The Delta's fit says the opposite: its heat term is negative, so cooler fires mean more extra squares. The data picks the line.",
          },
          { act: "Seat the gear. Move the lever from a quiet year to a busy year." },
          { say: "hudhud", text: "Busy years have more tiny fires too." },
          { act: "Seat the last gear. The dashed line hugs the solid one." },
          { say: "hudhud", text: "This is {model}, the translator Zij really uses.", when: "all four in" },
          { say: "hudhud", text: "But it practised on these years. Is that a fair test?" },
        ],
      },
      {
        id: "4.5",
        title: "The fair exam",
        beats: [
          { label: "Fair", role: "answer", was: "(none)", why: "The player answers “Is that a fair test?”, so three lines don't run in a row." },
          { label: "Not fair", role: "answer" },
          { act: "Press either answer." },
          { show: "Nine cards, one for each year both flew." },
          { say: "hudhud", text: "Hide a year. The translator can't peek.", when: "start" },
          { act: "Turn a card face down. The translator learns from the other eight, writes its guess, and the card turns back." },
          { say: "hudhud", text: "{worstYear} was its worst guess. Zij shows that too.", when: "after {worstYear}" },
          { act: "Hide three years in all (the rest are bonus)." },
          { label: "{testYears}, never seen", role: "envelope" },
          { say: "hudhud", text: "Now years it has never seen.", when: "the envelope" },
          { act: "Break the wax seal. The real counts slide out beside the guesses." },
          { say: "hudhud", text: "Close, every time. And Zij always says how close.", when: "end" },
          { label: "Honest Scientist", role: "seal" },
          { act: "Press the seal into the diary." },
        ],
      },
      {
        id: "4.6",
        title: "One diary",
        beats: [
          { act: "Crank the translator: the MODIS years come out in VIIRS's language, each with a soft doubt band." },
          { act: "Tap a band." },
          { say: "hudhud", text: "A translated year can't be exact. The band shows how far off." },
          { label: "Two records", role: "lever" },
          { label: "One diary", role: "lever" },
          { act: "Move the before-and-after lever: the fake jump appears and vanishes." },
          { say: "hudhud", text: "The fake jump is gone. One diary, {seasonCount} autumns." },
          { act: "Tap MODIS.", was: "MODIS and VIIRS spoke straight after Hudhud.", why: TAP_TO_SPEAK },
          { say: "modis", text: "My old years count again." },
          { act: "Tap VIIRS." },
          { say: "viirs", text: "And I'm not alone." },
          { label: "What Zij built", role: "slip-title" },
          { act: "Unfold the slip, one line at a time." },
          { line: "Two NASA records, one diary.", role: "slip" },
          { line: "{SatelliteWord} satellites, read as one.", role: "slip", was: "26 years, five satellites.", why: "Two numbers in one line; the 26 years are said just before." },
          { line: "Tested on years it never saw.", role: "slip" },
          { line: "Any place you draw.", role: "slip" },
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
          { say: "hudhud", text: "Rule one: only say what the diary shows." },
        ],
      },
      {
        id: "5.1",
        title: "Is this year special?",
        beats: [
          { show: "The autumns stand as bars, translated years with their bands. Hudhud brings this autumn." },
          { act: "Set this autumn at the end of the row." },
          { label: "Higher than usual", role: "answer" },
          { label: "Usual", role: "answer" },
          { label: "Lower than usual", role: "answer" },
          { act: "Press a wrong answer." },
          { say: "hudhud", text: "Look at the tallest years, then this one.", when: "wrong" },
          { act: "Press “Lower than usual”." },
          {
            say: "hudhud",
            text: { pick: "thisYear", options: { first: "Lower. The quietest autumn in {seasonCount} years.", among: "Lower. Among the quietest autumns in {seasonCount} years." } },
            when: "right",
            was: "Lower. One of the two quietest autumns in 26 years.",
            why: "Two numbers in one line; and this year's rank can still move, so the data picks the line.",
          },
          { say: "hudhud", text: "This year's numbers are fresh. They may change a little.", when: "then" },
        ],
      },
      {
        id: "5.2",
        title: "The quiet autumns",
        beats: [
          { act: "Lay one brass bracket over the earlier years and another over the recent ones. A water line rises in each to its average." },
          { label: "About the same", role: "answer" },
          { label: "About half", role: "answer" },
          { label: "About double", role: "answer" },
          { act: "Press “About half”." },
          { say: "hudhud", text: "The recent years burn {sinceShare} as much.", when: "right", was: "Since 2018, about half the burning.", why: "Two numbers in one line (2018 and half)." },
          { say: "hudhud", text: "One year bounced back. Find it." },
          { act: "Tap {bounceYear}." },
        ],
      },
      {
        id: "5.3",
        title: "The ban",
        beats: [
          { label: "{banYear}: Burning straw banned.", role: "flag" },
          { act: "Move the reading stone over the years before the ban, then the years after." },
          { say: "hudhud", text: "After the ban, the fires seen went up." },
          { line: "So did the ban fail?", role: "question" },
          { label: "Yes", role: "answer" },
          { label: "No", role: "answer" },
          { label: "The diary can't tell", role: "answer" },
          { act: "Press any answer. Three cards turn over." },
          { line: "It was already rising before {banYear}.", role: "card" },
          { line: "Only {banBeforeWord} years before the ban.", role: "card" },
          { line: "We can't see what would have happened without it.", role: "card" },
          { say: "hudhud", text: "A good detective says “I can't tell.”" },
        ],
      },
      {
        id: "5.4",
        title: "The missing fires",
        bonus: true,
        beats: [
          { show: "A clock with the satellites' pass times." },
          { act: "Drag a fire along the clock: caught while it overlaps a pass, missed between passes. Then a tiny fire and a smoky one." },
          { say: "hudhud", text: "Fewer fires seen can mean smaller fires, or other hours." },
        ],
      },
      {
        id: "5.5",
        title: "Around the world",
        bonus: true,
        beats: [
          { show: "A globe with three pins." },
          { label: "Kafr El Sheikh, Egypt", role: "pin" },
          { label: "Portugal", role: "pin" },
          { label: "Chilecito, Argentina", role: "pin" },
          { act: "Tap Kafr El Sheikh." },
          { line: "The quietest autumns VIIRS has ever seen.", role: "pin" },
          { act: "Tap Portugal." },
          { line: "{PortugalShare} the burning it once had.", role: "pin", was: "Since 2018, less than half the summer burning.", why: "Two numbers in one line; and the season is August to October." },
          { act: "Tap Chilecito." },
          { line: "So many dots. Only {chilecitoCells} fire squares.", role: "pin", was: "900 dots, only 8 squares. Squares, not dots.", why: "Two numbers in one line." },
          { act: "Take Hudhud's brass pen and draw a loop round a field. A tiny diary appears." },
        ],
      },
      {
        id: "5.6",
        title: "Who needs the diary?",
        beats: [
          { show: "Five engraved figures on tokens on the left, five questions on the right." },
          { label: "Air-quality officer", role: "person" },
          { label: "Farm adviser", role: "person" },
          { label: "Fire chief", role: "person" },
          { label: "Journalist", role: "person" },
          { label: "Student", role: "person" },
          { line: "Is smoke season early this year?", role: "question" },
          { line: "Did burning fall in my district?", role: "question" },
          { line: "Is this week unusual here?", role: "question" },
          { line: "Did fires really double?", role: "question" },
          { line: "How has my region changed?", role: "question" },
          { act: "Tie each person to their question with brass thread." },
          { say: "hudhud", text: "They all need one thing: a diary that tells the truth." },
          { label: "Detective", role: "seal" },
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
          { say: "hudhud", text: "Spot, sort, count, translate, compare. Zij does this every day." },
          { act: "Tap MODIS.", was: "All four lines ran in a row.", why: TAP_TO_SPEAK },
          { say: "modis", text: "Thanks for translating me." },
          { act: "Tap VIIRS." },
          { say: "viirs", text: "See you in the sky." },
          { say: "hudhud", text: "Made in Cairo by Team Zij, for NASA Space Apps." },
          { label: "Diary Keeper", role: "seal" },
          { act: "Press the last seal. The Keeper's page: the three seals, the constellation and the five chapters." },
          { label: "Save this page", role: "catchword" },
          { label: "See the real map", role: "stamp" },
          { label: "Play again", role: "catchword" },
          { label: "Ride the night", role: "catchword" },
        ],
      },
    ],
  },
];
