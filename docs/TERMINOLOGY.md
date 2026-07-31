# 最小名词表

| 名词 | 本项目含义 | 与其他节点关系 |
| --- | --- | --- |
| VideoBrief | 用户内容、受众、时长和交付约束 | Story 创作的输入，不包含实现代码 |
| StorySpec | Agent 写入的稳定叙事声明 | 包含 Story、StoryBeat 和已创作 ttsChunks，不拥有渲染或 provider 配置 |
| NarrationSpec | 本次旁白生成声明 | 包含 voice profile 引用和允许的生成参数，不包含密钥或 provider 地址 |
| RenderSpec | 用户每次制作直接提供的 Composition 与交付声明 | 包含画幅、fps、locale、字幕安全区、音频输出与显式片头片尾范围；Agent 只结构化和机械校验，不重复确认 |
| Story | 一条完整叙事 | 对应一个 Composition |
| StoryBeat | Story 中一个单一核心语义 | 对应一个 meaningId、NarrationUnit 和 Scene |
| meaningId | 语义关联键 | 连接 StoryBeat、旁白、字幕、Scene 与审核 |
| NarrationUnit | StoryBeat 的语言表达 | 包含一个 `ttsChunks` 有序集合 |
| TTSChunk | 一次 TTS 请求和实测音频片段 | 与一条 CaptionCue 精确一一对应 |
| CaptionCue | 顶层字幕的一条精确时间提示 | 文本来自实际 `ttsText` |
| SealedNarrationManifest | 完整旁白的封存凭证 | 记录 chunk、checksum、实测时长、完整音频和 fingerprint |
| SemanticTiming | 由封存 PCM 的累计样本边界按固定算法量化出的绝对时间线 | 是 Caption、NarrativeCore 和所有增强轨的时间权威 |
| Narrative Baseline | 不依赖任何增强轨的最低可播放视频 | 由 NarrativeCore 独立检查、预览和渲染 |
| ProjectRegistry | bundle 前自动发现并生成的 Story Composition 静态注册表 | 元数据静态可枚举，组件通过 `lazyComponent` 和字面量 `import()` 按需加载；runtime 不扫描目录，也不依赖 RendererRegistry |
| Scene | StoryBeat 的独立视觉任务 | 完成制作后对应一个 ScenePackage；内含一个或多个 Shot，不拥有字幕或旁白 |
| ScenePackage | 一个 Scene 的可装配制作结果 | 只绑定一个 Scene 级 rendererId、资源引用与 fingerprint |
| SceneRenderer | Scene 对 runtime 暴露的单一视觉入口 | 可内含多个本地 Shot 组件，只输出视觉 |
| RendererRegistry | composition-local 静态 renderer 绑定 | 把 ScenePackage.rendererId 映射到 SceneRenderer |
| Shot | Scene 内连续的镜头区间 | 绑定 meaningId，不绑定字幕、rendererId、组件或模块路径 |
| StoryBeatTransition | 相邻 StoryBeat 的视觉交接决定 | v1 为 hard cut 或等时长 overlay |
| NarrativeCore | 最低可播放成片层 | 旁白、字幕、绝对时间与 BaseCanvas |
| EnhancementTrack | 对 NarrativeCore 的可选增强 | visual、sound、global 各自独立，只读消费上游 |
| StoryVisualTrack | 完整视觉增强轨 | SceneVisualTrack 与转场的组合 |
| Composition | Remotion 最终渲染入口 | NarrativeCore 与各增强轨实时合成 |
| `<Sequence>` | Remotion 时间容器 | 可承载 Scene、Shot 或局部元素，不代表业务概念 |
