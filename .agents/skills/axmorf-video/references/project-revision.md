# Project revision workflow

禁止原地改现有 Project。先复验 current context，validate strict raw input，再创建隔离候选：

```bash
npm run project:revise:context -- --project <storyId>
npm run project:revise:validate -- --input <repository-relative-json>
npm run project:revise -- --project <storyId> --input <repository-relative-json>
```

revision 无 `--schema`；validate 仅 `--input`，不加 `--project`。先核 installed public `ProjectRevisionInputSchema`
（`@axmorf/studio/contracts`）。raw 顶层为 `schemaVersion: 1`、`contractVersion: "project-revision-input-v1"`、
`storyId`、`baseRevisionId`、`baseDeliveryBuildId`、`patch`。
局部 Scene 排版只改完整 `patch.scenes` 列表中目标 Scene 的 brief；不顺手改全局 VisualStyle/GlobalVisual/Story/TTS。
patch 支持 brief/story/visualStyle/scenes/globalVisual/publishing，以及边界播放与现有音乐的窄修订；无 Cover-only API。
`boundaryScenes` 必须按 context 给出的完整边界 meaningId/order 提交；`playbackRange: null` 保留完整模板，
非空区间使用 `[startFrame,endFrame)`，只能选择已有 immutable instance 的帧，不改变源码、素材或身份。
可选 `musicVolume/musicFadeInFrames/musicFadeOutFrames` 只控制该区间的模板 BGM；固定任务同步裁剪 shot、anchor 与音轨源起点。
`sound` 使用 context 的完整 ProjectSoundPlan input，只能修改已有 contribution 的 volume/fadeInFrames/fadeOutFrames；
resourceId、descriptorFingerprint、ID/order、loop 与 playbackScope 必须保留，不能在 candidate 接入新媒体。
运行时升级改变策略指纹时，先正式复验现稿交付再取新 revision context；缺 artifact 且 owning current Scene
的完整 task input 未变时，可把复验后的当前源码冻结到 bound priorSource，禁止读其他 Project 或历史产物。

input 绑定 `baseRevisionId` 与已复验 `baseDeliveryBuildId`。候选 source/public/narration/work/attempt/out/delivery
隔离，promote 前 live Project/current Delivery 是 authority；候选仅用 base snapshot 已有 Project-owned media。

每次 live/candidate production（含同请求自主 revision）都重新验证当前 capability、成功 execution resolve 一次，再 inspect、
报告 source readiness/cost/artifact reuse/结构化失效、prepare；不沿用上轮 probe/resolver。局部修订出现无关 dirty tasks 时，
prepare 前缩小 raw patch 并 validate/create 新 candidate，再走本轮入口；全重做不证明局部 reuse。
inspect/prepare/task/continuation/recovery 逐次携带返回的 exact `--candidate <candidateId>`。
continuation 复验隔离 exact-four Delivery 后自动 promote；失败回滚 source/public/narration/delivery，候选保留可重试：

```bash
npm run project:revision:promote -- --project <storyId> --candidate <candidateId> --revision <revisionId> --delivery <deliveryBuildId>
```

This retries promotion only. Do not reissue a successfully produced candidate attempt.

主题修订必须保留或替换完整 `visualStyle.theme` 四角色颜色；不能删除已有主题。旧 Project 的 immutable 首尾没有主题接口时，不能在 revision 中直接添加新主题，需新建 Project，禁止修改旧模板副本。
