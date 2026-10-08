# Project revision candidates

> 文档类型：操作指南

现有 Project 只通过隔离 revision candidate 修改；不得原地编辑 live source。candidate 使用与 current Project
相同的 ProductionRevision、Task DAG、ArtifactAttestation 和 exact-four-file Delivery 主链，不形成第二条 authority。

## 1. Freeze the exact base

先读取只读 context：

```bash
npm run project:revise:context -- --project <storyId>
```

只有 live ProductionRevision、current `publish.json` 绑定的 revisionId 和已复验 four-file Delivery 一致时，
context 才返回 editable authoring、`baseRevisionId`、`baseDeliveryBuildId` 与固定约束。调用方不得自行猜测或复用
旧 base tuple。

## 2. Validate and create the candidate

raw input 必须是 strict `ProjectRevisionInput`：same `storyId`、exact base tuple、非空 authored patch。patch 只允许
`brief`、`story`、`visualStyle`、`scenes`、`globalVisual`、`publishing`，并保持 narrated meaningId/order 与 boundary
Scenes。revision 无 `--schema`；validate 只接 `--input`，不加 `--project`。先读 installed public schema 的 input 形状：

```bash
node --input-type=module -e 'import {ProjectRevisionInputSchema} from "@axmorf/studio/contracts"; console.log(JSON.stringify(ProjectRevisionInputSchema.toJSONSchema({io:"input"}), null, 2));'
```

raw 顶层固定为 `schemaVersion: 1`、`contractVersion: "project-revision-input-v1"`、`storyId`、
`baseRevisionId`、`baseDeliveryBuildId`、`patch`；不要提交 context response 或诊断 feedback。
局部 Scene 排版应复制 context 的完整 `editable.scenes`，只改目标 Scene 的 `compositionIntent`/`motionIntent` 等 brief 字段，
保留其他 Scene 及 VisualStyle/GlobalVisual/Story/TTS。VisualStyle 是全局共享输入，局部调整不能借改它触发全视觉重做。
patch 没有 Cover-only 字段；若公开 schema 无法表达范围内的修正，报告限制，不虚构 API。先校验，再创建：

revision validate/create 与 Project create 共用 structured pre-mutation authoring validation。若 patch 中某个
authored `ttsChunk` 超过 72 `caption-display-unit-v1` half-units，返回
`authoring-validation-failed` / `caption-display-budget-exceeded`；应改短或按自然语义拆分，不得降低 validator。

```bash
npm run project:revise:validate -- --input <repository-relative-json>
npm run project:revise -- --project <storyId> --input <repository-relative-json>
```

candidateId 由 canonical input 决定。candidate 隔离在
`.producer-revisions/<storyId>/<candidateId>/`，拥有自己的 source、public、narration、work、attempt、out 和
Delivery。runtime/config/operation lock 与 content-addressed Artifact Store 仍由 Workspace 共享。相同完整 input
和 base bytes 只读 current；stale base、bytes conflict、unknown entry、symlink、special file 或 path escape fail closed。

base snapshot/record v2 显式冻结每个 owned root 的 `present`/`absent` 状态；只有 Story 的
`authored-frames` 分支允许 narration root 不存在。candidate 保留真实缺失，不创建空目录代替；
source/public/delivery 仍必须存在，缺失路径的既有祖先也必须是安全真实目录。root presence drift 与 bytes drift
同样拒绝。旧 v1 candidate 不静默补充 presence，须以 exact current context 创建新 candidate。

本流程不提供 candidate-local asset import。revision patch 只能引用 live Project 已经准入并纳入 base snapshot 的
Project-owned media。

builder 在替换 authoring 或清理受影响 Scene 前，从已复验 base 冻结该普通 Scene 的完整本地 TS/TSX 图、plans、
许可及 lineage，保存到 authoring-owned `production/scene-prior-source.json`，纳入 candidate 的 authoring checksum。
prepare 将 owning entry 提供为 bound `context.scene.priorSource`，并声明必要 helper/许可输出；worker 只改本次 brief
要求的部分。新 Scene 没有 prior input，不得声称保留旧实现。固定模板不进入该输入。
未改 Scene 的 entry 保持不变；index 随 source promotion 保存。其指纹只进入 owning Scene TaskRevision，后续 replan
读取冻结输入，不能从新产出重新生成它。连续 A→B 修订保留 A 的输入和可用 artifact，现有 32 输出上限不变。

## 3. Produce in the isolated scope

每次 live/candidate production（含同一业务请求的自主 revision）都重新按 Skill 验证当前宿主 capability、释放 probe 槽位，
成功执行一次 `npm run project:execution:resolve` 后再 inspect；不得沿用上轮 probe/resolver。报告 `sourceState`、cost、
artifact reuse 和 structured invalidations 后才 prepare。局部修订有无关 dirty tasks 时，先缩小 raw patch、validate/create
新 candidate，再重走本轮入口；全重做不是局部 reuse 成功。

从 candidate create 返回值取得 exact `--candidate <candidateId>`。inspect、prepare、task bind/IO/terminal、
continue 与 recover/reissue 都使用返回的 candidate-routed commands；不得手工去掉或替换 candidate 参数。
candidateId、隔离路径与 promotion state 只属于 routing/diagnostic plane，不进入 ProductionRevision、TaskRevision、
ArtifactAttestation 或 DeliveryBuildId。

candidate 的 `video.mp4`、两张 Cover 与 `publish.json` 通过验证，只证明它具备 promotion 前提；live Project 与
current Delivery 在 promotion 成功前仍是唯一 current authority。

## 4. Promote or retry promotion

candidate continuation 在 exact-four validation 后自动尝试 promotion。fixed promotion 在 operation lock 内再次
复验 candidate definition/bytes、live base tuple 与四类 base snapshot、expected candidate Revision/Delivery tuple，
然后受控替换 source/public/narration/delivery 四个 Project-owned roots，刷新 Registry/Catalog 并复验结果。
任一步失败按逆序恢复上一 current roots，candidate 保留。
authored narration 的 absence 同样受控晋升并在 rollback 后保持缺失；不引入空 narration root。

若 production 已成功而 promotion 失败，只重试 exact promotion：

```bash
npm run project:revision:promote -- --project <storyId> --candidate <candidateId> --revision <revisionId> --delivery <deliveryBuildId>
```

成功重复 promotion 返回 current。promotion retry 不重新 render、不调用 provider，也不是 failed-attempt reissue；
不得重开已经完成的 candidate production attempt。
