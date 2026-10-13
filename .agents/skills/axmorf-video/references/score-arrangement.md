# Original score arrangement

Root reads this before new-film music synthesis. Scene workers use only their frozen local musicTiming.

For new music, synthesize original audio locally; do not select existing BGM or download samples. Choose BPM, meter,
instrumentation and energy for this film:

```bash
node .agents/skills/axmorf-video/scripts/synth-score.mjs --input inputs/score.json --id <score-id>
```

## New films: the studio-v2 engine

New films set `"engine": "studio-v2"` with an authored `arrangement`. It renders filtered, detuned and enveloped voices
through reverb, tempo delay and kick sidechain, writes a seeded two-bar lead motif with a call/answer, and adds a fill,
riser and crash wherever a section lifts into drums. Instruments: `kick`, `snare`, `clap`, `hat`, `bass`, `pad`, `pluck`,
`lead`. A score may run up to 64 bars, so plan one score for the whole film instead of looping a short phrase.

Design the score from the story, not from defaults:

1. **Length**: estimate the spoken body at about 4.5 Chinese characters per second, add the inherited bookends, and choose
   `bars` so the score covers the whole film (`bars × beatsPerBar × 60 / bpm` seconds).
2. **Tempo and colour**: calm explanation 84–96 BPM `organic`; product, tech or upbeat 100–124 BPM `electronic`.
   Minor modes suit tension and investigation, major modes optimism and reveals.
3. **Sections follow the narrative**: a sparse intro (pad, pluck) under the hook, a pulse section (kick, hat, bass) while
   the problem builds, the fullest section (add snare/clap and lead) on the key reveal or payoff, and a thinned outro.
   Place each section boundary near the estimated start of the Beat it supports. Energy should rise towards the payoff
   rather than staying flat; one clear arrival is better than constant intensity.
4. **Voice room**: narrated films keep `lead` for the payoff or for passages without speech. Density above 0.8 only where
   narration pauses or the picture carries the moment.

Example (JSON needs quoted keys):

```text
{fps:30,bpm:104,beatsPerBar:4,bars:20,style:"electronic",seed:20261014,engine:"studio-v2",
 arrangement:{tonic:"A",mode:"minor",progression:[1,6,3,7],swing:0.05,sections:[
  {bars:2,instruments:["pad","pluck"],density:0.35,energy:0.35},
  {bars:8,instruments:["kick","hat","bass","pluck","pad"],density:0.55,energy:0.55},
  {bars:6,instruments:["kick","clap","snare","hat","bass","pluck","pad","lead"],density:0.8,energy:0.9},
  {bars:4,instruments:["pad","pluck","lead"],density:0.4,energy:0.4}]}}
```

The helper prints `sections` and `accentFrames` (crash arrivals) in composition frames. Report them with the plan and write
the intended visual landing for each accent into the matching Scene brief.

Its `backgroundMusic` object includes `volume: 0.24` and `underSpeechVolume: 0.09`. Keep both: the composition lowers the
score under every measured narration chunk with short ramps and brings it back between lines, so music is present without
masking speech. Silent films omit `underSpeechVolume`.

## Shared rules

Without `engine`, the original recipe (fps, bpm, beatsPerBar, bars ≤ 16, style `organic`/`electronic`, seed, optional
`arrangement` with kick/hat/bass/pluck/pad) keeps its exact previous audio. Do not change existing Projects' scores.
The script writes original stereo 48 kHz PCM and `timeline.json` under `public/assets/generated-score/<score-id>/`, with
two-pass loudnorm (-14 LUFS, -2.7 dBTP targets). One timeline drives synthesis and visual beats: absolute beat frames are
rounded once from `60 * fps / BPM`; never accumulate rounded beat lengths.
Use the helper's returned `backgroundMusic` object in create input. Create validates checksum/PCM duration/fps, freezes the
Project-owned score and timeline, and suppresses Scene/template BGM while retaining independent effects. The score loops
from composition frame zero and fades at the end; it never restarts at Scene or Beat boundaries. Explicit no-music uses null.
