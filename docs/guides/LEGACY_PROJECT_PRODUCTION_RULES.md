# 旧 Project production 主链规则

> 文档类型：Agent 规则（按需读取）
>
> 归档状态：0.1.x 的 Project production 主链在 0.2.x 冻结、0.3.0 删除。修改 `scripts/project-production/`、
> `scripts/projects/`、旧主链 contracts、`.agents/skills/axmorf-video/`，或在 Workspace 中制作/修订 `src/projects/` 下的旧作品前，
> 必须完整读取本文件。下面的规则从仓库 `AGENTS.md` 原样迁出，约束力不变。

## 通用 Agent 入口

- 先按 assignment 路由：已有 exact attempt-bound task bind 的 worker 直接按 Skill task protocol 绑定并执行该任务；
  不重跑全局 doctor/preflight、browser preparation、Project create/revise、execution resolve、inspect/prepare、provider 或 continuation。
  这些是 Root 职责；worker 的输入、写入和命令范围由成功 bind 与 TaskExecutionContract/validators 决定，不能因环境错误扩大。
- `AGENTS.md` 是唯一仓库级 Agent 指令 authority。`CLAUDE.md`、`GEMINI.md` 与任何宿主专用 metadata
  只能作为导入或发现 adapter，不复制、覆盖或扩展这里的规则。
- 处理视频创建、生产或交付时，即使宿主不会自动发现 Skill，也必须手动读取
  `.agents/skills/axmorf-video/SKILL.md`；Scene task 再按该 Skill 读取 repository-local
  `remotion-best-practices`。
- 全新 scaffolded Workspace 的内置执行默认是 `subagents`，最大并发 4；用户或已保存设置可明确选择 `inline`。
  用户明确批准制作前串行 fallback 时，可用 `project:execution:resolve --allow-inline-fallback`；报告真实 inline、原请求及能力缺口。
  精确并发仍阻塞，不切换已派发 attempt，不更改权限或发布并行验收要求。
  默认生产要求宿主提供 bounded runtime-native child execution，并按 Skill 的临时 challenge probe 为本次 production 验证
  `shared-workspace` 或 `controller-io` transport 时才使用子 Agent；不得把线程、聊天或普通后台进程伪装成 child
  runtime。transport 是不持久化的宿主能力证据，不是 Workspace/App/Project 设置。
- `.agents/**/agents/openai.yaml` 只提供 OpenAI host 的可选 UI metadata，不属于 Skill、production contract、
  Task identity 或完成证据。其他 Agent 直接读取 `SKILL.md`、references、JSON contracts 与 CLI 输出。
- 宿主兼容性、最低能力与入口文件见 `docs/guides/AGENT_COMPATIBILITY.md`。

## 权威文档

- 产品目标：`docs/FINAL_PRODUCT_GOAL.md`（已改为 direct 方式；迁移计划见
  `docs/promotions/2026-10-14-direct-film-production.md`。迁移完成前，下文的 production 规则仍约束已发布主链）
- 生产流程：`docs/PRODUCTION_WORKFLOW.md`
- 当前事实：`docs/ITERATION_STATUS.md`
- 阶段门槛：`docs/ROADMAP.md`
- 架构：`docs/ARCHITECTURE.md`
- 确定性：`docs/DETERMINISTIC_EXECUTION.md`
- 名词：`docs/TERMINOLOGY.md`

文档冲突时先用 current 可执行代码和测试确认事实，再同步权威文档；不能把目标写成实现。

## 产品不变量

- 最终用户通过 `create-axmorf-studio` 创建普通 npm Workspace；运行时、CLI、contracts、Remotion
  exports 与预构建 Web 由 `@axmorf/studio` 提供，Workspace-local Skill 与用户配置由 creator
  生成。不存在 Desktop、Electron、Runtime Pack 或 `rsp` authority。
- 环境接入是 Agent-first capability gate：Agent 负责准备 package 声明的 Node.js/npm 与宿主前置条件，creator
  负责 install/bootstrap，生成 Workspace 的 `npm run doctor` 决定当前环境是否 ready。参考环境证据不构成 OS
  allowlist，未认证系统也不由文档预先阻塞；但 Agent 不得修改 `node_modules`、package internals、精确依赖或
  validator 来制造兼容，无法通过 gate 时必须报告 blocker。
- 只使用宿主机 Node.js/npm 与 Workspace-local Remotion CLI，不新增 Docker；所有 `remotion` 与 `@remotion/*` 保持
  完全相同的精确版本。
- 一 Story 一个 Composition；一 StoryBeat 一个 meaningId。`story.visualScenes` 可让一个 Scene 连续拥有多个
  相邻正文 Beat，首 Beat 的 meaningId 是 task/path owner；一个 owner 一个 Renderer/ScenePackage，Coverage 仍逐 Beat。
  未声明分组时每 Beat 单独成 Scene，既有作品不自动重组。全片 concept/subject/camera/rhythm/sound 写入 `story.filmPlan`。
  默认 sealed-narration 模式保留 narrated 正文和首尾 silent；显式 authored-frames 模式仅使用 silent scene-owner
  正文的 preset frame duration，不生成旁白/字幕或调用 TTS。fixed template-copy 仍只在首尾，不能加入正文分组。
  保留已发布 visual-scene/durationInFrames 路径，其 narration/sealed/mastered 为 JSON null、零 provider；
  narrated/visual/显式 authored-frames 正文模式不混用。
- 新片默认在 Story pool 冻结已批准 runtime capabilities 为 `optionalCapabilityIds`；正文 task 自动获得该可选范围。
  `resources.capabilityAccess:explicit` 保留显式限制；媒体仍须逐项准入，silent preset 资源仍须全部消费。
  可选能力不要求全部使用；旧 Project 不迁移，revision 保留冻结集合。目录 recipes 指导实际使用，demoOnlyExports 只作旧样例标注。
- `project:create` 从 strict create input 原子创建 configured authoring，并将选定边界 Scene template
  源码与资源复制为 Project-local immutable instance；它不调用 provider、不生成媒体或生产 attempt。
- 用户明确的尺寸/横竖屏、fps、locale 写入 create input 的 `render.width/height/fps/locale`，未指定字段继承配置；
  不为单次需求修改长期默认值。创建返回的 `render` 是已复验的 Project RenderSpec，须在 provider preparation 前核对用户要求。
- runtime package 只通过 policy-covered Workspace seed 发行 manifest/checksum/license 已验证的 shared media；
  bootstrap 投影到保留的 `public/assets/axmorf-shared/` 和 Catalog，相同 bytes 幂等、不同 bytes/symlink fail closed。
  默认首尾 template 实际使用的音频必须在 `project:create` 时复制为 Project-local resource；既有 Project 不自动迁移。
  template-copy Scene 由 fixed task 验证和产出 artifact，不派发 Agent。
- `project:create` 同事务冻结 `production/scene-originality-baseline.json`，只记录创建前其他 Project 的完整
  TypeScript Scene source graph；重复 create 必须复用自身 baseline。旧 Project 缺失时只能由用户显式运行零 provider、
  持锁的 `npm run project:originality:freeze -- --project <storyId>`，production 不得静默补空 baseline。
- 现有 Project 禁止原地修改 live authoring。先用只读 `project:revise:context` 取得 exact current Revision 与已复验
  four-file Delivery，再以 strict raw input 运行 `project:revise:validate -- --input <repository-relative-json>` 与
  `project:revise -- --project <storyId> --input <repository-relative-json>`；revision 无 `--schema`，validate 不接 `--project`。
  先核 installed public `ProjectRevisionInputSchema` 可用字段；局部 Scene 排版只改完整 `patch.scenes` 的目标 Scene brief，
  不顺手改全局 VisualStyle/GlobalVisual/Story/TTS，不虚构 Cover-only API。候选隔离 source/public/
  narration/work/attempt/out/delivery；promote 前 current Project/Delivery 始终是 authority。
  `patch.boundaryScenes` 只按 context 的完整 boundary meaningId/order 选择既有 immutable template 的受检播放区间，
  保留源码/素材/身份；`patch.sound` 只改既有 track 的音量与首尾包络，或将 composition 范围收窄到 content-window，
  不新增或替换媒体。运行时升级后先正式复验
  current 交付再修订；artifact missing 且完整 Scene task input 未变时，planner 可冻结已复验的 owning current Scene，
  供 bound executor 保留源码并重新 finalization/validation，不扫描历史或伪造 artifact hit。
- `ttsChunks` 是 Agent 已确定的原子朗读单元。sealed PCM 实测 samples 是绝对时间 authority；frame
  boundary 统一为 `ceilDiv(cumulativeSamples × fps, sampleRate)`。Scene/transition 不吞 spoken frames。
- create 与 revision validate/create 在 mutation 前执行 structured authoring validation；每个 authored
  `ttsChunk` 最多 72 `caption-display-unit-v1` half-units。`authoring-validation-failed` /
  `caption-display-budget-exceeded` 由 Agent 改短或按自然语义拆分，不得降低 validator。
- 字幕只由顶层 CaptionLayer 渲染；Scene root 透明，只输出 Beat 语义视觉与音效。Composition exactly
  once owns SceneViewport、captions、narration 和 GlobalVisual layers；GlobalVisual base 覆盖完整
  Composition，decoration 只覆盖正文连续窗口（旁白模式首至末 narrated Beat；authored 模式首至末 scene-owner Beat）。
- 新 Project 冻结 readability policyVersion 3：正文使用 `scene-full-frame` 画布与独立 `textSafeArea`，
  图像、背景、材质、光影与遮挡可铺满画面；文字使用相机变换之外的 `SceneTextSafeArea` 或等价冻结矩形。
  无旁白不预留字幕带。Scene 只消费派生 viewport，不读取 raw policy 或自行安装 viewport。
  fixed template-copy 首尾仍使用原 safe-area-local viewport；既有 policyVersion 1/2 的几何/fingerprint 保留，revision 不自动迁移。
- 新 Project 的 `VisualStyleSpec.theme` 固化四角色配色，Composition 绘制 fallback background；新全幅正文的
  Scene-owned 美术可使用题材需要的颜色，并确保文字在实际局部背景上可读。themed GlobalVisual base 仍直接返回 null，
  decoration 的 8% 上限只限制共享氛围层，不限制 Scene-owned 美术。固定首尾仍取主题色；旧 immutable 模板不静默迁移。
- 旁白独占 narration track；非旁白声音都是独立 `SoundContribution`。新片 Skill 默认在 create 前本地代码合成 BGM，
  以 `backgroundMusic.mode:synthesized` 冻结原创 PCM 与 timeline；一个 composition 音轨替换全部 Scene/模板配乐，保留独立音效。
  synth helper 的可选 arrangement 按题材指定 tonic、mode、progression、swing 与分段乐器/密度/力度，编译为同一 timeline；
  无 arrangement 的旧 recipe 保持原生成行为，不能把默认和声当作每片的创作要求。
  新片使用 `engine:"studio-v2"`（滤波音色、混响/延迟、sidechain、主题动机、过门与重音，最长 64 小节），timeline 额外冻结
  sections/accentFrames 并投影为 Scene-local sectionFrames/accentFrames；`underSpeechVolume` 冻结为 contribution
  `speechDucking`，Composition 只在实测旁白 chunk 下平滑压低音乐。无 engine 的 recipe 与既有 Project 音频不变。
  Scene task 的 musicTiming 是同一音乐网格投影到实测时序的局部帧；sealed PCM、字幕和语义边界不为踩拍改变。
  既有兼容模式的 BGM 在 create 时从已批准的全局
  loop 音乐库自动选曲或按明确选择冻结，单个 content-window contribution 只覆盖正文，跨 Scene 不重启，不覆盖首尾模板或 lead/tail。
  正文 BGM 只抑制正文 Scene 的 background-music，保留模板配乐与所有独立音效；显式 `backgroundMusic:null` 抑制全部背景音乐。
  缺曲必须报告 unavailable，不把资源发现当作播放成功；旧 Plan 的 composition/narrated-content/content scope 保留，不自动迁移。
- JSON/数据文件不包含 executable expression；renderer 由 composition-local static registry 绑定。
  render runtime 不调用 Agent、Skill、MCP、Git、网络或目录扫描。
- 所有媒体都位于当前 Workspace `public/`、具有 manifest identity 并通过检查。render-critical motion
  只用 Remotion frame API，禁止 CSS animation/transition 和 Tailwind animation utilities。

## 唯一 production 与 delivery 主链

- `project:create` 之后、live Project 首次 `project:produce:inspect` 之前可准备题材所需素材：先查本地 Catalog，
  Root 用当前实际可调用的生图工具生成图片，或创作原创 SVG，再通过 `project:asset:import --input <absolute-json>`
  校验原创 provenance 与实际文件，并原子接入 Project manifest、资源池和指定正文 Scene。生成主体与环境可分层，
  不伪造第三方 acquisition receipt。兼容的许可图片 MCP 仍可走原 `--receipt` 准入；必须实际暴露同一 MCP 的
  status/search/preview/acquire tools，安装配置或其他 Agent 可调用不算当前可用。没有素材缺口或对应工具时不生成占位 task/DAG node。
  revision candidate 只使用 base snapshot 已有 Project-owned media，不开放新素材准入。工具、远程路径与 receipt
  不进入 child/runtime；生产只消费通过固定 import 的 Project-owned manifest identity、provenance 与 bytes fingerprint。
- 每次 live/candidate production（含同一业务请求的自主 revision）重新验证当前宿主 capability，并在 inspect 前成功运行一次
  `npm run project:execution:resolve`；不得沿用上轮 probe/resolver。执行策略：用户提示词中的明确字段优先于
  `private/execution-preferences.json`，未明确字段继续继承配置，再继承内置 `subagents`/4 默认。override 只作用于当前
  production，除非用户明确要求保存；解析结果不进入 Revision/Task/artifact/delivery identity。`inline` 由
  Root 一次只执行一个 dirty workspace；`subagents` 使用不超过四个且受 runtime capacity 限制的 bounded pool，
  并要求本次 resolver 输入 verified worker transport。原生 wait-any 完成即补位；原生批量每批不超过容量，同步返回或原生整批完成通知后发下一批。
  runtime capacity 未知时阻塞；transport 未验证、容量为 0
  或 exact capacity 无法满足都必须在 prepare 前阻塞，不自动换模式。transport/解析结果不持久化也不进入 content
  identity。
- `npm run project:produce:inspect -- --project <storyId>` 是严格只读、零 provider call 的诊断入口；Root
  必须先报告 source readiness（`sourceState`）、estimated cost、artifact reuse 与结构化失效解释，再运行有成本 preparation。
  局部修订若出现无关 dirty tasks，prepare 前缩小 raw patch、validate/create 新 candidate 并重新走本轮入口；全重做不证明局部 reuse。
- `npm run project:produce:prepare -- --project <storyId>` 是唯一允许调用 provider、准备 fixed artifacts、
  计算 ProductionRevision/content-addressed Task DAG、创建 dirty workspace 与 ExecutionAttempt 的生产入口。
- candidate 的 inspect/prepare/task/continue/recover/reissue 必须携带 exact `--candidate`，但 candidateId/path 只属于
  routing/diagnostic plane，不进入 Revision、TaskRevision、ArtifactAttestation 或 DeliveryBuildId。candidate exact-four
  Delivery 成功后 fixed continuation 自动尝试 promotion；promotion 在锁内重验 live base 与 expected candidate
  Revision/Delivery tuple，只受控替换 source/public/narration/delivery 四个 Project-owned roots，并刷新/复验
  Registry/Catalog；任一步失败完整 rollback。production 已完成而 promotion 失败时只允许幂等
  `project:revision:promote` 重试，不能 reissue attempt。
- RevisionId、TaskRevision、ArtifactAttestation identity 不包含 attemptId、历史执行 ID、时间戳、PID、
  absolute path 或 Agent identity。ExecutionAttempt 只保存诊断，不拥有 artifact 或 delivery。
- prepare 只为未命中有效 artifact 的 Agent 任务创建 `.producer-work/<storyId>/<taskRevision>/`。Root 按已解析
  模式串行执行或受限派发 dirty `scene-owner`、`global-visual-owner`、`cover-owner`；valid artifacts 必须复用。
- Agent task 的 immutable、attempt-neutral `TaskExecutionContract` 位于 `inputs/task-contract.json`，与
  `task.json`、`inputs/context.json` 一起定义 purpose/workflow/constraints、exact outputs 及 Agent/fixed ownership；
  contract 不承载 transport、binding、failure state 或 CLI template。新 contract version 只让 Agent TaskRevision/
  artifact 一次失效，不修改 ProductionRevision 或 current delivery。
- 每个 Root/child executor 在任何 task content 读写前先运行 prepare 返回的 exact attempt-bound
  `project:task:bind`；bind 校验 identity、active attempt、immutable input checksums 与 task contract，且必须零写入。
  只有 `task-worker-bound` 才允许按 binding 返回的 capability 读取三个 immutable inputs、写 declared outputs。
  `shared-workspace` 只能访问返回的 workspace；`controller-io` 没有 filesystem access，只能通过 exact bound
  `project:task:file-read`/`file-write` 读允许路径、用 strict base64 JSON 写 declared output。
- `project:task:describe`、`finalize`、`check`、`commit` 与 authored-output `taskFailureCommand` 都要求 full valid
  binding；finalize 只做 fixed derived projection，executor 只修正 `agent-output` issues。commit 重跑 validator 并
  原子提升 ArtifactAttestation。Root-only `spawnFailureCommand` 仅记录真实 spawn/transport/permission failure，
  `fixedFailureCommand` 仅记录 immutable/controller fault；二者 authority 更窄，不能读写 task content。
- Artifact hit 每次重新验证 contract、task identity、dependencies、validator version、exact sorted file
  set、path containment、regular-file/no-symlink、size 与 checksum；目录存在不代表命中。
- originality baseline fingerprint 只进入 `scene-owner` TaskRevision/context；`scene-template` 明确豁免。Scene validator
  用全部 declared TS/TSX 的 token-normalized source graph 拒绝历史冲突；converge 在任何 live materialization 前再次
  拒绝同 revision Scene 的 exact 或 normalized duplicate。
- Root 在串行执行完或把全部 dirty tasks 纳入 bounded pool 后，启动 prepare 返回的 attempt-bound
  `project:produce:continue`，每个 attempt 仅一次。Root 全程负责，用原进程阻塞等待或原生通知做低 token 监督；
  等待取宿主 deadline 内最长阻塞时长，通常 30–60 秒或更长；不反复一秒等待。普通超时只续等，不轮询 child/status、反复读日志或推理未变进度。错误通知才唤醒 Root 诊断并指导原 executor；
  不读写其 workspace、不代 commit、不修复运行中的 continuation。只按 fixed 结果报告一次，忽略迟到的重复成功通知。fixed continuation
  必须先获得 one-shot atomic attempt claim，再等待 immutable task-terminal event log；重复 continuation
  fail closed。任一失败直接终止且不 converge；全部成功才内部恰好调用一次 converge；从 ExecutionAttempt
  创建时刻起一小时总 deadline 内缺少终态时写 timeout failure 并退出；converge 失败也直接终止。
- converge 使用只读 current replan，拒绝 stale revision；不调用 provider、不创建 workspace/attempt；全部
  required artifacts 齐全前不得修改 live
  owner roots。物化使用受控 staging/replace/rollback，随后刷新 ScenePackage、Coverage、RendererRegistry、
  GlobalVisualPackage 与生成式 Composition，并从 live paths 复验 bytes 与 attestations 一致。
- 需要交付前时序审阅时，可先原生等待所有 workers 完成，再运行 `project:preview -- --project <storyId>`
  （candidate 携带 exact `--candidate`），随后启动同一个唯一 continuation。preview 只复验 current inputs/有效 artifacts，
  在私有冻结 view 物化并缩放渲染；不调用 provider、不创建 attempt、不写 live source/current Delivery、不 promotion。
  它仍受 attempt 一小时总期限限制，receipt 的 motion/continuity/listening 默认为 not-assessed；草稿成功不是交付或审美通过。
- delivery 是同一 converge 内的同步阶段。它使用 build-owned staging，可跨失败复用已验证媒体，等待
  Remotion/FFmpeg 完成，验证 H.264/AAC、声道、尺寸、fps、frame count、PNG、checksum 与 EOF decode，
  最后写 `publish.json`。exact 四文件全部通过后才受控替换 `deliveries/<storyId>/`。
- current delivery exactly 是 `video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`。相同
  DeliveryBuildId 且完整时只读 no-op；完成终点是 `project-production-complete` 或
  `project-production-current`，两者都表示实际四文件已复验。

## Project 与本地产物

- 具体 Project 只依赖 core；ProjectRegistry/ResourceCatalog 支持 zero Project。Registry 在 bundle 前
  生成静态字面量 imports，composition-local RendererRegistry 与全局 ProjectRegistry 分离。
- `public/`、`src/projects/`、generated Registry/Catalog、`.narration-work/`、`.producer-work/`、
  `.producer-artifacts/`、`.producer-attempts/`、`.producer-runs/`、`out/` 与 `deliveries/` 都是 ignored
  本地产物，不进入 Git。
- settings 只从 current source Projects、新 attempts/artifacts 与 current four-file delivery 投影；结构化
  explanation、baseline、estimate 与 attempt 只属于 diagnostic plane，不得改变 Revision、TaskRevision、
  ArtifactAttestation、dispatch、materialization 或 DeliveryBuild identity/authority；不得
  扫描 `.producer-runs/` 来规划、构建、收敛或判定 current 状态。历史 Run 只是 deletion-only 数据。
- 用户明确删除 Project 时，使用
  `npm run project:delete -- --project <storyId> --confirm-delete` 的完整 storyId-owned 清理语义；禁止 broad
  `rm`。删除范围含 Project/public/narration/work/artifact/attempt/revision candidate/legacy Run/out/delivery，不含 core、其他
  Project、private config、共享素材或 `public/voice_profile/`。
- 删除器只为历史 `.producer-runs` 保留内部严格 `runId/storyId` ownership parser，不导出或解释旧合同。
  删除矩阵只能在明确的 `mktemp` 隔离副本中运行。

## Scene 制作来源与任务所有权

每个 Scene task executor 必须完整读取 repository-local
`.agents/skills/remotion-best-practices/SKILL.md`，再按 Renderer 需要读取路由 reference。`AGENTS.md`、
TaskSpec、contracts 与 validators 拥有更高 authority，不能扩大 workspace 写入范围。

新 Scene 只参考 current Story/StoryBeat/timing/VisualStyle/brief、ResourceCatalog 当前登记能力、当前方案
显式本地化的 immutable upstream source，以及随 Skill 发行的精选标杆 Scene
（`remotion-best-practices/references/exemplar-scenes.md`）。标杆只可借鉴技法，内容、构图与时序仍来自 current brief，
不得原样粘贴。不得搜索、比较、模仿或复制用户历史 Scene、Composition、still、contact sheet 或布局。第三方 source/media 分别校验 license/attribution；未确认音频不得进入 artifact。

- 局部修订只以 bound context 的 `scene.priorSource` 中 owning Scene 已复验冻结的 current base 源码图与声明为起点，
  比较 previous/current brief 并只实现目标 delta；保留其余行为及许可/lineage bytes，derived fields 交给 fresh finalizer。
  它不授权读取 base snapshot、其他 Scene、历史或其他 executor workspace；缺失时从 current brief 创建，不宣称保留旧源码。
- Scene、GlobalVisual、Cover 是互相隔离的 task workspace。GlobalVisual 不读 Scene 输出；Cover 只读
  StorySpec、VisualStyleSpec 与 fixed CoverSpec。
- exact-reference Scene 的 lineage/license/phase/checksum 由机械 validator 检查，不使用主观自评 gate。
- 新实现默认留在 Project-local artifact。只有 fingerprint-bound promotion proposal 且用户明确授权
  scope/API/files/target 后，才移入 `src/remotion/capabilities/`。
- subagents 中每个不同 TaskRevision 必须使用全新 native child/session；完成后不得通过 follow-up/resume 接另一个任务，
  释放容量也不代表复用 session。只有原 owning executor 在同任务 terminal 前可修正自己的输出。
- Root 只有在解析为 `inline` 时才能按 task prompt 串行创作；不得读其他 executor workspace、跨 task 代
  commit 或持久化 child identity/chat/heartbeat/token。subagents 模式的 spawn failure 记录 exact
  `spawnFailureCommand`，不得自动回退 inline。

短 `--assignment` 只路由 exact project/attempt 的 immutable dirty task 序号；CLI 还原 full task/binding 后继续原验证，不能混入手写长身份。
Root 优先整段转发 prepare/reissue 的 `workerPrompts`；进程工具返回 session/cell handle 时完整保留并等待，不能只取 output 或提前结束 Root。

## 故障语义

- Agent-owned workspace 校验失败时，Root 可根据原 executor 返回的结构化错误与最小相关片段定位并指导，
  仅原 executor 在 terminal 前修正 owning paths 并重跑同一 validator；不得降低合同。相同错误重复且没有具体新修正时停止报告。
- 已启动的 continuation 意外退出而未写终态时，Root 先诊断报告；不属于自动任务恢复。用户另行明确恢复后，
  才运行 `project:attempt:interrupt-inspect`；只有同宿主
  owner 与已登记 process groups 均已退出、全部 Agent tasks 已终态、operation lock 可复验时才允许
  `project:attempt:interrupt` 追加 failed event 并归档匹配的遗留锁。原 claim/attempt inputs 不改；legacy/unknown
  owner fail closed，不手动删锁。随后沿既有 recover-inspect/reissue 新建 attempt。进程诊断不进入 content identity。
- terminal failed attempt 永远 immutable。每个用户制作请求（含 candidate）最多自动恢复一次，且只覆盖已证明的
  Agent-authored output fault；普通退出码或 recovery-ready 本身不能证明故障归属。
  commit 的受检 outputFailure 只证明 declared output 缺失或 JSON/TypeScript 语法错误；无证据的通用 commit failure 仍阻塞，
  不能从后来补写的文件或文字说明追认原故障。
  先等待原 continuation 退出，通过原生完成通知或 stop 后确认所有旧 workers 已退出；无法证明就报告 blocker，禁止新旧 writer 重叠。再运行
  严格只读、零 provider 的 `npm run project:attempt:recover-inspect`，报告原因、修正方案和复用情况；只有
  `attempt-recovery-ready`、同一 current Revision、无 active/fixed blocker 时才运行 `npm run project:attempt:reissue`。
  reissue 不要求 current delivery，复用 valid artifacts/drafts，返回 fresh attempt/bindings/continuation；使用 fresh workers
  且只派 dirty tasks。恢复再次失败就报告，不重跑 prepare/旁白或重置恢复额度；后续用户明确恢复另算授权。详见 Skill hardening。
- fixed workflow 在 valid inputs 下失败是系统缺陷：当前 attempt 立即终止。Root 可诊断并报告证据和所需工程范围，
  不自动修改程序源码、安装包、依赖或 validator。只有用户另行启动的 engineering task 才能保存脱敏 incident，
  Red → minimal shared Green → focused/full verification；之后再从
  current inputs 新建 ExecutionAttempt。不得在失败 attempt 内修复或重试。
- provider、host tool、sandbox、permission 或 authorization failure 是 external blocker；不添加 fallback、
  自动 retry、TTS warm-up 或降低 Chromium sandbox。
- artifact checksum drift、unknown file、symlink、path escape、identity conflict、stale revision 与
  materialized drift 都 fail closed。不得手改 artifact manifest 或 current delivery 来继续。
