# 音效计划与音效轨

工作顺序与音效设计只维护在 [导演手册第 2、6–7 节](direction.md#2-工作顺序不能倒过来)：
旁白 → 节奏谱 → film:music → 按小节 storyboard → 画面 → 从动作派生音效 → animatic 自检。
本页只讲 sound.effects、原始音频登记与播放 API。全部帧计正片；默认本片原创，除非用户指定曲目/共享素材。

## 每片原创音效（默认）

在 `film.json` 写计划，动作多久，声音就写多久，不借现成 WAV 拉伸：

```json
"sound": {
  "effects": [
    { "id": "reveal-rise", "kind": "riser", "frame": 150, "durationFrames": 30,
      "anchor": "end", "params": { "pitch": -2, "brightness": 0.6, "intensity": 0.65, "tail": 0.5, "stereo": 0.5, "seed": 17 },
      "for": "s03：f120–150 揭示前蓄势" },
    { "id": "evidence-hit", "kind": "impact", "frame": 150, "durationFrames": 18,
      "anchor": "start", "for": "s03：f150 证据到达，f168 停稳" }
  ]
}
```

`id` 唯一，`frame` 为整数（起始帧可为 0），`durationFrames` 为正整数，完整声音窗口须在正片内。
`anchor: start` 从 frame 起；`end` 在 frame 排他结束；`center` 将 frame 置于窗口中心。
`pitch` 为半音偏移；`brightness` 为亮度；`intensity` 为强度；`tail` 为尾音比例；`stereo` 为声像宽度；`seed` 为确定性种子。
kind：`riser` 上升蓄势、`impact` 冲击、`whoosh` 掠过、`tick` 轻刻度、`glitch` 碎裂、`shimmer` 闪烁余韵、
`swell` 聚拢、`thud` 低沉落地、`paper` 纸张、`clank` 金属碰撞、`chime` 和弦提示、`click` 点击。
参数范围和默认值见 [API](api.md)。

运行 `npm run film:sfx -- --film <filmId>`，输出本片 `public/films/<id>/sfx/<effectId>.wav` 与 `generated/sfx.json`。
内容指纹包含合成器版本、参数、fps；同输入命中缓存，变更必须重新生成。生成器登记本片原创 Apache-2.0 素材。
`film:check` 检查计划、实测样本时长、对齐帧、文件 hash 和许可登记；不一致时重跑 `film:sfx`，不要手改 generated 文件。

`<FilmSoundEffects />` 直接播放完整计划；显式 cues 则只播放传入项：
`{ frame: 150, sfx: "plan:evidence-hit", for: "s03：证据到达" }` 复用本片生成音色和时长。
配方/场景轨的 `sfxCues` 含建议 `kind`、`durationFrames`；先把建议转为本片计划，再播放。
它们不自动发声；不要同时播放计划和同一份建议导致重复叠声。

审片逐条写出可见动作、动作起止帧、声音起止帧、主要落点与 onset/accent 的距离；音长必须与动作时长一致。
已有 v3 等锁定画面的声音重做，不改画面代码或旁白字幕帧；用 `framemd5` 对新旧视频流逐帧比对，全部相同才算通过。

## 显式 Cue 与吸附（兼容旧片）

```tsx
import { FilmSoundEffects } from "@axmorf/studio/remotion";

export const EvidenceSounds = () => (
  <FilmSoundEffects
    cues={[
      { frame: 96, sfx: "glitch-tick", for: "s02：证据击碎旧字" },
      {
        frame: 178,
        sfx: "soft-impact",
        snap: "accent",
        maxShiftFrames: 3,
        minFrame: 176,
        maxFrame: 182,
        for: "s03：新公理重组到位",
      },
      {
        endFrame: 180,
        sfx: "riser-short",
        for: "s03：揭示前蓄势，到揭示帧结束",
      },
    ]}
  />
);
```

这组帧用于 30 fps、至少 181 帧的正片；真实片从生成网格与动作计划取值。`frame` 与 `endFrame` 必须且只能写一个。
`endFrame` 是排他的声音终点：开始帧 = 吸附后的终点 − `ceil(实测秒数 × fps)`；riser 需要足够前置空间，
不能让它从负帧开始。普通 cue 的尾音会被裁在正片结尾，不延伸到品牌片尾。

- `snap`：`none`（默认）、`beat`、`bar`、`accent`、`section`，使用本片 `music` 网格；无对应网格或窗口内无拍则保留原锚点。
- `maxShiftFrames` 默认 4；`minFrame`/`maxFrame` 为锚点的闭区间。endFrame cue 吸附的是终点，普通 cue 吸附的是起点。
- `volume` 默认 0.55（0–1），旁白下乘 0.55 并平滑压低。先听实际混音，不用简单加大音量补质感。
- `for` 必须非空，描述可见动作并带句子 id，方便对照分镜。
- 同素材、同解析起点会合并，不是同一帧的所有声音都合并。避免把场景轨与多个配方建议的 impact 全部堆到一起。

`resolveFilmSoundEffects(film, cues)` 返回解析后的音频贡献（`startFrame`/`endFrame`/`sfxId`/`for` 等），
组件 `<FilmSoundEffects cues={cues} />` 才播放。`sfx` 可用下表短名、共享资源 descriptor，或
`{ asset: 已登记的FilmAsset, durationInSeconds: 实测秒数 }`；字符串不是任意路径，本片文件不能直接填文件名。

## 接入配方与转场建议

`resolveFilmSceneTrack(film, scenes).sfxCues` 和六个配方 resolver 的 `sfxCues` 都可直接展开到 `cues`。
它们只是建议，不会随视觉组件自动播放；按计划选择、改 `for`、窗口和吸附，再显式交给 `FilmSoundEffects`。
配方 cue 已是正片绝对帧，不要再加场景起点。配方内若用本地时钟，则先统一回正片时钟（见 [API](api.md#镜头配方)）。
转场 `enter.sfx: false` 关闭该条建议，也可用 `sfx` 覆盖默认角色。配方 cue 接线见 [文字形变配方](recipes.md#axiommorph文字形变)，场景轨字段见 [API](api.md#场景轨)。

## 揭示前留白与结尾收音

```tsx
import { FilmSoundtrack } from "@axmorf/studio/remotion";

export const EvidenceSoundtrack = () => (
  <FilmSoundtrack
    musicDips={[{ from: 150, to: 180, volume: 0.02 }]}
    ending={{ landFrame: 270, sfx: "shimmer" }}
  />
);
```

`musicDips` 的 `[from, to)` 为正片绝对帧，`volume` 是绝对音量，不是倍率；与基础配乐音量、旁白 ducking 取较小值，
边沿平滑。先压低配乐留出预期，再让音效与画面到达；不改变旁白或字幕。

新片默认用 score.ending 做和声落定，见 [导演手册](direction.md#7-混音)。以下仅为兼容行为：不传 `ending` 时仍在正片结尾淡出。传了 `ending` 却省略 `landFrame`，会选正片内最后一个有效 accent，
没有则选正片终点；确认它不会让需要的音乐过早消失。配乐用原 `fadeOutFrames` 淡出到该落点，之后静音。
可选 `sfx` 也以落点为结束锚点，尾音不进入品牌片尾。结尾效果需足够前置空间；不要同时在音效轨里重复放一份。

## 共享音效清单（仅用户指定时使用）

短名直接用作 `sfx`。下列原创音效均以 Apache-2.0 登记，文件在
`assets/axmorf-shared/audio/sound-effects/axmorf-<短名>-v1.wav`；不必为使用共享素材再次登记。

| 短名                                                                                                               | 叙事角色                         |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `ui-click`、`mouse-click`、`mouse-down`、`mouse-up`、`mouse-right-click`、`mouse-double-click`、`mouse-wheel-tick` | 界面点击与滚动，避免连续轰炸     |
| `keyboard-tap`、`typing-burst`、`toggle-switch`                                                                    | 输入、开关状态变化               |
| `drag-pickup`、`drop-settle`、`snap-lock`                                                                          | 拾起、落下、锁定                 |
| `soft-pop`、`soft-impact`                                                                                          | 轻出现、物件到达或数字落定       |
| `whoosh-short`、`whoosh-sweep`、`swish-reverse`、`card-flip`                                                       | 短移动、方向移动、反向蓄势、翻转 |
| `confirm-chime`、`sparkle-accent`、`notification-ping`、`warning-blip`、`success-arpeggio`                         | 确认、亮点、提醒、风险、完成     |
| `riser-short`（P1 合成新增，1.6 s）                                                                                | 揭示前上升蓄势，通常用 endFrame  |
| `reverse-swell`（P1 合成新增，1.4 s）                                                                              | 吸回、反向聚拢的预期             |
| `low-impact`（P1 合成新增，1.2 s）                                                                                 | 关键证据击中或大体量到达         |
| `glitch-tick`（P1 合成新增，0.24 s）                                                                               | 短促碎裂、信号打断               |
| `whip`（P1 合成新增，0.56 s）                                                                                      | 快速甩镜换空间                   |
| `shimmer`（P1 合成新增，1.7 s）                                                                                    | 重组显现或尾音收束               |

兼容角色别名：`soft-whoosh` → `whoosh-short`，`directional-whoosh` / `signal-sweep` → `whoosh-sweep`，
`impact-bloom` → `soft-impact`。品牌片头的 Mixkit impact 有单独许可，不把它当作上表原创短名。

合成音色的质感须由用户在手机或 Mac 上实际听审（本机不启动播放器）；技术解码通过不等于好听。若要外采，只用许可已确认并逐个登记的素材，不能下载许可不明的音频。

## 调性与旧片兼容

`film:sfx` 的 film-sfx-v2 会读取 score.arrangement 的 tonic/mode：chime、shimmer、swell、riser、impact、thud、tick 未写 params.pitch 时，
把基音或滑音落点对齐到最近八度的主音（主音和谐波五度均在大小调内）。显式 pitch（含 0）完全保留；无调性与噪声拟音不变。
旁白下仍用运行时 ducking，音效 intensity .18–.30 是与 v3 教学谱一起校准的起点。旧 film-sfx-v1 的音频、指纹和许可仍按 v1 校验，
`film:check` 不因升级强制重生成；主动运行 film:sfx 才升级。改过计划、损坏 PCM 或缺许可仍报错。
