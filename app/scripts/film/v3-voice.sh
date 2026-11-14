#!/usr/bin/env bash
# The final cut's voice-over, to word times (docs/event/FILM.md, "The third version").
# Transcribes app/film/audio/voiceover-v3.* locally with whisper.cpp, one segment per word, picks the
# smallest speed-up (at most 5%) that ends the last word by 28.8 s with the first at 0.1 s, and
# writes the timing file and the captions from it (scripts/film/v3-timing.mjs). Run from app/.
#   WHISPER=.../whisper-cli.exe MODEL=.../ggml-large-v3-turbo.bin bash scripts/film/v3-voice.sh
set -euo pipefail
WHISPER=${WHISPER:-D:/Zij/zij-story/whisper/build/bin/whisper-cli.exe}
MODEL=${MODEL:-D:/Zij/zij-story/whisper/ggml-large-v3-turbo.bin}
VOICE=$(ls film/audio/voiceover-v3.* | head -1)
WORK=film/work/v3-voice
mkdir -p "$WORK"
ffmpeg -y -loglevel error -i "$VOICE" -ac 1 -ar 16000 -c:a pcm_s16le "$WORK/voice16k.wav"
PROMPT="In 2012, NASA's fire record jumps tenfold. The fires didn't change. The satellite did. So we built a machine that learns how both satellites see, area by area. Tested on years it never saw, its error falls from 77% to 14%, and every value shows its margin. Draw any area: Zij fits it live in your browser, and tells emergency teams if this season is normal. And it reveals what the split record hid: in the Delta, detected burning rose after the 2004 ban, and has halved since 2018."
"$WHISPER" -m "$MODEL" -f "$WORK/voice16k.wav" -l en -ml 1 -sow -oj -of "$WORK/words" --prompt "$PROMPT" > "$WORK/whisper.log" 2>&1
TEMPO=$(node -e '
const w = require("./'"$WORK"'/words.json").transcription.filter((s) => s.text.trim());
const span = (w[w.length - 1].offsets.to - w[0].offsets.from) / 1000;
const tempo = Math.min(1.05, Math.max(1, span / 28.7));
console.error(`  spoken from first word to last: ${span.toFixed(2)} s; tempo ${tempo.toFixed(3)}`);
console.log(tempo.toFixed(3));')
npx -y tsx scripts/film/v3-timing.mjs --whisper "$WORK/words.json" --tempo "$TEMPO" --at 0.1
