# Iteration Status

## 动漫 OP 风格配方与图形处理组件（2026-10-22，未发布）

`@axmorf/studio/remotion` 新增 `graphic-fx` 组件，全部用 SVG filter、clip-path 与帧驱动计算实现，不依赖
WebGL 或实验性的 HTML-in-Canvas（`@remotion/effects` 只能挂在 `<Img>` 与 `HtmlInCanvas` 上，后者需要 Chrome 148 及 flag）：
`ProducerBeatCutSeries` 与 `selectProducerCutFrames`（按音乐网格硬切）、`ProducerGradientMap`（双色调 / 伪彩）、
`ProducerChromaticSplit`（RGB 错位）、`ProducerGlitchSlices`（切点撕裂，装饰副本 aria-hidden 且只在 burst 内存在）、
`ProducerHalftoneOverlay`、`ProducerFlashCut` 与 `ProducerCreditTitle`（职员表式粗宋体大字），以及对应的纯函数 resolver。
Skill 新增 `references/styles/anime-op.md` 风格配方（节拍段 / 讲述段划分、色板、文字、素材、配乐参数、闪烁安全与审片追加项），
`SKILL.md` 指向 `references/styles/`，`api.md` 增加组件说明；creator 模板镜像同步。原有 `producerStyleProfiles` 未改动。

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
