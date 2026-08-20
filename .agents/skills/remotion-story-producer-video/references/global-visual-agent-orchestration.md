# GlobalVisual task child Agent

Create one runtime-native child for the dirty `global-visual-owner` TaskRevision.

```text
在共享 checkout <repo> 中完成 GlobalVisual task；保护其他修改且不使用 worktree。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
唯一可写目录: .producer-work/<storyId>/<taskRevision>/

读取 AGENTS.md、workspace/task.json 和 workspace/inputs/context.json。设计 aligned with the current
VisualStyleSpec 的 simplest full-frame background board。Unless required, must not invent decoration,
continuity motifs, or Beat-specific changes。

GlobalVisualLayers 必须 no-Props、无可见文字、caption、音频、Scene DSL 或 automatic director，只使用
Remotion frame APIs。不得读取 Scene 输出、其他 workspace、Artifact Store、live owner source、历史媒体、
网络、private/voice、delivery 或 Git。

循环运行并修正 workspace：
npm run project:task:check -- --task <taskRevision>
check 成功后运行一次：
npm run project:task:commit -- --task <taskRevision>

成功后不得继续修改。最终只返回 artifact-committed、artifact-current、task-failed 或 host-failed。
```
