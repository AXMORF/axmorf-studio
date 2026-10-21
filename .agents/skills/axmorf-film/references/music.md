# 配乐与卡点

原创配乐在本地用代码合成，不下载、不选用现成曲库。写在 `film.json` 的 `music` 字段，然后运行
`npm run film:voice` 和 `npm run film:music`。

```json
"music": {
  "score": {
    "engine": "studio-v2",
    "bpm": 104,
    "beatsPerBar": 4,
    "bars": 20,
    "style": "electronic",
    "seed": 20261014,
    "arrangement": {
      "tonic": "A",
      "mode": "minor",
      "progression": [1, 6, 3, 7],
      "swing": 0.05,
      "sections": [
        { "bars": 2, "instruments": ["pad", "pluck"], "density": 0.35, "energy": 0.35 },
        { "bars": 8, "instruments": ["kick", "hat", "bass", "pluck", "pad"], "density": 0.55, "energy": 0.55 },
        { "bars": 6, "instruments": ["kick", "clap", "snare", "hat", "bass", "pluck", "pad", "lead"], "density": 0.8, "energy": 0.9 },
        { "bars": 4, "instruments": ["pad", "pluck", "lead"], "density": 0.4, "energy": 0.4 }
      ]
    }
  },
  "startFrame": 0,
  "volume": 0.24,
  "underSpeechVolume": 0.09,
  "fadeOutFrames": 45
}
```

`score` 不写 `fps`（使用本片 fps）。配乐只覆盖正片，片头片尾使用各自的模板音频。乐器：`kick`、`snare`、`clap`、`hat`、`bass`、`pad`、`pluck`、`lead`、`guitar`（失真强力和弦，主要给 `drive`）；
`sections` 的小节数之和必须等于 `bars`，最多 64 小节。

## 按故事编曲

1. **长度**：先运行 `film:voice` 得到总帧数，按 `bars × beatsPerBar × 60 / bpm` 秒选 `bars` 覆盖全片。
   `film:music` 在配乐比片子短时会给出建议的小节数；短于全片时配乐会循环。
2. **速度与色彩**：平静讲解 84–96 BPM `organic`；产品、科技、轻快题材 100–124 BPM `electronic`；
   片头、MV、动漫 OP 一类高能片 160–180 BPM `drive`（乐队编制：军鼓反拍、八分音符贝斯、强力和弦吉他，
   每 4 小节自动过门，段落交接前有通鼓滚奏）。`drive` 按段落 `energy` 分三档：低于 0.5 为主歌（闷音和弦），
   0.5–0.8 为前奏（十六分琶音推进），0.8 以上为副歌（开放和弦、开镲、每两小节镲片），`lead` 在每 4 小节里把同一个
   两小节钩子唱两遍再回答。
   小调适合紧张和探究，大调适合乐观和揭晓。
3. **段落跟随叙事**：开场钩子用稀疏的段落（pad、pluck）；问题展开时加入脉冲（kick、hat、bass）；
   关键揭示用最满的段落（加 snare/clap 和 lead）；结尾收薄。把段落边界放在它所服务的那句旁白开始附近
   （`film:voice` 输出了每句的起止帧）。能量逐步走向高潮，一次清楚的到达胜过一直很满。
4. **给旁白留空间**：`lead` 留给高潮或没有旁白的段落；密度超过 0.8 只用在旁白停顿或画面独自承担的时刻。
5. **音量**：保留 `volume: 0.24` 和 `underSpeechVolume: 0.09`。`<FilmSoundtrack />` 会在每句旁白下平滑压低配乐，
   句间回升，结尾淡出。无旁白的片可把 `underSpeechVolume` 设成与 `volume` 相同。

`seed` 只改变旋律细节；改变情绪要改调式、和声、配器和段落，而不是换 seed。

## 卡点

`film:music` 输出 `sectionFrames`（段落起点）、`accentFrames`（段落升起处的重音）和 `barFrames`；
代码里用 `useFilmTiming().music` 读取，帧号都是全片绝对帧。

- 最大的揭示、切换或镜头到位落在 `accentFrames` 或 `sectionFrames`；次要动作落在 `barFrames`/`beatFrames`。
- 用 `snapProducerFrameToBeat(frame, music.barFrames, { maxShiftFrames: 6, minFrame, maxFrame })` 在允许的窗口里吸附；
  预备动作提前开始，让“到达”那一帧踩在拍上。
- 语义优先：吸附会让画面早于或晚于对应旁白时就保留原帧。旁白和字幕的时间永远不为踩拍而改变。
- 音效对齐同一个落点（`assets/axmorf-shared/audio/sound-effects/` 下的共享音效），不要每个拍点都发声。
