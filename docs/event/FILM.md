# The demo film

A 29.5 second film, 1920 x 1080, 30 frames a second, drawn from the real app one frame at a time. Nothing in it is a screen recording. There are three versions of it:

- **v3**, `/studio/film/v3`: the final cut. Six shots on four surfaces, every beat keyed to the word of the voice-over that names it: NASA's picture of the Delta folding into the record, the machine, the real app, and what the joined record shows (see [The third version: the final cut](#the-third-version-the-final-cut)).
- **v2**, `/studio/film/v2`: one continuous camera take across a board, with no cuts and no fades (see [The second version: the board](#the-second-version-the-board)).
- **v1**, `/studio/film`: seven scenes, one sheet after another, joined by cuts, the ink rule and the paper slide.

v1 and v2 tell the same story to the same times; v3 tells a shorter one, to its own script.

| File | What it is |
|---|---|
| `app/film/film-v3-final.mp4` | **The final cut**: v3 with music and effects, no voice. |
| `app/film/film-v3-final-voice.mp4` | The same with Yassen's voice-over, once it is recorded (`app/film/audio/voiceover-v3.*`). |
| `app/film/film-v3.1-final.mp4` | **v3.1**, to Yassen's take, with his voice (see [v3.1](#v31-to-yassens-take)). |
| `app/film/zij-demo30-v3.1.en.srt`, `.vtt`, `.ass` | v3.1's captions: his ten. |
| `app/film/YOUTUBE_DESCRIPTION.txt` | The description for v3.1: the film in a paragraph, every data and audio credit, and how the film was made. v3's is `YOUTUBE_DESCRIPTION-v3.txt`. |
| `app/film/film-v2-final.mp4`, `film-v2-final-voice.mp4` | v2, without and with the second cut's voice-over. |
| `app/film/film-final.mp4`, `film-final-voice.mp4` | v1, the same two ways. |
| `app/film/film-silent.mp4`, `film-v2-silent.mp4`, `film-v3-silent.mp4` | The picture with no sound, as rendered. The sound is put on these (see [Sound](#sound)). |
| `app/film/film.mp4`, `film-v2.mp4`, `film-v3.mp4` | The renderer's own output: the silent picture, or with `app/film/music.mp3` if that exists. |
| `app/film/audio/` | The voice-over of the second cut (`voiceover.wav`), its cleaned and placed copy, and the masters. |
| `app/film/thumbnail.jpg`, `thumbnail-v2.jpg`, `thumbnail-v3.jpg` | One frame of each film, 1280 x 720. |
| `app/film/stills/`, `stills-v2/`, `stills-v3/` | Still frames at full size, for looking at before a whole render. |
| `app/film/zij-demo30.en.srt`, `.vtt`, `.ass` | v3's captions, as a separate track (see [Captions](#captions)). |
| `app/film/v2-captions/zij-demo30.en.*` | v1's and v2's captions: the second cut's voice-over. |

The renderer's output stays out of git (`app/film/.gitignore`): render it again from the steps below.

## Captions

The captions go to YouTube as a separate track. They are not burned into the picture: v1 has no caption strip, and v2 has none either.

**v3.** Its source is `docs/event/zij-demo30.en.srt`, written by `app/scripts/film/v3-timing.mjs` from the script's words and their times (`docs/event/zij-demo30-v3-timing.json`): 18 short cues, each starting on its first word, running to the next with no gap, and each inside its shot (a line's first cue starts with its shot). The words are the script's exactly. The renderer writes the three files from it into `app/film/`.

**v1 and v2.** Their source is `docs/event/zij-demo30-v2.en.srt` (until v3 it was `zij-demo30.en.srt`), and the renderer writes their three files into `app/film/v2-captions/`. It holds the second cut's voice-over words and timings, transcribed locally with whisper.cpp (large-v3-turbo). Each sentence starts as he says it. Where a sentence crosses a scene boundary, it is held to the next scene's start or split there, so that every caption lies inside one scene. That makes nine captions. Four of them start 0.15 to 0.9 s after his words: captions 3, 4, 6 and 8. Every run of the renderer writes three files from a film's source, with the same times, the same lines and the same line breaks:

- `zij-demo30.en.srt`: plain, the source byte for byte (the renderer checks this).
- `zij-demo30.en.vtt`: WebVTT, each cue at `line:92%,end align:center`, so its bottom sits 8% above the bottom of the frame.
- `zij-demo30.en.ass`: for YTSubConverter (`.ass` to YouTube's `.ytt`). Times New Roman (YouTube cannot use the app's faces), not bold, 54 px on a 1920 x 1080 script. Ink `#1E1A15` on a box of paper `#F6EDD8` at 85% opacity, no outline, no shadow. Bottom centre, 8% above the bottom.

How YTSubConverter reads the `.ass`, from its source, and what the file does about it:

- **The box.** Its colour is taken from `OutlineColour` when `BorderStyle` is 3 and `Outline` is above 0, so the style has `Outline 1`: it is the box's padding, not an outline round the letters. `BackColour` is only the shadow's colour, and `Shadow` is 0.
- **The position.** `MarginV` is ignored, and a line is placed by its `\pos`, so every line carries `{\an2\pos(960,994)}`.
- **The size.** YouTube gives the `Default` style its standard size, so the 54 px is a guide for other players.
- **The font.** The name is passed on as written. If YouTube does not offer Times New Roman, the player falls back to Roboto.

Placed this low, the box covers no paper's heading and none of the map's key area in any scene of either version. This was checked by burning the `.ass` onto rendered frames with libass.

- In v1's scene 6 the box lies over the lower part of the brief's calendar.
- On v2, paper 1's legend is at the top of its chart, so the box never reaches it.
- On v2's paper 4 the box overlaps the bottom of Results' "This month so far" figure.
- On v2's paper 6 it overlaps the lower rows of the brief's calendar.
- v3 keeps what carries the story clear of the box: the record chart's bars and numbers, the machine, the verdict, the finale's chart and the Seal block sit above it. On the map it touches the lower part of the box and of Results' lower card.

## How it is made

`/studio/film` is one page with one function, `window.__film.seek(t)`. It draws the exact frame for the time `t` in seconds and resolves when the page is still.

- Every motion is a function of `t` (`app/lib/film/timeline.ts`). There are no CSS transitions or animations (the film's stylesheet switches off the app's own inside the film), no timers, and no random numbers without a seed. The wood and the paper are painted from fixed seeds.
- React draws the frame from `t`. Then each scene sets by hand what the app's own components animate with timers: the bars of the chart (the chart is found by its element, its animation is off, and its values are set for the frame), the map's camera, the rows of the calendar, the strokes of the Seal.
- The map's camera is set for each frame with `jumpTo`, along a path eased with one curve. Each frame waits for the map's `idle` event (every tile loaded, label fades finished) and for the atlas's detail cells.
- In v1 the last second is still: the end card stops moving at 28.5 s, and from then on every frame is the same. The page says when that is (`__film.stillFrom`). The renderer photographs that frame once and repeats it. Then it photographs the page's very last frame again and prints how closely the two match.

Before any frame is taken, the renderer checks the words against the film and the data, and stops if one fails:

- every caption lies inside one scene;
- a caption that quotes the error ("N% to M%") gives the numbers `method.json` holds: the season error of raw MODIS and of M4, each leaving one year out, rounded (76.51% and 14.15%). v3's caption 3 quotes it ("Error fell from 77% to 14%"); v1's and v2's captions follow the second cut's voice-over, which does not;
- the counter on screen (v1, v2), or v3's dial and its small line, run between the same two numbers;
- in v3, five more: the MODIS season of 2011 and the VIIRS season of 2012 are 162 and 1,609 (the tenfold jump); the error falls from 77% to 14%; after the 2004 ban +97% and since 2018 -53% (`findings.json`); and the verdict's sentence states its rank among 26 years as the rank worked out again from the drawn area's own numbers ("8th lowest of 26 years"). The page reads each from the data files; the renderer stops if any differs from the brief.

`app/scripts/film/render.mjs` opens the page in headless Chrome over the DevTools protocol. It steps `t` by 1/30 s and takes a JPEG screenshot of every frame at quality 92. Frames are photographed at twice the size (3840 x 2160) and scaled to 1920 x 1080 with Lanczos, so charts and maps are sharp. Chrome runs with `--run-all-compositor-stages-before-draw`, so a screenshot never shows a tile that has not been rastered yet. Then ffmpeg:

1. One mp4 per piece, the same settings for all: `libx264`, `-crf 18`, `-pix_fmt yuv420p`, 30 fps, BT.709. A piece is a scene in v1 and about five seconds in v2.
2. The pieces are joined with the concat demuxer and `-c copy`.
3. Sound is added last with `-c:v copy`, by `scripts/film/sound.mjs` (see [Sound](#sound)).
4. `ffprobe` checks that each file is 1920 x 1080 and 29.5 s long, and never over 29.9.

A transition belongs to the scene it opens, so it is inside that scene's file; nothing is blended between files.

### To render it again

From `app/`, with Node 22 or later, Chrome, ffmpeg and ffprobe:

    pnpm build
    pnpm start --port 3111
    node scripts/film/render.mjs --stills 2.3,7.3,9.6,12.3,16.5,19.7,23.6,27.3
    node scripts/film/render.mjs
    node scripts/film/render.mjs --film v2 --stills 0.3,6.2,18.2,2.6,8.6,16.2,19.6,29.0
    node scripts/film/render.mjs --film v2 --thumb 16.9
    npx tsx scripts/film/sound.mjs --story D:/Zij/zij-story
    npx tsx scripts/film/v3-timing.mjs --planned        (or --whisper words.json --tempo 1.0x --at 0.1)
    node scripts/film/render.mjs --film v3 --stills 2.5,4.6,7.7,13.4,19.2,27.9,29.3
    node scripts/film/render.mjs --film v3 --thumb 13.5
    npx tsx scripts/film/sound.mjs --films v3 --story D:/Zij/zij-story

Other options:

- `--parts 4,5` renders those pieces again and joins everything.
- `--thumb 9.9` sets the thumbnail's time.
- `--keep` keeps the frames.
- `--captions` runs the checks and writes the three caption files, and nothing else.

Scene 5 needs the network: its satellite picture comes from NASA GIBS.

To look at it by hand, open `/studio/film?t=12.3`, `/studio/film/v2?t=12.3` or `/studio/film/v3?t=12.3`. The arrow keys step one frame, with Shift one second.

### The address

The area and the day are in the address, like every view of the app: `/studio/film?poly=...&day=YYYY-MM-DD`. With neither, the page goes to the film's own: a polygon over the rice country of the northern Nile Delta (30.50 to 31.80 E, 30.60 to 31.40 N) and 20 October 2023, a day of the straw burning with 157 VIIRS and 26 MODIS detections in the polygon. The downloads in scene 6 read the same address, so the CSV and the calendar picture are the drawn area's. The brief is the Nile Delta preset's: it is the app's own page at `/brief?area=nile-delta`, held in a frame on the desk, with the film's small stylesheet put into it (no buttons, no ground behind the sheet, nothing that moves).

## The scenes

The scenes are the same in both versions: what each paper shows, and when. Below is v1, where each scene is its own sheet. For how v2 lays the same stories on one board, see [The second version: the board](#the-second-version-the-board).

| | Seconds | What happens | Drawn by |
|---|---|---|---|
| 1 | 0.0 to 6.4 | The jump. The Nile Delta's seasons as recorded. MODIS years are inked in, then the VIIRS years leap. The two halves are named. | `SeriesChart`, `Lever`, `ResultPaper` |
| 2 | 6.4 to 10.6 | The link. The lever goes to "On one scale"; the bars settle into the harmonized record, with the likely range of each converted year and the median. The calendar slides in and its rows are stamped from 2000 to now. | `SeriesChart`, `Calendar` |
| 3 | 10.6 to 14.0 | The proof. The validation chart's bars are drawn; a counter runs from 77% to 14%. | `docs/assets/validation-light.svg` |
| 4 | 14.0 to 18.4 | Any area. The map flies from Egypt to the Nile Delta preset; a brass cursor draws a polygon; the shape closes; Results slides in and the verdict is written. | `MapView`, `setSketch`, `Panel`, `resolveDrawn` |
| 5 | 18.4 to 22.2 | Any day. 20 October 2023 is set; the day's hotspots drop in the order the satellites saw them; the atlas turns into NASA's picture of that day. | `MapView` twice, `Panel`, `loadDay` |
| 6 | 22.2 to 25.0 | Take it. The Nile Delta's season brief slides out; the drawn area's monthly CSV and calendar picture are stamped. | `/brief?area=nile-delta`, `Downloads` |
| 7 | 25.0 to 29.5 | End card. The Seal is written with the brush, then "Team Zij · zij.watch", then the credits in one small line. The end card holds from 28.5 s. | the landing page's Seal |

In v1, transitions are of three kinds only: a cut (1 to 2, 4 to 5), the ink rule (into 3 and into 7: a double rule is drawn across, then travels down the frame with the next sheet behind it), and the paper slide (the calendar, the map sheet, Results, the brief).

Motion: one easing curve for every move, the design system's `ease-lamp`; one spring for every arrival, critically damped so nothing bounces (the design system allows no bounce). Every scene has a slow push-in from 1.00 to 1.03 on the sheets, with the desk moving less and the lamp's light drifting between them. One exception to the one curve: the Seal's strokes keep the pace the landing page gives them.

## The second version: the board

v2 is one continuous camera take with no cuts and no fades. Everything in it is a function of `t` (`app/lib/film/board.ts`), as in v1.

**The board.** The landing page's night desk, darkened under a lamp. Seven papers are pinned on it, each turned less than 1.5 degrees, each with a drop shadow and a brass pin. They lie on a path that is not straight: papers 1 to 4 along the top, then down to 5, and back left through 6 to 7. The board is about 3.8 frames wide and 2.2 tall.

A brass thread runs from pin to pin, 1 to 7. Between neighbours it arcs above the papers' top edges, so it never lies across a heading. From 4 down to 5 it loops round the right of the board. It is drawn ahead of the camera, its end a little under half a stretch in front.

| Paper | Story | Scene | Camera glides in | Story starts |
|---|---|---|---|---|
| 1 | The jump: the seasons as recorded, the key at the top, MODIS then VIIRS, the two halves named. A slip at its corner: "Team Zij · Harmonization of MODIS and VIIRS Hot Spots". | 0.0 to 6.4 | 0.6 to 1.8 s | 1.33 s |
| 2 | The link: the lever, the seasons on one scale with their ranges and median; the calendar beside it, its rows stamped | 6.4 to 10.6 | 5.65 to 6.7 s | 6.28 s |
| 3 | The proof: the validation chart's bars; the counter card from 77% to 14% | 10.6 to 14.0 | 9.85 to 10.9 s | 10.48 s |
| 4 | Any area: the map flies to the Nile Delta, the cursor draws the polygon, Results and the verdict | 14.0 to 18.4 | 13.25 to 14.3 s | 13.88 s |
| 5 | Any day: the day's slip, the hotspots drop, NASA's picture of the day | 18.4 to 22.2 | 17.65 to 18.7 s | 18.28 s |
| 6 | Take it: the CSV and the calendar picture stamped on a sheet, the Nile Delta's brief beside it | 22.2 to 25.0 | 21.45 to 22.5 s | 22.08 s |
| 7 | The Seal card: the Seal written with the brush, "Team Zij · zij.watch", the credit line | 25.0 to 29.5 | 24.25 to 25.3 s | 24.88 s |

Each paper's story starts when the camera is 70% of the way there, and each paper is in focus during its scene.

**The camera.** One path through nine keys: the wide shot, each paper in focus, and the end.

- **Keys.** In focus, one world pixel is one pixel of the frame, and the camera turns with the paper by 0.6 of its angle. The wide shot fits the board into 1,800 px. The end key fits it into 1,640 px, with room for the thread's loop, drawn 15% towards the Seal card.
- **Path.** Position runs on a centripetal Catmull-Rom spline. Zoom (in log) and roll are eased from key to key.
- **Time.** Time is remapped so the camera never stops dead and never starts suddenly. On each paper it drifts at a crawl. Each glide from paper to paper takes 1.05 s: the crawl is blended across, plus a smooth sin² rise and fall in speed. While gliding the camera zooms out by up to 12%.
- **Opening.** The wide shot lasts 0 to 0.6 s, then the camera pushes into paper 1.
- **End.** From 27.7 s the camera pulls back from the Seal card until all seven papers and the whole thread are in frame. It dips out a further 9% past the board and settles at 29.2 s with the card still in focus. It does not move after that.

**Depth and light.** The layers move at different rates. The desk moves 0.965 times as fast as the papers, and the pins and thread 1.012 times. The lamp's light and its warm glow follow the camera 0.45 s behind. Each paper's shadow is cast away from the lamp, 9 to 18 px long, and the thread's shadow is cast the same way.

Papers other than the one in focus are softened. The blur starts 320 px from the middle of the frame and grows to 4.5 px over the next 900 px. Focus passes from paper to paper over each glide.

**Motion blur.** Only on frames where the camera moves more than 2 px per frame; settled frames get none (on a paper the camera crawls at under 0.3 px per frame). Such a frame is 12 photographs spread evenly over 1/60 s from `t`, a 180 degree shutter, each standing for its 1/720 s slice. On its own, twelve sharp copies still show as a comb on fast text. So the renderer's second page, the darkroom, smears each photograph along the way the picture slides in its slice (`slideAt` in `board.ts`, an affine field from the camera). This happens on the GPU (WebGL 2, a tap every 3/4 of a pixel). The twelve smears meet without a gap; they are summed in a float buffer, divided, and saved at JPEG quality 92. 239 of the 885 frames have it.

**Sharpness.** Papers are laid out at their in-focus size and photographed at twice the size, like v1. The maps are drawn at the sheet's own pixel size (1572 x 712). While the camera travels they are not redrawn: they move with their paper as pictures.

**The titles on the papers.** Each of papers 1 to 6 carries a short title in ink as its heading:

1. "As recorded"
2. "One record, 2000 to today"
3. "Tested on unseen years"
4. "Any area"
5. "Any day"
6. "Take it with you"

The titles are set in Cormorant Garamond 600 at 56 px on screen when the paper is in focus. Each is inked in left to right over 0.45 s from the paper's story start (the camera 70% arrived) and stays on the paper. The Seal card carries "Team Zij · zij.watch" and the credit line. The captions are not in the picture: they are only in the caption files. Paper 1's legend sits at the top of its chart, under the title.

**Rendering.** v2 is encoded in six pieces of about five seconds each and joined, with the same settings as v1. There is no held last second: the camera rests from 29.2 s, but every frame is photographed. The hotspots' ink blots have no blend mode on the board, unlike v1. In v2 the blend mode forced a render surface the size of the papers' layer, larger than the GPU takes, and Chrome dropped the layers above it from the frame.

## The third version: the final cut

v3 (`/studio/film/v3`) is the final cut, on the same desk, lamp and render pipeline. It follows a script of six lines, and every beat lands on the word that names it. The words' times are one file, `docs/event/zij-demo30-v3-timing.json`: the planned timings (the brief's line windows, each word given time by its letters), or the recorded voice's word times from whisper.cpp, matched to the script word by word. `app/lib/film/v3.ts` makes everything else from it: the shots, the camera, each beat, the captions, and the sound's effects. The page reads it at every request, so a new voice needs no new build.

| Shot | Line | What happens, and on which word |
|---|---|---|
| L1 | "In 2012, NASA's fire record jumps tenfold." | NASA GIBS true colour of the Nile Delta on 20 October 2023 (the app's satellite basemap), that day's fire dots inking in. "Team Zij · Cairo" and "Harmonization of MODIS and VIIRS Hot Spots" in the lower left for the first 2 s. The picture folds down into the record chart; the Delta's raw seasons are drawn, and the bars leap at 2012 on "tenfold": 162 over 2011, 1,609 over 2012. |
| L2 | "The fires didn't change. The satellite did." | An ink circle round the leap on "satellite"; "MODIS 1 km" and "VIIRS 375 m" on the two halves. Then a beat of stillness. |
| L3 | "So we built a machine that learns how both satellites see, area by area." | A glide to the machine: a brass instrument in the zij and astrolabe style, drawn in the app's tokens. Its input is labelled "NASA FIRMS · MODIS + VIIRS": the pale MODIS seasons of 2001 to 2011 run into it. Four stages light up in turn ("machine", "learns", "both", "area"): "Real fires" (a cluster of gas flares blinks out), "One grid" (pixels snap into 0.1 degree cells), "Each satellite" (two dials average into one), "Learn" (a line fitted through the seasons of 2012 to 2020 as both satellites saw them). Out on the right come the converted seasons, which meet the real VIIRS seasons of 2012 on with no step. |
| L4 | "Tested on years it never saw, its error falls from 77% to 14%, and every value shows its margin." | The dial sweeps from 77% to 14%, landing on "14%"; the line "Raw MODIS 77% · fixed factor 24% · Zij 14%" on "77%". On "margin" the converted seasons' error bands glow. |
| L5 | "Draw any area: Zij fits it live in your browser, and tells emergency teams if this season is normal." | A glide to the real app on its satellite basemap, with "Today: Egypt, Portugal, Argentina". A box is drawn on "Draw any area"; "fitted in your browser · 0.16 s" on "browser" (measured during the render); Results, the verdict's badge and sentence on "tells", with its rank among 26 years; then that day's fires drop in. |
| L6 | "And it reveals what the split record hid: in the Delta, detected burning rose after the 2004 ban, and has halved since 2018." | A glide to the Delta's harmonized seasons, 2001 to 2026, drawn as one line with its margin. On "split" the two raw halves flash once behind it; on "ban" an arrow up from 2004, "after the 2004 ban: +97%"; on "halved" a stamp, "since 2018: −53%". On the last word the Seal, "zij.watch" and the credit lines land and hold to 29.5 s: "Data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth" and "Animated from real data with AI-assisted code". |

**The camera.** A close shot of each surface, always drifting in (0.8% a second), so no shot holds still for more than half a second except the beat after "The satellite did.". Three glides of 0.8 s, to the machine, to the app and to the finale, on a quintic smootherstep with a 12% dip out. Motion blur, as on the board, only on the glides: 12 subframes over 1/60 s, each smeared along its own slice on the GPU. The fold of the picture is not a camera move and has none.

**The numbers.** Every number is read from the data files: the seasons from `app/public/data/areas/nile-delta.json` (2011's MODIS season 162, 2012's VIIRS season 1,609, 9.93 times; the converted seasons and their ranges); the errors from `method.json` (raw 76.51%, M0, the fixed factor, 24.06%, M4 14.15%, leaving one year out); the ban and the fall from `findings.json` (+97.35%: 2005 to 2007 against 2001 to 2003; −52.7%: 2018 to 2026 against 2005 to 2017). The verdict and its rank come from the box's own document, fitted in the browser. The fit time on the tag is measured on the page: the second run of the fit, once the country's cells are in memory, as Explore runs it after the first draw. The machine's small pictures are drawn by hand, except "Learn", whose points are the Delta's seasons of 2012 to 2020.

**The box.** From 30.55 E, 31.38 N to 31.75 E, 30.65 N, over the rice country of the northern Delta: the address is `/studio/film/v3?poly=30.55,31.38;31.75,31.38;31.75,30.65;30.55,30.65&day=2023-10-20`. The verdict is the app's own: it speaks of the month so far (November 2026).

## v3.1: to Yassen's take

v3.1 (`/studio/film/v31`, `app/lib/film/v31.ts`) tells v3's story to the voice-over Yassen recorded, in his words. v3 is kept as it is. The film is 29.8 s and still from 29.5 s.

**Voice.** His take (`app/film/audio/voiceover-v3.wav`, 31.1 s) is longer than the film may be (at most 29.9 s), and the book must close after his last word. `app/scripts/film/v31-voice.mjs` therefore shortens each of its 19 pauses (quieter than -40 dB for 80 ms or more) to 70 ms, plays it 2.9% faster with rubberband (pitch and formants unchanged; the earlier briefs allowed up to 5%), and places it so his first word starts at 0.3 s and his last ends by 29.05 s: `app/film/audio/v31-voice-placed.wav`. whisper.cpp then gives the placed voice's word times, and `app/scripts/film/v31-timing.mjs` writes `docs/event/zij-demo30-v3.1-timing.json`, to which every beat is keyed.

**Captions.** His final captions (`zij-demo30-en.final.srt`): ten cues, his words and his line breaks exactly, each timed to the placed voice (from its first word, a shot's first cue from the shot's start, to the next cue, with no gaps; the last to his last word plus 0.4 s). `docs/event/zij-demo30-v3.1.en.srt`; the renderer writes `app/film/zij-demo30-v3.1.en.srt`, `.vtt` and `.ass`.

| Shot | His lines | What happens, on which word |
|---|---|---|
| Opening | (0 to 0.5 s) | NASA GIBS true colour of the Nile Delta on 20 October 2023 fills the frame, pushing in; that day's fire dots appear. No frame, no desk. |
| 1 | "In 2012, NASA's fire record jumps tenfold." | The camera pulls back: a printed photo with a white border on the desk, soft shadow. On its border, in ink, "Team Zij · Cairo" and "Harmonization of MODIS and VIIRS Hot Spots". The dots lift off the photo and fly into the record sheet beside it, two to each season, and the bars grow where they land: the MODIS years on "fire record", the VIIRS years leaping on "tenfold" (162 and 1,609). |
| 2 | "The fires didn't change, but the satellites did." | In on the sheet: the ink circle round the leap on "satellites", "MODIS 1 km" and "VIIRS 375 m"; a still beat after "did". |
| 3 to 5 | "So we built a model ... shows its margin." | To the machine: "NASA FIRMS · MODIS + VIIRS" on its input, the four stages from "model" on, the dial from 77% to 14% on "77 to 14", the margins glowing on "margin". |
| 6, 7 | "Draw any area: Zij fits it live, and it tells responders if this season is normal." | To the real app: a freehand loop drawn with the app's lasso over the rice country of the northern Delta on "Draw any area"; "fitted live in your browser" with the fit time measured on the page, on "live"; the verdict with its rank among 26 years ("12th lowest") on "tells"; the day's fires; "Today: Egypt, Portugal, Argentina". |
| 8 to 10 | "Using Zij, we revealed what the split record hid. ... and it has halved since 2018." | To the findings sheet, its chart across the whole width: the raw halves flash behind the harmonized line on "split"; "after the 2004 ban: +97%" on "ban"; "since 2018: −53%" lands on "halved". |
| End | | From 27.8 s the sheets slide together and stack; a leather cover with a raised-band spine, a gold double fillet and gold corner stars closes over the page block; the Seal is brushed onto it in gold leaf with the landing page's brush (its own strokes, faster), then "zij.watch" and the credit line are stamped in gold. Still for the last 0.3 s. |

**Style.** No strings and no pins or tacks. Rubric red only for fire. Each sheet and the cover fill the frame.

**Checks.** As v3: 162 and 1,609, 77% and 14%, +97% and −53%, the verdict's rank, all from the data files; every caption inside its shot; at most 29.8 s; -14 LUFS and -1 dBTP. Rendered on the laptop's RTX 5060 (`render.mjs --high-gpu`, which starts Chrome with `--force_high_performance_gpu`): about twice as fast on the motion-blurred frames as the integrated GPU.

**Sound.** His voice at -16 LUFS with only a gentle low cut (70 Hz): no de-noiser and no de-clicker. A de-clicker switched on round each mouth click made glitches at its edges, which sounded like clipping, so his take is left as he recorded it. The 2.9% speed-up is done with rubberband (high quality, formants kept) rather than atempo. The music very quiet, 26 dB under him (-42 LUFS), ducked about 6 dB more while he speaks, its final note at about 29.2 s. No lamp bed and no ticks, quill or rasp. The only effects are soft air (the wind, low-passed at 900 Hz) on the camera's moves and the flight, paper as the sheets slide together, and a muffled thud as the cover closes. `npx tsx scripts/film/sound.mjs --films v31`.

## Sound

`app/scripts/film/sound.mjs` puts the sound on the rendered silent films. It runs with tsx because it reads the films' own timelines, which are TypeScript:

    npx tsx scripts/film/sound.mjs --story D:/Zij/zij-story

It follows the registration film's sound (`zij-story/narration/DIRECTION.md`): a quiet ambience bed under every second, the music under the voice, about -14 LUFS integrated and at most -1 dBTP. No AI-generated audio of any kind. Every file, its author and its licence: [AUDIO_CREDITS.md](AUDIO_CREDITS.md).

- **Music.** The registration film's track, "Arabic" by Kulakovka (Pixabay Content License): its last section, back-timed so the final note is struck at 28.95 s and rings out over the last half-second. It fades to silence by 29.5 s.
- **Bed.** The lamp's flame (Freesound, CC0), about 22 dB under the music.
- **Effects.** Quiet and few, placed from the timelines, never by ear (each film's event list is written to `app/film/work/sound/events-v1.txt` and `events-v2.txt`).
  - In v2 the times come from `lib/film/board.ts`: soft air on each camera glide (`TRAVELS`); a faint thread rasp along it; a tick when the thread reaches each pin (6.2, 10.4, 13.8, 18.2, 22.0 and 24.8 s, from `threadDrawn`); a quill for each title at its paper's story start, for the verdict, and for the team and credit lines; the polygon drawn; stamps for the calendar's rows, the verdict's badge and the two files; paper slides for Results and the day's slip; and the Seal's brush.
  - In v1 the times come from `lib/film/timeline.ts` (`T`): the same kinds of sound at its own beats.
  - Sources: recordings from the registration film's folder (CC0), plus two sounds synthesised with ffmpeg (the thread, the tick).
- **Voice.** Only in the `-voice` files: the voice-over, cleaned lightly (a high-pass at 80 Hz, a gentle de-noise), played 3% faster with `atempo` (no change of pitch). It is placed at 0.15 s, so his last word ends at 29.03 s. He speaks for 29.75 s, longer than the 28.5 s asked for, so the 3% (under the 5% allowed) is what fits it; nothing is cut. The music sits 13 dB under him and comes back up for its final note as he finishes.
- **v3.** The music is a quiet bed, the effects small and on the beats (`app/film/work/sound/events-v3.txt`): soft air on the three glides, paper as the picture folds, a stamp on "tenfold", the quill for the circle, a brass tick for each of the machine's four stages, a rasp while the dial sweeps and a tick where it lands, the quill for the box and the arrow, a stamp for the badge, for "since 2018" and for the Seal landing. With the voice, the voice is at -16 LUFS, the music 18 dB under it, and a side-chain compressor keyed by the voice ducks it about 6 dB more while he speaks. Without a voice there is nothing for the music to sit under, so at -14 LUFS it carries the loudness.
- **Master.** Each mix is set to -14 LUFS and limited below -1 dBTP, then checked again after AAC encoding (320 kbps, 48 kHz). The picture is copied (`-c:v copy`), and every file is checked with ffprobe for 29.5 s, never over 29.9.

## Sources

Every chart, map and number is a real component fed the exported data. Nothing was typed in.

| On screen | Comes from |
|---|---|
| Season bars, their axis, the range of converted years, the median | `app/public/data/areas/nile-delta.json`, through `components/SeriesChart.tsx` |
| "MODIS 2001-2011", "VIIRS 2012-2026" over the two halves | The years of that file whose source is MODIS or VIIRS |
| The calendar, in scenes 2 and 6 | The same file's months, through `components/Calendar.tsx` |
| The validation chart | `docs/assets/validation-light.svg`, drawn from `method.json` by `scripts/readme_assets.py`. Its flat ground and frame are left out so it lies on the sheet's paper. |
| 77% and 14% | `app/public/data/method.json`: the season error of raw MODIS and of M4, each leaving one year out, rounded. The numbers the counter passes on the way are not data. |
| The atlas | `lib/map/style.ts` with Natural Earth data from `app/public/atlas/` |
| The preset boxes and name tags | `app/public/data/index.json` |
| The drawn area's verdict, cells, this month | Fitted in the browser from `app/public/data/cells/` by `lib/drawnArea.ts` and `lib/verdict.ts`, the way Explore does it |
| The day's verdicts and counts, the hotspots | `app/public/data/hotspots/` through `lib/dayData.ts`; the marks are the app's own layers (`lib/map/layers.ts`) |
| The satellite picture | NASA GIBS, `VIIRS_SNPP_CorrectedReflectance_TrueColor`, 20 October 2023, fetched while rendering (`lib/map/style.ts`) |
| The season brief | The app's page `/brief?area=nile-delta` (`components/Brief.tsx`), in a frame, without its buttons |
| The CSV and the calendar picture | The files the Downloads page saves. The page is mounted out of sight, its "Monthly CSV" and "Calendar PNG" buttons are pressed once, and the files are caught on their way to disk, with their names. |
| The Seal and its brush strokes | `app/public/landing.html`, where `scripts/build-landing.mjs` puts them. The landing's keyframes are worked out for the frame's time instead of run as CSS animations. |
| The desk | The landing page's wood (`landing-src/landing.js`, `paintWood`), copied to `app/lib/film/wood.ts`, in the Night colours |
| The paper | `components/Paper.tsx` |
| The captions | `docs/event/zij-demo30.en.srt`, parsed by `app/lib/film/srt.ts`: the words and the times are the file's. Eight captions, each inside its scene. Since the voice-over, they are its words and timings, transcribed locally (whisper.cpp). A separate track for both versions. |
| "error falls from 77% to 14%" | The caption file's words, checked against `method.json` before every render |
| v3's numbers: 162 and 1,609; 77%, 24%, 14%; +97% and −53%; the verdict's rank | `nile-delta.json`, `method.json`, `findings.json` and the box's own fit, read by the page and checked by the renderer before any frame is taken |
| "Data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth" | The credits the app gives on its map (`components/Explore.tsx`, `lib/capture.ts`), as text |
| Type | Cormorant Garamond and Amiri, bundled with the app |
| Fire data | NASA FIRMS active fire detections, MODIS Collection 6.1 and VIIRS 375 m |

What the film adds that is not in the app:

- the desk and the lamp's light;
- the names over the chart's two halves, and the line between them;
- the brass cursor;
- each hotspot's drop and blot of ink before it lands (the landed mark is the app's);
- the counter;
- the line "Team Zij · Harmonization of MODIS and VIIRS Hot Spots";
- the end card's credit line;
- in v2, the board's pins and thread, and the papers' titles;
- in v3, the fold, the ink circle and the sensors' names, the machine and its four small pictures, the dial, the tags, the arrow and the stamp;
- the sound (see [Sound](#sound)).

## What is not in it

No faces, names or voices of people. No NASA logos: NASA is named in words only, in the captions and the credit line. No generated images: everything is drawn by the app's code from the exported data, or is NASA's satellite picture. Rubric is used only for fire: the VIIRS and harmonized bars, the VIIRS marks, the heat ramp, the intensity line.

## Files

| File | What it holds |
|---|---|
| `app/app/studio/film/page.tsx` | The page: reads the captions, the validation chart, the Seal and the two numbers on the server |
| `app/app/studio/film/film.css` | The frame, the desk, the light, the sheets |
| `app/components/film/Film.tsx` | v1: the clock, `seek(t)`, the desk |
| `app/components/film/Record.tsx`, `Proof.tsx`, `Atlas.tsx`, `Take.tsx`, `EndCard.tsx` | v1: scenes 1 and 2, 3, 4 and 5, 6, 7 |
| `app/components/film/kit.tsx` | Both: the film's handle, sheets, the ink rule, text inked in |
| `app/lib/film/timeline.ts` | Both: the scenes, every beat's time, the one curve and the one spring |
| `app/lib/film/srt.ts`, `wood.ts` | Both: the caption file's reader; the desk's wood |
| `app/app/studio/film/v2/page.tsx`, `board.css` | v2: the page (it reads what v1's does) and the board's styles |
| `app/components/film/board/Board.tsx` | v2: the clock, `seek(t)`, the desk, the layers, the pins and thread, the lamp |
| `app/components/film/board/Charts.tsx`, `Maps.tsx`, `Cards.tsx`, `Title.tsx` | v2: papers 1 to 3, 4 and 5, 6 and 7; a paper's title |
| `app/lib/film/board.ts` | v2: the papers' places, the camera and its time, focus, the lamp, the thread, each paper's beats |
| `app/app/studio/film/v3/page.tsx`, `v3.css` | v3: the page (the captions, the timing, the Seal, every number from the data files) and its styles |
| `app/components/film/v3/Cut.tsx` | v3: the clock, `seek(t)`, the four surfaces, the pins, the lamp, the numbers for the checks |
| `app/components/film/v3/RecordSheet.tsx`, `Machine.tsx`, `MapSheet.tsx`, `Finale.tsx` | v3: L1 and L2, L3 and L4, L5, L6 |
| `app/scripts/film/v3-timing.mjs` | v3: the words' times (planned, or from whisper) and the captions from them |
| `app/lib/film/v3.ts` | v3: the script, the surfaces, every beat from the words' times, the camera and its glides, focus, the lamp, the captions, the box |
| `app/app/studio/film/v31/`, `app/components/film/v31/`, `app/lib/film/v31.ts` | v3.1: the page, the photo, the record sheet with the flight, the book, the camera and the beats (the machine, the app and the findings are v3's) |
| `app/scripts/film/v31-voice.mjs`, `v31-timing.mjs` | v3.1: the placed voice and its word times; the timing file and the captions |
| `app/scripts/film/render.mjs` | The renderer, the checks and the caption files |
| `app/scripts/film/sound.mjs` | The sound: music, bed, effects, voice, the masters and the final files |

Outside the film's own files, one file of the app changed: `scripts/build-landing.mjs` now writes `public/landing.html` and `public/landing/reference/landing.js` with LF line endings. Together with the new `.gitattributes`, a build on Windows no longer rewrites the committed files.
