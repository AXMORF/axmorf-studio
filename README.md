# Remotion Story Producer

一个以 Remotion 为渲染运行时、以 Project authoring revision 和内容寻址 artifacts 为生产 authority 的本地
视频生产仓库。Agent 负责创意任务；固定脚本负责输入快照、验证、artifact promotion、Project 物化、`source-current`
与可选的 exact-four-file Delivery。

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
  → attested source-current
  → manual stop / automatic or later explicit exact four-file DeliveryBuild
```

核心性质：

- RevisionId、TaskRevision、ArtifactAttestation 与 DeliveryBuildId 不绑定 attempt、时钟、PID、绝对路径或
  Agent identity；
- Root/child task executor 只写 `.producer-work/<storyId>/<taskRevision>/`，fixed commit 重跑 validator 后才能产生
  ArtifactAttestation；
- 新 attempt 机械复用 valid artifacts，只执行仍 dirty 的 Scene/GlobalVisual/Cover tasks；
- inspection、estimate、baseline、explanation 与 attempt 都只属于 diagnostic plane，不进入或改变任何
  production/artifact/delivery identity 或 authority；
- template-copy Scenes 由 fixed task 处理，不派发 Agent；
- Composition exactly once 拥有 SceneViewport 与 full-frame readability policy；Scene Renderer 只接收
  safe-area-local `viewportWidth`/`viewportHeight`，不读取或重复应用 Composition inset；
- Root 串行执行完或完成受限并发 admission 后不监督、不轮询、不参与成败处理；fixed continuation 以
  one-shot atomic claim 独占 terminal barrier，并受 attempt 创建起一小时总 deadline 约束；
- converge 重新计算 current Revision，全部 artifact 齐全才受控物化 Project 并写入、复验 `source-current`；
- `manual` 在 source-current 停止；`automatic` 或 later explicit DeliveryBuild 才生成并验证 `video.mp4`、两张 PNG
  Cover 和 `publish.json`，全部通过才替换 current slot；
- `project-production-source-current` 只证明 source ready；`project-production-complete` 与
  `project-production-current` 才表示 actual current four files 已机械复验。

产品目标、实现状态和精确 contract 请从 [文档导航](docs/README.md) 进入。生产 Agent 使用
[remotion-story-producer-video Skill](.agents/skills/remotion-story-producer-video/SKILL.md)；每个 Scene task executor
还必须完整读取 repository-local `remotion-best-practices`。

## Agent 兼容性

仓库以 `AGENTS.md`、repository-local `SKILL.md`、JSON contracts 和 npm CLI 作为宿主中立接口，不依赖
Codex、Claude、Gemini、Cursor 或 Copilot SDK。Codex、Cursor 与 GitHub Copilot 可直接读取 `AGENTS.md`；
Claude Code 通过 `CLAUDE.md`、Gemini CLI 通过 `GEMINI.md` 导入同一文件。不会自动发现 Skill 的 Agent 仍可按
`AGENTS.md` 指向的路径手动加载，规则没有第二份副本。

全新 checkout 内置使用 `inline`：单个 Agent 即可完成 dirty tasks。`subagents` 是可选加速能力，只有宿主确实
支持 runtime-native children 且本次解析选择该模式时才启用。OpenAI 的 `agents/openai.yaml` 只是可选 UI
adapter，不参与生产 authority。完整入口与能力矩阵见
[Agent 兼容性指南](docs/guides/AGENT_COMPATIBILITY.md)。

## 面向用户的产品目标

普通用户最终安装并运行 `AXMORF Studio`，不需要 clone 仓库或安装 Node/npm/Git。v1 是 macOS 13+ Electron
App，分别发布 Apple Silicon `arm64` 与 Intel `x64` 的完整离线 unsigned DMG；用户作品位于单一 Workspace
Root，用户自己的 Codex 或 Hermes 通过 workspace-local Skill 与 `.rsp/bin/rsp` 协作，App 不内置 Agent。
Delivery 默认由用户手动触发，App 更新与 Workspace 数据分离。完整目标见
[Desktop App 产品架构](docs/DESKTOP_APP_PRODUCT.md) 与
[macOS 维护与发行](docs/DESKTOP_APP_MACOS_MAINTENANCE.md)。

Phase B Workspace production 与 Phase C arm64/真实 Intel x64 native gate 已验证完成；gate 使用 deterministic task
executor，不等于已安装外部创作 Agent 的真实创意生产证明。Phase D 已实现 internal/manual-only ordinary unsigned DMG
并完成双架构 installer artifact evidence；Remotion redistribution 许可、签名、公证和公开发行仍未完成。
下面的 npm 命令继续服务 repository contributor；精确完成状态只看
[ITERATION_STATUS.md](docs/ITERATION_STATUS.md)。

## 快速开始

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

## Desktop 开发与 installer 验证

当前 `AXMORF Studio` 使用 embedded Runtime Pack、Workspace-owned production、authenticated `rsp-local-v2`、原生
`<video>` 和只读 Scene/narration/caption 时间轴；它不启动或嵌入 Remotion Studio/Settings Web service。只有与
current source 匹配且 exact-four-file 复验通过的 Delivery 才进入 Preview Catalog。

```bash
npm run desktop:check
npm run desktop:integration-smoke
```

macOS 开发机可继续运行：

```bash
npm run desktop:start
npm run desktop:package
```

`desktop:package` 只生成本机架构的内部未签名 `.app` 开发证据，不生成 DMG。Phase B 的 Apple Silicon packaged
production 与 Phase C 双架构原生证据已验证。Phase D `desktop:dmg` 必须先取得同一 exact commit/architecture 的
native gate evidence，随后重新构建 ordinary package、生成 DMG 并完成挂载/隔离安装验证；精确命令、artifact contract
与未满足的许可/签名/公开发行边界见
[Desktop Phase D internal unsigned DMG](docs/guides/DESKTOP_PHASE_D_UNSIGNED_DMG.md)。

本地配置页：

```bash
npm run config:dev
```

配置页统一维护 Agent 默认执行模式/并发上限、local/cloud TTS providers、默认 voice/render/readability/scene
templates/publishing collections，
并展示 source readiness、current Revision、estimated/actual cost、逐任务 direct/dependency/artifact 解释、
latest ExecutionAttempt diagnostic 和 current four-file delivery。private config 保持 ignored；UI/API 不读取
protected voice contents 或 raw fingerprints。

packaged Desktop 另有独立“Preview / 配置”导航，复用上述纯表单和校验模型，但不启动或嵌入 Settings Web
service。Desktop 的 Provider/voice/render/readability/Scene/collection/Agent execution/Delivery defaults 只写入 macOS
Application Support 的单一加密 private config；token/API Key 只写不回显，保存错误按字段、加密存储与 Engine restart
分类显示。

Workspace 外部 Agent 创建 Project 前可直接读取 packaged contract，无需源码 checkout：

```bash
./.rsp/bin/rsp schema project-create
./.rsp/bin/rsp project create < project-create-input.json
```

stdin 必须是 raw `ProjectCreateInput`，禁止 `command/input/protocolVersion/requestId/workspaceId` wrapper；用户未指定
边界模板时省略 `sceneTemplates` 以继承当前配置。无效输入返回脱敏字段级 `issues[]`。

## 新建 Project

新 Project 使用 `private/producer.config.json` 中的 defaults；先创作一个 strict、repository-relative 的
create input，其中包含 Story、narrated beats 的 exact `ttsChunks`、视觉与发布选择，然后：

```bash
npm run project:create -- --project <story-id> --input <repository-relative-json>
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

## 生产一个 Project

1. 在 inspect 前按“当前用户提示词明确字段 → 配置页 → 内置默认”解析本次执行策略。内置默认是宿主中立的
   `inline`；提示词 override 不自动保存：

```bash
npm run project:execution:resolve -- [--mode inline|subagents] [--max-concurrency <n>] [--require-exact-concurrency] [--runtime-max-concurrency <n>]
```

仓库并发上限为 4；runtime capacity 未知按 1、明确为 0 时阻塞。非 exact 请求会明确显示 clamp，无法满足
的 exact 请求在 prepare 前阻塞。解析结果只属于本次编排，不进入生产 identity。

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
   pool，任务多于槽位时仅 wait-any 释放 admission slot。每个 executor 在自己的 workspace 内循环：

```bash
npm run project:task:check -- --task <task-revision>
npm run project:task:commit -- --task <task-revision> --attempt <attempt-id>
npm run project:task:fail -- --task <task-revision> --attempt <attempt-id> --kind task|host
```

5. 串行执行完或全部 bounded admission 完成后，Root 的最后一个生产动作是启动 exact `continuationCommand`：

```bash
npm run project:produce:continue -- --project <story-id> --revision <revision-id> --attempt <attempt-id>
```

此后 Root 挂起且不再轮询、推理、修复或重试。fixed continuation 先原子占用 exact attempt，只读取 immutable
task-terminal event log；重复 continuation fail closed。任一失败非零退出且不 converge；全部成功才内部调用一次
converge；从 attempt 创建起一小时内缺少终态会写 timeout failure 后退出；converge 失败同样直接退出。内部 converge 先只读
重算 current Revision/plan，再验证/materialize artifacts、刷新 packages/registry/Composition 并写入
`source-current`。repository contributor 命令显式采用 `automatic` policy，随后同步构建 current Delivery；Desktop
`manual` policy 则在 source-current 返回，later explicit Delivery 不会创建 provider、Agent task 或新 attempt。聊天终态
不作 authority；只有 ArtifactAttestation、复验后的 source-current 和 exact-four-file package 作 authority。详细步骤见
[生产编排指南](docs/guides/PRODUCTION_ORCHESTRATION.md) 与
[本地交付指南](docs/guides/LOCAL_DELIVERY.md)。

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

它清理 Project-owned source/public/narration/work/artifact/attempt/legacy history/out/delivery，并重建
Registry/Catalog；不会删除 core、其他 Project、shared assets、private config 或 voice profiles。删除矩阵只在
`mktemp` 隔离副本运行。

## Repository layout

```text
src/contracts/                        versioned JSON-safe contracts
src/remotion/                         runtime components and top-level ownership
src/projects/<storyId>/               ignored authoring + materialized Project source
scripts/project-production/           Revision/DAG/workspace/artifact/convergence/delivery
scripts/narration/                    provider attempts, PCM seal, timing
scripts/scene-package/                 deterministic ScenePackage/Coverage projection
scripts/renderer-registry/             static composition registry generation
.producer-work/<story>/<task>/         ignored task workspaces
.producer-artifacts/<story>/           ignored reusable attested artifacts
.producer-attempts/<story>/            ignored diagnostic attempts
.producer-runs/                        ignored legacy deletion-only history
deliveries/<story>/                    ignored exact current four-file package
settings/                              local configuration/progress UI and API
docs/                                  current authority, guides, evidence, archive
```

## 工程边界

- 保护未提交/ignored 用户数据，不 reset，不 broad delete，不使用 `git add .`，不 push 除非明确授权。
- Project/runtime code 不读取 historical execution data、private values 或 protected voice bytes。
- domain/application/adapters 分层；render runtime 不调用 filesystem discovery、Agent、Skill、MCP 或网络。
- 修改后先 focused tests，再按风险运行 `npm run check`；不能运行的检查必须明确报告。
