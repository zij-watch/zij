// Every word of Roro's Fire Diary, in one place (the plan's section 4, version 3).
//
// Edit the words here. scripts/check-diary.mjs checks them before `dev` and `build`, and
// /studio/diary?script shows each one with its word count:
//   - a line from Roro, MODIS or VIIRS, or one on a slip or card: 12 words or fewer
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

export type Who = "hudhud" | "modis" | "viirs" | "mona";
/** A line that depends on the data: `pick` names a choice in lib/diary/numbers.ts (picks). */
export type Variants = { pick: "heat" | "thisYear"; options: Record<string, string> };
export type Text = string | Variants;
type Edit = { was?: string; why?: string };

export type LabelRole =
  | "stamp" | "catchword" | "answer" | "tray" | "token" | "gear" | "seal" | "pin" | "flag"
  | "envelope" | "scale" | "lever" | "caption" | "slip-title" | "person";
export type LineRole = "slip" | "card" | "question" | "pin" | "rumour" | "task" | "recap";

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
  { id: "ui.hudhud", label: "Roro, the hoopoe", role: "caption", what: "the guide's name for screen readers" },
  { id: "ui.mona", label: "Mona", role: "caption", what: "the girl from Kafr El Sheikh whose question the game answers" },
  ...["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => ({ id: `ui.m${i + 1}`, label: m, role: "caption" as const, what: "a month on the calendar gear's volvelle" })),
  { id: "ui.landing", label: "Play Roro's Fire Diary", role: "catchword", what: "on the landing page, under Open the map" },
  { id: "ui.turn", label: "Your turn", role: "caption", what: "above the task slip that says what to do next" },
  { id: "ui.ch1", label: "Chapter one", role: "caption", what: "the turning page before level 1" },
  { id: "ui.ch2", label: "Chapter two", role: "caption", what: "the turning page before level 2" },
  { id: "ui.ch3", label: "Chapter three", role: "caption", what: "the turning page before level 3" },
  { id: "ui.ch4", label: "Chapter four", role: "caption", what: "the turning page before level 4" },
  { id: "ui.ch5", label: "Chapter five", role: "caption", what: "the turning page before level 5" },
  { id: "ui.ch6", label: "The last page", role: "caption", what: "the turning page before the ending" },
  { id: "ui.kept", label: "Stars kept", role: "caption", what: "on the Keeper's page, beside the count of stars" },
];


const TAP = "Each one speaks when the player taps it, so no more than two lines run in a row.";
const MONA = "The game answers one real question, asked by a girl from Kafr El Sheikh; every level gathers what the honest answer needs.";

export const SCRIPT: Chapter[] = [
  {
    id: "opening",
    title: "Opening: Mona's question",
    parts: [
      {
        id: "0",
        title: "Mona's question",
        beats: [
          { show: "Night over the Delta. Roro flies in and lands by a palm. A village of rice fields lies below." },
          { id: "open.hello", say: "hudhud", text: "I'm Roro. I keep a diary of fires." },
          { id: "open.straw", say: "hudhud", text: "Each autumn, farmers burn the straw left after the rice harvest." },
          { show: "Mona stands at the edge of her village, with a question." },
          { id: "open.task.mona", line: "Tap Mona to hear her question.", role: "task", was: "(none)", why: MONA },
          { act: "Tap Mona." },
          { id: "open.mona", say: "mona", text: "Do our fields burn less now than when I was little?", was: "(none)", why: MONA },
          { show: "Two satellites glide in along their brass rings." },
          { id: "open.task", line: "Tap each satellite: they will help us answer.", role: "task" },
          { act: "Tap MODIS.", why: TAP },
          { id: "open.modis", say: "modis", text: "MODIS. Watching since {modisStart}." },
          { act: "Tap VIIRS." },
          { id: "open.viirs", say: "viirs", text: "VIIRS. Since {viirsStart}. Sharper eyes." },
          { id: "open.ready", say: "hudhud", text: "Five steps, and we can answer Mona honestly. Ready?", was: "Five steps make the diary true. Ready?", why: MONA },
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
      why: "26 words in v3, one over the limit; and the README says 11 to 20 times in most years (42 in 2018).",
    },
    parts: [
      {
        id: "1",
        title: "Two cameras",
        beats: [
          { show: "Mona's village from above. Two photos of the same fields, the same night: an old camera's and a new one's." },
          { id: "spot.start", say: "hudhud", text: "Two cameras photograph the same fields. One is old, one new.", was: "Tap a fire while a satellite looks.", why: "Like an old phone camera and a new one: everyone has seen the difference." },
          { id: "spot.photo.modis", label: "Old camera: MODIS", role: "caption" },
          { id: "spot.photo.viirs", label: "New camera: VIIRS", role: "caption" },
          { id: "spot.task.modis", line: "Tap each fire in the old camera's photo.", role: "task" },
          { act: "Tap a fire in MODIS's photo: one big square lights up round it." },
          { id: "spot.modis", say: "hudhud", text: "MODIS is the old camera: one big square per fire.", when: "first fire in MODIS's photo" },
          { act: "Tap a tiny fire in MODIS's photo." },
          { id: "spot.tiny", say: "hudhud", text: "Too small for MODIS's eye. Its photo shows nothing there.", when: "a tiny fire in MODIS's photo" },
          { id: "spot.task.viirs", line: "Now tap each fire in the new camera's photo.", role: "task" },
          { act: "Tap a fire in VIIRS's photo: several small squares light up, and the tiny fires too." },
          { id: "spot.viirs", say: "hudhud", text: "VIIRS is the new camera: small squares, even tiny fires.", when: "first fire in VIIRS's photo" },
          { act: "Count every fire in both photos." },
          { id: "spot.tally.modis", label: "MODIS squares", role: "caption" },
          { id: "spot.tally.viirs", label: "VIIRS squares", role: "caption" },
          { id: "spot.end", say: "hudhud", text: "Same fires. Very different counts. Remember that for Mona.", when: "end" },
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
        title: "Seven nights of evidence",
        beats: [
          { id: "sort.start", say: "hudhud", text: "Not every hot spot is a burning field. Check its seven nights.", when: "start", was: "Not every hot spot is a field fire.", why: "Each hot spot comes with its evidence: the same spot on seven nights." },
          { id: "sort.tray.field", label: "Field fire", role: "tray" },
          { id: "sort.tray.not", label: "Not a field fire", role: "tray" },
          { id: "sort.is.field", label: "Hot spot on a field", role: "token" },
          { id: "sort.is.factory", label: "Hot spot by a chimney", role: "token" },
          { id: "sort.is.ghost", label: "A very faint hot spot", role: "token" },
          { id: "sort.nights", label: "The same spot, seven nights", role: "caption" },
          { id: "sort.task", line: "Read its seven nights, then carry it to a tray.", role: "task" },
          { act: "Carry a field fire, lit on a night or two after the harvest, into Field fire." },
          { act: "A hot spot lit every night arrives." },
          { id: "sort.factory", say: "hudhud", text: "Lit every night in one spot. That's a factory, not a field.", when: "first factory flame" },
          { act: "Sort it, then a very faint ghost dot arrives." },
          { id: "sort.ghost", say: "hudhud", text: "Too faint to be sure. Leave it out.", when: "first ghost dot" },
          { act: "Drop a hot spot into the wrong tray." },
          { id: "sort.wrong", say: "hudhud", text: "Read its nights again. Every night? Too faint?", when: "wrong tray" },
          { act: "Sort twelve in all. Three stars with no mistakes." },
          { id: "sort.end", say: "hudhud", text: "Only real field fires now. Mona asked about fields.", when: "end" },
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
        title: "The camera that slept",
        beats: [
          { show: "A week of seven boxes. Above each, the satellite's eye is open or shut." },
          { id: "count.start", say: "hudhud", text: "A guard's camera was switched off. Did nobody come that night?", when: "start", was: "Some nights it looked. Some nights it slept.", why: "A switched-off camera: “nobody came” and “we don't know” are not the same." },
          { id: "count.zero", label: "0", role: "token" },
          { id: "count.unknown", label: "?", role: "token" },
          { id: "count.day.looked", label: "It looked", role: "caption" },
          { id: "count.day.asleep", label: "It slept", role: "caption" },
          { id: "count.task", line: "Eye open and no fire: 0. Eye shut: ?", role: "task" },
          { act: "Put a 0 on a night when the satellite was asleep." },
          { id: "count.asleep", say: "hudhud", text: "It was asleep. We don't know. That's a ?", when: "0 on an asleep night" },
          { act: "Put a ? on a night it looked." },
          { id: "count.looked", say: "hudhud", text: "It looked and saw nothing. That's a 0.", when: "? on a night it looked" },
          { act: "Fill the rest of the week." },
          { show: "A real week from the record: one VIIRS satellite was switched off, the other kept looking." },
          { id: "count.real", label: "A real week: {realWeek}", role: "caption" },
          { id: "count.real.off", label: "{realOff}, switched off", role: "caption" },
          { id: "count.real.on", label: "{realOn}, still looking", role: "caption" },
          { id: "count.task.real", line: "Put a ? where the satellite was switched off.", role: "task" },
          { act: "Fill the real week." },
          { id: "count.end", say: "hudhud", text: "Mona's answer must not count a sleeping week as quiet.", when: "end", was: "0 means none seen. ? means nobody looked.", why: MONA },
        ],
      },
    ],
  },
  {
    id: "translate",
    title: "Level 4 · Translate",
    note: {
      text: "A fire square is a hotspot-day, {gridDeg}° on one day; hiding each year, the translator is about {loyoPct}% off, and {outOfTimePct}% on {testYears}.",
      why: "One note per level: the two notes of v3 joined in one sentence of 25 words.",
    },
    parts: [
      {
        id: "4.0",
        title: "To the desk",
        beats: [
          { show: "The camera tilts from the sky to the desk. The translator stands beside the open diary." },
          { id: "t40.hard", say: "hudhud", text: "Mona's question needs the old years too. Those are MODIS's.", was: "This is the hard puzzle. It's why Zij exists.", why: MONA },
        ],
      },
      {
        id: "4.1",
        title: "The fake jump",
        beats: [
          { id: "t41.join", label: "Join the records", role: "stamp" },
          { id: "t41.task", line: "Join the old camera's years and the new one's in one diary.", role: "task" },
          { act: "Press Join the records: MODIS's years, then VIIRS's, fill the diary." },
          { show: "The VIIRS bars are about ten times taller: a cliff where VIIRS begins." },
          { id: "t41.why", line: "Why does the diary jump where VIIRS begins?", role: "question" },
          { id: "t41.farmers", label: "Farmers burned {timesWord} times more", role: "answer" },
          { id: "t41.sharper", label: "A sharper camera started counting", role: "answer", was: "A sharper satellite started counting", why: "The camera of level 1." },
          { id: "t41.river", label: "The river caught fire", role: "answer" },
          { act: "Press “Farmers burned…”." },
          { id: "t41.if.farmers", say: "hudhud", text: "{TimesWord} times, in one year? Think of the cameras.", when: "if farmers" },
          { act: "Press “The river caught fire”." },
          { id: "t41.if.river", say: "hudhud", text: "Rivers don't burn. Try again.", when: "if river" },
          { act: "Press “A sharper camera started counting”." },
          { id: "t41.if.sharper", say: "hudhud", text: "Yes. Like the two cameras: the counter changed, not the fields.", when: "if sharper" },
          { show: "A newspaper cutting is pinned to the desk." },
          { id: "t41.rumour", line: "Fires {timesWord} times worse", role: "rumour" },
          { id: "t41.false", label: "False", role: "stamp" },
          { id: "t41.task.false", line: "Stamp the headline False.", role: "task" },
          { act: "Press the False stamp. One drop of ink spreads across the slip." },
          { id: "t41.language", say: "hudhud", text: "We must turn old counts into new ones, like old prices.", was: "Let's make both satellites speak one language.", why: "Converting old prices into today's money: an everyday way to see it." },
        ],
      },
      {
        id: "4.3",
        title: "The exchange rate",
        beats: [
          { show: "A chart of the years both cameras worked: VIIRS as a solid rubric line, translated MODIS as a dashed ink line." },
          { id: "t43.learns", say: "hudhud", text: "Both cameras worked these years. Find the exchange rate.", was: "Both flew in these years. The translator learns here.", why: "One MODIS square is worth about so many VIIRS squares, like a rate between two currencies." },
          { id: "t43.far", label: "far off", role: "scale" },
          { id: "t43.close", label: "close", role: "scale" },
          { id: "t43.spot", label: "spot on", role: "scale" },
          { id: "t43.dial", label: "The exchange rate", role: "caption" },
          { id: "t43.guess", label: "MODIS, translated", role: "caption" },
          { id: "t43.task", line: "One MODIS square is worth how many VIIRS squares? Turn the dial.", role: "task" },
          { act: "Turn the × dial. The needle moves from far off towards close, and overshoots past ×{magic}." },
          { id: "t43.closer", say: "hudhud", text: "Closer. But like a price, the rate changes with the season.", when: "at ×{magic}", was: "Closer. But one number can't fit every week.", why: "The fine print of the rate: the gears that follow." },
        ],
      },
      {
        id: "4.4",
        title: "The fine print",
        beats: [
          { id: "t44.g1", label: "Quiet weeks", role: "gear" },
          { id: "t44.g2", label: "The calendar", role: "gear" },
          { id: "t44.g3", label: "Fire heat", role: "gear" },
          { id: "t44.g4", label: "Busy years", role: "gear" },
          { id: "t44.task", line: "Tap a gear to add its fine print to the rate.", role: "task" },
          { act: "Tap the Quiet weeks gear: it fits, and its balance tips." },
          { id: "t44.quiet", say: "hudhud", text: "In quiet weeks, tiny fires matter more." },
          { act: "Tap The calendar gear: its volvelle turns to autumn." },
          { id: "t44.month", say: "hudhud", text: "Each month has its own tiny fires." },
          { act: "Tap the Fire heat gear: two fires, small and cool, big and hot." },
          {
            id: "t44.heat",
            say: "hudhud",
            text: { pick: "heat", options: { cool: "Cool fires come with more tiny fires MODIS missed.", hot: "Hot fires come with more tiny fires MODIS missed." } },
            was: "Hot fires mean more fires nearby.",
            why: "The Delta's fit says the opposite: its heat term is negative, so cooler fires mean more extra squares. The data picks the line.",
          },
          { act: "Tap the Busy years gear: its lever moves to a busy year." },
          { id: "t44.busy", say: "hudhud", text: "Busy years have more tiny fires too." },
          { id: "t44.m4", say: "hudhud", text: "This is {model}, the translator Zij really uses.", when: "all four in" },
          { id: "t44.fair", line: "But it practised on these years. Is that a fair test?", role: "question" },
        ],
      },
      {
        id: "4.5",
        title: "The fair exam",
        beats: [
          { id: "t45.fair", label: "Fair", role: "answer" },
          { id: "t45.notfair", label: "Not fair", role: "answer" },
          { act: "Press either answer." },
          { show: "Nine cards, one for each year both cameras worked." },
          { id: "t45.hide", say: "hudhud", text: "Hide a year. Can it guess what VIIRS really counted?", when: "start", was: "Hide a year. The translator can't peek.", why: "Like testing a translator on sentences you already know." },
          { id: "t45.guess", label: "Its guess", role: "caption" },
          { id: "t45.real", label: "The real count", role: "caption" },
          { id: "t45.task", line: "Tap a year's card to hide it from the translator.", role: "task" },
          { act: "Tap a card. The translator learns from the other eight, writes its guess, and the real count is shown." },
          { id: "t45.worst", say: "hudhud", text: "{worstYear} was its worst guess. Zij shows that too.", when: "after {worstYear}" },
          { act: "Hide three years in all (the rest are bonus)." },
          { id: "t45.envelope", label: "{testYears}, never seen", role: "envelope" },
          { id: "t45.task.env", line: "Break the seal on the envelope.", role: "task" },
          { id: "t45.never", say: "hudhud", text: "Now years it has never seen.", when: "the envelope" },
          { act: "Break the wax seal. The real counts slide out." },
          { id: "t45.close", say: "hudhud", text: "Close, every time. And Zij always says how close.", when: "end" },
          { id: "t45.seal", label: "Honest Scientist", role: "seal" },
          { id: "t45.task.seal", line: "Press the seal into the diary.", role: "task" },
          { act: "Press the seal into the diary." },
        ],
      },
      {
        id: "4.6",
        title: "One diary",
        beats: [
          { id: "t46.crank", label: "Turn the crank", role: "catchword" },
          { id: "t46.task.crank", line: "Turn the crank to translate the old years.", role: "task" },
          { act: "Crank the translator: the MODIS years come out in VIIRS's language, each with a soft doubt band." },
          { id: "t46.band", say: "hudhud", text: "A translated year can't be exact. The band shows how far off." },
          { id: "t46.two", label: "Two records", role: "lever" },
          { id: "t46.one", label: "One diary", role: "lever" },
          { id: "t46.task.lever", line: "Move the lever one way, then back.", role: "task" },
          { act: "Move the before-and-after lever: the fake jump appears and vanishes." },
          { id: "t46.gone", say: "hudhud", text: "The fake jump is gone. One diary, {seasonCount} autumns." },
          { id: "t46.modis", say: "modis", text: "My old years count again." },
          { id: "t46.built", label: "What Zij built", role: "slip-title" },
          { act: "Read the slip, then Next." },
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
      why: "Every level has one note; this one carries the figures behind Mona's answer.",
    },
    parts: [
      {
        id: "5.0",
        title: "The detective",
        beats: [
          { show: "Roro picks up a reading stone from the desk. Mona's question is pinned beside the diary." },
          { id: "c50.rule", say: "hudhud", text: "Now we answer Mona. Rule one: only say what the diary shows.", was: "Rule one: only say what the diary shows.", why: MONA },
        ],
      },
      {
        id: "5.1",
        title: "Is this autumn unusual?",
        beats: [
          { show: "The autumns stand as bars, translated years with their bands. This autumn stands at the end, marked." },
          { id: "c51.ask", line: "First: is this autumn unusual?", role: "question", was: "(none)", why: "The first part of Mona's answer." },
          { id: "c51.higher", label: "Higher than usual", role: "answer" },
          { id: "c51.usual", label: "Usual", role: "answer" },
          { id: "c51.lower", label: "Lower than usual", role: "answer" },
          { act: "Press a wrong answer." },
          { id: "c51.wrong", say: "hudhud", text: "Look at the tallest years, then the marked one.", when: "wrong" },
          { act: "Press “Lower than usual”." },
          {
            id: "c51.right",
            say: "hudhud",
            text: { pick: "thisYear", options: { first: "Lower. The quietest autumn in {seasonCount} years.", among: "Lower. Among the quietest autumns in {seasonCount} years." } },
            when: "right",
            why: "Two numbers in one line in v3; and this year's rank can still move, so the data picks the line.",
          },
          { id: "c51.fresh", say: "hudhud", text: "This year's numbers are fresh. They may change a little.", when: "then" },
        ],
      },
      {
        id: "5.2",
        title: "When Mona was little",
        beats: [
          { show: "Two brackets draw themselves over the diary, each with a water line at its average." },
          { id: "c52.before", label: "When Mona was little", role: "caption", was: "{referenceYears}", why: MONA },
          { id: "c52.after", label: "Now", role: "caption" },
          { id: "c52.ask", line: "Do the fields burn less now than when Mona was little?", role: "question" },
          { id: "c52.same", label: "About the same", role: "answer" },
          { id: "c52.half", label: "About half as much", role: "answer" },
          { id: "c52.double", label: "About double", role: "answer" },
          { act: "Press a wrong answer." },
          { id: "c52.wrong", say: "hudhud", text: "Compare the two water lines.", when: "wrong" },
          { act: "Press “About half as much”." },
          { id: "c52.right", say: "hudhud", text: "Yes. The recent years burn {sinceShare} as much.", when: "right" },
          { id: "c52.bounce", say: "hudhud", text: "But one year bounced back. Find it." },
          { id: "c52.task.pick", line: "Tap the recent year that came back up.", role: "task" },
          { act: "Tap {bounceYear}." },
        ],
      },
      {
        id: "5.3",
        title: "Did the law work?",
        beats: [
          { id: "c53.flag", label: "{banYear}: Burning straw banned.", role: "flag" },
          { id: "c53.before", label: "Before the ban", role: "catchword" },
          { id: "c53.after", label: "After the ban", role: "catchword" },
          { id: "c53.task", line: "Mona's teacher asks if the ban worked. Look before, then after.", role: "task", was: "(none)", why: MONA },
          { act: "Tap Before the ban, then After the ban: each shows its average." },
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
          { id: "c54.move", label: "Move the fire", role: "caption" },
          { id: "c54.task", line: "A farmer burns at another hour. Slide the fire round the clock.", role: "task" },
          { act: "Slide the fire round the clock: caught while it meets a pass, missed between passes." },
          { id: "c54.hours", say: "hudhud", text: "Fewer fires seen can mean smaller fires, or other hours." },
        ],
      },
      {
        id: "5.5",
        title: "Around the world",
        bonus: true,
        beats: [
          { show: "A globe with three pins: Mona's village, and two far places." },
          { id: "c55.kafr", label: "Kafr El Sheikh, Egypt", role: "pin" },
          { id: "c55.portugal", label: "Portugal", role: "pin" },
          { id: "c55.chilecito", label: "Chilecito, Argentina", role: "pin" },
          { id: "c55.task", line: "Tap each pin on the globe.", role: "task" },
          { act: "Tap Kafr El Sheikh." },
          { id: "c55.kafr.line", line: "Mona's district: the quietest autumns VIIRS has ever seen.", role: "pin" },
          { act: "Tap Portugal." },
          { id: "c55.portugal.line", line: "{PortugalShare} the burning it once had.", role: "pin" },
          { act: "Tap Chilecito." },
          { id: "c55.chilecito.line", line: "So many dots. Only {chilecitoCells} fire squares.", role: "pin" },
          { show: "Mona's district's own small diary opens." },
        ],
      },
      {
        id: "5.6",
        title: "Who else needs the diary?",
        beats: [
          { show: "Five people on tokens on the left, five questions on the right. Mona is one of them." },
          { id: "c56.p1", label: "Air-quality officer", role: "person" },
          { id: "c56.p2", label: "Farm adviser", role: "person" },
          { id: "c56.p3", label: "Fire chief", role: "person" },
          { id: "c56.p4", label: "Journalist", role: "person" },
          { id: "c56.p5", label: "Mona, a student", role: "person", was: "Student", why: MONA },
          { id: "c56.q1", line: "Is smoke season early this year?", role: "question" },
          { id: "c56.q2", line: "Did burning fall in my district?", role: "question" },
          { id: "c56.q3", line: "Is this week unusual here?", role: "question" },
          { id: "c56.q4", line: "Did fires really double?", role: "question" },
          { id: "c56.q5", line: "Do our fields burn less now?", role: "question", was: "How has my region changed?", why: MONA },
          { id: "c56.task", line: "Tie each person to their question.", role: "task" },
          { act: "Tie each person to their question with brass thread." },
          { id: "c56.truth", say: "hudhud", text: "They all need one thing: a diary that tells the truth." },
          { id: "c56.seal", label: "Detective", role: "seal" },
          { id: "c56.task.seal", line: "Press the seal into the diary.", role: "task" },
          { act: "Press the seal into the diary." },
        ],
      },
    ],
  },
  {
    id: "ending",
    title: "Ending · Mona's answer",
    parts: [
      {
        id: "6",
        title: "Mona's answer",
        beats: [
          { show: "Back under the sky. The stars are joined by brass thread into the hoopoe constellation." },
          { id: "end.every", say: "hudhud", text: "Spot, sort, count, translate, compare. Now Mona gets her answer." },
          { id: "end.task", line: "Tap Mona to give her the answer.", role: "task" },
          { act: "Tap Mona. Her answer unfolds, written from the diary." },
          { id: "end.a1", line: "Yes: {sinceShare} as much burning as when you were little.", role: "recap", was: "(none)", why: MONA },
          { id: "end.a2", line: "But one autumn, {bounceYear}, came back almost to the old level.", role: "recap" },
          { id: "end.a3", line: "The diary can't say why. Only that it changed.", role: "recap" },
          { id: "end.mona", say: "mona", text: "Thank you. I'll show my class the diary." },
          { id: "end.task2", line: "Tap MODIS, then VIIRS, to say goodbye.", role: "task" },
          { act: "Tap MODIS.", why: TAP },
          { id: "end.modis", say: "modis", text: "Thanks for translating me." },
          { act: "Tap VIIRS." },
          { id: "end.viirs", say: "viirs", text: "See you in the sky." },
          { id: "end.credit", say: "hudhud", text: "Made in Cairo by Team Zij, for NASA Space Apps." },
          { id: "end.seal", label: "Diary Keeper", role: "seal" },
          { id: "end.task.seal", line: "Press the last seal.", role: "task" },
          { act: "Press the last seal. The Keeper's page: what each chapter taught, the seals and the stars." },
          { id: "end.page", label: "The Keeper's page", role: "slip-title" },
          { id: "end.r1", line: "Spot: two cameras see the same fires differently.", role: "recap" },
          { id: "end.r2", line: "Sort: factory flames and faint dots are left out.", role: "recap" },
          { id: "end.r3", line: "Count: a night nobody looked is a ?, not a 0.", role: "recap" },
          { id: "end.r4", line: "Translate: old counts converted, and tested on unseen years.", role: "recap" },
          { id: "end.r5", line: "Compare: only say what the diary shows.", role: "recap" },
          { id: "end.save", label: "Save this page", role: "catchword" },
          { id: "end.map", label: "See the real map", role: "stamp" },
          { id: "end.again", label: "Play again", role: "catchword" },
          { id: "end.night", label: "Ride the night", role: "catchword" },
        ],
      },
    ],
  },
];
