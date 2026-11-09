# 配乐与卡点

做片先读 [导演手册](direction.md)，顺序以第 2 节为准：实测旁白 → 节奏谱 → film:music → 按小节分镜 → 画面 → 音效。
默认为本片写原创 `studio-v3` music.score；v2 与原始 bars-only 引擎保持字节兼容。只有用户指定才用已登记许可的 music.track；本页讲配置与生成 API。
旁白与字幕使用实测时序，不为踩拍改变。

## 用旁白章节锚定节奏谱（默认）

sections.from 用句子 id 或正片绝对帧，hits 是揭示、breaks 是揭示前抽空、ending 是收尾。
先用口播语义决定事件，再让精确 hit 与画面落点对齐；规律 kick/bar 维持底层节奏，不挪旁白字幕强塞固定拍点。
句首短语用 sentence id；句中关键词只有经人工或外部确认的绝对帧才称词级精度，否则只称句级，不按字数均分。
bpmRange 先找所有章节锚点误差都在 3 帧以内的速度，再取最接近显式 bpm 的速度；没写 bpm 时取最接近区间中点者。
film:music 输出实际边界与残差，超过 3 帧按提示调整范围或锚点。

```json
{
  "music": {
    "score": {
      "engine": "studio-v3",
      "bpm": 104,
      "bpmRange": [96, 116],
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
            "instruments": ["kick", "snare", "hat", "bass", "pluck"],
            "density": 0.8,
            "energy": 0.85
          },
          {
            "from": 216,
            "instruments": ["kick", "hat", "bass", "pad"],
            "density": 0.55,
            "energy": 0.55
          },
          {
            "from": 504,
            "instruments": ["pad", "pluck"],
            "density": 0.25,
            "energy": 0.3
          },
          {
            "from": 576,
            "instruments": [
              "kick",
              "snare",
              "clap",
              "hat",
              "bass",
              "pad",
              "lead"
            ],
            "density": 0.9,
            "energy": 1
          },
          {
            "from": 720,
            "instruments": ["pad", "pluck"],
            "density": 0.3,
            "energy": 0.3
          }
        ]
      },
      "hits": [
        {
          "frame": 0,
          "kind": "stinger",
          "intensity": 0.8
        },
        {
          "frame": 576,
          "kind": "drop",
          "intensity": 1
        }
      ],
      "breaks": [
        {
          "from": 540,
          "to": 576,
          "keep": ["pad"]
        }
      ],
      "ending": {
        "landFrame": 864,
        "cadence": "resolve"
      }
    },
    "startFrame": 0,
    "volume": 0.64,
    "underSpeechVolume": 0.60,
    "mixProfile": "voiceover",
    "fadeOutFrames": 0
  }
}
```

`score` 不写 fps，使用本片 fps。配乐只覆盖正片；片头片尾用各自音频。
乐器为 kick/snare/clap/hat/bass/pad/pluck/lead/guitar；旧 bars-only sections 总和必须等于 bars，最多 64 小节。

这是 30 fps、900 帧（30 秒）的可生成教学谱：hook 7.2 秒 → 证据 → lift/break → f576 drop（之后 2 小节最满）→ outro，f864 和声落定；
真实片按实测句子调整章节，不直接套用这些长度。例子用于至少 900 帧的正片；真实片先按实测句子写节奏谱，生成网格后再写 storyboard，不照搬帧号。`from` 可和旧的 `bars` 段混用（每段二选一）；锚定编曲省略总 `bars` 时自动覆盖全片，写了则必须足够长。
速度搜索步长 0.01 BPM，另含范围端点和中点。先筛选所有锚点整数帧残差绝对值都 ≤3 的候选，
按到显式 bpm（未写时为区间中点）的距离排序；距离相同取残差平方和更小者，仍相同取较小 BPM。
没有可行候选时，最小化 Σ(残差 / 每小节帧数)²，避免偏向快速度；超过 3 帧的提示保留。
`hits.kind` 为 `stinger` / `lift` / `drop` / `swell`；它们按指定帧加入配乐，并进入 `accentFrames`。
`breaks` 在编曲中真正停掉未保留乐器，与 `musicDips` 压低音量不同；`ending.cadence` 为 `resolve` / `cut` / `ring`，
在落点解决、切断或留尾，不用循环收尾。锚点使用正片帧，`music.startFrame` 由生成器处理。
旧的只用 bars 的 score 和指定 track 继续兼容。

## 用音乐事件做次级运动

`useFilmTiming().music.onsets` 是合成时导出的实际事件帧，含 `kick`、`snare`、`clap`、`hat`、`bass`、`hits`、`sections`。
v3 还导出 `onsets.fills` / `onsets.breaks`（`{from,to}`，半开区间）及 `onsets.accents`（`{frame,strength}`，与 `accentFrames` 一致）；
这些新增字段可选，旧文件继续可读。fill 区间是军鼓过门的编排窗口，break 区间中只保留 authored keep 的乐器及其混响；全部 keep 为空时为 PCM 数字零。
`useBeatPulse({events:"fill"})` / `events:"break"` 读窗口起点，`useImpact(music.onsets.accents)` 读带强度重音。
例如 kick 事件 f120，灯在 f120 开始闪，误差为 0 帧；无需再做音频节拍检测。旧 track 没有 onsets，必须判断字段是否存在。
`useFilmMusicEnergy()` 返回对数刻度、平滑后的 `{ low, mid, high }`，只用于辉光、粒子呼吸等连续次级运动；
关键动作仍用事件帧。它读取本片的本地 WAV，详见 [API](api.md)。

## 节奏与混音

统一遵循 [导演手册第 3、4、7 节](direction.md#3-节奏谱怎么写)：讲解片一个 BPM，96–116，
hook 直接进鼓，能量 hook 高 → verse 中 → lift 收 → drop 爆 → outro 落；每小节 L2、每重音 L3（0 帧误差）。
旁白约 -16 LUFS，讲述段底层（配乐 + SFX，实际逐句 duck 后）目标低 8–10 LU；节拍段低 6–8 LU 可作参考，混音 true peak ≤ -1 dBTP。
新 studio-v3 口播片显式 .64/.60 和 `mixProfile: "voiceover"` 是教学谱校准起点（同 fixture：voice -16.0 LUFS，speech bed -25.2 LUFS/差 9.2 LU，开场/收尾差 7.3/8.1 LU，mix -1.7 dBTP），不保证任意片均达到目标；音效 intensity .18–.30，真实片仍须测量并由用户听审。
`voiceover` 是整条配乐的静态频谱预留：48kHz stereo s16 PCM 在源母带化前进行因果 RBJ peaking EQ（2000Hz、Q=2/3、-6dB），左右独立状态，相同系数。
两声道连续至少 48 samples（1ms）同时为数字零时，整个零区间保持零并在边界清空滤波状态；短零串正常滤波，不把过零当休止；四舍五入至最近整数并显式饱和到 s16，非有限输出报错，不改采样数或事件帧。
这不是声纹、ASR 或动态侧链；短循环也不依赖句间位置。FilmSoundtrack 仍仅一次逐句音量 ducking，生成后和播放时不再 EQ。
省略 profile 保持旧 PCM、音量默认 .24/.09 和指纹语义；纯音乐不默认使用 profile，film:new 建片后无旁白时去掉它。
频响公式见 [W3C Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/)。
已锁定画面的声音重做保留原帧，用精确 hit 强调；不移动原画面/旁白/字幕，不改旧 schema 隐式默认。

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
