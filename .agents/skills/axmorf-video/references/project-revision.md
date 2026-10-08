# Project revision workflow

现有 Project 不改 live；先取 exact current context、校验 strict raw input，再创建隔离 candidate：

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

当前源码支持显式 story.visualScenes 重组，完整 patch.story 必须保持正文 meaningIds/顺序与原 timingSource，
fixed 首尾不合组。合组内任一 Beat brief 的局部 delta 由第一 meaningId 的同一 owning source graph 实现，
coveredBriefs 冻结所有成员，组外有效 artifacts 继续复用；不能读取其他 executor 或历史 Scene。
authored-frames 以 preset 帧数定义时间，章节可为空或完整按正文顺序声明，不做隐式时间来源迁移。

input 绑定 `baseRevisionId` 与已复验 `baseDeliveryBuildId`；candidate 的 source/public/narration/work/attempt/out/delivery
全部隔离，promotion 前 live/current 仍是 authority。候选只用 base snapshot 的既有 Project-owned media，不能导入新素材。
snapshot/record v2 冻结 root presence；authored-frames 允许 narration root 缺失并在晋升/回滚后保留缺失，
不手动补空目录。source/public/delivery 仍 required；旧 v1 candidate fail closed，用新 exact context 创建。

每次 live/candidate production（含同请求自主 revision）都重新验证当前 capability、成功 execution resolve 一次，再 inspect、
报告 source readiness/cost/artifact reuse/结构化失效、prepare；不沿用上轮 probe/resolver。局部修订出现无关 dirty tasks 时，
prepare 前缩小 raw patch 并 validate/create 新 candidate，再走本轮入口；全重做不证明局部 reuse。
inspect/prepare/task/continue/recovery 一律使用返回的 exact `--candidate <candidateId>`。
continuation 验证 candidate 四文件后尝试受控 promotion；失败完整回滚，保留候选可独立重试：

```bash
npm run project:revision:promote -- --project <storyId> --candidate <candidateId> --revision <revisionId> --delivery <deliveryBuildId>
```

This retries promotion only. Do not reissue a successfully produced candidate attempt.

主题修订必须保留或替换完整 `visualStyle.theme` 四角色颜色；不能删除已有主题。旧 Project 的 immutable 首尾没有主题接口时，不能在 revision 中直接添加新主题，需新建 Project，禁止修改旧模板副本。
