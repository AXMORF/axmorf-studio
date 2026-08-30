# Deterministic Execution

> 文档类型：确定性 authority

## 1. Identity 原则

所有 content identity 使用 canonical JSON 和 SHA-256。数组在 contract 指定处排序且唯一；任何 stale
derived fingerprint 在 parse 时拒绝。以下数据永不进入 RevisionId、TaskRevision、ArtifactAttestation 或
DeliveryBuildId：ExecutionAttempt ID、clock、PID、absolute path、workspace location、Agent/child identity、
chat、heartbeat、token usage。

OS、CPU architecture、reference-environment label、Node/npm install path、Agent 的环境准备步骤和 doctor diagnostic
同样不进入 content identity。它们只决定当前 Workspace 能否通过 capability gate；通过 gate 不改变相同 inputs 的
Revision/Task/Artifact/Delivery identity，也不替代 exact delivery validation。

ProductionInspection、TaskDecisionExplanation、diagnostic baseline、estimated/actual cost 和 ExecutionAttempt
都属于 diagnostic plane。即使缺失、损坏或不可用，也只能降低解释完整度，不能改变 production identity、
artifact classification、dispatch、materialization 或 delivery authority。

TTS waveform 不要求跨 provider call bit-for-bit 可重复；一旦 provider attempt 与 canonical PCM 通过校验，
后续以 sealed bytes、checksum、generation fingerprint 和 actual sample count 为 authority。

## 2. ProductionRevision

Revision 绑定显式 contract fingerprints、configured template identities、selected resource bytes、narration
generation identity 和相关 policy fingerprints。输入列表规范排序。修改无关 Project、attempt 或 historical
data 不改变 Revision。

resource manifest 不能只绑定元数据；selected bytes/checksum drift 必须改变 identity 或 fail closed。private
secret value 不进入 Revision，只有 private-safe provider/voice/policy identity。

Composition readability policy 作为 Revision policy identity，但 Scene task 只绑定由它确定性派生的
safe-area-local SceneViewport fingerprint（width/height/min font size/coordinate space）。raw full-frame
policy fingerprint/width/height/insets 均不进入 Scene workspace；Composition 在 runtime 重新从当前 policy 派生
SceneViewport，并与 task/package 绑定的 boundary version/fingerprint fail-closed 对齐。

Configured template instance 另外绑定 copied Renderer adapter 与完整 import graph。adapter 只做
`viewportWidth`/`viewportHeight` → 模板内部 `width`/`height` 的确定性映射；adapter/layout bytes 改变会改变
未来 instance/source-graph identity，但不会跨过 immutable copy 边界重写既有 Project。

## 3. TaskRevision 与精确失效

每个 node key 包含 task kind、story/semantic identity、Revision reference、最小 input fingerprints、dependency
artifact identities、declared reads/outputs 和 validator policy。Task graph stable-sort 并拒绝 cycle、duplicate、
unknown dependency。

失效解释把正交事实分开：typed `artifactState` 描述目标 artifact 的 current integrity；`directChanges`
只比较 allowlisted input/validator/declared-I/O snapshot；`dependencyChanges` 与 `blockedBy` 只沿已验证 DAG
edges 传播。hash 不可反解，因此 baseline 不可用时明确标记，不能把 artifact missing 猜成某个 input change。

预期 invalidation：

- 一个 Scene brief 变化：该 Scene 与必要 convergence/delivery dirty，其他 Scene/TTS/GlobalVisual/Cover reused；
- Cover input 变化：Cover 与 delivery dirty；
- 一个 TTS chunk 变化：其他 chunk reused，seal/timing 及实际受 timing 影响的 Scene dirty；
- shared renderer runtime 变化：相关 Scene/convergence/delivery dirty；
- readability 改变：只有派生 SceneViewport 或 caption/runtime policy 真正变化的下游 dirty；
- 一个 validator policy 变化：只影响该 task kind；
- attempt、历史数据或无关 Project 变化：current identities 不变。

## 4. Workspace 与 Artifact Store

workspace roots 只由 strict storyId/taskRevision 推导。`task.json` 与 seed inputs 是 immutable fixed writes；Agent
只写 declared outputs。read-only check 可重复且不写 authority。

commit 重跑 validator，递归检查 exact entry set，拒绝 unknown/duplicate/escape/absolute/backslash path、symlink、
FIFO/device 和 checksum drift。ArtifactAttestation 由实际 output bytes 构建；manifest 最后写。promotion 使用
同父 staging + atomic rename，失败回滚旧 artifact。commit/fail 必须写入 prepare 指定的 exact attempt；一个
TaskRevision 的首个 task-terminal outcome 不可被相反结果覆盖，相同结果重复提交只读幂等。相同 artifact
identity/bytes 保持 byte/mtime 稳定；冲突 fail closed。

## 5. Narration 与 timing

Agent-authored `ttsChunks` 是一次 provider request 的语义单位。generation/provider attempt cache 以 authored
text、provider/voice/rate/options 和 policy identity 寻址，不隐式 split/retry/fallback。seal 只有在所有 PCM
都通过格式、sample-rate/channel/finite-sample/checksum 校验后产生。

SemanticTiming 的 boundary 是：

```text
ceilDiv(cumulativeSamples × fps, sampleRate)
```

Scene/CaptionCue/Composition 消费同一 timing artifact；transition 不移动、缩短或覆盖 spoken frames。

## 6. Fixed continuation、convergence 与 materialization

Root 派发全部 dirty Agent tasks 后只启动 prepare 返回的 attempt-bound fixed continuation，然后挂起。该
bounded process 先以原子 create 建立不可重复的 attempt claim，再通过 filesystem event 等待 immutable event
log，而不依赖 progress projection，也不由 Root 轮询。任一 Agent task failure 先把 attempt 终结为 failed，
再非零退出且不调用 converge；全部 Agent task outcomes 为 committed/current 时，内部只调用一次 converge。
从 ExecutionAttempt 创建起一小时总 deadline 到期仍缺 terminal 时原子写 timeout failure 并退出。converge failure 直接退出，不 retry、
不修复，也不重新进入 Root。

内部 converge 每次通过 read-only current-plan builder 重新计算 current Revision/Plan；不调用 provider、不创建
workspace/attempt。调用方 revision stale 时不采用旧 artifact。required artifacts
齐全前零 live mutation。所有 owned roots 先 staging，再 controlled replace；跨 root 操作记录 previous targets，
捕获失败按逆序恢复。

物化后从 live filesystem 重新枚举 exact logical paths，验证 regular/no-symlink、size 和 checksum 与 attestation
逐项相同。只有通过后才生成 ScenePackage/Coverage/RendererRegistry/GlobalVisualPackage/Composition；生成步骤
再次严格解析 upstream contracts。

Template Scene 的 current-plan 读取会排除 live-only fixed projections，并将已存在的 canonical derived
outputs 幂等归一到 shared exact output contract。因此物化本身不改变该 fixed task 的 TaskRevision；
Artifact Store 仍通过 exact files/checksums 拒绝未知或漂移内容。

## 7. DeliveryBuild

DeliveryBuildId 由 revisionId、artifact set fingerprint、Composition id/fps/frameCount/width/height 和 exact build
policy 计算。build 前后复验 materialized bytes，防止 manual drift。

同 identity staging 中已经通过 inspect 的 media 可复用；损坏或不匹配 media 删除后只重做该项。render 输出
先写 temporary，inspect 成功后 rename；`publish.json` 在全部媒体通过后最后写。current package promotion 使用
受控 replace/rollback，失败保持上一 current package。

current validation 要求 exact filenames、regular files、publish identity、checksums/sizes、H.264/AAC/channels、
video dimensions/fps/frame count/EOF、Cover PNG dimensions/decode 全部一致。同 identity 完整 package 返回只读
no-op。

## 8. Idempotence 与 failure

- create：same creation identity → read-only current；different/partial target → fail closed，不覆盖；
- inspect：同 source/cache/artifact/delivery snapshot → byte-equivalent read model、零 provider/零写入；
- prepare：同 inputs + valid store → same Revision/Task identities and reuse classification；新 attempt 仍只诊断；
- check：同 workspace → same read-only result；
- task terminal：同 attempt/task/result → no-op；相反 result → immutable-terminal conflict；
- commit：same artifact identity/bytes → no-op，different bytes → conflict；
- continuation：同 active attempt 只有一个 atomic claim；只消费 plan-bound immutable terminal events；failure
  不 converge，all-success 内部 converge once，attempt 创建起一小时 deadline 到期原子失败；
- converge：只由 fixed continuation 调用；same revision/artifact set/materialized bytes → deterministic projection；
- delivery：same complete DeliveryBuildId → current no-op；captured staging failure → later reuse valid media；
- settings progress：malformed diagnostic/historical data 不影响 current classification 或 projection authority；
- delete：严格 story ownership，可重复清理 missing targets，并保护其他 roots。

系统不得用自动 retry、compatibility shim、fallback output、Agent 自评或手工修复 manifest 来制造幂等。
