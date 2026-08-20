# Production Workflow

> 文档类型：生产流程 authority
>
> 本文只描述 current Revision/DAG/Artifact 主链。

## 1. 主链概览

```mermaid
flowchart LR
  Author[Project authoring source] --> Plan[ProductionRevision + Task DAG]
  Plan --> Inspect[Revalidate Artifact Store]
  Inspect --> Reuse[Reuse valid artifacts]
  Inspect --> Dirty[Create dirty task workspaces]
  Dirty --> Children[Runtime-native task children]
  Children --> Check[Read-only task check]
  Check --> Commit[Validator recheck + ArtifactAttestation]
  Reuse --> Barrier[All required artifacts]
  Commit --> Barrier
  Barrier --> Materialize[Controlled materialization]
  Materialize --> Derived[Packages + Registry + Composition]
  Derived --> Build[Synchronous media build]
  Build --> Verify[Exact four-file validation]
  Verify --> Current[Controlled current delivery]
```

一个新 ExecutionAttempt 可以失败或消失；已验证 artifact 仍按内容 identity 复用。历史执行目录不参与
plan、converge、delivery 或 settings progress。

## 2. Project authoring

新 Project 使用 `project:configure` 将 ProducerConfig 的 render/readability/TTS defaults 与选定 boundary
Scene templates 投影到 Project-local authoring source。已有 Project 不读取共享 template 的后续变化。

StoryBeat 明确区分 narrated-scene 与 silent-scene。narrated beat 的 `ttsChunks` 是 Agent-authored atomic
units；silent beat 只允许在首尾，使用固定 frame/template/sound，不创建 TTS、CaptionCue 或 sealed segment。
外部媒体必须先经 `project:asset:import` 本地化为 Project-owned、runtime-approved asset，只有 manifest ID
和校验后的 bytes fingerprint 进入 Revision/task inputs。

## 3. Revision 与计划

运行：

```bash
npm run project:produce:plan -- --project <storyId>
```

planner 严格读取 StorySpec、NarrationSpec、RenderSpec、VisualStyleSpec、PublishingIntent、sound、authoring
requirements/readability、SceneProductionBrief、GlobalVisualBrief、StoryResourcePool、configured template
instances、asset manifest/selected bytes、narration generation identity 与相关 policy fingerprints。

它生成：

- `ProductionRevision`：只含生产输入，不含 Agent output 或过程数据；
- `ProducerTaskSpec[]`：内容寻址 DAG nodes，具备 dependency artifacts、declared read/output set 和
  task-kind validator policy；
- `ProducerPlan`：稳定排序的 `reused/dirty/missing/incompatible/blocked` 状态与 reason；
- `ExecutionAttempt`：计划、等待、收敛或失败诊断，不进入任何产物 identity。

Task kinds 包括 narration chunk/seal/timing、scene-template、scene-owner、global-visual-owner、cover-owner、
composition-convergence 与 delivery-build。共享输入只进入真正依赖它的 node key，避免全局版本导致无差别失效。

## 4. Artifact reuse 与 task workspace

每个 artifact hit 都重新解析 ArtifactAttestation，并复验 task/dependencies/policy、exact sorted output set、
normalized contained paths、regular files、no symlink、size 与 checksum。任何 unknown file、escape、special file、
stale checksum 或 identity conflict 都 fail closed。

planner 只为 non-reused task 建立：

```text
.producer-work/<storyId>/<taskRevision>/
├── task.json
├── inputs/context.json
└── <declared outputs>
```

Agent 不能直接写 live Project。Root 只将 dirty `scene-owner`、`global-visual-owner`、`cover-owner` 各自交给
一个 runtime-native child；`scene-template` 和其他 fixed tasks 不派发。容量受限可分批，但一 child 只拥有
一个 TaskRevision。Scene child 完整读取 repository-local `remotion-best-practices`，且不能用 Skill 扩大
TaskSpec/validator/write scope。

child 在 workspace 内循环：

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision>
```

check 只读；commit 必须重跑同一 validator。成功 promotion 使用同父 staging/atomic rename，manifest 最后写，
并产生 immutable ArtifactAttestation。相同 identity/bytes no-op；冲突绝不覆盖。child chat 仅用于 barrier，
不进入 repository state。

## 5. Convergence 与物化

Root 等待全部已派发 child 达到 committed/current、明确 task failure 或 host failure 后，在一次编排尝试中
恰好调用一次：

```bash
npm run project:produce:converge -- --project <storyId> --revision <revisionId>
```

converge 先重新计划 current inputs；revision 不同返回 stable stale 结果。任何 required artifact 缺失时，
返回 incomplete 且不得写 live owner roots 或 delivery。

齐全后，materializer 从 Artifact Store 读取 bytes，分别对 Scene、GlobalVisual、Cover owned roots 使用
staging + controlled replace + rollback。随后 fixed application 机械刷新 ScenePackage、Coverage、
RendererRegistry、GlobalVisualPackage 与生成式 Composition。它必须从 live paths 重读 exact outputs，并证明
与 ArtifactAttestation 的 path/size/checksum 一致，人工漂移不能进入 build。

## 6. 同步四文件 delivery

DeliveryBuildId 绑定 `revisionId + artifactSetFingerprint + Composition metadata + build policy`。build 前后都
复验 materialized bytes。每个 Project 有一个 build-owned staging，可复用同 identity 已验证的 video 或 Cover；
捕获到的失败不替换 current package。

build 同步等待 Remotion/FFmpeg，依次验证：

- video 是 H.264/AAC，声道、尺寸、fps、frame count 与 RenderSpec 一致并 EOF-decode；
- Covers 是 exact 1600×1200 和 1200×1600 PNG 且可完整 decode；
- 三个媒体的 repository path、size、checksum 与 `publish.json` 一致；
- directory exact 只有 `video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`。

`publish.json` 最后写。四文件全部通过才 controlled replace `deliveries/<storyId>/`。相同完整 identity 返回
`project-production-current`；新 package 成功提升返回 `project-production-complete`。这两个状态均证明实际
current files 完整，不是计划、聊天或进程启动事实。

## 7. Progress 与失败后继续

settings API 从 `src/projects/` 枚举 source Projects，展示 current Revision、task counts、latest attempt
diagnostic 和 four-file delivery。它不扫描历史执行数据，也不把 `out/` 或 delivery-only 目录伪装成 Project。

若三个 Agent tasks 中两个已 commit、第三个失败，新 attempt 重新 plan 时前两个必须是 reused，只派发第三个。
delivery 若在生成 video 后失败，再次执行复用已验证 staging video，只生成缺失媒体。任何 retry 语义都由新
attempt + content inspection 得出，而不是修改失败记录。

## 8. 作品删除

用户明确删除一个或多个作品时，默认含义是删除其全部本地 production data，而不是只删 MP4：

```bash
npm run project:delete -- --project <storyId> --confirm-delete
```

删除器要求完整 Project ID，精确清理 `src/projects`、Project-owned `public`、`.narration-work`、
`.producer-work`、`.producer-artifacts`、`.producer-attempts`、legacy `.producer-runs`、`out` 和 `deliveries`
中的对应 ownership roots，并重建 Registry/Catalog。它不删除 core、其他 Project、shared assets、private
config 或 voice profiles。

legacy data 仅在删除器内部以最小严格 `runId/storyId` parser 判定 ownership；这不是 runtime compatibility。
删除矩阵只允许在 `mktemp` 隔离副本中运行。

## 9. 固定流程故障

Agent workspace validator 失败由同一 child 修正 owning output 并重跑。validator/store/materialization/
delivery 在 valid input 下失败是 shared system defect：停止、保存脱敏 incident、增加精确 Red、实施最小
Green、运行 focused/full gates，然后从 current inputs 新建 attempt。不得手改 artifact/current delivery、
增加 fallback success、自动重试 provider、预热 TTS 或降低 Chromium sandbox。
