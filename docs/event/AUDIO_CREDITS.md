# Audio credits: the demo film

Every sound in the demo film (`app/film/film-final*.mp4`, `film-v2-final*.mp4`), where it comes from, who made it and under what licence. No AI-generated audio of any kind. The music and the recorded effects are the ones the registration film already uses (the `zij-story` folder, `assets/music/` and `assets/sfx/`, listed in its `assets/SOURCES.csv` and `CREDITS.md`). The rest were synthesised for this film with ffmpeg's own sources and filters. `app/scripts/film/sound.mjs` builds the mix; FILM.md says how.

## Voice

| File | What | Source | Licence |
|---|---|---|---|
| `app/film/audio/voiceover.wav` | The voice-over, in English | Yassen, Team Zij, recorded for this film (exported from DaVinci Resolve, 14 November 2026) | The team's own recording |

Cleaned lightly: a high-pass at 80 Hz, a gentle de-noise (6 dB, `afftdn`). It is played 3% faster with `atempo`, so the pitch does not change. It is only in the `-voice` files.

## Music

| File | Used | Author | Source | Licence |
|---|---|---|---|---|
| `pixabay-kulakovka-arabic-295885.mp3` | 96.05 s to 125.5 s of the track: its last section, back-timed so the final note lands at 28.95 s | Kulakovka | Pixabay Music, https://pixabay.com/music/arabic-arabic-295885/ | Pixabay Content License: free for commercial and non-commercial use, no attribution required. Credited anyway. |

## Recorded effects (Freesound, CC0 1.0)

| File | Used for | Title and author | Source |
|---|---|---|---|
| `lamp-flame-fs680474.mp3` | The ambience bed under every second: the lamp's flame | "Candle double wood wick flame stereo 01.wav" by roisin.gleeson | https://freesound.org/people/roisin.gleeson/sounds/680474/ |
| `wind-desert-plain-fs697217.mp3` | The camera's glides (v2) and the map's flight and the day's turn (v1): soft air, band-passed | "Looping Gentle Wind Ambience on an Open Desert Plain.wav" by dhallcomposer | https://freesound.org/people/dhallcomposer/sounds/697217/ |
| `quill-parchment-fs507864.mp3` | Ink: the titles, the verdict, the team and credit lines, the polygon, the ink rules, the Seal's brush | "Quill and Parchment.WAV" by Nickh69 | https://freesound.org/people/Nickh69/sounds/507864/ |
| `paper-parchment-fs112579.mp3` | Stamps: the calendar's rows, the verdict's badge, the CSV and the calendar picture | "Old Heavy Parchment.wav" by Dredile | https://freesound.org/people/Dredile/sounds/112579/ |
| `paper-sheets-fs450803.mp3` | Paper slides: Results, the day's slip, the corner slip and the v1 sheets | "paper sheets flip through turn page nice various.wav" by kyles | https://freesound.org/people/kyles/sounds/450803/ |

CC0 1.0 (public domain dedication): no attribution required. Credited anyway.

## Synthesised for this film (ffmpeg, no recordings)

| Sound | How | Used for |
|---|---|---|
| The thread | Pink noise (`anoisesrc`), band-passed around 4.2 kHz, faded in and out with each glide | The brass thread drawn ahead of the camera (v2) |
| A pin's tick | Two decaying sines at 2.65 and 5.15 kHz (`aevalsrc`), high-passed | The thread reaching each pin (v2); the lever (v1) |

These are made by `app/scripts/film/sound.mjs` and belong to the project.
