# Iteration Status

## P8 节奏运行时与导演 Skill（2026-11-08，未发布）

完成音乐网格驱动动效的方法与工具，不改合成器引擎、旧片源码、依赖/lockfile 或版本，不 push/publish/merge。
声音实验室的音色升级未移植，本批不代表全新 Agent 重做整片的 P8.4 审美/听审验收。

- `@axmorf/studio/remotion` 新增 `lastAtOrBefore`、`resolve/useBeatPulse`、`resolve/useNarrationActive`、
  `resolveBreathScale`、`resolve/useBarCamera`、`barCameraShots` 与 `resolve/useImpact`。
  L1 默认讲述段 1.2%、节拍段 3.5%；L2 小节起点 spring（18/120）走向下一机位后稳住，耗尽后停住；
  L3 前 6 帧蓄力、落点开始 spring（11/260/.6）回弹、后 6 帧确定性 shake。机位接原生世界 center/zoom，固定视差锚点。
  hook 在 Film 根使用，Sequence 内可传正片根 frame；旧 track 缺 onsets 时 kick 回退 beatFrames，无配乐 pulse=0。
- review-only 遥测上报完整事件计划，稀疏采样仍保留精确落点；音效日志保留真实 start/end/center anchor，不改播放。
  `motion.summary.rhythmSync` 统计重音/落点/声音/小节的 total/matched；新增 accent-without-visual、visual-without-sound、
  sound-without-visual、bar-without-change。诊断容差 ±2 帧，导演 L3 要求仍为 0 帧。
  缺配乐/精确遥测、截断或歧义保持 unknown；软提示不拦检查或交付。
- 两份 `.agents` Skill 正文与 references 全树一致，两份 `.claude` 保留共享正文的发现 adapter 且互相一致。
  新增 `references/direction.md`，统一音乐先行顺序、每小节 storyboard、三层动效、动作派生音效、混音、审片与反模式。
  craft/music/sound 去除冲突与重复规则。完整 TSX 片段与 `RhythmDirectionExample.tsx` 逐字一致，由测试实际编译。
  文档和 film:new 的配乐建议为显式 .24/.145；film:new 仍默认 music:null，schema 的旧隐式 .09 不变。

**验证**：完整 `npm run check` 退出 0：495 项测试，494 通过、1 项 macOS 专属测试在 Linux 跳过、0 失败；
包括类型、lint、文档链接/命令、种子音频、Web/Remotion 构建、creator 包检查和宿主 compositions。
新增 16 项测试覆盖边界、衰减、回退、旁白区间、camera 越界/耗尽、impact 落点/过冲/确定性、四条同步规则、
start/end/center 声音锚点、未知/截断/歧义与完整 Skill 同步；默认 music.md 的 30 秒 JSON 谱也实际生成，
避免配置因不足一小节的段落而无法运行。Skill 规范验证通过；独立只读前向验证未发现 API 接线阻断。
既有 Zod 4.6.7 / Remotion 建议 4.3.6 提示仍保留，不为消除提示改依赖。

**真实浏览器校准**：用 MusicSyncGallery 的配乐网格（重音 f0/120/150/240/270，小节 f0/60/120/180/240）
渲染新最小示例，沿用 ReviewMotionProvider/ReviewMeasure 每 15 帧采样，共 20 份完整遥测，无坏行/缺帧。
合规版本 accents/landings/sounds/bars 全部 5/5 匹配，0 warning；删除 f150 impact 后 accents 变为 4/5，
恰好新增 f150 的 accent-without-visual。未配置场景轨的旧规则仍为 unknown，不当作已通过。
新示例 f150 still 已看图；它是接线示例，不是成片构图模板或声音质感验收。

**旧画面回归**：MusicSyncGallery f150（含真实 music/sfx props）与 SceneTrackGallery f45 在独立 80ff22a checkout
和当前代码渲染；Recipe-CameraMove f45 对比改动前基线。三对 PNG 均 cmp 逐字节相同。
证据在仓库外 `/home/zzzxc/AgentWorkspace/p8-validation/`，交付说明在
`/home/zzzxc/AgentWorkspace/2026-11-08-p8-runtime-skill-notes.md`。未做完整旧影片逐帧比对、真实人耳听审或新 Agent 成片；
没有替换原交付。

## P7 每片原创声音与帧级同步（2026-11-07，未发布）

本批完成声音工具链与 10 秒工程示例；不改版本、不发布、不 push。没有重做 v3 整片声音、没有替换原交付，
不代表 P5 用户听审或 P6 通过。v3 原 Workspace 只读，19 个片源文件 SHA256 与此前基线完全一致。

- `film.json.sound.effects` 为严格 schema：唯一 id、12 种 kind、正片帧、动作时长、start/end/center anchor、
  pitch/brightness/intensity/tail/stereo/seed 与可见用途。`film:sfx` 离线确定性合成每片 WAV，记录合成器版本、
  内容指纹、PCM 样本时长、实际起止/对齐帧；按指纹和音频 checksum 缓存，登记原创 Apache-2.0，来源进入 publish.json。
  `film:check` 核验计划、投影、音频、对齐和许可，过期提示重生成。删除计划后重新生成空投影，不 broad-delete 原 WAV。
- studio-v2 支持 `sections.from` 句子 id/正片帧与 bars 混排、`bpmRange` 搜索、精确 hits、真正的编曲 breaks、
  resolve/cut/ring ending。搜索步长 0.01 BPM，另含端点与中点，最小化整数帧残差平方和；同分取最接近范围中点者。
  breaks 同时排除未保留乐器的干声、混响和延迟尾音。锚定配乐不循环、不挪旁白字幕；残差超过 3 帧给建议，
  提醒锁定画面不得为卡拍移动。三种旧 bars-only 风格的音频和 timeline 哈希与修改前完全相同。
- `generated/music.json.onsets` 导出 kick/snare/clap/hat/bass/hits/sections，时刻直接来自合成事件。
  `<FilmSoundEffects />` 默认播放本片计划，显式 cue 支持 `plan:<id>`；review 计入计划音效。
  配方/场景轨新增 kind/动作时长建议；旧共享角色、track、显式 cues 继续兼容。
- `useFilmMusicEnergy()` 用现有 media-utils 4.0.489 的窗口 PCM 和 visualizeAudio，输出对数低/中/高能量；
  只做次级辉光/呼吸，主要落点用事件帧。固定 PCM 邻域和无状态平滑消除加载顺序影响；
  对 pinned API 拼接不连续 Range 窗口的行为显式等待，避免长音频缺中间窗口时误读后段数据。
- 两份 Film Skill 镜像逐字一致，默认流程改为 storyboard → 锚定 score → 逐动作 effects → film:music/film:sfx →
  onset 次级运动；除非用户指定，不选 track 或共享音效。审片要求逐条给动作/声音起止帧、onset/accent 帧号及偏移。
  README、architecture、API、术语和 creator 命令同步。

**验证**：完整 `npm run check` 通过（479 项：478 通过，Linux 跳过 1 项 macOS 测试），覆盖类型、lint、文档链接、
音频种子、Web/Remotion 构建、creator 包检查与宿主 compositions；runtime `build:runtime`、`build:types` 通过。
新增 36 项测试，覆盖全部音效 kind/参数/anchor、字节确定性与缓存、损坏/过期/许可、CLI→registry→check→publish、
速度搜索/残差、hits/breaks/ending、三种风格旧哈希、onset 与合成样本起点、句子同总长变时序的 fingerprint、
计划播放/review 计数，以及对数能量、乱序加载、20 秒长音频缺窗口。
Remotion 保留当前依赖的既有 Zod 版本提示（4.6.7 / 建议 4.3.6）；未为消除提示改依赖或检查器。

**真实预览**：`MusicSyncGallery`，1920×1080 / 30fps / 300 视频帧（10 秒；AAC 容器含 48ms 编码尾垫）。
`[96,124]` 搜索得到 119.76 BPM，章节 f0/f120/f240 残差均 0；break f120–150 只留 pad，hit f150，解决和弦 f270。
Kick onset 为 f150/165/180/195/210/225，灯在同一帧亮，辉光读取 low。12 种音效各有可见动作区间。
f165 两次独立 PNG 渲染逐字节相同，已看图。fixture `film:check` 服务通过，无错误或警告；
CLI 路由与生成 Workspace 的 npm script 在测试中覆盖，本仓库 checkout 无 Workspace marker，不伪造 marker 跑 doctor。

预览目录 `/home/zzzxc/AgentWorkspace/backups/axmorf-p7-preview/`：`preview.mp4`、`music.wav`、`sfx/<kind>.wav`、
两张 still、输入/生成 JSON、`media-validation.json`。FFmpeg 全部完整解码、非静音；预览 −21.66 LUFS / −7.21 dBTP，
独立配乐 −14.23 LUFS / −2.66 dBTP；12 种 SFX 真峰值 −7.35 至 −5.92 dBTP，均低于 −1 dBFS。
少于 400ms 的 tick/click/glitch 没有有效 integrated LUFS，以非静音峰值验证，不把 −∞ 响度误作静音。
代码与验证记录在 `out/p7-validation/` 和 `out/p7-*.log`，不提交片源、媒体或生成投影。

可复现入口（仓库开发用途，首次创建保留本地 fixture，已有同名片时拒绝覆盖）：

```bash
node --import tsx scripts/films/preview-sound.ts
npx remotion render src/index.ts MusicSyncGallery out/p7-preview.mp4 --props=out/p7-validation/gallery-props.json
```

**尚未验证**：人耳音色/混音/连续听审、更多实际片型、全新包安装升级；v3 整片声音重做和新旧视频流 `framemd5` 尚未执行。
该项仍遵守第 9.5 节：后续锁定画面代码及帧号，逐帧 md5 全相同并经用户听审后，才能继续后续验收。

## P5-v3 rc 前运行时与审片修正（2026-11-07，未发布）

本批修正 mask-wipe、文字组遮挡采样与状态标识；用 v3 片源复制品复测，没有新 Agent 重做片子，
不改版本、不发布、不进入 P6。v3 原 Workspace 只读，19 个片源文件的 SHA256 复验未变。

- `mask-wipe` 从硬边纯色路径改为确定性的羽化渐变光带：半透明暖白、窄亮边、低不透明度中心，
  可选 `enter.tint` 调色。仅透传外观参数，resolver 的窗口、Sequence 时长、场景时钟和 cue 不变；其他转场不变。
  gallery 改为深→浅默认色、浅→深自定义 tint，分别渲染约 25%/50%/75% 的 1920×1080 still；
  v3 f1014/f1019/f1023 与 f2276 也已渲染、看图。gallery f30 独立渲染两次 PNG 逐字节一致。
- `AxiomMorph`、`NumberRoll` 的根字形容器带 `data-axmorf-text-group`。前景采样只忽略同一最近组元素内的字形互挡，
  不按属性字符串把不同实例合并；外部图形、其他组与嵌套组仍判遮挡。pointer-events:none 的同组兄弟排除，
  被测文字自身或外部前景命中不可靠时仍为 unknown。没有放宽采样、opacity 或覆盖阈值。
- 新增公共 `FilmStatusTag` 与 props 导出，六种默认状态文案和自定义文本、detail、position、style；
  默认字号由当前画布的正文最低字号和默认字幕字号共同推导，主副词同字号、同暖白颜色、独立不透明深底。
  `data-axmorf-status-tag` 进入 review；`small-status-tag` 用实测（含缩放）字号与实测字幕的 70% 比较，
  句间没有字幕时用画布默认字幕字号。遥测新字段 optional，兼容旧日志；字幕字号公式共享后原导出与计算结果保持一致。
  该提示只在 review，不接入 `film:check` 或 deliver。两份 Skill 的 craft/api/SKILL 逐字一致，
  要求内容状态标识统一用该组件，并核对 `small-status-tag`、底板与实际对比。

**v3 实测**（1920×1080 / 30fps；DOM computed style + review 几何测量，f61/f545/f2106/f2100）：

| 项 | 替换前字号 / 颜色 | 替换后字号 / 颜色 |
| --- | --- | --- |
| 主词 | 38px / `#eaf3ed` | 43.03px / `#fff4e3` |
| 副词 | 34px / `#a7bdc2` | 43.03px / `#fff4e3` |
| 字幕 | 48.09px / `#eaf3ed` | 48.09px / `#eaf3ed`（不变） |

新组件 computed font-size 为 43px，字幕为 48px；上表保留 review 对布局取整后的实测值。
底板实测 `#101c28`。复制品只改 `scenes/design.tsx` 中的手写 Status 为 `FilmStatusTag`，
并把状态栏放到上方空位（left=900、top=24），避免新增底板压住原有移动标题；其他 18 个片源文件逐字节一致。
五个全尺寸前后帧（另含 f1783「可能没公开」所在镜头）的完整 RGB 比较，在状态栏所在 y=[24,153) 之外差异均为 0；
没有改其他画面、旁白、音乐、字幕或时序，也没有修改原片。

**真实 review**：同一组 53 个帧、177 个运动样本、7 场景、29 cue；修复前复现 19 条 `text-under-foreground`，
修复后按 snippet 合并为 **13 条**，同组碎字的非转场误报消失；没有 `small-status-tag` 或其他可读性规则提示。
两轮测量的 missingFrames/truncatedFrames/errors/unknown 均为空、badLines=0；最终 motionWarnings 为空。
剩余前景提示全部在转场帧：

- f1223（match-scale）：此前实验、数据准备、人力、未计入，共 4 条，两世界短暂叠合。
- f2276（mask-wipe）：`$21k`、一次训练、＝、便、宜、训、练、研、发，共 9 条。
  羽化带中心可透出画面，但现有 elementsFromPoint 按几何命中，不按渐变每个像素的 alpha 判断，仍可能高估覆盖。
  新光带几何范围比旧路径更宽，新增「训/练」两条转场命中；未通过跳过转场、放宽阈值或扩大本批判定方案来消除它们。

完整 `npm run check` 通过（443 项：442 通过，Linux 跳过 1 项 macOS 专用测试），含 typecheck、lint、
文档/素材检查、Web/Remotion 构建、creator 包检查及宿主 compositions。新增 6 项回归覆盖 tint 时序不变、
同组/不同组/嵌套组/外部前景与 unknown、状态文案/自定义样式/画布字号、主副词 70% 临界值及旧遥测兼容；
包级 typecheck、runtime `build:types` 与 `check:package` 也通过。现有检查未降低，未新增依赖。

预览在 `/home/zzzxc/AgentWorkspace/backups/axmorf-prerelease/`：`mask-wipe-{25,50,75}.png`、
`mask-wipe-tint-*.png`、`mask-wipe-v3-*.png`，以及 f61/f545/f2106/f2100/f1783 的
`status-tag-before-*.png`、`status-tag-after-*.png`、`status-tag-compare-*.png`（左旧右新）。
审片、原始日志、字号/颜色、源文件 hash、RGB 对比、修改前后片源与检查记录保存在本 worktree 的
`out/prerelease-validation/`；临时片已通过仓库 film CLI 的 delete owned-path 清理，不提交片源、媒体或输出。

尚未验证：人工连续播放与听审、手机真机观感、更多片型的提示泛化、完整成片重渲/交付及新包安装升级；
本批没有让新 Agent 重新制作，也不代表 P5 用户验收通过。

## P5 审片反馈修正（2026-11-07，未发布）

本批只改运行时、Skill 与文档，没有重做、交付或发布影片；后续由全新 Agent 做 P5-v3 验证 Skill 引导。

- Skill 的分镜/编写流程与 craft 构思/章节明确要求：旁白出现旧公理或新公理候选时，用 `AxiomMorph`
  从旧公理形变到候选，必读横屏示例并在 storyboard 写句子 id 与出现/形变/落定/阅读帧。
  补入空容器约 0.3 秒内开始出内容、不得等待超过约 0.5 秒、前景避让阅读文字、状态标识正文级字号
  （不低于 `minimumReadableFontSize`）与清楚对比、手机亮度建议，并逐条审片；两份 Skill 逐字一致。
- `NumberRoll` 的所有列改由同一个单调递增的定点整数生成（非负从 0 起，负目标从显示目标的两倍起）；
  保持 props 签名与原有返回字段类型，新增当前 `displayText` 与位移 `offsetInEm`。
  千分位、小数、符号、前后缀保持支持，`turns` 保留为递增速度控制；回弹只动位置，不动数值。
  显示精度向下取值，避免舍入后超过事实目标；配方卡提醒过程数值不得大于目标或与旁白矛盾。
- `text-under-foreground`：对非字幕的可见文字矩形做 10×3 点 `elementsFromPoint` 测量，
  累积 opacity ≥0.3 的非字幕前景覆盖 ≥20% 时在 `readabilityWarnings` 提示，附帧与覆盖比例。
  忽略透明布局容器；pointer-events:none 等不可靠命中在 `readability.unknown` 中保留，不报遮挡警告。
  新遥测字段 optional，兼容旧日志；采样、opacity 与覆盖阈值均为待校准常量。
- `repeated-composition`：以单一完整场景轨的边界和内部候选切点分段，排除转场窗口与不足 1 秒的切点碎段，
  渲染精确中点，比较所有非相邻段落的 64×64 灰度签名，MAD <12 时提示两个帧号，包含有旁白时段。
  无场景轨、日志不完整/歧义或缺中点签名为 unknown。阈值待校准；没有添加新的镜头识别器。
- release 指南、根 README/creator 升级说明和模板 README 记录 npmmirror + prefer-offline 的 `three@undefined`
  （ERESOLVE）及官方 registry / prefer-online 环境变量；未改依赖或使用安装绕过参数。

真实验证只读取试用 Workspace，复制 17 个片源文件及媒体到当前 worktree 的临时 fixture，确认片源 SHA256
逐项一致；没有向主 checkout、ai Workspace、试用 Workspace 写入，也未调用 TTS。
更新 runtime build 后跑 P5 `film:review`，2643 帧正片 / 30fps，177 个运动样本、6 场景、31 cue；
readability/motion 无 missingFrames、badLines、truncated 或 unknown。`text-under-foreground` 输出 9 条：

```text
"64 × H100": f873，20%
"此前实验": f1161，37%
"接口匹配 · 证明能用": f2176 / f2215，67% / 33%
```

`repeated-composition` 的 P5 输出为 `[]`：结尾在同一场景 `[1936,2643)`，没有检测到内部切点，
只取到一个中点 f2289，无法把结尾三个镜头互相比对。六段的中点为 f135/f645/f1188/f1494/f1782/f2289；
非相邻中点均未达到 MAD <12 的提示阈值（另以 0.25 scale 中点图复核，最小 MAD 约 23.65）。
曾评估改为按旁白句子分段（取句中点签名，两两比较句序相差 ≥2 的句子）：结尾 candidate2/question 的 MAD 为 23.46，
要报出它须把阈值放到 23.46 以上，此时另有 47 对误报（40 对跨章节，如 lab/counter、cluster/people）。现有低清灰度 MAD 签名
分不开“同构图”与“同画风”，故未采用，保留场景/切点分段；结尾构图雷同改由 Skill 审片清单人工核对（craft.md 跨段构图与第 2 条）。没有为制造命中而放宽阈值或新增镜头分段；
这条规则的正例/反例、仅相邻不报、阈值边界与 unknown 已有单测，但 P5 结尾仍是已知漏检，不能宣称该处已被识别。

新增 16 项回归：NumberRoll 10 项（逐帧解析实际列、千分位/小数/带数字前后缀、负数/0、高精度、
不同 turns 与向下舍入）；前景 3 项（20% 边界、字幕/离屏跳过、跨帧合并、unknown/旧日志及 schema）；
构图 3 项（非相邻/旁白、阈值、unknown、场景/内部切点与转场排除）。
完整 `npm run check` 通过（437 项：436 通过，Linux 跳过 1 项 macOS 专用测试），含 typecheck、lint、
文档/素材检查、Web/Remotion 构建、creator 包检查与宿主 compositions；
两包构建、包级 typecheck、runtime `build:types` 和 `check:package` 也通过。
NumberRoll gallery 已重渲 1920×1080 / 30fps / 108 帧 H.264 + AAC 双声道短片及 f25/40/63/65/100 still；
运动与停稳画面已看图，完整解码至 EOF 通过，f40 为 ¥10,097.35、f100 为 ¥12,804.75。

证据在本 worktree `out/p5-fixes-validation/`（ignored）：review.json、review-original.json、review/、
fixture-source/、source-sha256.json、midpoints/（中点图与距离对照）、gallery/（预览、still、media-validation.json）。
临时片已按 `film:delete` 的 owned-path 清理；片源副本、媒体和验证输出不提交。
尚未验证：P5-v3、新 Agent 是否遵循新增 Skill 规则、更多片型的提示阈值泛化、人工连续播放听审、
npmmirror 安装修复环境变量的本次重现实跑。两条新提示均未接入 `film:check` 或交付门禁，现有检查未降低。

## 审片运动提示与 animatic P3（2026-11-07，未发布）

按 [实施方案](promotions/2026-11-06-cinematic-motion-and-sound.md) 完成第 4 节及 deliver 提醒：

- review 专用 context 收集场景轨边界/kind/mode/窗口、已解析音效 cue、六个配方关键帧与镜头预设、
  WorldCamera 使用情况（含 FilmSoundtrack 的 ending 音效）。沿用 readability 的 warn 日志通道、固定标记 +
  单行 JSON、contracts schema、ANSI/tag 容错；正片/封面/片头片尾不输出 review 遥测。
- 默认每 0.5 秒以 0.125 scale 采样，用既有 readFrameSignature 生成 `motion-curve.json`（每秒变化量、候选切点及
  采样区间）和内部 Still 绘制的 `motion-curve.png`。`motion.boundaryChecks` 将候选切点区间与已知场景边界核对，
  不把半秒采样伪装为逐帧精确切点。每批最多 48 帧、遥测每帧最多 16 KB，避免进程 1 MiB 日志尾部截断。
- 新增纯函数提示 enter-then-hold、hard-cut-heavy、no-sound-effects、off-beat-cuts、static-camera；
  motion 摘要包含统计、曲线路径、密集帧路径、unknown、missingFrames/badLines。旧手写 Audio/Html5Audio
  （含 import 别名）和 sound-effects/staticFile 识别为 unknown；无带 chapter 的场景轨不报 static-camera。
  enter-then-hold 和 stillWarnings 重叠时不重复报；不确定的精确踩拍判断写 unknown。
- 标记时段以 6 fps、每段最多 3 秒输出 `dense/<rule>-<from>-<to>/`，全片最多 108 张，另报 denseSkipped。
  `--animatic` 默认关闭，开启时用交付组合（含系统片头片尾）、短边 360、原 fps、H.264/AAC 双声道输出
  `review/animatic.mp4`，沿用 Workspace 渲染超时；不写入 deliveries。普通 review 保留已有 animatic。
- deliver 新增 animaticReminder，按本片源码、film.json、generated 与本片媒体 mtime 判断缺失/过期；
  读取失败也只提醒，未改变现有错误/许可/画质检查，未把 motion 提示接入 film:check 或交付门禁。

旧片校准：仅从 ai Workspace **读取并复制** `ai-small-lab-training-cost-20261106` 的片源、实测 timing/music 和媒体，
在当前 worktree 的临时 fixture 运行真实 film:review；未向 ai Workspace 写入或调用 TTS。正片 2643 帧 / 30fps
（88.1 秒），177 个连续样本，无遥测缺帧/坏行；stillWarnings 为空。初始切点阈值 8 把持续平移也算成切点（48 个），
校准为 45 后得到 16 个候选切点；旧片的连续运动可达 MAD 35，背景硬切超过 130。入场后的停留允许 20% 的
采样含收尾/字幕变化，同时要求平均变化 <3，避免用单次字幕切换否定整段停留。阈值仍注释「待校准」，P5 再复验。
最终 motionWarnings：enter-then-hold `[0,120)`、`[120,285)`；hard-cut-heavy `[0,2643)`；
no-sound-effects `[0,2643)`。cueCount=0；off-beat-cuts（缺精确边界）与 static-camera（旧片无场景轨）为 unknown。
四个标记区间生成 72 张密集帧，无预算跳过。示例：

```json
{
  "rule": "no-sound-effects",
  "frames": [0, 2643],
  "message": "Narrated film exceeds 30 seconds and has no sound-effect cues; consider sound tied to visible actions."
}
```

真实验收：P1 gallery 派生 fixture 识别 3 场景、4 cue、NumberRoll/CameraMove 关键帧、push-in 及 2 个
WorldCamera 样本；跨章节两段 static-camera 提示产生 12 张密集帧，曲线与边界核对正常，无 missingFrames/badLines。
animatic 为 640×360 / 30fps / 390 帧（90 帧正片 + 300 帧系统片头片尾），846,036 字节；
inspectFilmVideo 校验与完整解码通过，AAC 双声道，解码 PCM 峰值 7553、79,311 个非零 mono samples，确认为有声音。
曲线与密集帧已看图；另以 warn 级别实渲正常正片确认无 review 日志，普通 review 实跑确认 animatic 大小/mtime 未变。
证据保存在当前 worktree 的 `out/p3-validation/`（ignored）：两片各有 review.json、review-original.json、
review/ 和 fixture-source/；整理后的 review.json 路径已指向保留目录。预览：
`out/p3-validation/p3-motion-probe/review/animatic.mp4`，媒体复验数据在 media-validation.json。
临时片已用 film:delete 的 owned-path 清理，片源、媒体和验证输出不提交。

新增 16 项回归覆盖五条规则的正反例、旧片 unknown、字幕/收尾容忍、切点校准、边界互核、日志容错、密集帧预算、
review 新字段 schema、animatic 参数/声音/超时与 deliver 缺失/过期/新鲜提醒；既有交付测试追加缺预览仍成功的断言。
完整 `npm run check` 通过（419 项：418 通过，Linux 跳过 1 项 macOS 专用测试），含 typecheck、lint、文档/素材检查、
Web/Remotion 构建、creator 包检查及新 motion-curve Still 的宿主 compositions；runtime 包 typecheck、
两包构建与 runtime check:package 通过。

尚未验证：人工实际播放听审、提示阈值在更多片型上的泛化、独立新 Workspace 安装/升级实跑和 P5 新旧生产样片对比。
未新增依赖；未改 Skill、模板、README 或其他任务持有的文档，未发布。

## 镜头配方 P2（2026-11-07，未发布）

按 [实施方案](promotions/2026-11-06-cinematic-motion-and-sound.md) 完成第一批六个配方：

- `@axmorf/studio/remotion` 新增 `AxiomMorph`、`NumberRoll`、`BarGrow`、`CameraMove`、`ParticleField`、
  `ParallaxLayers`，每个组件有独立的 `resolve* (frame, options)` 纯函数，返回状态、绝对关键帧与
  `FilmSoundEffectCue[]`，可直接展开到 `FilmSoundEffects`。组件可传根时间轴 `frame`，在嵌套 Sequence 内保持音画同钟。
- 新增 `ProducerRecipeMeta` 与 `PRODUCER_RECIPE_CATALOG`：使用/避用场景、建议秒数、
  anticipate/move/land/settle 语义、建议音效落点。仅新增导出，未改旧 API 或依赖。
- AxiomMorph 用 `@remotion/layout-utils` 逐 grapheme 实测布局，测量与帧 resolver 分离；支持 assemble、scatter、
  shatter、reform，中英文共有字按 FIFO 一对一匹配（含重复字）；字形按三角 clip 碎裂，轨迹用 `random(seed)`。
  NumberRoll 支持逐位过冲后精确 land、千分位、小数、固定前后缀；BarGrow 含基线/刻度与每柱错峰 land cue。
- CameraMove 的五种预设复用世界镜头和按长度取点，统一缓动；motion blur 仅在快速段开启，默认 4、上限 8 次采样，
  源码标注约采样数倍的子树渲染成本。ParticleField 按 SVG path 长度采样，默认 120、最多 400 粒子。
- ParallaxLayers 评估了固定三槽的 `ProducerLayeredStage` / `ProducerShotStage`，选择薄封装已支持任意深度层的
  `ProducerWorldCamera`，复用投影和边界校验，默认背/中/主/前景深度为 0.15/0.5/1/1.5，不重复实现变换引擎。
- 六个 `Recipe-*` gallery 组合均为 1920×1080 / 30fps / 108 帧，音效由配方 cue 直接接入。
  实现为项目内原创，没有拷贝外部项目代码或新增素材，许可清单无需修改。

验证：新增 22 项回归覆盖各 resolver 的阶段边界、land、cue 帧与角色、参数校验、重复字匹配、确定性状态、
前后缀数字不滚动及嵌套时间轴。完整 `npm run check` 通过（403 项：402 通过，1 项 macOS 专用测试在 Linux 跳过），
含六个新 composition 的宿主 Chromium 枚举；两包构建、typecheck 和 runtime `check:package` 通过。
`scripts/tests/check-recipe-pixels.ts` 为独立宿主 Chromium 检查：AxiomMorph、ParticleField 的第 40/100 帧各独立渲染两次，
1920×1080 PNG 全部逐字节相同（比像素相同更严格），共 4 对/8 张；不使用灰度缩略签名代替完整像素验证。
六张 still 已看图；六段 H.264 + AAC 短片全部解码至 EOF，108 帧/3.6 秒画面，容器 3.648 秒，PCM 检查音轨非静音。
五种镜头预设及快速段 motion blur 有真实 Chromium still 冒烟。
预览目录：`/home/zzzxc/AgentWorkspace/backups/axmorf-p2-preview/`，每个配方各有同名 `.png`/`.mp4`，
另附 `determinism.json`、`media-validation.json` 与 `camera-presets/`。开发预览使用共享 seed 的 public-dir。
Remotion CLI 仍有既存 zod 4.6.7 / 建议 4.3.6 提示，未改依赖或检查。

尚未验证：人工实际听审、跨机器/字体环境的像素一致性、motion blur 性能基准、独立新 Workspace 安装/升级实跑与生产样片对比；
后两项按 P5 验收。Skill、api.md 与配方卡按计划留到 P4。

## 场景轨与音效轨 P1（2026-11-06，未发布）

按 [实施方案](promotions/2026-11-06-cinematic-motion-and-sound.md) 完成 P1：

- `@axmorf/studio/remotion` 新增 `FilmSceneTrack` / `resolveFilmSceneTrack`：句子 id 或绝对帧编排，
  4 种覆盖式与 8 种重叠式转场，窗口居中，补偿 Sequence 时长，保持正片长度与名义边界；提前出现时本地帧钳到 0。
  resolver 校验边界、窗口和相邻场景长度，并产出可直接传入音效轨的 `sfxCues`。
- 新增 `FilmSoundEffects` / `resolveFilmSoundEffects`：共享角色/id、已登记素材、起点/终点锚定、
  beat/bar/accent/section 有界吸附、同帧去重及旁白压低。本片素材复用 `FilmAssetSchema`，由调用方传入登记条目与实测时长。
- `FilmSoundtrack` 增加 `musicDips` 和 `ending`；留白与旁白压低取较低音量，复用 8 帧斜坡。
  ending 默认选最后一个有效重音（无重音取正片末尾），可指定帧，收尾音效尾端也对齐该帧。
  不传新参数时输出逐字段保持原状，旧转场映射的类型与行为保留。
- 扩展既有 `scripts/sound-effects/generate.ts` 确定性 PCM 合成器，生成 riser-short、reverse-swell、
  low-impact、glitch-tick、whip、shimmer；冻结 WAV、Apache-2.0 许可与媒体元数据进入共享 seed、manifest 和打包校验，
  沿用创建/升级 Workspace 的资源分发路径。

验证：新增 18 项回归测试通过；完整 `npm run check` 通过（381 项，380 通过，1 项 macOS 专用测试在 Linux 跳过；
含 typecheck、lint、文档/素材检查、Web/Remotion 构建、creator 包检查与宿主 Chromium compositions）。
两包 typecheck/build、runtime `check:package`、六个 WAV 两次逐字节复现及 manifest 校验通过。
12 种转场分别通过真实 Chromium 中点 still 冒烟；gallery 的 match-scale + flash + 多音效示例已渲染、看图，
预览为 960×540 / 30fps / 87 帧（视频 2.9 秒，含 AAC 的容器 2.944 秒），H.264 + AAC 完整解码通过，音轨非静音。
预览目录：`/home/zzzxc/AgentWorkspace/backups/axmorf-p1-preview/`（`scene-track.png`、`scene-track.mp4`、`transitions/`）。
开发仓库预览用 `--public-dir=packages/studio/src/runtime/workspace-seed/files/public` 读取共享 seed。
现有 Remotion CLI 仍提示仓库锁定的 zod 4.6.7 与其建议 4.3.6 不同；此次检查与渲染均成功。

尚未验证：人工实际听审、独立新 Workspace 的安装/升级实跑、生产片新旧对比；后续按 P5 验收。
Skill、api.md 和其他权威文档的能力说明按计划留到 P4 同步。

## VoxCPM 参考音频转换与远程服务诊断（2026-10-28，0.3.0-rc.5 候选）

已在本机复现高保真克隆上传前 `FFmpeg prompt normalization failed with exit code 234`：
Remotion bundled FFmpeg 不含 raw `s16le` muxer。改为写入可 seek 的 WAV 文件，严格解码 PCM，再生成标准
48 kHz / mono / 16-bit WAV；不改原始参考文件、不引入另一套 FFmpeg、不重试或切换 provider。

VoxCPM 诊断按配置的 HTTP(S) 地址访问 `/health` 和 `/ready`，支持 Tailscale 等远程自托管部署，
不再因非 loopback 地址直接失败；仍不合成、不预热、不跟随重定向，错误不暴露地址或 token。
回归覆盖真实 Remotion FFmpeg、转换失败/空音频/截断 WAV、远程/localhost/IPv6 地址及诊断错误脱敏。
验证：完整 `npm run check` 通过（363 项测试、typecheck、lint、文档与素材检查、Web/Remotion 构建、creator
检查及宿主 Chromium compositions），两包 typecheck/build 与 `npm audit --audit-level=low` 通过。
`DefaultIntroPreview` 真实渲染为 1080×1920 / 30fps / 60 帧 H.264 + AAC stereo，完整解码到 EOF。

用两个候选 tarball 创建全新外部 Workspace，安装、doctor 与 compositions 通过。通过该 Workspace 的公开
`film:voice` 和既有已确认参考声线向原 VoxCPM 服务合成中性测试句，`/clone_with_prompt` 返回 HTTP 200
`audio/wav`，最终音频约 5.181875 秒、48 kHz / mono / `pcm_s16le`，完整解码通过。连续两次公开配音命令
只有一次真实合成请求，第二次复用缓存。生产默认配置未改。未实际听审，尚不作为 `latest` 的 Agent 晋级验收。

前述画面、OP、超时改进已经随 `0.3.0-rc.4` 合入默认分支并通过
[发布 CI](https://github.com/AXMORF/axmorf-studio/actions/runs/40550067560) 发布到 npm `next`；下方“未发布”是各条实现时的历史状态。

## 讲解片画面优化与渲染超时设置（2026-10-28，未发布）

用同一份固定旁白脚本（瑞利散射，12 句）让 Codex 在 AXMORF Workspace 内外各做一部讲解片：Workspace 内的一组画面更有
电影感、空间连续，但字幕被压成约 30px 的单行，镜头只在原地推拉（平移不超过 80px），画面标注少，静音时不如
Workspace 外的一组易懂。据此：

- `film:review` 的 `readabilityWarnings` 新增 `small-caption`：字幕实测字号低于短边 4%（1080 宽约 43px）时提示；
  Skill 写明一句是一个字幕事件、可折成两行，不要为排成一行缩小字号。
- `@axmorf/studio/remotion` 新增 `ProducerWorldCamera`（比屏幕大的世界里平移、跟拍、推拉，各层按深度视差）、
  `resolveProducerWorldCamera`、`resolveProducerWorldPlane` 与 `resolveProducerPathPoint`；示例段落新增
  “镜头在大场景里跟着过程走”。
- 画面手艺：推拉不算取景变化，每章至少一次平移、跟拍或换位；文字预算放宽为一个标题加最多 3 个贴在物体上的短标注；
  旁白里的数字要画成可见的数量；审片新增静音测试、镜头类型与字幕字号三项。
- Producer config 的 `renderDefaults.renderTimeoutMinutes`（15–120，缺省 15）决定 `film:deliver` 与 `film:review`
  单次渲染的时限；Web 设置“通用”可改。超时报错提示调高设置而不是降低画质、尺寸或帧率，Skill 同步。

## MV / OP 类片子的支持（2026-10-23，未发布）

用同一份需求让 Codex（gpt-6.1-sol，max）分别在 AXMORF Workspace 内外各做一部原创动漫 OP：Workspace 外的一组
插画更多、画面更丰富。差距主要来自 Workspace 规则在这类片子上的约束：生图失败后不重试只剩 6 张图、配乐只能合成、
60 秒里 10 秒是品牌片头片尾、审片查不出素材反复使用。据此按“讲述段 / 节拍段”的时间段思路改进，讲解片的默认行为不变：

- `@axmorf/studio/remotion` 新增 `ProducerSpriteSheet` 与 `resolveProducerDrawing`（播放动作表）、`ProducerBeatCamera`、
  `ProducerWhipIn`、`ProducerSpeedLines` 及其纯函数 resolver。
- `film.json` 的 `music` 二选一：`score`（合成）或 `track`（已用 `film:asset` 登记来源与许可的音频）。`track` 的节拍网格
  由作者写定，缺失时 `film:music` 从音频估计 `bpm` 与首个强拍并停下；登记的音频变了 `film:check` 报 `music-stale`。
  `AGENTS.md`、产品目标与架构文档同步。
- `film:review` 新增 `repetitionWarnings`：只在没有旁白的时段每 0.5 秒取样（最多 120 帧），同一画面超过这些时段 25%
  时提示，不拦截交付。
- `film:new --bookends workspace|both|none` 只决定本片的品牌片头片尾，Workspace 默认不变。
- Skill：画面手艺新增“讲述段与节拍段”；配乐新增授权曲目流程；素材新增绿幕动作表的生成与抠像；OP 配方新增素材预算、
  片头片尾与审片项；生图失败缺关键画面时停下请用户同意重试。creator 模板镜像同步。

## 动漫 OP 风格配方与图形处理组件（2026-10-22，未发布）

`@axmorf/studio/remotion` 新增 `graphic-fx` 组件，全部用 SVG filter、clip-path 与帧驱动计算实现，不依赖
WebGL 或实验性的 HTML-in-Canvas（`@remotion/effects` 只能挂在 `<Img>` 与 `HtmlInCanvas` 上，后者需要 Chrome 148 及 flag）：
`ProducerBeatCutSeries` 与 `selectProducerCutFrames`（按音乐网格硬切）、`ProducerGradientMap`（双色调 / 伪彩）、
`ProducerChromaticSplit`（RGB 错位）、`ProducerGlitchSlices`（切点撕裂，装饰副本 aria-hidden 且只在 burst 内存在）、
`ProducerHalftoneOverlay`、`ProducerFlashCut` 与 `ProducerCreditTitle`（职员表式宋体文字，`entrance` 可选砸入或淡入），
以及对应的纯函数 resolver。Skill 新增 `references/styles/anime-op.md` 风格配方，`SKILL.md` 指向 `references/styles/`，
`api.md` 增加组件说明；creator 模板镜像同步。原有 `producerStyleProfiles` 未改动。

配方初稿只依据每 3 秒一帧的抽样，误把高潮段的霓虹故障当成整体风格，样片观感很差。随后对两部参考 OP 逐镜头抽帧
（150 / 196 段）并实测色彩与切点：基调是高调白灰金或靛蓝夜色，高饱和像素约 13–14%；切点与节拍网格的对齐只比随机略好，
停留镜头多为 0.6–1.75 秒并夹有长镜头，快感主要来自镜头内作画。配方据此重写为作画优先、实测色板、意象体系、
五段结构与特效上限，并要求缺少插画时说明只能做纯图形版；示例段落改为只演示组件用法的占位实现。

配乐引擎新增 studio-v2 专用的 `drive` 风格：失真强力和弦 `guitar` 与 `tom` 声部、按 `energy` 分三档的军鼓反拍鼓型、
八分音符贝斯、每 4 小节过门与段落前通鼓滚奏、可重复的两小节旋律钩子。合同的 `style` 增加 `drive`，事件增加可选 `beat`；
所有 studio-v2 事件按精确拍位置合成，不再四舍五入到视频帧（原先 30fps 下鼓点最多偏差约 16ms）。
`electronic` / `organic` 的编曲不变，但重新生成后起音时间更准确；原始引擎与其金样校验不受影响。
用 `drive`（172 BPM）与 Codex 生成的插画、绿幕作画序列重做的原创样片在临时 Workspace 中交付复验通过，成片约 -14.8 LUFS；
节奏感只做了起音自相关等粗略测量，未经人工听审。

验证：完整 `npm run check` 通过（338 项测试，含新增 10 项组件测试；风格配方的示例段落纳入 `film:check` 用例）。
用本地打包的 runtime 新建临时 Workspace（doctor 通过），制作 1920×1080 / 30fps 纯视觉样片：`film:check`、`film:review`
（`stillWarnings` 与 `readabilityWarnings` 为空）、`film:deliver` 通过，交付 22 秒（含片头片尾）四文件复验通过；
审片确认伪彩、网点、撕裂、闪白与金色大字在宿主 Chromium 中生效，并据此调低撕裂染色、把镜像倒影改到文字下方。

未验证：人工连续观看与听审、竖屏样片、生图角色素材上的效果、非 macOS 宿主的宋体回退；配乐引擎仍只有
`electronic` / `organic` 音色，未新增摇滚音色。本次未发布。

## 清理 contracts 旧主链残留（2026-10-21，未发布）

按[实施计划](promotions/2026-10-21-contracts-old-chain-cleanup.md)，从公开的 `@axmorf/studio/contracts` 删除
`story`、`semantic-timing`、`scene-readability`、`generation-input`、`generated-artwork`、`render` 整模块，
以及资源目录、Scene 模板实例、旧运动验证和仅服务这些模块的导出。媒体授权描述、模板 ID、可选运动组件所需的合同及
传递依赖保留，现行合同未做全量未用导出清扫；旧素材描述的 `generatedSource` 字段随 generated-artwork 删除。
这是 0.3.0 范围内的公开导出破坏性变更，外部调用方需移除对退役合同的引用。

`CAPTION_MAX_DISPLAY_HALF_UNITS` 与 `countCaptionDisplayHalfUnits` 移入 `film.ts`，仍从 contracts 导出；
`pauseMsToSampleFrames` 移入旁白脚本的 PCM 内部模块，不再从 contracts 导出。名称和计算保持不变，仍执行 72 half-units
上限和 round-half-up 停顿 samples 换算。`@axmorf/studio/remotion` 的导出（含 `ProducerMotionObject`）、依赖与版本不变。

验证：完整 `npm run check` 通过（328 项测试，含 typecheck、lint、文档链接、素材、Web / Remotion 构建、creator 包检查与
宿主 Chromium compositions 门禁），runtime 完整构建及 `build:types` 通过，定向 43 项测试通过。原有字幕预算与 PCM
换算测试保持通过，迁移实现与原代码逐字一致；另用构建产物确认 ASCII / 中文 / emoji 的 72 half-units 边界。
首轮完整检查的进程超时测试未在 300ms 内捕获子进程启动输出，单独运行 14 项和第二轮完整检查均通过，未修改该测试。

测试由 330 项降至 328 项，仅删除：

- generation fingerprint 用例：验证已删除的 Story / generation-input 指纹；其中现行旁白 schema 的两条严格校验断言移入旁白测试。
- composition ID 用例：只验证已删除 render 合同使用的 ID schema。

已删的 122 个导出名在 `packages/`、`scripts/`、`settings/`、`src/`、`tests/` 中检索无匹配；另有上述停顿函数迁入内部。
清空后重建的 contracts 声明树也无退役名称（含 `StorySpec`、`SemanticTiming` 和资源目录专用名称）：
声明树由 5328 行 / 232059 字节降到 2692 行 / 113951 字节，`dist/contracts.js` 由 4505 行 / 167160 字节降到
2202 行 / 81310 字节；入口 `dist/contracts.d.ts` 仍为 5 行 / 199 字节，实际声明位于 `dist/contracts/`。

未验证：真实 TTS、成片渲染或交付、生成 Workspace 的全新安装 / 升级验收、仓库外调用方迁移；本次未提交、推送或发布。

## 审片渲染实测可读性提示（2026-10-20，未发布）

按[实施计划](promotions/2026-10-20-review-readability-measurement.md)，`film:review` 新增 `readabilityWarnings`：
在审片组合内等待字体与布局稳定后测量文字，提示非字幕文字的实际字号过小、部分越界与字幕框遮挡；相同规则和文字摘要
合并列出正片帧号与实测值。`readability` 列出测量帧数、缺失帧、坏日志、截断帧与测量错误。提示不拦截 `film:check`
或交付，静态小字号警告复用同一阈值，`stillWarnings` 保持原行为。Skill 与 creator 模板镜像同步。

验证：完整 `npm run check` 通过（330 项测试，含 typecheck、lint、文档链接、素材、Web / Remotion 构建、
creator 包检查与宿主 Chromium compositions 门禁）；focused tests 18 项通过，React Doctor 改动扫描无新增诊断。
仓库根目录用无旁白临时片实测 1080×1920、`--scale=0.5` 的 f10、f150、f294：缩放文字 16px、SVG 文字 12px
均低于 26px 阈值，右侧文字越界约 329.84px，正常 64px 文字无警告；3 帧测量齐全，无坏日志或截断。
联系表与单帧正常生成并看图，`stillWarnings` 与改动前渲染一致，`film:check` 与 HEAD 版本的同片输出完全相同；
同质量、同缩放的 f10 正片 still 与审片 JPEG 字节一致，测量容器未改变该帧像素。
Remotion 4.0.489 非 TTY 子进程确认 `console.warn` + `--log=warn` 在 stderr 输出完整测量行，其他渲染保持 error 级别。
临时片已通过 `film:delete --film readability-probe --confirm-delete` 清理。

未验证：字幕遮挡只做单元测试（含 10% 边界），未进行带旁白真实渲染，未调用 TTS；对比度和文字停留时长仍未实现。
本仓库根目录没有生成 Workspace 的 marker / producer config，验收直接调用仓库 film CLI 服务与本地 Remotion，
未做生成 Workspace 的 doctor / 新安装验收；本次未交付或发布成片。

## 0.3.0：删除 Project production 主链（2026-10-19，0.3.0-rc.1 已发布至 next）

2026-10-20 核实：`@axmorf/studio` 与 `create-axmorf-studio` 的 npm `next` 均为 `0.3.0-rc.1`，
`latest` 仍为 `0.2.1`；0.3.0 正式版尚未发布。

按[迁移方案](promotions/2026-10-14-direct-film-production.md)第 2 步删除旧主链，只保留 direct film：

- 删除 `project:*`、`catalog`、`registry`、`renderer`、`scene`、`narration`、`reference` 等 CLI 与其实现，45 个旧合同，
  旧 Remotion 运行时（story-visual、narrative-core、composition-assembly 等）、资源目录 catalog、`proofs/`、
  `axmorf-video` Skill、旧 Agent 首用审计工具，以及只服务旧 attempt 恢复的进程登记与期限作用域。
  `@axmorf/studio/remotion` 保留 film 组件、片头片尾与 Skill 文档列出的可选组件。
- 配乐引擎从 `axmorf-video` Skill 移到 `scripts/films/score/`；成片检查函数移到 `scripts/films/inspect-media.ts`。
- Web 控制中心改为“作品 / 通用 / 片头片尾 / TTS”：作品页读 `film:list` 并按 `publish.json` 记录的文件大小预览交付，
  删除需输入完整 ID；去掉旧的 Agent 执行、画面安全区、合集与全局 BGM 设置（配置字段为兼容保留）。
- Workspace：bootstrap 与 doctor 不再创建或要求 `src/projects/`、`.producer-*` 和资源目录；doctor 五项检查。
  升级删除退役的 `axmorf-video` 与旧 `remotion-best-practices` Skill、`src/runtime/` 兼容层、仍是原值的旧脚本，
  并清理留下的空目录；旧 Project 目录只在有内容时列入 `legacyProjectData`，不删除。
- `axmorf-film` Skill 新增两个可编译的[示例段落](../.agents/skills/axmorf-film/references/examples.md)，由测试保证
  它们放进 film 后 `film:check` 零错误零警告。
- 文档收敛为 11 份 active 文档；旧主链的文档、合同、guides 与 0.2.0 之前的证据移入
  [archive/project-production/](archive/project-production/)，0.1.22–0.1.23 状态移入
  [归档](archive/iteration-status-0.1.23-and-earlier.md)。

验证：`npm run check` 通过（320 项测试，耗时由 5 分 42 秒降到约 2 分 10 秒）；运行时包由 314 个文件、40.7MB 降到
246 个文件、32.8MB。用本地 tarball 新建 Workspace，doctor 通过、无旧目录，交付一部 240 帧无旁白片
（片头片尾在内 540 帧，H.264/AAC 双声道），Web 作品页列出作品并播放交付视频与封面。用 npm 上的 0.2.1 新建
Workspace、交付一部片并放入旧 Project 残留后升级：删除 49 个退役文件、无本地改动冲突、doctor 通过，旧片重新交付
并归档上一版，新片完整交付。带旁白的片首次在 Edge TTS 第一句失败（外部阻塞）；维护者同意后重试一次，两句均成功，请求间隔
10 秒。该片两段分别用 Skill 的两个示例段落，按第二句起点切换，审片一轮后把模块落点改到配乐重音第 144 帧，
`film:check` 零错误零警告，交付 568 帧（60 + 268 + 240），片尾列出参考来源。带旁白的升级后生产留待发布前验收。

## 0.2.1 发布与宿主验收（2026-10-18）

`0.2.1-rc.1`（Edge TTS 请求节奏、`/axmorf-film` 入口）与 `0.2.1-rc.2`（片头片尾、审片自查）先后发布到 `next`，
维护者的 Workspace 用 `npx create-axmorf-studio@next upgrade` 就地升级，doctor 六项通过。

Codex（gpt-6.1-sol，高推理）在 rc.2 上按 `axmorf-film` 流程完成 `dns-address-journey-v2`：

- 交付 1400 帧 = 片头 60 + 正片 1100 + 片尾 240，1080×1920、30fps，46.67 秒；片尾列出 3 条参考来源。
- 抽帧确认片头片尾与音频都在；第一版“顶部标题 + 居中物体 + 底部字幕”的版式改为同一场景内的物体与贴附标签，
  各级服务器造型不同，镜头在对象之间移动，结尾无长时间静止。剩余倾向：多数段落仍以单个居中物体为主。

发布流程同时修正：新版本在公共 registry 可见可能超过 10 分钟，rc.2 因原 5 分钟等待误判失败（runtime 已发布、creator 未发布，
人工重跑后完成）。现在发布后最多等待 30 分钟；`npm publish` 报版本已存在时不再直接失败，而是等待并核对 registry integrity
与本次 tarball 一致。

未验证：人工连续观看与听审。

## 片头片尾与审片自查（2026-10-16，随 0.2.1 发布）

0.2.0 的 direct 流程没有接 Workspace 配置里的 `sceneDefaults.introSceneTemplateId/outroSceneTemplateId`，
Codex 制作的 `dns-address-journey` 因此没有片头片尾。现在：

- `film.json` 新增可选 `bookends`（`intro`、`outro`、`theme`、`sources`），`film:new` 按配置写入；省略即无片头片尾，既有片不变。
- 交付组合在正片前后自动接上系统模板 `axmorf-brand-reveal-v1`（2 秒）与 `axmorf-source-follow-v1`（8 秒），各带模板音频；
  其他帧率按秒换算。`Film.tsx`、`useFilmTiming()`、审片与配乐仍只计正片。交付校验与 `publish.json` 使用总长。
- `film:review` 新增 `stillWarnings`：相隔 2 秒以上、64×64 灰度缩略图平均差小于 3 的相邻审片帧。阈值用该片校准：
  结尾静止 4 秒的两帧差 2.37，有变化的相邻帧 4.9–14.3。只提示，不拦截交付。
- Skill 要求审片清单逐条给出帧号证据，新增“每段顶部标题 + 居中物体 + 底部字幕”的失败信号与替代做法，结尾同样需要次级运动。

验证：film 测试 19 项通过；本地打包的 runtime 在测试 Workspace 交付 510 帧（60 + 210 + 240），抽帧与分段音量确认片头、
正片、片尾参考来源与品牌落版及各自音频都在。

## Edge TTS 请求节奏与诊断（2026-10-15，随 0.2.1 发布）

隔离诊断的五次低频请求全部获得 HTTP 101 与可解码音频：当前 API/v1 与 Bing/v2 均通过代理和应用层直连，
当前 API/v2 也通过代理。未复现 429，不能认定旧 GEC 是当前 API 的失败原因，也未证实出口 IP 持续被封。
历史突发请求后 429、稍后恢复的表现仍支持短时节流假设，具体阈值与计数范围未知。

源码 Edge adapter 现在串行发送真实请求，前一次结束后至少间隔 10 秒；首句立即发送，缓存命中不等待。
10 秒是待真实生产验证的缓解初值，不是已测得的微软配额。失败会立即停止该 adapter 的排队请求，仍无自动重试或 fallback。
stderr 只记录开始/结束时间、chunk ID、代理/直连标签、耗时和固定 HTTP/超时状态，不含旁白、URL 或凭据。
保留 `node-edge-tts@1.2.11`、当前端点和握手参数；不改变音频停顿、缓存 identity 或实测时序。

离线假时钟、假客户端及缓存集成验证覆盖上述行为；108 项相关回归、类型、定向 lint、格式与文档链接检查通过。
本次实现未新增真实 TTS 请求；随 `0.2.1-rc.1` 发布到 `next`，同版还带有 Claude Code 的 `/axmorf-film` Skill 入口。
诊断与验证边界见[记录](evidence/2026-10-15-edge-tts-pacing.md)。

## 0.2.0 发布与宿主验收（2026-10-15）

`0.2.0-rc.1` 经 tag 触发的 CI 完整检查后发布到 `next`。维护者的 Workspace 用 `npx create-axmorf-studio@next upgrade`
从 0.1.23 就地升级：新增 `axmorf-film` Skill，更新 5 个托管文件，无本地改动冲突，doctor 六项通过，既有作品与交付保留。

Claude 作为宿主按 `axmorf-film` 流程完成 `https-handshake-direct`（与 0.1.23 验收片同一脚本）：

- 源码先在测试 Workspace 中用估算时序起草并审片一轮，修正重叠、裁切和过小元素后复制到正式 Workspace。
- Edge TTS 首次在第 5 句超时（外部故障，未自动重试）；维护者同意后重试一次，已缓存的前 4 句未再请求，8 句全部完成。
- 按实测时长重排配乐，使最满段落及重音落在第 692 帧，与两端金钥匙合成同帧；尾声段落起点第 1038 帧对应地址栏小锁亮起。
- 审片联系表确认取景逐段变化、两个落点对齐；交付 38.87 秒、1080×1920、30fps、1166 帧 H.264 与 AAC 双声道，
  exact 四文件复验通过，-15.7 LUFS。

未验证：Codex 宿主的表现、人工连续观看与听审。

## Direct film 制作方式（2026-10-14，随 0.2.0 发布）

按[实施计划](promotions/2026-10-14-direct-film-production.md)第 1 步实现，计划作为 0.2.0 发布；0.1.23 的
Project production 主链保持不变，只处理既有作品。

- 合同：`FilmSpec`（`film.json`）、`FilmTiming`、`FilmMusic`、`FilmAssets`、`FilmPublish`，以及 `filmCompositionIds`。
  旁白每句最多 72 caption display half-units；时序按实测 samples 用 `ceilDiv(samples × fps, sampleRate)` 换算。
- 运行时（`@axmorf/studio/remotion`）：`useFilm`、`useFilmTiming`、`FilmCaptions`、`FilmSoundtrack`
  （旁白、循环配乐、旁白下 ducking、结尾淡出）、`FilmCompositions`；每部片注册正片、`--review` 与两张封面 Still，
  另有共享的 `axmorf-contact-sheet` Still。计划中的独立 `@axmorf/studio/film` 入口改为并入 `/remotion`：
  两个 bundle 会各带一份 React context，Provider 与 hook 将无法互通。
- CLI：`film:new`、`film:voice`（按 provider 与文本缓存每句 TTS）、`film:music`、`film:asset`、`film:review`、
  `film:check`、`film:deliver`（临时目录渲染、复验后替换，旧交付按其交付时间归档）、`film:list`、`film:delete`；
  写操作共用 `.project-operation.lock`。bootstrap 生成 `src/films/index.ts` 静态注册表。
- 审片：review 组合与正片等长（Remotion 会把冻结帧裁剪到组合长度），CLI 只渲染前 N 帧；联系表由 Remotion
  渲染，因为随 Remotion 发行的 ffmpeg 没有 `tile` 等滤镜。
- 检查：硬错误为 TypeScript、渲染时联网（按调用和属性判断，屏幕上的 URL 文本允许）、CSS 动画、
  `Math.random`/`Date.now`/`new Date()`、未登记或已改动的媒体、跨片导入、缺少字幕/声音组件、旁白或配乐过期；
  小字号只给警告。计划中的“渲染后实测可读性”尚未实现。
- 模板与 Skill：新 Skill `axmorf-film`（流程、画面手艺、配乐与卡点、素材、API），Workspace `AGENTS.md`、
  README 与 9 个 `film:*` scripts；`workspace:upgrade` 镜像新 Skill。首尾品牌组件尚未提供。

验证：film 单元与流程测试 12 项（含真实 TypeScript 检查、伪造 TTS 的旁白时序、交付替换与回滚、删除范围）。
用本地打包的 runtime 与 creator 新建 Workspace（doctor 六项通过），完成一部无旁白的 7 秒测试片：
`film:music` → `film:check` → `film:review`（联系表帧内容正确）→ `film:deliver`（29 秒，H.264 210 帧、AAC 双声道，
配乐与重音音效实际混入）。同一次运行中 Edge TTS 对第二句返回 HTTP 429（外部阻塞，未重试），第一句的真实 TTS、
归一化与缓存成功；带旁白的完整真实生产留待发布前验收。
