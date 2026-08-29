# GlobalVisual task executor

Assign this prompt to the resolved Root or runtime-native child executor for the dirty `global-visual-owner`
TaskRevision.

```text
在共享 checkout <repo> 中完成 GlobalVisual task；保护其他修改且不使用 worktree。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
bindingId: <bindingId>
首先运行 exact task bind command；未返回 task-worker-bound 前零写入，不猜路径。只通过返回的
shared-workspace 或 controller-io capability 读 immutable inputs、写 declaredOutputs。

读取 AGENTS.md、task.json 和 inputs/context.json，按 current VisualStyleSpec 设计
simplest full-frame background board。`GlobalVisualBaseLayer` 仅含全片稳定底板/纹理；
`GlobalVisualDecorationLayers` 仅含 narrated window 装饰，以窗口起点为 local frame 0，不进入 silent
boundary Scenes。Unless required, must not invent decoration, continuity motifs, or Beat changes。

两者须 no-Props、无可见文字、caption、音频、Scene DSL 或 automatic director；decoration motion 只用
Remotion frame APIs。不得读取 Scene 输出、其他 workspace/Artifact Store、live source、历史媒体、网络、
private/voice、delivery/Git。

循环运行 exact finalize/check commands，只修正 agent-output issues；check 成功后运行 exact commit command。

成功后不得继续修改。无法修正的 authored-output failure 运行 exact taskFailureCommand。immutable/identity
failure 零写入并返回 structured fixed issue，不得执行 host failure。记录终态后立即结束。
```
