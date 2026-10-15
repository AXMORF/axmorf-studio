# Iteration Status

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

## 当前源码与公开版本（2026-10-13）

当前源码已完成能力可发现性、全幅正文与独立文字安全区、原创图片/SVG 准入、分段配乐及 Edge TTS 端点修复。
最终完整 `npm run check` 退出 0：1499 项测试全部通过，无失败或跳过，类型、Lint、文档、资源、
Web/Remotion 构建与宿主检查通过；runtime/creator 构建和 package checks 通过。
文档收口后，32 项文档回归、12 项 Workspace scaffold 回归、全部当前文档链接/npm 命令引用检查及两包
package checks 再次通过；Skill 上下文预算和共享创作文件同步保持原门槛。

包含这些改进的本地 tarball 已在新 Workspace 完成 `rea-inside-the-black-box` 正式生产：
76.5 秒、1080×1920、30fps、2295 帧 H.264/AAC stereo 视频，以及两张封面和 `publish.json`。
唯一 continuation 返回 `project-production-complete`；Compositions 与七项 final check 通过。
抽查 36 帧预览、9 帧正式视频和两张封面；最终 AAC 约 −15.72 LUFS / −2.26 dBTP，技术分析确认配乐实际混入。
完整连续播放、主观听审、实机手机播放和独立发布首用认证不在本次验证范围内。
具体故障、恢复与交付 identity 见[本地生产记录](evidence/2026-10-13-edge-tts-endpoint-incident.md)。

2026-10-13 回读两包 npm `latest` 仍为 **0.1.21**，已发布范围见[发布记录](evidence/v0.1.21-publication.json)。本地 tarball 仍使用该版本号，
但包含上述未发布源码，不能用包版本号将两者等同。Git 提交或推送不会更新已安装的 npm 包；原有 Workspace 与
既有作品未迁移。下方日期小节保留各阶段的实现和验证范围，较早测试数不代表最终累计结果。

## 0.1.23 发布（2026-10-14）

`0.1.23-rc.1` 的 Codex 验收在 prepare 阶段失败：studio-v2 配乐给 Scene 合同新增了一条 workflow，分组且有 filmPlan 的
Scene 因此超过 16 条上限。修复后发布 `rc.2`；Codex 验收进行到正文预览时因账号额度耗尽中止（外部阻塞，未交付）。
维护者随后批准由 Claude 作为宿主验收：用 `npx create-axmorf-studio@next upgrade` 将维护者的 0.1.21 Workspace
就地升级到 `0.1.23-rc.2`（16 秒，doctor 六项通过，20 个作品与交付保留，替换文件已备份），再按 Skill 完成
`https-handshake-20261014`。这次运行按 Workspace 保存的偏好使用 inline 执行，由 Root 依次完成 Scene、GlobalVisual
与 Cover；Edge TTS 首次返回 429，经维护者授权重试一次后补齐两段配音。交付 44.47 秒、1080×1920、30fps，
exact 四文件复验通过并完整解码，-15.7 LUFS、-2.3 dBFS。以原始配乐作参照逐 0.5 秒估计成片中的配乐增益：
旁白期间稳定在 0.08–0.10（设定 0.09），旁白结束后 8 帧内升到 0.239（设定 0.24）。抽帧确认全幅取景逐段变化、
钥匙高潮对齐小节线与重音、标题之外没有冗余文字。这不等于 Codex 的原生验收，也未经人工试听。

制作中发现的限制：Scene 源码不能出现 `https://` 字面量（地址栏只能显示域名）；封面不能用 `url(#id)` 引用
SVG 渐变；GlobalVisual 不接受 `.map()` 生成的子元素；运行时升级后，较旧 Project 的 catalog 快照漂移，导致无法 inspect。

## Workspace 升级、配乐与卡点（2026-10-14）

只升级 `@axmorf/studio` 会让 Workspace 的 Skill 停留在旧版本，bootstrap 还会因 runtime facade 过期而失败。新增
`npx create-axmorf-studio@latest upgrade`：同步产品托管的 Skill、指南、facade 与 npm scripts，合并 `package.json`，
运行 install、bootstrap、doctor；被替换的文件先备份到 `.axmorf/backups/`，任一步失败都会还原。`.axmorf/managed.json`
记录托管文件 checksum，便于识别本地修改。用 npm 上的 0.1.21 真实创建 Workspace 后升级到 0.1.22，doctor 六项通过。

rc1 验收片的配乐只有正弦波音色，音量固定为 0.08，段落和画面落点也对不上。新增可选的 `studio-v2` 配乐引擎：
滤波和失谐音色、军鼓与拍手、两小节主题动机、混响与同步延迟、底鼓 sidechain，以及进入鼓组段落前的过门、riser 和 crash；
timeline 冻结 sections/accentFrames，Scene 得到投影后的局部重音。旧引擎配方的音频逐字节不变。`underSpeechVolume`
冻结为 `speechDucking`，Composition 只在实测旁白分段下平滑压低音乐。新增 `snapProducerFrameToBeat`，质量底线加入卡点自审。
量化对比显示新配乐覆盖完整频段，响度动态范围从 5.5 增至 8.6 LU。

## 0.1.22 发布（2026-10-14）

`v0.1.22-rc.1` 由 tag 触发的新发布流程在 CI 中通过完整检查、最小渲染和全新外部安装，以 provenance 发布到 npm `next`。
随后在全新目录用 `npm create axmorf-studio@next` 创建 Workspace，doctor 六项通过；Codex（`gpt-6-astra`）只收到一条普通业务提示词，
完成 `git-bisect-45s` 正式生产：45.13 秒、1080×1920、30fps 的 H.264/AAC 立体声视频，两张封面和 `publish.json`。
exact 四文件已独立复验，可完整解码到 EOF。正文 Scene 首次通过 `project:asset:import` 导入两张生成图片，使用了
`InterfaceWindow`、`TerminalPanel` 与 `SceneTextSafeArea`；Root 用预览自审修正了命令裁切、光带遮挡和 18 帧的数字不同步。
16 帧抽帧审阅确认全幅环境、有体积的主体、逐段变化的取景、精简的文字和真实终端界面；部分帧下半部分偏空，
正文未使用 `ProducerShotStage`。Codex 在运行中读取了其全局记忆，未连续观看或试听。验收通过后以同一源码发布 `0.1.22` 到 `latest`。

## 画面质量与发布流程（2026-10-14）

审阅用户 Workspace 的 17 个 Project 后确认，成片普遍呈现“一 Beat 一页幻灯片”：固定的标题、带框插图、说明与页脚，
主体为手写的简单 SVG，相隔数秒的帧几乎不变，且没有任何 Project 导入过图片素材。已合入默认分支的改动包括：
Skill 的画面质量底线与 commit 前自审清单；`ProducerShotStage` 全幅镜头舞台；`InterfaceWindow`、`TerminalPanel`、
`CodePanel`、`RepositoryCard` 真实界面组件；两个通过真实 Scene 校验的标杆 Scene，Scene executor 可借鉴其技法，
用户历史作品仍不可参考，原创性校验不变。`npm run check:static` 1514 项测试通过，并实际渲染了 1080×1920 静帧。

发布流程简化为两道门：tag 触发的 CI 完整检查通过即发布；预发布版本进入 `next`，真实 Agent 宿主验收后再发布正式版本到
`latest`。不再要求 release plan、验收复用审批或发布后补写的记录。见[发布流程](guides/FIRST_USE_RELEASE_GATE.md)。
这些改进随 0.1.22 发布；既有 Workspace 需更新包或重新创建才能获得。

## Edge TTS 端点迁移（2026-10-13，源码验证完成，未发布）

真实制作首段失败后，用户明确选择保留 Edge TTS 并排查。原 `node-edge-tts@1.2.10` 对旧端点握手返回 403；
同一宿主代理下，隔离安装的 1.2.11 对上游迁移后的端点握手成功，两次诊断均未请求语音。
源码、runtime 与 creator 统一固定 1.2.11；NO_PROXY 按新服务域名判断，错误只额外保留受限 HTTP 状态码和
固定超时信号，不记录任意上游消息、URL 或凭证，不增加重试或替代 provider。
20 项 focused 回归通过；最终全仓验证见上方当前状态。新 Workspace 通过正常 npm install 更新本地 tarball 后，
六项 doctor 通过。正式 prepare 缓存十段配音后遇到 HTTP 429 并停止；用户明确授权后，fresh host probe/inspect
及一次 prepare 仅新增剩余五次请求，复用原十段。全部十五段完成 seal，五个 fresh native workers 提交 artifacts，
唯一 continuation 完成上述正式四文件交付。未切换 provider，也未增加自动重试。
详见[故障与修复记录](evidence/2026-10-13-edge-tts-endpoint-incident.md)。

## 内容画面、原创素材与分段配乐（2026-10-13，源码与渲染验证完成，未发布）

新建正文使用 readability policyVersion 3 / viewport schema 2 全画布，文字通过 `SceneTextSafeArea` 使用独立安全区；
旁白继续保留字幕带。既有 policy 1/2、revision freeze 和固定首尾模板的几何不迁移。场景可独立安排背景图片、
SVG、光色、材质与前景遮挡，theme 仍拥有兜底底色及文字/品牌角色；全局装饰的原有边界保持不变。

`project:asset:import --input` 验证原创生图或静态 SVG，并原子加入 Project manifest、Story pool 和指定 Scene candidates，
支持分组与 silent scene-owner。旧图库 receipt 模式保留；新素材只在首次 inspect 前准入，revision 不扩张素材范围。
创建入口去除 editorial-tech 优先选择，TaskExecutionContract v4 强调编码前的完整画面和具体动作状态。
配乐 helper 可显式编写调性、和声、分段配器/疏密/力度/休止及 swing，旧配方 bytes 兼容。
Skill 使用 policy schema v21 / policy v28，原创素材与编曲细节按需读取，未增加审美评分或自动返工轮数。

素材准入增加真实像素解码、容器完整性与 SVG namespace/XML 校验；常规测试入口补入 project-assets。
silent Scene 的 preset/brief 意图与资源冲突在创建锁之前拒绝，避免延后到素材导入或制作阶段才失败。

此阶段完整 `npm run check` 退出 0：1498 项全部通过，无失败/跳过；类型、Lint、文档、资源、Web/Remotion 构建、
Compositions 和宿主 source gate 通过（当前源码仓库零 Project）。runtime/creator 构建与 package checks 通过；
React Doctor 94/100，无报告问题。实际生图 PNG 与原创 SVG 经隔离 Project 导入并分配到 owning Scene；
两段不同表现的工程样片均为 H.264/AAC stereo、1280×720、30fps、240 帧，完整解码与关键帧查看通过。
两套不同编曲的原创 PCM 也通过合约与完整解码，未宣称主观听审通过。
详见[本轮验证记录](evidence/2026-10-13-content-quality.json)。样片不属于四文件正式交付或独立 Agent 首用验收，
也不作为新默认模板。后续新 Workspace 的正式生产见上方当前状态；原有 Workspace 和既有作品未改写。

## 能力可发现性与首次制作输入（2026-10-13，源码完成、未发布）

新 Project 默认把当前已批准 runtime capabilities 冻结为 Story pool 的 `optionalCapabilityIds`，正文 task 自动
收到相应指南；`resources.capabilityAccess:explicit` 可保留显式限制。媒体准入没有扩大，silent preset 仍要求
消费全部必选资源，可选代码能力不构成使用配额。既有 Project 不迁移，revision 保留冻结集合。

create context 提供用途索引，Catalog 支持 API 名称、用途和中文配方查询。新增六个可编译配方，覆盖分层、3D、
汇聚、连续跟随、颗粒和内容甩镜；59 个固定内容/数据/时序演示 export 明确标注。WhipPan 与 NoiseGrain 改为
接受作品内容或参数的透明组件，不再附带样例文案和配色。该阶段 TaskExecutionContract v3 同步选择与实际调用规则，
不增加审美打分或循环返工要求。Skill 与 creator 入口分别保留宿主职责并同步能力使用指南。
随后内容画面阶段升级为当前 v4，保留这些能力规则。

此阶段完整 `npm run check` 退出 0：1453 项全部通过，无失败/跳过；类型、Lint、文档、资源、Web/Remotion 构建、
Compositions 和宿主 source gate 通过。runtime/creator 构建与 package checks 通过；React Doctor 改动扫描
94/100，未报告问题。真实渲染验证了分层/汇聚/纹理/甩镜与 3D 镜头，H.264 125/60 帧、30fps、360×640，
完整解码与抽帧查看通过。这些是能力工程验证，不是四文件成片交付或独立 Agent 首用验收。
详见[本轮验证记录](evidence/2026-10-13-capability-routing.json)。此时尚未升级安装的 Workspace；后续本地候选生产
见上方当前状态，不改变该工程样片的证据范围。

## 更早的版本历史

0.1.21 及更早各版本的实现、验收与发布记录已归档到
[iteration-status-0.1.21-and-earlier](archive/iteration-status-0.1.21-and-earlier.md)。

## Project production 主链现状（0.1.x 能力，0.2.x 冻结，0.3.0 删除）

下面各节记录旧主链已实现的能力与验证边界，仍约束 `src/projects/` 下的旧作品；新视频使用上文的 direct film。

## 当前结论

当前分支已在 Foundation 主链上实现 npm Workspace 本地 vertical slice：

- 根 package 是 `private` npm workspaces owner；`@axmorf/studio` 提供 compiled ESM public
  exports、单一 CLI、package-owned RuntimeResources、Remotion entry 和预构建 Web；
- `create-axmorf-studio` 以 same-parent staging 原子创建普通独立应用，写入精确 dependencies、marker、
  配置、宿主无关 `AGENTS.md`/Skill，并默认完成 install、lockfile、bootstrap 和 doctor；
- runtime package 现在构建 policy-covered Workspace seed：Mixkit “Movie Trailer Epic Impact” 片头两秒节选、
  Mixkit “Deep Urban” 片尾八秒节选、一个 AXMORF SVG、
  asset manifest 与默认 template audio projection。bootstrap 只创建缺失的保留路径、拒绝不同 bytes/symlink，
  随后重建 Catalog；creator 默认启用首尾 templates，Project create 把实际使用的音频冻结为 Project-local assets；
- `v0.1.3` 按用户明确发布授权把上述两个实际音频节选纳入 Git 与 npm Workspace seed；package
  manifest 记录原文件 checksum、媒体信息和 Mixkit license identity，`THIRD_PARTY_NOTICES.md` 明确它们不受
  repository Apache-2.0 license 覆盖；
- contracts 与 Remotion runtime 的 canonical source 已迁入 runtime package；Workspace 只拥有可写 Project、
  media、config、work/artifact/attempt/out/delivery，以及 catalog/registry 的薄静态 facade；
- Web 只监听 `127.0.0.1`，复用 Foundation 配置/诊断/进度 UI，新增 verified current Delivery player/covers；
  Remotion Studio 继续作为独立实时预览，Web/Studio 都不拥有创作或生产 authority；
- runtime 通过已验证的 package policy manifest 与 package resources 工作，Remotion/FFmpeg/FFprobe/Studio 均解析
  Workspace-local npm CLI JavaScript entry，不依赖 shell、PATH 或 `.bin` 路径。

当前平台策略是 Agent-first capability gate，不是固定 OS matrix：Agent 按 README 创建 Workspace、读取本地
`AGENTS.md`/Skill、准备 package 声明的 Node.js/npm 与宿主前置条件，再以 `npm run doctor` 判定当前环境 readiness。
macOS 15 ARM64 的 package/scaffold native gate 与 Ubuntu 24.04 x86_64 的 packed exact-Delivery E2E 都是
reference environment evidence，不是 runtime allowlist；其他宿主可以尝试通过同一 gate，但未经原生证据不描述为
已认证。Agent 不得修改 package internals、精确依赖、sandbox 或 validators 来强行适配。

仓库和两个 child packages 已采用 Apache-2.0；child packages 已移除 `private`、声明 public publish access，并
补齐 package README/LICENSE/third-party notices。两个包的当前公开版本与源码候选由本页顶部发布收口维护，
不从历史版本小节推断 latest。此前 `v0.1.3` 从 exact tag 通过 Trusted Publisher 纯 OIDC 发布，registry integrity 与
release candidates 一致，provenance、registry signatures 与 attestations 已由外部 fresh Workspace 复验。
GitHub 仓库已转移为 `AXMORF/axmorf-studio`，npm 发布分支是 default branch，旧 `main` 保留。production 与完整
repository `npm audit` 通过精确 overrides 及兼容更新归零；当前依赖版本以 package.json/package-lock.json 和
本轮实际审计为准。macOS 15 ARM64 package/scaffold evidence 与
Ubuntu 24.04 x86_64 exact-Delivery evidence 已完成，固定 OS matrix 已从首次发布 gate 移除；Organization transfer、
release blocker commits、provenance workflow、tag、双包 publish 与 GitHub Release 均已完成。转移后的 macOS full gate 又
捕获 delayed `fs.watch` notification 与 `/var` test alias 两个 portability 边界；最小修复已由 macOS gate
`#33330699611` 完整 Green。该 receipt 的解包比较继续暴露 creator 本地 pack 混入 6 个 Git-ignored template
placeholders；这些 `.gitkeep` 现作为 package source 精确 tracked，并由 `check:package` 锁定。最终 release commit 仍以
自身 macOS receipt 为 authority。exact commit `7b5fea3329d2ef5eb10f82ef67a3606ca5476bfb` 的 macOS gate、npm publish
gate 与 GitHub Release 均已完成；首次发布外部门禁归零。两个 package 的 npm Trusted Publisher 已由用户配置到
`AXMORF/axmorf-studio` / `npm-publish.yml`，publish workflow 已移除 `NODE_AUTH_TOKEN`；`v0.1.2` 已完成真实纯 OIDC
双包 publish、公开 integrity 回读和 receipt upload，不依赖人工 token。

`v0.1.1` 已把 README Agent 入口分成两个阶段：root 与两个 package README 只提供一句 prompt，
要求 Agent 根据项目最新 README 在指定路径完成 Workspace 搭建与可用性验收，并停止在视频生产之前。
creator template README 才在 ready Workspace 中提供下一次视频 prompt，并要求 Agent 读取当前安装版本的 README、
`AGENTS.md`、Skill 与按阶段 references。此前发布的 `0.1.0` tarball 保持 immutable。

仓库当前 production authority 已收敛为 ProductionRevision、content-addressed Task DAG、task workspace、
ArtifactAttestation、reusable Artifact Store、fixed convergence 与 synchronous exact four-file delivery。
当前 authoring/production 主链公开 scripts 为：

```text
project:create
project:asset:import
project:originality:freeze
project:revise:context
project:revise:validate
project:revise
project:revision:promote
project:execution:resolve
project:produce:inspect
project:produce:prepare
project:task:bind
project:task:describe
project:task:finalize
project:task:check
project:task:commit
project:task:fail
project:task:file-read
project:task:file-write
project:attempt:recover-inspect
project:attempt:reissue
project:produce:continue
```

旧 production/delivery/build command surface 与对应 active contracts/implementation/tests 已移除，不提供转发
shim。历史 `.producer-runs` 数据保持原位，但 current prepare/convergence/build/settings 不读取；删除器内部只
保留 strict ownership parser。

当前 checkout 没有 source Project 或 current Delivery，ProjectRegistry 为 0 entry；这验证了 zero-Project
bootstrap/Registry/Catalog/settings 合同。readiness、cache reuse 与 dirty task estimate 始终都不是完成证据。

当前 repository video Skill policy schema v20 / policy v27 定义了 pre-inspect external-asset Agent capability slot 与
isolated Project revision flow：外部能力只按
当前 Root Agent 的实际 callable MCP tools 激活，缺失时完全省略；激活后也必须先查本地 Catalog，再通过
`project:asset:import` 把选择准入为 Project-owned 输入。该 slot 不创建 DAG node，也不进入 child/runtime。

## 已实现 contracts 与 domain

- `ProjectCreateInput`、structured `AuthoringValidationIssue`、`ProjectRevisionInput/Context/CandidateRecord`、
  `SceneOriginalityBaseline`、`ProductionInspection`、`TaskDecisionExplanation`、`ProductionRevision`、
  `ProducerTaskSpec/TaskRevision`、`TaskExecutionContract`、`TaskWorkerBinding`、`ArtifactAttestation`、
  `ProducerPlan`、`ExecutionAttempt`、
  `DeliveryBuild/DeliveryPublish`；
- Revision/DAG/invalidation/plan pure domain；DAG cycle/duplicate/unknown dependency/stable ordering gates；
- renamed Project authoring contracts `authoring-requirements` 与 `scene-readability`，不导出旧 runtime authority；
- `production-requirements-current-v4` / `scene-composition-boundary-v2` clean-break：Composition 拥有
  raw readability policy 与 inset，SceneTask v7 只接收 Scene-only requirements 和派生的
  safe-area-local SceneViewport，ScenePackage v6 绑定 `scene-visual-runtime-v3`；
- attempt/time/path/process/explanation identity exclusion、safe diagnostic input IDs、typed artifact state、direct
  snapshot diff 与 DAG dependency propagation tests。

## 已实现 create、inspect 与 prepare

- `project:create` 从 strict repository-relative input 原子创建 configured authoring；相同 creation identity
  只读 current，existing/partial/conflicting/symlink/path escape/special file fail closed；
- create 与 revision validate/create 在 mutation 前共享 structured authoring validation；caption issue 使用
  `authoring-validation-failed` / `caption-display-budget-exceeded` / `caption-display-unit-v1`，每个 authored
  `ttsChunk` 上限 72 display half-units；
- create 同事务冻结其他 Project 的完整 Scene TS/TSX source-graph baseline；existing create 复用自身 baseline，
  legacy Project 通过显式零 provider、持锁 `project:originality:freeze` 迁移，缺失时 production fail closed；
- create 保留 authored Story/`ttsChunks`，复制 boundary template 与 sound/catalog projection，但零 provider、
  零媒体生成，且不写 narration work、artifact、workspace、attempt 或 delivery；
- `project:revise:context` 只读复验 exact current Revision 与 four-file Delivery；validate/create 使用 strict raw input，
  在 `.producer-revisions/<storyId>/<candidateId>` 隔离 source/public/narration/work/attempt/out/delivery，promotion 前不改
  live Project/Delivery；
- `project:produce:inspect` 通过 check-only ports 返回 sourceState、baseline、unknown-safe estimated cost、
  structured task explanations 与 nextAction；前后 snapshot drift fail closed，零 provider/零 repository mutation；
- `project:produce:prepare` 是唯一有成本入口，负责 provider/cache/seal/master/timing、timing-bound authoring、
  fixed artifacts、Revision/DAG、dirty Agent workspaces 与 ExecutionAttempt，并区分 estimated/actual cost；
- explanation/baseline/attempt 只属于 diagnostic plane，不改变 Revision、TaskRevision、ArtifactAttestation、
  dispatch、materialization 或 DeliveryBuild identity/authority。

## 已实现 workspace 与 Artifact Store

- `.producer-work/<storyId>/<taskRevision>` strict resolution、immutable `task.json`/context/task-contract seeds 和
  exact cleanup；TaskExecutionContract 是 attempt-neutral content input，不包含 transport/binding/commands；
- Agent task 把 canonical task-contract fingerprint 纳入 TaskRevision；这一 clean break 使既有 Agent task artifacts
  一次失效，但不改变 ProductionRevision 或已验证 current delivery；
- workspace/output path containment、regular/no-symlink、unknown/special file rejection；
- exact TaskRevision/attemptId 派生 binding ID；`task bind` 在任何 task content read/write 前执行 zero-write
  identity/attempt/checksum/contract gate，只有 `task-worker-bound` 返回 capability；
- shared-workspace 只允许 binding 返回的 relative workspace/declared files；controller-io 没有 filesystem access，
  file-read/file-write 对 logical path、symlink/special file、strict base64 body/byte cap 与 atomic replace fail closed；
- fixed check、commit-time recheck、attestation generation、same-parent staging、atomic promotion、identity conflict
  与 rollback；
- `.producer-attempts` append-only diagnostics；task/delivery terminal 使用 deterministic event key 原子
  compare-and-create，冲突不可被 projection 顺序覆盖，写入失败不污染 artifacts；
- commit/fail terminal events 与 continuation/converge 都绑定 exact attemptId，不按 latest attempt 串线；
  continuation 具有 one-shot atomic claim。

## 已实现 planning 与 task owners

- read-only current-plan builder 从 current Project contracts、template instances、asset manifest/selected bytes、narration identity 和
  runtime policies 计算 Revision/Task DAG；
- Scene、GlobalVisual、Cover workspace validators 与 commit flow；
- template-copy Scene 固定任务，不进入 Agent dispatch；共享 canonical builder/output contract 同时物化 copied
  source/assets 与完整 derived Scene bundle，并保证 create-only/fixed-prepared/materialized replan 的
  TaskRevision 稳定；
- originality baseline 只绑定 `scene-owner` TaskRevision/context，template-copy 豁免；Scene validator 拒绝 frozen
  historical graph，converge 在 materialization 前拒绝同 revision exact/normalized duplicates；
- GlobalVisual fixed layer policy 从 canonical SemanticTiming 派生：base 覆盖完整 Composition，decoration 只覆盖
  首个至末个 narrated Scene 的连续窗口并使用 window-local frame zero；生成式 Composition 分别挂载两个 no-Props
  exports，validator 拒绝 Scene output、Beat 文案和越界 continuity window；
- configured template 的 Project-local `Renderer.tsx` 实现当前 `SceneRendererComponent` viewport props，并把
  `viewportWidth`/`viewportHeight` 适配为冻结模板内部的 `width`/`height`；模板源码不拥有 SceneViewport 或
  full-frame policy，既有 Project copy 也不会被共享模板修复静默改写；
- `DefaultOutroPreview` 的 AXMORF mark/wordmark 使用同一个 responsive lockup box 居中，图标初始展开位置与
  最终组合中心在 portrait/landscape 都有确定性回归；
- Root-facing prepare 输出 stable reuse/dirty/blocked summary、逐任务 direct/dependency/artifact 解释和 dirty Agent
  TaskRevisions；
- Scene executor 继续受 Workspace-local `remotion-best-practices`、Scene-only requirements、本地
  SceneViewport、resource/license 与 Remotion runtime gates 约束；它不感知 full-frame 安全区 inset。
- Scene owner context 现提供完整 Scene brief、VisualStyleSpec 和封存旁白的 Scene-local chunk 帧区间；
  TaskExecutionContract 要求开场、可见变化、结果与镜头/旁白同步，`scene-owner-validator-v4` 拒绝原样提交
  Renderer scaffold。任务 context/contract 变化只失效相应 Agent TaskRevision。
- `project:scene:review` 在复验 current Delivery 与 SemanticTiming 对齐后，为每个 Scene 生成三帧本地
  review 页面，保存在 ignored `out/<storyId>/scene-review/`；可选 `--motion` 增加保留音轨的完整 Scene
  和跨边界重叠 MP4/播放器，仍不自动批准动态质量；人工画面复核不属于自动生产完成门槛。
- execution resolver 已按用户提示词明确字段、独立 settings、内置 `subagents`/4 默认逐级解析；全新 scaffolded Workspace
  默认要求宿主提供 bounded runtime-native children 并为本次 production 验证
  `shared-workspace` 或 `controller-io` transport 时启用，最多四个。transport 不写 execution preferences，也不进入
  Revision/Task/artifact/delivery identity。
- prepare 的每个 dirtyAgentTask 返回 `bindingId`、shared/controller bind commands、describe/finalize/check/commit、
  task/fixed/spawn failure commands。describe/finalize/check/commit/authored task failure 要求 full binding；Root-only
  spawn failure 与 immutable/controller fixed failure 只持有更窄的 terminal authority，不能访问 task content。
- `AGENTS.md` 是唯一 repository Agent authority；`CLAUDE.md`/`GEMINI.md` 只导入该文件，OpenAI Skill metadata
  只提供可选 UI 展示。生产脚本不调用任何厂商 Agent SDK。
- continuation 启动后 Root 不参与 barrier；event-driven fixed continuation 读取 immutable event log，在 task
  failure 或 attempt 创建起一小时 terminal deadline 到期时直接退出，在全部成功后只调用一次 converge，fixed failure 不自动重试。Root 按 Skill 诊断，有界恢复只覆盖视频任务错误。
- terminal failed attempt immutable；`project:attempt:recover-inspect` 严格只读、零 provider，并要求 failed terminal、
  no active attempt、same current Revision、no dirty fixed work；下游 blocked 必须追溯到可恢复 Agent root。
  `project:attempt:reissue` 在 lock 内重检，零
  provider、不要求 current delivery，复用 valid artifacts/drafts 并创建 fresh attempt/bindings；stale/active/
  fixed-flow recovery 拒绝。

## 已实现 convergence 与 delivery

- converge 只读 replan，零 provider/workspace/new attempt；stale revision/incomplete artifact 在任何 live mutation
  前拒绝；
- task-owned staging、controlled replace、rollback 和 materialized bytes revalidation；
- ScenePackage、Coverage、RendererRegistry、GlobalVisualPackage 与生成式 Composition fixed refresh；
- build-owned staging、validated media reuse、synchronous Remotion/FFmpeg、H.264/AAC/channels、dimensions、fps、
  frame count、PNG、checksums 与 EOF decode；
- `publish.json` 最后写、exact four files、controlled current replacement 与 same identity no-op。
- candidate exact-four Delivery 完成后自动尝试 promotion；锁内复验 live base 与 expected candidate Revision/Delivery
  tuple，受控替换 source/public/narration/delivery 并刷新 Registry/Catalog。失败完整 rollback，保留 candidate 供
  `project:revision:promote` 独立幂等重试，不借 attempt reissue 修复 promotion。

## Settings、删除与 zero Project

- settings schema v5 展示 sourceState、current Revision、estimated/actual cost、逐任务 structured explanation、
  latest attempt diagnostic 和 four-file delivery；不输出 raw fingerprints/private authoring/provider data；
- 独立 `private/execution-preferences.json` 以 strict contract/`0600` 原子保存 Root inline 或 subagents 最大并发
  偏好，文件缺失时使用内置 `subagents`、最大并发 4；它不改变 ProducerConfig fingerprint，当前用户提示词 override 不自动持久化；
- source Project enumeration 不读取 historical data，也不把 output-only roots 伪装成 Project；
- deletion scope 增加 `.producer-work`、`.producer-artifacts`、`.producer-attempts`、`.producer-revisions`，继续保护 private、voice、
  shared/core 与 other Projects；
- bootstrap、Registry、Catalog 和 settings 支持 zero Project。

## 验证边界

2026-08-30 的 package 验收在仓库外使用真实 `.tgz` 完成：creator 默认流程创建 Workspace，删除并通过
`npm ci` 重装后 doctor 五项检查通过；public `/contracts` 与 `/remotion` imports、三个 Remotion compositions、
Web static/API/CSP、浏览器交互、zero-provider `project:create` 和只读 inspect 均通过。packed runtime 只含
allowlisted `package.json`/`dist/**`，CLI 保持 executable；host-neutral Skill 扫描未发现特定 Agent host、会话或
child tool 假设。

生成的 Workspace scripts 现在机械包含 inspect 前必需的 `project:execution:resolve`，并由 scaffold contract
regression 锁定。

脚手架实现提交 `2bac738d4b24745b6bd10be386257dff7c60c4d1` 已通过
[macOS npm Workspace gate #33291456702](https://github.com/agenticnoob/axmorf-studio/actions/runs/33291456702)：
`Darwin arm64`、Node `v24.16.0`、npm `11.13.0` 上完成 repository/public package gates、两个真实 tarball
pack、全新外部 Workspace 安装、doctor 五项检查、三个 Remotion compositions 与双侧 audit；下载后的两个 tarball
SHA-256 与 CI receipt 一致。artifact `9726110695` 的 digest 为
`sha256:2d0a74df869a1ec43ee294640f0bb8e0c7d8dbf7eea426d6ad80b01ab2c16b46`。

Ubuntu 24.04 x86_64 随后从新 pack 的 runtime/creator tarballs 创建 clean Workspace，完成 doctor、官方 registry
零漏洞 audit、strict Project create、execution resolve、inspect/report、provider narration、四个 bounded Agent
tasks、one-shot continuation、convergence、Remotion render 与 exact four-file Delivery。terminal 为
`project-production-complete`；H.264/AAC 1080×1920/30fps video、两张固定尺寸 PNG、checksums 与 bundled FFmpeg
EOF decode 全部通过。完整 receipt 见
[Ubuntu npm Workspace production acceptance](evidence/2026-08-30-ubuntu-npm-workspace-production-acceptance.md)。

新增 revision/originality/task-binding/reissue/GlobalVisual contracts 后，同一 Ubuntu 24.04 x86_64 宿主又从当前
snapshot 的两份真实 tarball 创建并以 `npm ci` 重装外部 Workspace；doctor、官方 registry 零漏洞 audit、public
imports、精确 Remotion 版本、packed Web HTTP 与 compositions 均通过。`ubuntu-current-features` 使用 verified
`shared-workspace`、四个 attempt-bound task bindings 和 one-shot continuation 抵达新的
`project-production-complete` exact-four Delivery。candidate promotion 与 failed-attempt reissue 在 repository
tests 中验证，本次 packed Project 没有伪造对应 runtime receipt。完整事实见
[Ubuntu npm current-feature re-acceptance](evidence/2026-08-30-ubuntu-npm-current-feature-reacceptance.md)。

2026-08-31 release closeout 从 current source 再次构建两份真实 tarball 并完成双包 publish dry-run。packed runtime
在同一外部 `ubuntu-current-features` Project 上以 `inline` 执行三个因 runtime identity 失效的 Agent tasks，复用
五个 artifacts 与两个 provider cache hits，零 provider request，one-shot continuation 抵达新的
`project-production-complete` exact-four Delivery。packed Web 的 progress/current Delivery API、Range video、双 Cover、
桌面播放与窄屏加载均通过真实浏览器验证。另一个从零消费者 Workspace 使用 creator 默认流程安装，随后以 lockfile
执行 `npm ci`，public exports、doctor、三个 compositions 与 official-registry audit 全部通过。完整 receipt 见
[npm release closeout](evidence/2026-08-31-npm-release-closeout.md)。

exact `v0.1.0` tag 已公开发布 `@axmorf/studio@0.1.0` 与 `create-axmorf-studio@0.1.0`。最终 publish gate
`#33362584883` Green；外部 official-registry creator 安装、doctor、compositions、public imports、零漏洞 audit、
250 个 registry signatures 与 47 个 attestations 均通过。首次新包写入后 packument 曾短暂 E404，后续 workflow 已增加
bounded registry visibility retry，并将 checksum receipt 改为 portable basename。

exact `v0.1.1` tag 随后公开发布当前 `@axmorf/studio@0.1.1` 与 `create-axmorf-studio@0.1.1`。该版本把
AXMORF-owned 首尾音频与品牌素材纳入 policy-covered runtime Workspace seed，creator 默认启用首尾 templates，
Project create 把实际使用的音频复制为 Project-local resources。macOS exact-commit gate `#33627797623` 与纯 OIDC
publish gate `#33628246765` 均 Green；official-registry fresh creator 安装、doctor、零漏洞 audit、250 个 registry
signatures 与 49 个 attestations 全部通过。完整事实见
[v0.1.1 shared Workspace media release](evidence/2026-09-02-v0.1.1-shared-workspace-media-release.md)。

exact `v0.1.2` tag 修复 System 首尾预览的 audio projection 默认值：`DefaultIntroPreview` 与
`DefaultOutroPreview` 现在从 package-owned manifest 解析并挂载共享 WAV，不再生成只有静音 AAC 的 MP4。macOS exact
release gate `#33663623305` 与纯 OIDC publish gate `#33664081626` 均 Green；显式锁定 official registry 的 fresh
Ubuntu creator Workspace 已复验 Studio 两条未静音 audio element、WAV HTTP 206、两个 H.264/AAC render 的实际音量、
零漏洞 audit、250 个 registry signatures 与 49 个 attestations。完整事实见
[v0.1.2 System preview audio release](evidence/2026-09-03-v0.1.2-system-preview-audio-release.md)。

exact `v0.1.3` tag 把当前项目配置的 Mixkit 片头 impact 两秒节选与片尾 “Deep Urban” 八秒节选作为
policy-covered Workspace seed 发布，并让 root factory 接收 Workspace-local audio projection。Studio 在 root mount 时
预取两条音频，preview 使用 `preload="auto"` 与 `pauseWhenBuffering`。纯 OIDC publish gate `#33971031243` Green；
official-registry empty-cache fresh Workspace 已复验精确音频 checksum、doctor、compositions、两段非静音 H.264/AAC
render 和真实浏览器首响延迟。完整事实见
[v0.1.3 Mixkit bookend audio release](evidence/2026-09-05-v0.1.3-mixkit-bookend-audio-release.md)。

用户明确授权后，受控 Project delete 又在上述真实 production Workspace 的一次性副本执行。缺少
`--confirm-delete` 时命令 exit 1 且 Delivery checksum 不变；exact confirmed command 清理 source/public/narration/
work/artifact/attempt/delivery ownership roots，Project Registry 归零，同时保留 package/lockfile、private config、
Agent instructions、共享 Catalog 资源和 Workspace entry。删除后的 doctor、三个系统 compositions、Web root 与空
progress API 均通过；原验收 Workspace 与 exact-four Delivery 未变。

closeout 同时修复了 packed Web 暴露的三个 release blocker：progress projection 现在携带 package runtime policy
manifest；三秒轮询会合并仍在执行的请求，不再反复 abort 较慢的只读 inspect；Delivery Range stream 在正常结束、
错误与客户端中止时都显式关闭 `FileHandle`。对应 server/UI/`/proc/self/fd` regression 已加入完整 gate。

本轮同时修复了 packed boundary 暴露的四个问题：scaffold execution resolver 缺失、bundled FFmpeg 不提供 raw
`s16le` muxer、scaffolded `remotion.config.mjs` 未进入 Workspace configuration snapshot，以及 EOF decode 默认选择
缺失的 `wrapped_avframe` encoder。音频现在经 PCM WAV 解码后由 Node 重建 canonical WAV；video/Cover decode
显式选择 bundled `rawvideo`/`pcm_s16le` encoders；Workspace 必须恰有一个受支持的 `.mjs` 或 `.ts` Remotion config。

未认证宿主仍按 capability gate best-effort 接入，不预先阻塞，也不描述为已验证支持。consumer production 与完整
repository audit 均为 0 finding。Remotion 继续精确锁定 4.0.489；安全处置没有运行不受控 `audit fix`，而是固定
传递版本并单独升级兼容的开发工具。ESLint 保持 9.39.5，因为 Remotion 当前内置的 TypeScript ESLint 8.21 peer
range 不支持 ESLint 10。Git push、GitHub Organization transfer、exact tag、双包 npm publish 与 GitHub Release 已执行。
post-transfer macOS gate 的两个 portability 修复已完成本地 package/fresh-consumer/packed-production/Viewer/delete
复验；creator ignored-placeholder 污染已在 package boundary 修正，最终 exact release commit 的 macOS gate
`#33331148535` Green，Linux/macOS 双包 tarball 逐字节相同。

focused create/contracts/explanation/inspect/prepare/converge/settings/E2E tests 已验证原子 create、inspect
零写入/零 provider、dirty-only dispatch、精确 direct/dependency/artifact explanation、诊断隔离、安全边界、
历史隔离、current no-op 与 delivery failure reuse。

本轮 closeout 已运行完整 `npm run check`：666/666 tests，以及 typecheck、lint、docs links、Catalog/Registry、
配置构建、Remotion bundle/compositions 与 host Project gate 全部 Green；`npm run packages:typecheck` 和 release-focused
17 tests 与 macOS portability-focused 22 tests 也通过。文档 closeout 后另行重跑 docs links 与 diff checks。GitHub
Organization transfer、default branch 切换与 publish workflow 已执行；post-transfer portability 已有 Green receipt，
creator placeholder package boundary 进入最终 exact-commit gate。push 后同时发现并修复 publish workflow 的 job-level
`runner.temp` context 解析错误；`v0.1.0` npm publish、tag 与 GitHub Release 已完成，最终 publish/integrity gate
`#33362584883` Green。受控 Project delete 只作用于一次性验收副本。

## 当前非目标

远程 scheduler/database/artifact store、平台发布、账号、上传、child identity persistence、subjective quality
gate、automatic capability promotion、Docker 和新的 TTS Gateway 均未实现。
