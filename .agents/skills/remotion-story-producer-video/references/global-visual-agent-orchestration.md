# GlobalVisual task executor

Assign this prompt to the resolved Root or runtime-native child executor for the dirty `global-visual-owner`
TaskRevision.

```text
在共享 checkout <repo> 中完成 GlobalVisual task；保护其他修改且不使用 worktree。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
唯一可写目录: .producer-work/<storyId>/<taskRevision>/

读取 AGENTS.md、task.json 和 inputs/context.json，按 current VisualStyleSpec 设计
simplest full-frame background board。`GlobalVisualBaseLayer` 仅含全片稳定底板/纹理；
`GlobalVisualDecorationLayers` 仅含 narrated window 装饰，以窗口起点为 local frame 0，不进入 silent
boundary Scenes。Unless required, must not invent decoration, continuity motifs, or Beat changes。

两者须 no-Props、无可见文字、caption、音频、Scene DSL 或 automatic director；decoration motion 只用
Remotion frame APIs。不得读取 Scene 输出、其他 workspace/Artifact Store、live source、历史媒体、网络、
private/voice、delivery/Git。

循环运行并修正 workspace：
npm run project:task:check -- --task <taskRevision>
check 成功后运行一次：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId>

成功后不得继续修改。无法修正的 task failure 必须先运行
`npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --kind task`；可执行命令的 host
failure 使用 `--kind host`。记录终态后立即结束，不等待或通知 Root，不重试新 attempt。
```
