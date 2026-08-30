# AXMORF Studio

一个以 Remotion 为渲染运行时、以 Project authoring revision 和内容寻址 artifacts 为生产 authority 的
Agent-first 视频生产工具。Agent 在用户 Workspace 中负责创作；npm package 提供 contracts、固定生产控制器、
Remotion runtime、CLI 和本地 Web 控制中心。

## npm 方案状态

当前分支已经完成可安装的本地 npm vertical slice：private monorepo 根管理 runtime 与 creator 两个公开 package，
creator 可从真实 tarball 创建一个普通、独立、可重装的 npm Workspace。目标产品不包含 Desktop、Electron、
Runtime Pack 或 `rsp` control plane；用户数据只属于生成的 Workspace。

仓库和两个发布包已采用 Apache-2.0，并补齐 package README、`LICENSE` 与
`THIRD_PARTY_NOTICES.md`。`@axmorf/studio` 和 `create-axmorf-studio` 当前 registry 查询均未发现公开包；下面的
`npm create` 是首次发布后的稳定入口。production 与完整 repository `npm audit` 已通过精确传递依赖约束和兼容的
开发工具更新归零。macOS 15 ARM64 已通过原生 package/scaffold gate；Ubuntu 24.04 x86_64 还通过了从真实
tarball 安装到 provider narration、bounded Agent tasks、Remotion render 与 exact four-file Delivery 的完整验收。
新增 revision/originality/task-binding/reissue/GlobalVisual contracts 后的
[Ubuntu current-feature re-acceptance](docs/evidence/2026-08-30-ubuntu-npm-current-feature-reacceptance.md) 也已完成。
首次发布不要求固定 OS matrix，其他宿主由 Agent 准备声明的前置条件，并以生成 Workspace 的
`doctor` capability gate 判定是否 ready。未经明确授权不会执行真实 publish、tag 或 push。

## 当前主链

```text
Project source
  → optional current-Agent MCP acquisition slot (only when actually callable)
  → resolve user-prompt/settings Agent execution policy
  → read-only inspection and cost/invalidation report
  → explicit fixed preparation
  → ProductionRevision
  → content-addressed Task DAG
  → reuse valid ArtifactAttestations / execute dirty Agent tasks
  → fixed attempt-bound continuation (Root suspended)
  → fixed convergence and materialization
  → synchronous exact four-file delivery
```

核心性质：

- RevisionId、TaskRevision、ArtifactAttestation 与 DeliveryBuildId 不绑定 attempt、时钟、PID、绝对路径或
  Agent identity；
- Root/child task executor 只写 `.producer-work/<storyId>/<taskRevision>/`，fixed commit 重跑 validator 后才能产生
  ArtifactAttestation；
- 每个 dirty Agent task 还有 immutable、attempt-neutral `TaskExecutionContract`，任何 task content 读写必须先通过
  exact attempt-bound zero-write bind；
- 新 attempt 机械复用 valid artifacts，只执行仍 dirty 的 Scene/GlobalVisual/Cover tasks；
- inspection、estimate、baseline、explanation 与 attempt 都只属于 diagnostic plane，不进入或改变任何
  production/artifact/delivery identity 或 authority；
- template-copy Scenes 由 fixed task 处理，不派发 Agent；
- `project:create` 冻结创建前其他 Project 的 Scene source-graph baseline；旧 Project 必须显式运行
  `project:originality:freeze` 迁移，production 不静默补空；
- baseline 只使 `scene-owner` TaskRevision 失效，template-copy 豁免；validator 与 converge 分别拒绝历史和
  同 revision 的 exact/token-normalized TS/TSX graph 重复；
- Composition exactly once 拥有 SceneViewport 与 full-frame readability policy；Scene Renderer 只接收
  safe-area-local `viewportWidth`/`viewportHeight`，不读取或重复应用 Composition inset；
- GlobalVisual 固定分为 full-Composition base 与首个至末个 narrated Scene 的 decoration window；decoration 从
  window-local frame zero 开始，不能读取 Scene output 或承载 Beat 文案；
- create/revision 在 mutation 前执行 structured authoring validation；每个 authored `ttsChunk` 最多 72 caption
  display half-units，超限必须改短或按自然语义拆分，不能降低 validator；
- Root 串行执行完或完成受限并发 admission 后不监督、不轮询、不参与成败处理；fixed continuation 以
  one-shot atomic claim 独占 terminal barrier，并受 attempt 创建起一小时总 deadline 约束；
- converge 重新计算 current Revision，全部 artifact 齐全才受控物化 Project；
- delivery 同步生成并验证 `video.mp4`、两张 PNG Cover 和 `publish.json`，全部通过才替换 current slot；
- `project-production-complete` 与 `project-production-current` 都表示实际 current four files 已机械复验。

产品目标、实现状态和精确 contract 请从 [文档导航](docs/README.md) 进入。生产 Agent 使用
[axmorf-video Skill](.agents/skills/axmorf-video/SKILL.md)；每个 Scene task executor
还必须完整读取 repository-local `remotion-best-practices`。

## Agent 兼容性

仓库以 `AGENTS.md`、repository-local `SKILL.md`、JSON contracts 和 npm CLI 作为宿主中立接口，不依赖
Codex、Claude、Gemini、Cursor 或 Copilot SDK。Codex、Cursor 与 GitHub Copilot 可直接读取 `AGENTS.md`；
Claude Code 通过 `CLAUDE.md`、Gemini CLI 通过 `GEMINI.md` 导入同一文件。不会自动发现 Skill 的 Agent 仍可按
`AGENTS.md` 指向的路径手动加载，规则没有第二份副本。

全新 scaffolded Workspace 内置使用 `inline`：单个 Agent 即可完成 dirty tasks。`subagents` 是可选加速能力，只有宿主
支持 bounded runtime-native children、为本次 production 验证 `shared-workspace` 或 `controller-io` transport，且
本次解析选择该模式时才启用。transport 是不持久化的宿主能力证据。OpenAI 的 `agents/openai.yaml` 只是可选 UI
adapter，不参与生产 authority。完整入口与能力矩阵见
[Agent 兼容性指南](docs/guides/AGENT_COMPATIBILITY.md)。

操作系统不是预先写死的 runtime allowlist。Agent 可以安装 package 声明的 Node.js/npm、重建普通 npm dependencies、
配置 provider 与处理可用端口；它不能修改 `node_modules`、package internals、精确依赖或 validator 来“适配”宿主。
`doctor` Green 只表示当前 Workspace 的声明能力 ready，不替代最终 production/Delivery 验证。

## 交给 Agent 的快速开始（首次发布后）

```bash
npm create axmorf-studio@latest my-video -- --yes
cd my-video
npm run doctor
```

creator 默认安装精确依赖、生成 `package-lock.json`，并在原子提升目标目录前完成无 provider 的
`bootstrap`/`doctor`。把下面的目标交给任意能读写文件并运行 npm 的 Agent 即可：

1. 检查并准备 `@axmorf/studio` README 声明的 Node.js/npm 环境；
2. 运行 creator，进入 Workspace 后读取 `AGENTS.md`；
3. 运行 `npm run doctor`，失败时只修复声明的宿主前置条件并重跑，无法满足时报告 blocker；
4. doctor Green 后读取 `.agents/skills/axmorf-video/SKILL.md`，按用户 brief 创建、生产并交付视频；
5. 需要配置或实时预览时运行 `npm run dev`。

`npm run dev` 同时启动 loopback-only Web 控制中心和 Remotion Studio；Web 负责配置、诊断、生产进度与
verified current Delivery，Studio 负责 Composition 实时预览。二者都不编辑 Project，也不派发 Agent。

## Contributor 快速开始

```bash
npm install
npm run bootstrap
npm run check:static
```

需要 Chromium/Remotion host 的验证：

```bash
npm run compositions
npm run check
```

真实 Remotion、FFmpeg、Chromium 和 production preflight 首次直接使用宿主权限。不要通过降低 Chromium
sandbox、预热 TTS 或 fallback output 获得 Green。

本地源码仓库的 Web 开发页：

```bash
npm run config:dev
```

配置页统一维护 Agent 默认执行模式/并发上限、local/cloud TTS providers、默认 voice/render/readability/scene
templates/publishing collections，
并展示 source readiness、current Revision、estimated/actual cost、逐任务 direct/dependency/artifact 解释、
latest ExecutionAttempt diagnostic 和 current four-file delivery。private config 保持 ignored；UI/API 不读取
protected voice contents 或 raw fingerprints。

## 新建 Project

新 Project 使用 `private/producer.config.json` 中的 defaults；先创作一个 strict、repository-relative 的
create input，其中包含 Story、narrated beats 的 exact `ttsChunks`、视觉与发布选择，然后：

```bash
npm run project:create -- --project <story-id> --input <repository-relative-json>
```

旧 Project 若缺少 `production/scene-originality-baseline.json`，经用户明确同意后执行：

```bash
npm run project:originality:freeze -- --project <story-id>
```

create 在一个受控 transaction 中原子写入 configured authoring 与选定 boundary Scene template 的
Project-local immutable instance；已存在/partial/conflicting target fail closed。它不调用 provider、不生成
媒体，也不写 narration work、task workspace、artifact、attempt 或 delivery。成功重复相同 creation identity
只读返回 current。Project-local 媒体只能在 Project 创建后通过下述准入命令导入。

Project 外部媒体必须经固定准入命令本地化；运行时只消费 Project-owned manifest ID：

```bash
npm run project:asset:import -- --project <story-id> --receipt <absolute-receipt-path> --asset <asset-id>
```

生产 Skill 把外部图片 MCP 作为 Root 的可选 Agent capability slot：只有当前 Agent 的实际 callable tool
surface 同时暴露兼容的 status/search/preview/acquire tools 时才启用；仅“已安装/已配置”、shell 可发现或其他
Agent 可用都不算。没有该 MCP 时本次流程完全省略该阶段，不产生错误、占位 task、prompt、estimate 或 DAG
node。有 MCP 时也先查询本地 Catalog，仅在确有缺口时 acquire，并通过上述 import 边界准入。

provider acquisition evidence 只存在于 adapter boundary；远程 URL、SDK、MCP、token 与 API key 不进入 task
workspace、Artifact Store、delivery 或 Remotion runtime。

## 修改现有 Project

修改前先读取并冻结 exact current base。context 只有在 current Revision 与已复验的 four-file Delivery 一致时
才返回可编辑 authoring：

```bash
npm run project:revise:context -- --project <story-id>
npm run project:revise:validate -- --input <repository-relative-json>
npm run project:revise -- --project <story-id> --input <repository-relative-json>
```

strict revision input 只允许 patch `brief/story/visualStyle/scenes/globalVisual/publishing`，并显式绑定
`baseRevisionId` 与 `baseDeliveryBuildId`。`project:revise` 在 `.producer-revisions/<storyId>/<candidateId>/`
建立隔离的 source/public/narration/work/attempt/out/delivery scope；它不会覆盖 current Project 或 Delivery。
后续 inspect、prepare、task、continue、recover/reissue 都必须携带命令返回的 exact `--candidate`。

candidate continuation 先在隔离 scope 完成并复验 exact four files，再自动尝试受控 promotion。promotion 在锁内
重验 live base 与 candidate expected Revision/Delivery tuple，只受控替换 source/public/narration/delivery 四个
Project-owned roots，刷新并复验 Catalog/Registry；任一步失败都回滚到原 current。若 candidate production 已成功而
promotion 失败，只重试：

```bash
npm run project:revision:promote -- --project <story-id> --candidate <candidate-id> --revision <revision-id> --delivery <delivery-build-id>
```

promotion retry 与 failed-attempt reissue 是两条不同语义：不得为已经完成的 candidate production 重开 attempt。
完整边界见 [Project revision candidates](docs/guides/PROJECT_REVISION.md)。

## 生产一个 Project

1. 在 inspect 前按“当前用户提示词明确字段 → 配置页 → 内置默认”解析本次执行策略。内置默认是宿主中立的
   `inline`；提示词 override 不自动保存：

```bash
npm run project:execution:resolve -- [--mode inline|subagents] [--max-concurrency <n>] [--require-exact-concurrency] [--runtime-max-concurrency <n>] [--worker-transport shared-workspace|controller-io]
```

仓库并发上限为 4；runtime capacity 未知按 1、明确为 0 时阻塞。subagents transport 未验证或 exact 请求无法满足
也在 prepare 前阻塞。解析结果与 transport 只属于本次编排，不写入设置或生产 identity。

2. 严格只读检查 source readiness、预计 provider/cache/Agent/delivery 成本、artifact reuse 与逐任务失效解释：

```bash
npm run project:produce:inspect -- --project <story-id>
```

Root 先向用户报告 inspection。unknown estimate 保持 unknown，不把诊断推测写入 data plane。

3. 明确执行唯一有成本的 preparation 入口；它才允许 provider/fixed preparation、workspace 与 attempt 写入：

```bash
npm run project:produce:prepare -- --project <story-id>
```

4. 按已解析模式执行 `dirtyAgentTasks`：inline 时 Root 一次处理一个；subagents 时以有效并发上限运行 bounded
   pool，任务多于槽位时仅 wait-any 释放 admission slot。每个 task 的 immutable
   `inputs/task-contract.json` 定义 purpose、workflow、constraints、exact outputs 与 Agent/fixed ownership；它不含
   attempt、transport 或命令。executor 在任何 task read/write 前先运行 prepare 返回的 exact bind command：

```bash
npm run project:task:bind -- --task <task-revision> --attempt <attempt-id> --binding <binding-id> --transport shared-workspace|controller-io
npm run project:task:describe -- --task <task-revision> --attempt <attempt-id> --binding <binding-id>
npm run project:task:finalize -- --task <task-revision> --attempt <attempt-id> --binding <binding-id>
npm run project:task:check -- --task <task-revision> --attempt <attempt-id> --binding <binding-id>
npm run project:task:commit -- --task <task-revision> --attempt <attempt-id> --binding <binding-id>
npm run project:task:fail -- --task <task-revision> --attempt <attempt-id> --binding <binding-id> --kind task|host|fixed
npm run project:task:file-read -- --task <task-revision> --attempt <attempt-id> --binding <binding-id> --path <logical-path>
npm run project:task:file-write -- --task <task-revision> --attempt <attempt-id> --binding <binding-id> --path <declared-output-path>
```

bind 是 zero-write gate，只有 `task-worker-bound` 才授予 capability。shared-workspace 只允许返回的 workspace 与
declared files；controller-io 不提供 filesystem access，只允许返回的 strict file commands。describe/finalize/
check/commit/task failure 需要 full binding；Root-only spawn failure 与 fixed failure 只能记录其更窄的
host/immutable-controller 终态，不能访问 task content。

5. 串行执行完或全部 bounded admission 完成后，Root 的最后一个生产动作是启动 exact `continuationCommand`：

```bash
npm run project:produce:continue -- --project <story-id> --revision <revision-id> --attempt <attempt-id>
```

此后 Root 挂起且不再轮询、推理、修复或重试。fixed continuation 先原子占用 exact attempt，只读取 immutable
task-terminal event log；重复 continuation fail closed。任一失败非零退出且不 converge；全部成功才内部调用一次
converge；从 attempt 创建起一小时内缺少终态会写 timeout failure 后退出；converge 失败同样直接退出。内部 converge 先只读
重算 current Revision/plan，再验证/materialize artifacts、刷新 packages/registry/Composition，并同步构建
current delivery；它不调用 provider 或创建 workspace/attempt。聊天终态
不作 authority；只有 ArtifactAttestation 和验证后的 four-file package 作 authority。详细步骤见
[生产编排指南](docs/guides/PRODUCTION_ORCHESTRATION.md) 与
[本地交付指南](docs/guides/LOCAL_DELIVERY.md)。

terminal failed attempt 不可重开。用户明确恢复时，先运行只读、零 provider inspection，再为同一 current
Revision reissue fresh attempt：

```bash
npm run project:attempt:recover-inspect -- --project <story-id> --attempt <failed-attempt-id>
npm run project:attempt:reissue -- --project <story-id> --attempt <failed-attempt-id>
```

reissue 不要求 current delivery，复用 valid artifacts/drafts 并返回 fresh bindings/continuation；active、stale
或 fixed-flow failure 拒绝恢复。这不是自动 retry，旧 attempt 保持 immutable。

## Narration maintenance

正常 production 由 fixed task DAG 复用或生成 narration artifacts。独立命令只用于明确的维护/诊断：

```bash
npm run narration:generate -- --project <story-id>
npm run narration:seal -- --project <story-id>
npm run narration:check -- --project <story-id>
```

不要隐式 split authored chunks、自动 retry/fallback provider 或假设波形 bit-for-bit 可重复。sealed PCM sample
measurement 和 cumulative frame formula 是时间 authority。参见
[Narration generation](docs/guides/NARRATION_GENERATION.md)。

## 删除 Project

删除是完整 storyId-owned local data cleanup，不是 MP4-only：

```bash
npm run project:delete -- --project <story-id> --confirm-delete
```

它清理 Project-owned source/public/narration/work/artifact/attempt/revision candidates/legacy history/out/delivery，并重建
Registry/Catalog；不会删除 core、其他 Project、shared assets、private config 或 voice profiles。删除矩阵只在
`mktemp` 隔离副本运行。

## Repository layout

```text
packages/studio/     compiled runtime, CLI, contracts, Remotion and Web assets
packages/create-axmorf-studio/ atomic user Workspace creator and host-neutral Skill template
packages/studio/src/contracts/ versioned JSON-safe contracts
packages/studio/src/remotion/ runtime components and top-level ownership
src/projects/<storyId>/               ignored authoring + materialized Project source
scripts/project-production/           Revision/DAG/workspace/artifact/convergence/delivery
scripts/narration/                    provider attempts, PCM seal, timing
scripts/scene-package/                 deterministic ScenePackage/Coverage projection
scripts/renderer-registry/             static composition registry generation
.producer-work/<story>/<task>/         ignored task workspaces
.producer-artifacts/<story>/           ignored reusable attested artifacts
.producer-attempts/<story>/            ignored diagnostic attempts
.producer-revisions/<story>/           ignored isolated revision candidates and promotion state
.producer-runs/                        ignored legacy deletion-only history
deliveries/<story>/                    ignored exact current four-file package
settings/                              Web source, built into the runtime package at release time
docs/                                  current authority, guides, evidence, archive
```

## 工程边界

- 保护未提交/ignored 用户数据，不 reset，不 broad delete，不使用 `git add .`，不 push 除非明确授权。
- Project/runtime code 不读取 historical execution data、private values 或 protected voice bytes。
- domain/application/adapters 分层；render runtime 不调用 filesystem discovery、Agent、Skill、MCP 或网络。
- 修改后先 focused tests，再按风险运行 `npm run check`；不能运行的检查必须明确报告。
