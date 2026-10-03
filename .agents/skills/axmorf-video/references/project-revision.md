# Project revision workflow

Never edit live authoring for an existing Project. Read its exact current context, validate strict raw input, then
create the isolated candidate:

```bash
npm run project:revise:context -- --project <storyId>
npm run project:revise:validate -- --input <repository-relative-json>
npm run project:revise -- --project <storyId> --input <repository-relative-json>
```

revision 无 `--schema`；validate 仅 `--input`，不加 `--project`。先核 installed public `ProjectRevisionInputSchema`
（`@axmorf/studio/contracts`）。raw 顶层为 `schemaVersion: 1`、`contractVersion: "project-revision-input-v1"`、
`storyId`、`baseRevisionId`、`baseDeliveryBuildId`、`patch`。
局部 Scene 排版只改完整 `patch.scenes` 列表中目标 Scene 的 brief；不顺手改全局 VisualStyle/GlobalVisual/Story/TTS。
patch 仅支持 brief/story/visualStyle/scenes/globalVisual/publishing，无 Cover-only API；无法按范围表达时报告限制。

The input binds `baseRevisionId` and verified `baseDeliveryBuildId`. Candidate source/public/narration/work/attempt/
output/Delivery stay isolated; live Project and current Delivery remain authoritative before promotion. Candidates
cannot import new assets and use only Project-owned media frozen in the base snapshot.

每次 live/candidate production（含同请求自主 revision）都重新验证当前 capability、成功 execution resolve 一次，再 inspect、
报告 source readiness/cost/artifact reuse/结构化失效、prepare；不沿用上轮 probe/resolver。局部修订出现无关 dirty tasks 时，
prepare 前缩小 raw patch 并 validate/create 新 candidate，再走本轮入口；全重做不证明局部 reuse。
Use the returned `--candidate <candidateId>` on every inspect, prepare, task, continuation, and recovery command.
Candidate continuation verifies isolated exact-four files, then attempts controlled promotion. A promotion failure
rolls the source/public/narration/delivery transaction back together and leaves the candidate retryable:

```bash
npm run project:revision:promote -- --project <storyId> --candidate <candidateId> --revision <revisionId> --delivery <deliveryBuildId>
```

This retries promotion only. Do not reissue a successfully produced candidate attempt.

主题修订必须保留或替换完整 `visualStyle.theme` 四角色颜色；不能删除已有主题。旧 Project 的 immutable 首尾没有主题接口时，不能在 revision 中直接添加新主题，需新建 Project，禁止修改旧模板副本。
