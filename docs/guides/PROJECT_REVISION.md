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
Scenes。先校验，再创建：

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

本流程不提供 candidate-local asset import。revision patch 只能引用 live Project 已经准入并纳入 base snapshot 的
Project-owned media。

## 3. Produce in the isolated scope

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

若 production 已成功而 promotion 失败，只重试 exact promotion：

```bash
npm run project:revision:promote -- --project <storyId> --candidate <candidateId> --revision <revisionId> --delivery <deliveryBuildId>
```

成功重复 promotion 返回 current。promotion retry 不重新 render、不调用 provider，也不是 failed-attempt reissue；
不得重开已经完成的 candidate production attempt。
