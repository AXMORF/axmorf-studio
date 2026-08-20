# Remotion Story Producer

一个以 Remotion 为渲染运行时、以 Project authoring revision 和内容寻址 artifacts 为生产 authority 的本地
视频生产仓库。Agent 负责创意任务；固定脚本负责输入快照、验证、artifact promotion、Project 物化和同步交付。

## 当前主链

```text
Project source
  → read-only inspection and cost/invalidation report
  → explicit fixed preparation
  → ProductionRevision
  → content-addressed Task DAG
  → reuse valid ArtifactAttestations / dispatch dirty Agent tasks
  → fixed convergence and materialization
  → synchronous exact four-file delivery
```

核心性质：

- RevisionId、TaskRevision、ArtifactAttestation 与 DeliveryBuildId 不绑定 attempt、时钟、PID、绝对路径或
  Agent identity；
- Agent child 只写 `.producer-work/<storyId>/<taskRevision>/`，fixed commit 重跑 validator 后才能产生
  ArtifactAttestation；
- 新 attempt 机械复用 valid artifacts，只派发仍 dirty 的 Scene/GlobalVisual/Cover tasks；
- inspection、estimate、baseline、explanation 与 attempt 都只属于 diagnostic plane，不进入或改变任何
  production/artifact/delivery identity 或 authority；
- template-copy Scenes 由 fixed task 处理，不派发 Agent；
- converge 重新计算 current Revision，全部 artifact 齐全才受控物化 Project；
- delivery 同步生成并验证 `video.mp4`、两张 PNG Cover 和 `publish.json`，全部通过才替换 current slot；
- `project-production-complete` 与 `project-production-current` 都表示实际 current four files 已机械复验。

产品目标、实现状态和精确 contract 请从 [文档导航](docs/README.md) 进入。生产 Agent 使用
[remotion-story-producer-video Skill](.agents/skills/remotion-story-producer-video/SKILL.md)；每个 Scene child
还必须完整读取 repository-local `remotion-best-practices`。

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

本地配置页：

```bash
npm run config:dev
```

配置页统一维护 local/cloud TTS providers、默认 voice/render/readability/scene templates/publishing collections，
并展示 source readiness、current Revision、estimated/actual cost、逐任务 direct/dependency/artifact 解释、
latest ExecutionAttempt diagnostic 和 current four-file delivery。private config 保持 ignored；UI/API 不读取
protected voice contents 或 raw fingerprints。

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

provider acquisition evidence 只存在于 adapter boundary；远程 URL、SDK、MCP、token 与 API key 不进入 task
workspace、Artifact Store、delivery 或 Remotion runtime。

## 生产一个 Project

1. 严格只读检查 source readiness、预计 provider/cache/Agent/delivery 成本、artifact reuse 与逐任务失效解释：

```bash
npm run project:produce:inspect -- --project <story-id>
```

Root 先向用户报告 inspection。unknown estimate 保持 unknown，不把诊断推测写入 data plane。

2. 明确执行唯一有成本的 preparation 入口；它才允许 provider/fixed preparation、workspace 与 attempt 写入：

```bash
npm run project:produce:prepare -- --project <story-id>
```

3. 只把 prepare 输出中的 `dirtyAgentTasks` 分别交给 runtime-native child。每个 child 在自己的 workspace 内循环：

```bash
npm run project:task:check -- --task <task-revision>
npm run project:task:commit -- --task <task-revision>
```

4. 只在当前任务内等待所有已派发 child 到达 committed/current、明确 task failure 或 host failure；不创建
watcher/scheduler。一次编排尝试中只调用一次：

```bash
npm run project:produce:converge -- --project <story-id> --revision <revision-id>
```

converge 先只读重算 current Revision/plan，再验证/materialize artifacts、刷新 packages/registry/Composition，
并同步构建 current delivery；它不调用 provider或创建 workspace/attempt。聊天终态
不作 authority；只有 ArtifactAttestation 和验证后的 four-file package 作 authority。详细步骤见
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
