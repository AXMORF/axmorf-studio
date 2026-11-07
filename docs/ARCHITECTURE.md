# Architecture

> 文档类型：当前架构 authority
>
> 最后复核：2026-10-19（0.3.0）

AXMORF Studio 由两个 npm 包和一个用户 Workspace 组成。Agent 直接编写每部片的 Remotion 源码；工具只负责
旁白时序、原创配乐或已登记曲目、素材准入、审片帧、硬规则检查和经过复验的交付。

## 1. 包与 Workspace

| 部分                   | 内容                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `create-axmorf-studio` | 创建与升级 Workspace；携带模板、`axmorf-film` Skill 与 Claude Code 入口                |
| `@axmorf/studio`       | `axmorf` CLI、`/contracts`、`/remotion` 公共导出、预构建 Web 控制中心与共享媒体种子    |
| Workspace              | 用户的 `src/films/`、`public/`、`deliveries/`、`private/` 配置与 `.axmorf/` 缓存和历史 |

仓库根目录本身也是一个开发用 Workspace：`npm run bootstrap` 生成 `src/films/index.ts` 与片头片尾音频投影，
`src/Root.tsx` 与生成 Workspace 的 `src/index.ts` 调用同一个 `createRemotionRoot`。

## 2. 模块

```text
packages/studio/src/
  contracts/          zod 合同：film（FilmSpec/Timing/Music/Assets/Publish）、producer-config、旁白与音色、
                      片头片尾主题与模板音频、合成配乐时间线、媒体授权描述与可选运动组件所需的状态和计划
  remotion/film/      FilmProvider、useFilm/useFilmTiming、FilmCaptions、FilmStatusTag、FilmSoundtrack、FilmSceneTrack、FilmSoundEffects、FilmBookends、
                      FilmCompositions（正片、--review、两张封面）与联系表 Still
  remotion/capabilities/  可选的镜头、六个镜头配方及其 resolver/catalog、运动、界面组件、媒体、特效与片头片尾模板
  remotion/runtime/sound-design/  音频播放、循环与旁白 ducking
  bootstrap/          Workspace 目录、共享资源种子与 doctor（含真实浏览器渲染）
  cli/                axmorf 命令路由：bootstrap、doctor、browser prepare、web、preview、dev、film
  web/                本地 Web 服务：静态资源、API 转发与交付媒体（只读 publish.json 记录的文件）
scripts/
  films/              film:new|voice|music|asset|review|check|deliver|list|delete 的实现；score/ 是配乐引擎
  narration/          TTS provider adapter（Edge、Speech SDK、VoxCPM）、PCM 与响度处理
  config/             私有 producer config 读写与旁白执行快照
  scene-templates/    片头片尾模板音频投影
  shared/             进程、媒体工具、Remotion CLI、原子写入与 Workspace 操作锁
settings/             Web 控制中心：作品列表与交付预览、通用、片头片尾、TTS 配置与环境诊断
```

依赖方向：`scripts/` 与 `settings/` 依赖 `@axmorf/studio/contracts` 和运行时源码；运行时不依赖 `scripts/`，
CLI 通过动态 import 加载 `scripts/films` 等实现并由 esbuild 打进 `dist/cli/main.js`。`settings/client` 只依赖浏览器
安全的合同与自身模块。

## 3. 一部片的数据流

```text
film:new     → src/films/<filmId>/film.json、Film.tsx、Cover.tsx、assets.json；更新 src/films/index.ts
film:voice   → TTS（按 provider、音色与文本缓存在 .axmorf/cache/voice）→ public/films/<id>/narration.wav
               → generated/timing.json（实测 PCM samples 换算帧）
film:music   → film.json 的 music.score（合成）或 music.track（已登记曲目）→ public/films/<id>/music.wav → generated/music.json（拍、对齐段落与残差、重音、乐器 onset 帧）
Agent        → src/films/<id>/storyboard.md（每小节一行：L2、L3、旁白句、音效，另补章节世界、镜头路径/配方/转场）
               → FilmSceneTrack + rhythm hooks 编排 L1/L2/L3 画面 → 从动作派生 sound.effects
film:sfx     → sound.effects → public/films/<id>/sfx/<effectId>.wav + generated/sfx.json（指纹、PCM 时长、对齐帧）；登记原创许可 → FilmSoundEffects
film:review  → 联系表、stillWarnings、readabilityWarnings、repetitionWarnings 与测量摘要 readability（仅提示）
               → motion / motionWarnings、review/motion-curve.json 与 .png、review/dense/ 密集帧（仅提示）
               → --animatic 时输出 review/animatic.mp4（短边 360、原帧率、带声音；先看节奏再精修）
film:check   → TypeScript、网络调用、CSS 动画、随机数与时间、未登记媒体、跨片 import、必须挂载的组件、过期时序
film:deliver → .axmorf/staging 中渲染正片（片头 + 正片 + 片尾）与两张封面 → 复验 → publish.json
               → 替换 deliveries/<id>/，旧交付移到 .axmorf/history/<id>/<deliveredAt>
```

渲染期间不调用网络、Agent、Git 或目录扫描；Remotion Root 只读生成的静态注册表。`Film.tsx` 只看到正片帧，
片头片尾由 `FilmWithBookends` 在交付组合中接上，各自带模板音频。场景轨按名义边界居中安排转场，不挪旁白绝对时序；音效 cue 显式交给音效轨，
新片默认 studio-v3；分层鼓组、贝斯与和声经确定性滤波、FFT 房间卷积、RMS 总线压缩及限幅输出。
v3 母带只测量 LUFS/true peak 后做线性增益，避免 loudnorm 重采样预振铃跨越事件帧；v2/原始母带保持字节兼容。
配乐支持 sections.from/bpmRange 结构锚点、精确 hits、编曲 breaks 与 ending 和声收尾；旧 bars-only 输出保持不变。
v3 onsets 可选 fills/breaks 半开区间及 accents {frame,strength}，accentFrames 与 accents 一致；旧 JSON 无新增字段仍有效。
film-sfx-v2 将隐式音高的音效对齐到 score 主音；显式 pitch 保留。检查器按已生成音效的版本核验指纹和许可，不强制旧 v1 重生成。
`FilmSoundEffects` 默认播放每片计划，显式 cue 可用 plan:id；共享库保留兼容。
节奏制作顺序由 Skill references/direction.md 定义：旁白 → 节奏谱 → film:music → 小节分镜 → 画面 → 音效 → animatic。
`capabilities/rhythm` 提供纯函数和 hooks：beat pulse、旁白区间、L1 缩放、bar camera 与 impact；
机位原生使用世界 center/zoom，通过 barCameraShots 固定视差锚点接入 ProducerWorldCamera。
所有事件计正片，在根调用 hooks；Sequence 内可显式传根 frame。旧片不主动使用新 hooks，动画输出不变。
次级运动使用合成事件 onsets；可选 `useFilmMusicEnergy` 只读本地 WAV，以对数能量驱动辉光，主要落点不依赖频谱检测。
原有揭示前的 musicDips 与运行时 ending 收音保持兼容。`mask-wipe` 是羽化光带，可用 `tint` 调色，不改变边界时序。
内容状态标识使用 `FilmStatusTag`，主副词同字号、同对比层级，有独立底板；review 用 `small-status-tag`
提示实测字号低于实测字幕的 70%（句间用画布默认字幕字号）。
可读性测量用可见文字矩形的命中采样提示 `text-under-foreground`，排除同一 `data-axmorf-text-group`
组件内部字形间的遮挡，保留其他组件与外部前景；不可靠命中保留 `readability.unknown`；
运动分析以场景轨/内部候选切点的中点签名提示非相邻的 `repeated-composition`（含旁白时段，无场景轨旧片为 unknown）。
新 rhythm 遥测经现有 review-only registry 传递完整计划，impact 记落点，bar camera 只记实际不同机位。
音效遥测保留 alignmentFrame（start/end/center；旧记录只有 start），不改变播放。
`motion.summary.rhythmSync` 的 accents/landings/sounds/bars 给出 total/matched；新四条软提示为
accent-without-visual、visual-without-sound、sound-without-visual、bar-without-change。
前 3 项诊断容差 ±2 帧，bar 使用半开区间且至少一次 L2+；导演 L3 仍要求 0 帧误差。
缺配乐、遥测、采样截断或多轨歧义为 unknown；缺音效遥测或手写音频时音效匹配为 unknown，未识别 transform 须人工核对。
上述 motion 字段是 `film:review` 输出；
不拦 `film:check`/交付。animatic 默认关闭、Skill 要求成片前至少看一次；缺少或过期时交付命令提醒，不增加交付文件。

## 4. 写入所有权与并发

- `src/films/<id>/` 的源码由 Agent 编写；`generated/` 与注册表只由 CLI 写入。
- 写操作（new、voice、music、asset、deliver、delete）与 Workspace 升级共用 `.project-operation.lock`；
  锁被占用时命令失败并报告，不排队、不抢锁。
- `film:delete` 只删除该片拥有的路径：源码、`public/films/<id>`、交付、历史、`out/films/<id>` 与 staging 残留。
- 交付在复验通过后才替换；替换失败时恢复旧交付。

## 5. Workspace 升级

`create-axmorf-studio upgrade` 按 `.axmorf/managed.json` 比较托管文件：更新或创建模板文件，删除旧版托管而新版
不再提供的文件（包括退役的 `axmorf-video` 与旧 `remotion-best-practices` Skill），只删除仍是旧产品值的已退役 npm scripts。被用户改过的托管文件
先备份再覆盖，并列在 `localChanges`。随后运行 `npm install`、`bootstrap`、`doctor`，任一步失败就恢复备份。
旧 Project 链留下的目录只列在 `legacyProjectData`，不自动删除。

## 6. 发布

见[发布流程](guides/RELEASE.md)。CI 在 tag 上完成完整检查、真实渲染与全新 Workspace 冒烟后以 provenance 发布；
`next` 版本经真实 Agent 宿主做完一部片后再以正式版本发布到 `latest`。
