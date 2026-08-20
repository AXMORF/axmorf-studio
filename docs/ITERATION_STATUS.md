# Iteration Status

> 文档类型：current implementation authority
>
> 最后复核：2026-08-20 clean-break implementation

## 当前结论

仓库当前 production authority 已收敛为 ProductionRevision、content-addressed Task DAG、task workspace、
ArtifactAttestation、reusable Artifact Store、fixed convergence 与 synchronous exact four-file delivery。
package scripts 只保留：

```text
project:produce:plan
project:task:check
project:task:commit
project:produce:converge
```

旧 production/delivery/build command surface 与对应 active contracts/implementation/tests 已移除，不提供转发
shim。历史 `.producer-runs` 数据保持原位，但 current planning/convergence/build/settings 不读取；删除器内部只
保留 strict ownership parser。

## 已实现 contracts 与 domain

- `ProductionRevision`、`ProducerTaskSpec/TaskRevision`、`ArtifactAttestation`、`ProducerPlan`、
  `ExecutionAttempt`、`DeliveryBuild/DeliveryPublish`；
- Revision/DAG/invalidation/plan pure domain；DAG cycle/duplicate/unknown dependency/stable ordering gates；
- renamed Project authoring contracts `authoring-requirements` 与 `scene-readability`，不导出旧 runtime authority；
- attempt/time/path/process identity exclusion 与 per-kind validator version invalidation tests。

## 已实现 workspace 与 Artifact Store

- `.producer-work/<storyId>/<taskRevision>` strict resolution、immutable task/input seeds 和 exact cleanup；
- workspace/output path containment、regular/no-symlink、unknown/special file rejection；
- fixed check、commit-time recheck、attestation generation、same-parent staging、atomic promotion、identity conflict
  与 rollback；
- `.producer-attempts` append-only diagnostics，写入失败不污染 artifacts。

## 已实现 planning 与 task owners

- planner 从 current Project contracts、template instances、asset manifest/selected bytes、narration identity 和
  runtime policies 计算 Revision/Task DAG；
- Scene、GlobalVisual、Cover workspace validators 与 commit flow；
- template-copy Scene 固定任务，不进入 Agent dispatch；
- Root-facing plan 输出 stable reused/dirty/blocked summary 和 dirty Agent TaskRevisions；
- Scene child 继续受 repository-local `remotion-best-practices`、readability、安全区、resource/license 与
  Remotion runtime gates 约束。

## 已实现 convergence 与 delivery

- stale revision/incomplete artifact 在任何 live mutation 前拒绝；
- task-owned staging、controlled replace、rollback 和 materialized bytes revalidation；
- ScenePackage、Coverage、RendererRegistry、GlobalVisualPackage 与生成式 Composition fixed refresh；
- build-owned staging、validated media reuse、synchronous Remotion/FFmpeg、H.264/AAC/channels、dimensions、fps、
  frame count、PNG、checksums 与 EOF decode；
- `publish.json` 最后写、exact four files、controlled current replacement 与 same identity no-op。

## Settings、删除与 zero Project

- settings schema v4 展示 current Revision、task summary、latest attempt diagnostic 和 four-file delivery；
- source Project enumeration 不读取 historical data，也不把 output-only roots 伪装成 Project；
- deletion scope 增加 `.producer-work`、`.producer-artifacts`、`.producer-attempts`，继续保护 private、voice、
  shared/core 与 other Projects；
- bootstrap、Registry、Catalog 和 settings 支持 zero Project。

## 验证边界

focused contracts/domain/store/workspace/task/convergence/delivery/settings/deletion/E2E tests 保护失败后 artifact
复用、dirty-only dispatch、精确 invalidation、安全边界、历史隔离、current no-op 与 delivery failure reuse。

最终验收必须按顺序运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run docs:check-links`、
`npm run check:static`、`npm run compositions`、`npm run check`。如果本次工作尚未取得某项 Green，交付报告必须
明确列出，不得仅凭本文宣称通过。

## 当前非目标

远程 scheduler/database/artifact store、平台发布、账号、上传、child identity persistence、subjective quality
gate、automatic capability promotion、Docker 和新的 TTS Gateway 均未实现。
