# Scene 音效与音乐

这组素材在开发仓库离线制作，作为 runtime package 的共享 Workspace seed 发行。Scene 制作只选素材、安排
卡点与音量；render 只读取已冻结的本地 WAV，不运行合成器或调用外部服务。

24 条素材均为原创程序合成，Apache-2.0，48 kHz、双声道、16-bit PCM WAV。鼠标、键盘和纸张声是模拟音效，
不是某个真实设备或物体的录音。manifest 记录独立 ID、checksum、
时长、用途、许可与起音/声势中心提示；bootstrap 沿既有 policy-covered seed 路径投影并登记 Catalog。

## 素材列表

文件位于 `public/assets/axmorf-shared/audio/sound-effects/axmorf-<name>-v1.wav`。

### 鼠标

| name               | Catalog ID                             |    时长 | 用途                     | 与视觉事件对齐的位置                  |
| ------------------ | -------------------------------------- | ------: | ------------------------ | ------------------------------------- |
| mouse-down         | asset.axmorf.sfx.mouse-down-v1         | 0.085 s | 鼠标按下                 | 起音                                  |
| mouse-up           | asset.axmorf.sfx.mouse-up-v1           | 0.075 s | 鼠标松开、松开时界面响应 | 起音                                  |
| mouse-click        | asset.axmorf.sfx.mouse-click-v1        |  0.15 s | 完整单击手势             | 起音对应按下，0.055 s 松开            |
| mouse-double-click | asset.axmorf.sfx.mouse-double-click-v1 |  0.34 s | 完整双击手势             | 0/0.18 s 两次按下，0.055/0.235 s 松开 |
| mouse-right-click  | asset.axmorf.sfx.mouse-right-click-v1  |  0.16 s | 右键菜单手势             | 起音对应按下，0.06 s 松开             |
| mouse-wheel-tick   | asset.axmorf.sfx.mouse-wheel-tick-v1   |  0.10 s | 单次滚轮刻度             | 起音                                  |

单击、双击的组合素材有固定间隔。光标动作使用不同间隔时，分别安排 mouse-down/mouse-up；界面响应发生在
松开时，可直接使用 mouse-up。滚轮逐步滚动可以在各个步骤重用 wheel-tick。

### 元素、转场与反馈

| name              | Catalog ID                            |   时长 | 用途                         | 与视觉事件对齐的位置        |
| ----------------- | ------------------------------------- | -----: | ---------------------------- | --------------------------- |
| ui-click          | asset.axmorf.sfx.ui-click-v1          | 0.08 s | 按钮点击、节点点亮、分步出现 | 起音                        |
| soft-pop          | asset.axmorf.sfx.soft-pop-v1          | 0.18 s | 小元素弹出、轻量缩放         | 起音                        |
| snap-lock         | asset.axmorf.sfx.snap-lock-v1         | 0.12 s | 吸附落位、连线完成           | 起音                        |
| whoosh-short      | asset.axmorf.sfx.whoosh-short-v1      | 0.36 s | 快速滑动、短擦除转场         | 起音后 0.14 s               |
| whoosh-sweep      | asset.axmorf.sfx.whoosh-sweep-v1      | 0.65 s | 大幅移动、面板切换           | 起音后 0.27 s               |
| soft-impact       | asset.axmorf.sfx.soft-impact-v1       | 0.32 s | 物体落地、结果强调           | 起音                        |
| confirm-chime     | asset.axmorf.sfx.confirm-chime-v1     | 0.50 s | 步骤完成、确认结果           | 起音                        |
| sparkle-accent    | asset.axmorf.sfx.sparkle-accent-v1    | 0.60 s | 高光出现、重点揭示           | 起音                        |
| keyboard-tap      | asset.axmorf.sfx.keyboard-tap-v1      | 0.12 s | 单次按键                     | 起音                        |
| typing-burst      | asset.axmorf.sfx.typing-burst-v1      | 0.55 s | 四次短打字动作               | 0/0.085/0.175/0.295 s       |
| toggle-switch     | asset.axmorf.sfx.toggle-switch-v1     | 0.15 s | 开关状态切换                 | 起音                        |
| drag-pickup       | asset.axmorf.sfx.drag-pickup-v1       | 0.20 s | 对象拾起                     | 起音                        |
| drop-settle       | asset.axmorf.sfx.drop-settle-v1       | 0.26 s | 对象放下、轻微回弹           | 起音，0.05/0.088 s 回弹     |
| swish-reverse     | asset.axmorf.sfx.swish-reverse-v1     | 0.42 s | 面板收回、反向转场           | 起音后 0.30 s               |
| card-flip         | asset.axmorf.sfx.card-flip-v1         | 0.28 s | 卡片翻面                     | 起音后 0.12 s               |
| notification-ping | asset.axmorf.sfx.notification-ping-v1 | 0.45 s | 通知出现                     | 起音                        |
| warning-blip      | asset.axmorf.sfx.warning-blip-v1      | 0.35 s | 轻警告、操作未通过           | 起音，0.11 s 第二声         |
| success-arpeggio  | asset.axmorf.sfx.success-arpeggio-v1  | 0.70 s | 完成结果                     | 起音，0.065/0.13 s 后续音符 |

## 制作 Scene 时使用

先查当前 Workspace 的 Catalog：

```bash
npm run catalog:query -- --kind asset --tag motion-sync
npm run catalog:query -- --kind asset --tag mouse
```

本开发分支的 `project:create:context` 同时返回许可已核验的 `soundResources` 与不含私有路径的 BGM 配置状态。
公开 npm 0.1.16 尚无此投影，仍使用当前 Catalog 查询。发现素材不代表已将它准入 Project 或启用 BGM。

新建 Project 时把选定 ID 同时写入 `resources.allowedResourceIds` 和需要使用该音效的 Scene
`candidateResourceIds`，并在 `soundIntent` 描述动作与卡点。已绑定的 Scene executor 只使用
`scene.availableResources` 内的素材，把 selected/descriptor 原样登记到 `selected-resources.json`。

在 `sound-plan.json` 以 contribution 声明资源、时长、音量和 timing。起音型音效使用动作的 sync anchor，
`offsetFrames: 0`。标有起音后对齐位置的素材将 `offsetFrames` 设为 `-round(对齐位置秒数 × fps)`，例如 30 fps 的
whoosh-short 使用 -4，whoosh-sweep 使用 -8。音效时长用 `ceil(素材秒数 × fps)`，开始帧不能早于 0，
结束帧不能越过 Scene；边界不足时选择更短或起音型音效。Renderer 与声音计划共用事件时机，顶层
SoundDesignTrack 实际播放，Renderer 不再重复挂载 Audio。

建议初次试听的 contribution volume 为 0.2–0.4；根据旁白、BGM 和整片混音调整。素材保留峰值余量，
但多个声音叠加后的响度和可懂度仍需要成片试听。只为有意义的动作安排声音。

现有 Project 的 live authoring 保持 immutable；调整音效选择需走 `project:revise:context` 与隔离 revision，
且只能使用 base snapshot 已准入的 Project-owned media。candidate 不提供外部素材 import。
当前 attempt 的 allowlist 不因安装了新素材而扩大。

## 循环音乐与试听版本

用户本地音乐库不属于 npm 的共享 seed。选曲以当前 Catalog 及许可为准，循环 BGM 优先使用已批准的原始循环
WAV；带淡出、裁剪或试听处理的 MP3 不应冒充循环原音。`audioDefaults.globalBgm` 通过 create 冻结为
Project-local contribution，覆盖正文窗口；不要在各 Scene 重复挂载同一 BGM。执行任务更快不授权改变音频速度、
音高、BPM 或 gain。

本开发分支可通过 strict `patch.sound` 修改已有 Project 音乐的音量和淡入/淡出，通过 `boundaryScenes` 修改
immutable 模板播放区间及其独立音乐包络，见 [PROJECT_REVISION.md](PROJECT_REVISION.md)。包络使用整段
contribution 时间，循环不会每次重启淡入。它不修改原音和 sealed narration，也不等于自动 ducking 或混音认证。
检查 codec、循环边界 waveform 和 PCM 可重复性只能证明技术属性；接缝是否可闻、旁白可懂度和整体平衡仍需听审。

退役旧试听版本前，检查其 resource ID、路径和 checksum 在 current Catalog、Project-owned manifests、源码、
sealed snapshots 和 delivery 依赖中的引用。有依赖时保留兼容资源，不自动迁移既有作品；无依赖且用户已授权时，
使用可恢复的废纸篓并复验当前目录、Catalog 和原作品。历史报告按原状态保留。音乐文件、私有 Library 标识和
操作报告留在用户 Workspace，不因维护公共指南而提交到源码仓库。

## 开发与验证

维护者可以重建缺失的 canonical WAV，或只读验证 bytes：

```bash
node --import tsx scripts/sound-effects/generate.ts write
node --import tsx scripts/sound-effects/generate.ts check
node --import tsx --test tests/catalog/sound-effects.test.ts
```

合成器不在 bootstrap、production 或 render 中执行。`write` 只补缺失文件，相同 bytes 幂等，已存在的不同
bytes 拒绝覆盖。修改声音应发行新的版本文件与资源 ID，再更新 manifest；新 bytes 必须通过共享素材的
build/checksum/license 和 package policy 检查。生成 Workspace 的用户直接使用包内素材。
