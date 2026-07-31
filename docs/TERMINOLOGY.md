# 最小名词表

| 名词 | 本项目含义 | 与其他节点关系 |
| --- | --- | --- |
| Story | 一条完整叙事 | 对应一个 Composition |
| StoryBeat | Story 中一个单一核心语义 | 对应一个 meaningId、NarrationUnit 和 Scene |
| meaningId | 语义关联键 | 连接 StoryBeat、旁白、字幕、Scene 与审核 |
| NarrationUnit | StoryBeat 的语言表达 | 包含一个 `ttsChunks` 有序集合 |
| TTSChunk | 一次 TTS 请求和实测音频片段 | 与一条 CaptionCue 精确一一对应 |
| CaptionCue | 顶层字幕的一条精确时间提示 | 文本来自实际 `ttsText` |
| Scene | StoryBeat 的独立视觉任务 | 内含一个或多个 Shot，不拥有字幕或旁白 |
| Shot | Scene 内连续的镜头区间 | 绑定 meaningId，不绑定某句字幕 |
| StoryBeatTransition | 相邻 StoryBeat 的视觉交接决定 | v1 为 hard cut 或等时长 overlay |
| NarrativeCore | 最低可播放成片层 | 旁白、字幕、绝对时间与 BaseCanvas |
| StoryVisualTrack | 完整视觉增强轨 | SceneVisualTrack 与转场的组合 |
| Composition | Remotion 最终渲染入口 | NarrativeCore 与各增强轨实时合成 |
| `<Sequence>` | Remotion 时间容器 | 可承载 Scene、Shot 或局部元素，不代表业务概念 |
