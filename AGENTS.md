# Remotion Story Producer Agent Guide

本文件定义仓库内 Agent 的执行规则。默认中文交流，先给结论，再给最少必要依据。

## 权威文档

- 产品最终目标：`docs/FINAL_PRODUCT_GOAL.md`
- 外部生产流程：`docs/PRODUCTION_WORKFLOW.md`
- 当前实现状态：`docs/ITERATION_STATUS.md`
- 实施顺序与阶段门槛：`docs/ROADMAP.md`
- 系统结构：`docs/ARCHITECTURE.md`
- 确定性执行：`docs/DETERMINISTIC_EXECUTION.md`
- 名词边界：`docs/TERMINOLOGY.md`

文档冲突时，先以可执行代码和测试确认当前事实，再同步状态文档；不能把目标设计说成
已经实现。

## 工程边界

- 只使用宿主机 Node.js/npm 与 Remotion CLI；不新增 Docker、docker-compose 或
  容器验证流程。
- 所有 `remotion` 与 `@remotion/*` 包保持完全相同的精确版本。
- 一 Story 对应一个 Composition；一 StoryBeat 对应一个 `meaningId` 和一个 Scene；完成
  视听制作的 Scene 对应一个 ScenePackage。ScenePackage 内聚画面与 Scene 局部声音，但不
  拥有旁白、字幕或全局 BGM。
- `ttsChunks` 是创作决策已经确定的朗读单元；工具不得按标点自动拆分，额外叙事停顿
  必须显式声明或来自封存音频的实测自然静音。
- 实测旁白时间是绝对时间权威；Scene 和转场不得移动、缩短或吞掉 spoken frames。
- TTS 波形不假定 bit-by-bit 可重复；生成结果必须经实测、checksum 和 fingerprint
  封存后才能成为后续时间权威。
- 字幕只由顶层 `CaptionLayer` 渲染；Scene renderer 只输出视觉。
- JSON/数据文件不得包含 JSX、任意代码、任意动态模块路径或可执行表达式。
- 每个 ScenePackage 只绑定一个 Scene 级 `rendererId`；ShotPlan 不绑定 `rendererId` 或
  模块路径。
- Scene renderer 必须通过 composition-local 静态 registry 绑定；它可以在内部拆分
  本地 Shot 组件并调用已批准共享能力，但这些内部组件不是 runtime registry 入口。
- render runtime 不调用 Agent、skill、MCP、Git、网络服务或目录扫描。
- 所有选中视觉与音频资产必须位于仓库 `public/`，有 manifest 元数据并通过校验。
- 所有 render-critical motion 使用 Remotion frame API；禁止 CSS animation、
  CSS transition 和 Tailwind animation utilities。

## 当前里程碑边界

- M1–M4 已实现 Scene 之外的叙事生产主链和机械验证闭环：VideoBrief、StorySpec、
  NarrationSpec、RenderSpec、StoryBeat、已创作的 `ttsChunks`、StoryCheck、真实 VoxCPM
  生成与封存、SemanticTiming、CaptionCue、透明 NarrativeCore、generated static
  ProjectRegistry、lazy-loaded Story Composition、真实 preview/render、M3 evidence，以及固定
  `project:check --level narrative`、可持久化 AutoCheck 和隔离失效矩阵。
- M4 只实现机械 AutoCheck，没有增加主观叙事质量复核或 `proceed/revise`。
- M5 ScenePackage 视听制作规格已于 2026-08-02 获用户正式批准。M6 已实现
  VisualStyleSpec、ResourceCatalog、不可变外部参考、本地化/保真 receipt、Scene 视听合同、
  ScenePackage/Coverage、composition-local RendererRegistry、visual/local-sound runtime、
  final-level 机械基础和独立 synthetic proof。M7 已为 `gps-relativity` 完成五个正式
  ScenePackage、全 ready coverage/registry/projection、批量 SceneVisual/SceneSound/连续性
  review、真实 contact sheet/正常速度 preview 和 passing final report。
- M8 已在不修改 M1–M7 权威的前提下完成 `GlobalSoundPlan`、原创全片 BGM、跨 Scene
  ambience、确定性 ducking、`FinalSoundProjection`、project-local `GlobalVisualLayers`、
  `FinalAssembly`、完整正常速度最终预览、用户 `FinalPreviewApproval` 和 passing
  `final-mechanical-check-v2`。M6 synthetic proof 仍不是正式 Story Scene。
- M9 已用 `product-comic-vertical` 完成第二主题、真实用户批准、passing v2、42-case matrix
  和泛化报告。M9.5 已按归档的历史实施计划
  `docs/archive/implementation-plans/2026-08-04-m9-5-contract-driven-production-orchestration-plan.md`
  实现数据合同驱动生产编排：`ProductionRequirementsFreeze`、append-only ProductionRun、
  固定 `production:*` CLI、Scene result/watcher 和无全局增强的 mechanical Preview 已落地。
  M10 发布、NarrativeCheck 和 promotion 仍未开始。
- ProductionRun 状态只能由 append-only 事件、Scene/GlobalVisual result 合同和 current
  fingerprints 复算；
  子 Agent 不修改中央 state，中央脚本是唯一 writer。主 Agent 分发 Scene 后保持当前任务运行
  并等待 watcher，但 repo 脚本不创建 Agent，也不承诺主任务结束后的 detached lifecycle。
- M9.5 第一版不生成全片 BGM、跨 Scene ambience、ducking 或独立 GlobalVisualLayers；不
  运行 Agent Scene 审美 gate。成功终点只能是等待用户观看的 `preview-ready`，不是批准或发布。
- 后续 production hardening 已实现 `ProductionRequirementsFreeze` v3、Run-before-write
  VoxCPM/Chromium preflight 与 `scene-composition-boundary-v1`。Composition exactly once
  提供 `SceneSafeArea`；Scene Renderer 根节点透明，只拥有当前 Beat 的语义视觉，不绘制
  Scene-local 背景、安全区底板、全帧纹理或装饰。已有 v1/v2 Run 与正式作品不迁移、不回填。
- 当前 future-only v4 production 在同次 freeze 后并行分发 N 个 Scene assignment 与一个
  whole-film GlobalVisual assignment，通过各自 immutable result 合同汇合。GlobalVisual 只拥有
  project-local 背景、纹理、装饰和连续性 motif，不读取 Scene 输出；repo 不监控或保存
  Agent/task/thread/progress/heartbeat 状态。已有 v1-v3 Run 和正式作品不迁移、不回填。
- M6 的 Scene 级 renderer/runtime 不得成为 Narrative Baseline 的前置条件，也不得反向修改
  Story、旁白、字幕或实测时间线。M8 不得重做五个 M7 ScenePackage；Scene-local
  ambience/SFX 仍由 ScenePackage 拥有，GlobalSoundPlan 不建立第二份 Scene SFX 权威。
- `GlobalVisualLayers` 只拥有 project-local 全局纹理、装饰和连续性 motif，不渲染字幕，
  不得扩张为通用 Track、Scene DSL、自动布局器或自动导演。`CaptionLayer` 仍是唯一顶层
  字幕权威。
- `FinalPreviewApproval` 只由用户明确决定产生，必须绑定 current preview checksum、
  evidence fingerprint 和 FinalAssembly fingerprint；Agent review、脚本或 checker 不得代签。
- ProjectRegistry 在 bundle 前按固定一级目录约定生成静态 TypeScript；注册元数据必须
  预先可枚举，Composition 代码通过 Remotion `lazyComponent` 和字面量 `import()` 按需
  加载。`Composition.tsx` 必须 default export。
- 目录发现只允许发生在固定生成步骤；render runtime 不扫描目录、不读取 JSON 模块路径，
  也不能为了列出 Narrative Baseline 而加载 Scene renderer。ProjectRegistry 与
  composition-local RendererRegistry 分离。
- RenderSpec 是用户每次制作直接给 Agent 的输入；Agent 只结构化并机械校验，不把它
  放进 StoryCheck，也不要求用户二次确认。
- 音频到帧必须按 sealed PCM 的累计整数 sample-frame 边界统一执行
  `ceilDiv(samples × fps, sampleRate)`；禁止逐 chunk 将浮点秒数转帧后累加。

## Scene 制作来源

制作新 Scene 只允许参考：

1. 当前 Story、StoryBeat、实测 timing、VisualStyleSpec、SceneVisualPlan、SceneSoundPlan
   与相邻连续性；
2. 当前 ResourceCatalog 中已登记的共享能力与本地资产；
3. 当前方案显式选择并已本地化的上游来源。

`video-shotcraft` 等来源只能通过冻结的完整 commit、Gallery card/style-key、完整配方、准确
demo 与最小依赖闭包进入 Scene；不得只凭卡名/参数近似重写，不得直接 import 上游仓库、
package、远程 URL 或全局 skill。Gallery preview 只用于选型和保真证据。第三方代码与媒体
资产分别校验 license/attribution；未确认的 bundled audio 不得进入 ScenePackage。

不得搜索、打开、比较、模仿或复制旧生产 Scene、旧 Composition、still、
contact sheet 或历史布局来制作新 Scene。历史诊断必须与新 Scene authoring 隔离。

## 共享能力提取

新实现默认留在 `src/projects/<story>/`。只有形成带 fingerprint 的具体 promotion
proposal，并得到用户对范围、API、文件和目标位置的明确批准后，才允许移入
`src/remotion/capabilities/`。证据充分不等于授权，笼统认可不等于后续提取许可。

## 审核

- `AutoCheck`：固定聚合 source contracts、StoryCheck identity、sealed narration、
  SemanticTiming、ProjectRegistry、Narrative Baseline 与 M3 evidence 的机械检查；
- `StoryCheck`：调用外部旁白生成前，由 Agent 检查 StoryBeat 顺序、`ttsChunks`、叙事完整
  性和 voice profile 选择，不阻塞用户；
- `NarrativeCheck`：Agent 批量检查 Story 完整性、旁白可懂度、字幕对应和叙事节奏；
- `SceneVisualCheck`：历史 M7–M9 在 Scene 阶段使用的批量 Agent 语义、构图、运动与连续性
  记录；M9.5 第一版不把它作为新作品 gate；
- `SceneSoundCheck`：历史 M7–M9 使用的 Scene 局部 ambience/SFX、同步、音量与固定 Beat
  窗口 Agent 记录；M9.5 第一版只做脚本机械检查；
- `FinalPreviewApproval`：默认唯一必须由用户作出的创意批准；GPS M8 已有 current、
  checksum-bound 的正式批准，任何装配或媒体 identity 变化都会使其失效；
- Shotcraft fidelity 仅在 Scene 显式选择 Shotcraft recipe 时执行；exact 模式必须证明 immutable
  lineage、准确 demo、最小本地化依赖闭包、真实 Renderer/frame-state binding、配对证据和
  正常速度可辨识度。motion strip、benchmark、封面和 promotion review 仍只在命中对应条件
  时执行。

不要为每个 Scene、每个 still 或每个脚本步骤反复要求用户审批。

## 修改与验证

- 保护用户现有未提交修改；不重置、不覆盖、不顺手整理无关内容。
- 删除、覆盖、强推、生产发布、密钥或权限变更必须有明确授权。
- 修改后先跑聚焦检查，再按风险运行 `npm run check`。`npm run check:static` 是不启动
  Chromium 的沙箱安全子集；`npm run check:host` 是需要宿主权限的浏览器/真实作品门禁。
- `scripts/production/` 只保留 CLI 入口；用例编排、纯领域规则和外部 I/O 分别位于
  `application/`、`domain/` 和 `adapters/`，新增代码不得重新平铺到根目录。
- `npm run check` 与 `npm run compositions` 首次执行必须直接使用宿主权限，因为两者都会
  直接或间接启动 Remotion Chromium。所有 `remotion compositions`、`remotion still`、
  `remotion render` 及会调用它们的 production 命令同样不得先在受限沙箱试跑。
- 真实 production preflight 必须直接以宿主权限运行；沙箱内失败只能作为环境诊断，不能据此
  判定 VoxCPM 不可用。不得为了通过检查而预热、发送测试 TTS、fallback 或降低 Chromium
  sandbox 安全设置。
- 新 Composition 至少通过 `npm run compositions`，高风险视觉改动补真实 still 或短片。
- 完成代码或配置任务后检查 README、状态、架构和合同是否需要同步。
- 不 push，除非用户明确要求。
