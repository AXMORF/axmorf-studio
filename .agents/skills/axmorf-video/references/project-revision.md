# Project revision workflow

现有 Project 不改 live；先取精确 context、校验 raw input，再创建隔离 candidate：

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
`boundaryScenes` 必须按 context 给出的完整边界 meaningId/order 提交；`playbackRange: null` 恢复完整模板，
非空区间使用 `[startFrame,endFrame)`，只能选择已有 immutable instance 的帧，不改变源码、素材或身份。
模板配乐的可选 `musicVolume/musicFadeInFrames/musicFadeOutFrames` 仅作用于该区间；fixed 同步裁剪计划和音轨源起点。
`sound` 使用 context 的完整 ProjectSoundPlan input，只能修改已有 contribution 的 volume/fadeInFrames/fadeOutFrames；
resourceId、descriptorFingerprint、ID/order、loop 与 playbackScope 必须保留，不能在 candidate 接入新媒体。
升级后先复验现稿，再取 project:revise:context。缺 artifact 且完整 Scene task input 未变时可冻结当前 owning 源码为
bound priorSource；不读取其他 Project 或历史。

完整 patch.story 可显式重组 story.visualScenes，保留正文 meaningIds/顺序和 timingSource，fixed 首尾独立。
组内 brief delta 由第一 meaningId 的 owning graph 实现；coveredBriefs 冻结全部成员，组外有效 artifacts 复用。
authored-frames 以 preset 帧数定义时间，章节可为空或完整按正文顺序声明，不做隐式时间来源迁移。

input 绑定 `baseRevisionId`/已复验 `baseDeliveryBuildId`；candidate 的 source/public/narration/work/attempt/out/delivery
全部隔离，promotion 前 live/current 权威不变。只用 base snapshot 既有媒体，不导入新素材。
snapshot/record v2 冻结 root presence；无旁白允许 narration root 缺失并在晋升/回滚后保留缺失，
不手动补空目录。source/public/delivery 仍 required；旧 v1 candidate fail closed，用新 context 创建。

每轮 live/candidate（含自主 revision）重验 capability、成功 execution resolve，再 inspect、
报告 source readiness/cost/artifact reuse/结构化失效、prepare；不复用 probe/resolver。出现无关 dirty tasks 时，
prepare 前缩小 patch、validate/create 新 candidate，重走入口；全重做不证明局部 reuse。
inspect/prepare/task/continue/recovery 一律使用返回的 exact `--candidate <candidateId>`。
continuation 验证 candidate 四文件后尝试受控 promotion；失败完整回滚，保留候选可独立重试：

```bash
npm run project:revision:promote -- --project <storyId> --candidate <candidateId> --revision <revisionId> --delivery <deliveryBuildId>
```

仅重试 promotion。Do not reissue 已成功制作的 candidate attempt。

主题修订保留或替换完整 `visualStyle.theme` 四角色颜色，不能删除。旧 immutable 首尾不支持主题时需新建 Project，不改模板副本。
