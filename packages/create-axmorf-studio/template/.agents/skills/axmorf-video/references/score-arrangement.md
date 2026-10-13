# Original score arrangement

Root reads this before new-film music synthesis. Scene workers use only their frozen local musicTiming.

For new music, synthesize original audio locally; do not select existing BGM or download samples. Choose BPM, meter,
instrumentation and energy for this film. The local helper is a starting arrangement, not a mandatory aesthetic:

```bash
node .agents/skills/axmorf-video/scripts/synth-score.mjs --input inputs/score.json --id <score-id>
```

Recipe: fps (resolved Project fps), bpm, beatsPerBar, bars, style (`organic`/`electronic`), seed.
新片明确写 `arrangement`：`tonic`、`mode`(major/minor)、`progression`(1–7级和弦)、可选 `swing`(0–0.4拍延迟)、
`sections`(bars/instruments/density/energy)。总 bars 必须匹配；乐器为 kick/hat/bass/pluck/pad，density 0–1，energy >0–1。
按铺垫、发展、落点安排疏密、配器和强弱；空 instruments 是休止段。旧六字段 recipe 保留原编曲，新片不靠换 seed/BPM 代替编曲。
例：`arrangement:{tonic:"D",mode:"minor",progression:[1,6,3,7],swing:0.15,sections:[{bars:2,instruments:["pad","pluck"],density:0.3,energy:0.4},{bars:2,instruments:["kick","hat","bass","pluck","pad"],density:0.9,energy:0.85}]}`（总4小节，JSON 文件需给键加引号）。
Before project:create, it uses Node/FFmpeg to write original stereo 48 kHz PCM and `timeline.json` under
`public/assets/generated-score/<score-id>/`, with two-pass loudnorm (-14 LUFS, -2.7 dBTP targets).
One timeline drives synthesis and visual beats. Round absolute beat frames once: `60 * fps / BPM` frames/beat.
Fractional grids are valid; never accumulate rounded beat lengths.
Use the helper's returned `backgroundMusic` object (`mode:"synthesized"`, sourcePath, timelinePath, volume) in create input.
Music gain under speech can start around 0.08-0.12, not certified loudness. Create validates checksum/PCM duration/fps, freezes
Project-owned score/sound.json timeline, and suppresses Scene/template BGM while retaining independent effects.
The synthesized score loops from composition frame zero and fades at the end; it never restarts at Scene or Beat boundaries.
Explicit no-music still uses null. Do not change saved music settings, remove the library, or migrate existing Projects.
