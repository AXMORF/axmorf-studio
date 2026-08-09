# Review Model

> 文档类型：当前检查边界
>
> 最后复核：2026-08-09

当前自动流程只使用合同与机械检查，不包含主观审美 gate。检查的职责是证明 identity、结构、
所有权、确定性和可执行边界，不替用户评价作品质量。

| 检查 | owner | 证明内容 |
| --- | --- | --- |
| StoryCheck | Agent | StoryBeat、ttsChunks、叙事输入和 voice profile 选择已明确 |
| AutoCheck | repository | narration、timing、registry、Narrative Baseline current |
| Owner receipt check | detached watcher | assignment identity、exclusive output manifest/checksum current |
| Scene check | detached watcher | assignment-owned source/package 机械有效 |
| GlobalVisual check | detached watcher | whole-film background package 机械有效 |
| Cover check | detached watcher | 两个固定比例 Composition 和 PNG 有效 |
| Render-ready check | repository | FinalAssembly、Composition 和 render plan identities current |
| Delivery check | repository | 非 MP4 package、intent、receipt 与 current inputs 一致 |

repository-local `remotion-best-practices` 是 Scene authoring guidance，不是新增的审美 gate，也不
替代 assignment、contracts、validators 或 Scene check。

`delivery-render-started` 只证明 detached child 获得 OS spawn acknowledgement。它不证明 exit
success、MP4 存在、媒体有效、审美质量或平台发布。

NarrativeCheck、SceneVisualCheck、SceneSoundCheck、人工审美审核和 detached render 观察都必须
作为独立后续范围明确授权，不能成为 current production/delivery 的隐式 gate。
