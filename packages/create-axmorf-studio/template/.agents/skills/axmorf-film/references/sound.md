# 音效计划与音效轨

先在 `src/films/<filmId>/storyboard.md` 写音效计划，再编写声音：对应的句子 id、可见动作（`for`）、角色、
开始帧或结束帧、允许移动窗口、吸附网格、音量。只给因果关键动作配声，不给每个拍点加声。
帧全部为正片绝对帧，字幕与旁白不为踩拍改变。共享素材已登记来源与许可；本片媒体先用 `film:asset` 登记。

## Cue 与吸附

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

这组帧用于 30 fps、至少 181 帧的正片；真实片中从句子/配方的时序取值。`frame` 与 `endFrame` 必须且只能写一个。
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
转场 `enter.sfx: false` 关闭该条建议，也可用 `sfx` 覆盖默认角色。完整接线见 [横屏示例](examples.md#横屏19201080旧公理文字形变)。

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

不传 `ending` 时仍按原行为在正片结尾淡出。传了 `ending` 却省略 `landFrame`，会选正片内最后一个有效 accent，
没有则选正片终点；确认它不会让需要的音乐过早消失。配乐用原 `fadeOutFrames` 淡出到该落点，之后静音。
可选 `sfx` 也以落点为结束锚点，尾音不进入品牌片尾。结尾效果需足够前置空间；不要同时在音效轨里重复放一份。

## 共享音效清单

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

合成音色的质感须实际听审；技术解码通过不等于好听。若要外采，只用许可已确认并逐个登记的素材，不能下载许可不明的音频。
