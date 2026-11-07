# 配乐与卡点

默认先写 storyboard 的章节和画面落点，再为本片写原创 `music.score`。除非用户指定曲目，不用 `music.track`。
配乐有两种来源，写在 `film.json` 的 `music` 字段，二选一：

- `music.score`：在本地用代码合成的原创配乐（默认做法，下面大部分内容讲它）。
- `music.track`：一首已用 `film:asset` 登记来源与许可的音频文件，见文末 [使用授权曲目](#使用授权曲目)。

先运行 `film:voice` 得到实测时序，写 storyboard，再运行 `film:music` 和 `film:sfx`。声音跟画面走；不要为卡拍移动旁白或字幕。

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
旧的 bars-only `sections` 小节数之和必须等于 `bars`，最多 64 小节。

## 用画面事件锚定配乐（默认）

storyboard 先定章节边界、揭示和收尾帧；`from` 用句子 id 或正片绝对帧，`hits`、`breaks`、`ending` 都对应这些事件。
`bpmRange` 在范围内搜索小节线误差最小的速度；`film:music` 输出实际边界与残差，超过 3 帧时按提示调整范围或锚点。
画面已锁定时保留原帧，用精确 `hit` 强调；不要把画面挪到搜索后的段落边界。

```json
{
  "engine": "studio-v2",
  "bpm": 104,
  "bpmRange": [112, 128],
  "beatsPerBar": 4,
  "style": "electronic",
  "seed": 17,
  "arrangement": {
    "tonic": "A",
    "mode": "minor",
    "progression": [1, 6, 3, 7],
    "sections": [
      {
        "from": 0,
        "instruments": ["pad", "pluck"],
        "density": 0.35,
        "energy": 0.35
      },
      {
        "from": 120,
        "instruments": ["kick", "hat", "bass", "pad"],
        "density": 0.6,
        "energy": 0.65
      },
      {
        "from": 240,
        "instruments": ["pad", "pluck"],
        "density": 0.4,
        "energy": 0.4
      }
    ]
  },
  "hits": [{ "frame": 150, "kind": "stinger", "intensity": 0.65 }],
  "breaks": [{ "from": 120, "to": 150, "keep": ["pad"] }],
  "ending": { "landFrame": 270, "cadence": "resolve" }
}
```

例子用于至少 300 帧的正片；真实片的帧号从 storyboard 取，不照搬。`from` 可和旧的 `bars` 段混用（每段二选一）；锚定编曲省略总 `bars` 时自动覆盖全片，写了则必须足够长。
速度搜索步长 0.01 BPM，另含范围端点和中点；最小化边界整数帧残差平方和，同分取更接近范围中点的速度。
`hits.kind` 为 `stinger` / `lift` / `drop` / `swell`；它们按指定帧加入配乐，并进入 `accentFrames`。
`breaks` 在编曲中真正停掉未保留乐器，与 `musicDips` 压低音量不同；`ending.cadence` 为 `resolve` / `cut` / `ring`，
在落点解决、切断或留尾，不用循环收尾。锚点使用正片帧，`music.startFrame` 由生成器处理。
旧的只用 bars 的 score 和指定 track 继续兼容。

## 用音乐事件做次级运动

`useFilmTiming().music.onsets` 是合成时导出的实际事件帧，含 `kick`、`snare`、`clap`、`hat`、`bass`、`hits`、`sections`。
例如 kick 事件 f120，灯在 f120 开始闪，误差为 0 帧；无需再做音频节拍检测。旧 track 没有 onsets，必须判断字段是否存在。
`useFilmMusicEnergy()` 返回对数刻度、平滑后的 `{ low, mid, high }`，只用于辉光、粒子呼吸等连续次级运动；
关键动作仍用事件帧。它读取本片的本地 WAV，详见 [API](api.md)。

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
- 音效 cue、吸附、揭示前 `musicDips` 与 `ending` 收音统一见 [音效计划与音效轨](sound.md)，不在此重复维护。

## 使用授权曲目

只有用户指定曲目或素材时使用；必须能证明可以用：

1. **确认许可**：曲子来自用户本人、明确写了可再使用的许可（如 CC BY、购买的授权），或用户确认有权使用。
   曲库、平台或生成服务没写清站外使用条款时，停下来问用户，不要自行认定可以用。
2. **登记**：`npm run film:asset -- --film <filmId> --file /absolute/path/song.mp3 --name song.mp3 --origin licensed
--creator "<作者>" --license "<许可>" --source-url "<来源网址>"`（用户原创的曲子用 `--origin original`）。
3. **写 `music.track`**，先不写节拍：

   ```json
   "music": {
     "track": { "asset": "song.mp3", "trimStartSeconds": 52.1, "beatsPerBar": 4, "sectionBars": [0, 8, 16] },
     "volume": 0.9,
     "underSpeechVolume": 0.9,
     "fadeOutFrames": 45
   }
   ```

4. 运行 `film:music`：没有 `bpm` 时它会从音频估一个 `bpm` 和 `firstDownbeatSeconds` 并停下。核对后把两个值写进
   `music.track`，再运行一次。之后的节拍网格只来自你写下的值，重跑不会漂移；估计值与写定值不一致时输出里会提示。

- `trimStartSeconds` 跳过安静的前奏，从曲子最有劲的段落开始；`sectionBars` 是裁剪后的小节号，决定
  `sectionFrames` 与 `accentFrames`。曲子比片子短会循环，最好选够长的曲子或缩短片子。
- 有旁白的片照样会在旁白下压低曲子；没有旁白的 MV 把 `volume` 和 `underSpeechVolume` 设成相同的 0.8–0.9。
- 授权曲目的作者和许可会随素材登记写入交付的 `publish.json`。
