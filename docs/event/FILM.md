# The demo film

A 29.5 second film, 1920 x 1080, 30 frames a second, drawn from the real app one frame at a time. Nothing in it is a screen recording.

| File | What it is |
|---|---|
| `app/film/film.mp4` | The film. With music if `app/film/music.mp3` exists, silent otherwise. |
| `app/film/film-silent.mp4` | The same picture with no sound. |
| `app/film/thumbnail.jpg` | One frame of the film, 1280 x 720. |
| `app/film/stills/` | Still frames at full size, for looking at before a whole render. |

The renderer's output stays out of git (`app/film/.gitignore`): render it again from the steps below.

## How it is made

`/studio/film` is one page with one function, `window.__film.seek(t)`. It draws the exact frame for the time `t` in seconds and resolves when the page is still.

- Every motion is a function of `t` (`app/lib/film/timeline.ts`). There are no CSS transitions or animations (the film's stylesheet switches off the app's own inside the film), no timers, and no random numbers without a seed. The wood and the paper are painted from fixed seeds.
- React draws the frame from `t`. Then each scene sets by hand what the app's own components animate with timers: the bars of the chart (the chart is found by its element, its animation is off, and its values are set for the frame), the map's camera, the rows of the calendar, the strokes of the Seal.
- The map's camera is set for each frame with `jumpTo`, along a path eased with one curve. Each frame waits for the map's `idle` event (every tile loaded, label fades finished) and for the atlas's detail cells.
- The last second is still: the end card stops moving at 28.5 s. The last caption ends at 29.3 s, so its strip fades out over the 0.15 s before that; from 29.3 s every frame is the same. The page says when that is (`__film.stillFrom`, the later of 28.5 s and the last caption's end); the renderer photographs that frame once and repeats it, then photographs the page's very last frame again and prints how closely it matches.

Before any frame is taken, the renderer checks the words against the film and the data, and stops if one fails:

- every caption lies inside one scene;
- the caption that says "from 77% to 14%" gives the numbers `method.json` holds: the season error of raw MODIS and of M4, each leaving one year out, rounded (76.51% and 14.15%);
- the counter on screen runs between the same two numbers.

`app/scripts/film/render.mjs` opens the page in headless Chrome over the DevTools protocol, steps `t` by 1/30 s and takes a JPEG screenshot of every frame at quality 92. Frames are photographed at twice the size (3840 x 2160) and scaled to 1920 x 1080 with Lanczos, so charts and maps are sharp. Then ffmpeg:

1. One mp4 per scene, the same settings for all seven: `libx264`, `-crf 18`, `-pix_fmt yuv420p`, 30 fps, BT.709.
2. The scenes are joined with the concat demuxer and `-c copy`.
3. Sound is added last with `-c:v copy` (AAC, a short fade in and a two second fade out), cut at 29.5 s.
4. `ffprobe` checks that each file is 1920 x 1080 and 29.5 s long, and never over 29.9.

A transition belongs to the scene it opens, so it is inside that scene's file; nothing is blended between files.

### To render it again

From `app/`, with Node 22 or later, Chrome, ffmpeg and ffprobe:

    pnpm build
    pnpm start --port 3111
    node scripts/film/render.mjs --stills 2.3,7.3,9.6,12.3,16.5,19.7,23.6,27.3
    node scripts/film/render.mjs

`--scenes 4,5` renders those scenes again and joins everything; `--thumb 9.9` sets the thumbnail's time; `--keep` keeps the frames. Scene 5 needs the network: its satellite picture comes from NASA GIBS.

To look at it by hand, open `/studio/film?t=12.3`. The arrow keys step one frame, with Shift one second.

### The address

The area and the day are in the address, like every view of the app: `/studio/film?poly=...&day=YYYY-MM-DD`. With neither, the page goes to the film's own: a polygon over the rice country of the northern Nile Delta (30.50 to 31.80 E, 30.60 to 31.40 N) and 20 October 2023, a day of the straw burning with 157 VIIRS and 26 MODIS detections in the polygon. The downloads in scene 6 read the same address, so the CSV and the calendar picture are the drawn area's. The brief is the Nile Delta preset's: it is the app's own page at `/brief?area=nile-delta`, held in a frame on the desk, with the film's small stylesheet put into it (no buttons, no ground behind the sheet, nothing that moves).

## The scenes

| | Seconds | What happens | Drawn by |
|---|---|---|---|
| 1 | 0.0 to 6.4 | The jump. The Nile Delta's seasons as recorded. MODIS years are inked in, then the VIIRS years leap. The two halves are named. | `SeriesChart`, `Lever`, `ResultPaper` |
| 2 | 6.4 to 10.6 | The link. The lever goes to "On one scale"; the bars settle into the harmonized record, with the likely range of each converted year and the median. The calendar slides in and its rows are stamped from 2000 to now. | `SeriesChart`, `Calendar` |
| 3 | 10.6 to 14.0 | The proof. The validation chart's bars are drawn; a counter runs from 77% to 14%. | `docs/assets/validation-light.svg` |
| 4 | 14.0 to 18.4 | Any area. The map flies from Egypt to the Nile Delta preset; a brass cursor draws a polygon; the shape closes; Results slides in and the verdict is written. | `MapView`, `setSketch`, `Panel`, `resolveDrawn` |
| 5 | 18.4 to 22.2 | Any day. 20 October 2023 is set; the day's hotspots drop in the order the satellites saw them; the atlas turns into NASA's picture of that day. | `MapView` twice, `Panel`, `loadDay` |
| 6 | 22.2 to 25.0 | Take it. The Nile Delta's season brief slides out; the drawn area's monthly CSV and calendar picture are stamped. | `/brief?area=nile-delta`, `Downloads` |
| 7 | 25.0 to 29.5 | End card. The Seal is written with the brush, then "Team Zij · zij.watch", then the credits in one small line. The end card holds from 28.5 s. | the landing page's Seal |

Transitions, three kinds only: a cut (1 to 2, 4 to 5), the ink rule (into 3 and into 7: a double rule is drawn across, then travels down the frame with the next sheet behind it), and the paper slide (the calendar, the map sheet, Results, the brief).

Motion: one easing curve for every move, the design system's `ease-lamp`; one spring for every arrival, critically damped so nothing bounces (the design system allows no bounce). Every scene has a slow push-in from 1.00 to 1.03 on the sheets, with the desk moving less and the lamp's light drifting between them. One exception to the one curve: the Seal's strokes keep the pace the landing page gives them.

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
| The captions | `docs/event/zij-demo30.en.srt`, parsed by `app/lib/film/srt.ts`: the words and the times are the file's. Eight captions, each inside its scene. |
| "error falls from 77% to 14%" | The caption file's words, checked against `method.json` before every render |
| "Data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth" | The credits the app gives on its map (`components/Explore.tsx`, `lib/capture.ts`), as text |
| Type | Cormorant Garamond and Amiri, bundled with the app |
| Fire data | NASA FIRMS active fire detections, MODIS Collection 6.1 and VIIRS 375 m |

What the film adds that is not in the app: the desk and the lamp's light, the names over the chart's two halves and the line between them, the brass cursor, each hotspot's drop and blot of ink before it lands (the landed mark is the app's), the counter, the caption strip, the line "Team Zij · Harmonization of MODIS and VIIRS Hot Spots" and the end card's credit line.

Captions are set in Cormorant Garamond at 58 px on a strip of paper in the lower third, inside a 5% margin, and inked in from the left over 250 ms. The strip is there only while a caption is: it fades in over 0.15 s as its caption begins and out over the 0.15 s before it ends, so between captions the desk is clear.

## What is not in it

No faces, names or voices of people. No NASA logos: NASA is named in words only, in the captions and the credit line. No generated images: everything is drawn by the app's code from the exported data, or is NASA's satellite picture. Rubric is used only for fire: the VIIRS and harmonized bars, the VIIRS marks, the heat ramp, the intensity line.

## Files

| File | What it holds |
|---|---|
| `app/app/studio/film/page.tsx` | The page: reads the captions, the validation chart, the Seal and the two numbers on the server |
| `app/app/studio/film/film.css` | The frame, the desk, the light, the sheets |
| `app/components/film/Film.tsx` | The clock, `seek(t)`, the desk, the captions |
| `app/components/film/Record.tsx`, `Proof.tsx`, `Atlas.tsx`, `Take.tsx`, `EndCard.tsx` | Scenes 1 and 2, 3, 4 and 5, 6, 7 |
| `app/components/film/kit.tsx` | Sheets, the ink rule, text inked in |
| `app/lib/film/timeline.ts` | The scenes, every beat's time, the one curve and the one spring |
| `app/lib/film/srt.ts`, `wood.ts` | The caption file's reader; the desk's wood |
| `app/scripts/film/render.mjs` | The renderer |

No existing file of the app was changed.
