# 最小名词表

| 名词                      | 本项目含义                                                     | 与其他节点关系                                                                                                            |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| VideoBrief                | 用户内容、受众、时长和交付约束                                 | Story 创作的输入，不包含实现代码                                                                                          |
| VisualStyleSpec           | 项目级全片画风权威                                             | 在 Scene 制作前确定 profile、项目化 art direction、连续性规则和禁止项；不进入旁白封存或 SemanticTiming                    |
| StorySpec                 | Agent 写入的稳定叙事声明                                       | 包含 Story、StoryBeat 和已创作 ttsChunks，不拥有渲染或 provider 配置                                                      |
| NarrationSpec             | 本次旁白生成声明                                               | 包含 voice profile 引用和允许的生成参数，不包含密钥或 provider 地址                                                       |
| RenderSpec                | 用户每次制作直接提供的 Composition 与交付声明                  | 包含画幅、fps、locale、字幕安全区、音频输出与显式片头片尾范围；Agent 只结构化和机械校验，不重复确认                       |
| Story                     | 一条完整叙事                                                   | 对应一个 Composition                                                                                                      |
| StoryBeat                 | Story 中一个单一核心语义                                       | 对应一个 meaningId、NarrationUnit 和 Scene                                                                                |
| meaningId                 | 语义关联键                                                     | 连接 StoryBeat、旁白、字幕、Scene 与审核                                                                                  |
| NarrationUnit             | StoryBeat 的语言表达                                           | 包含一个 `ttsChunks` 有序集合                                                                                             |
| TTSChunk                  | 一次 TTS 请求和实测音频片段                                    | 与一条 CaptionCue 精确一一对应                                                                                            |
| CaptionCue                | 顶层字幕的一条精确时间提示                                     | 文本来自实际 `ttsText`                                                                                                    |
| SealedNarrationManifest   | 完整旁白的封存凭证                                             | 记录 chunk、checksum、实测时长、完整音频和 fingerprint                                                                    |
| SemanticTiming            | 由封存 PCM 的累计样本边界按固定算法量化出的绝对时间线          | 是 Caption、NarrativeCore 和所有增强轨的时间权威                                                                          |
| Narrative Baseline        | 不依赖任何增强轨的最低可播放视频                               | 由 NarrativeCore 独立检查、预览和渲染                                                                                     |
| AutoCheck                 | 对当前 Narrative Baseline 上游身份和真实产物的固定机械聚合报告 | 默认由 `project:check --level narrative` 只读重算并检查 persisted drift；只有全部通过时可显式原子写入，不包含主观叙事审核 |
| ProjectRegistry           | bundle 前自动发现并生成的 Story Composition 静态注册表         | 元数据静态可枚举，组件通过 `lazyComponent` 和字面量 `import()` 按需加载；runtime 不扫描目录，也不依赖 RendererRegistry    |
| Scene                     | StoryBeat 的独立视听制作任务                                   | 完成后对应一个 ScenePackage；内含视觉、Shot 与 Scene 局部声音，不拥有字幕、旁白或全局 BGM                                 |
| ScenePackage              | 一个 Scene 的可装配视听制作结果                                | 绑定一个 Scene 级 rendererId、SceneSoundPlan、资源引用、同步锚点与分层 fingerprint                                        |
| SceneRenderer             | Scene 对 runtime 暴露的单一视觉入口                            | 可内含多个本地 Shot 组件，只输出视觉                                                                                      |
| RendererRegistry          | composition-local 静态 renderer 绑定                           | 把 ScenePackage.rendererId 映射到 SceneRenderer                                                                           |
| Shot                      | Scene 内连续的镜头区间                                         | 绑定 meaningId，不绑定字幕、rendererId、组件或模块路径                                                                    |
| SceneSyncAnchor           | Scene 内稳定的视听同步事件                                     | 由稳定 eventId 与局部帧定义；SceneSoundCue 可引用它，缺失或漂移时 fail closed                                             |
| SceneSoundPlan            | ScenePackage 内的局部声音声明                                  | 包含 Scene ambience、SFX、资源引用和同步锚点；不拥有旁白、全局 BGM 或跨 Scene 混音                                        |
| ExternalReferenceSnapshot | 制作期外部参考源的不可变快照                                   | 绑定 repository、完整 commit、索引、license metadata 与 fingerprint；render runtime 不访问外部来源                        |
| ShotRecipeSelection       | Scene/Shot 对上游镜头配方的显式选择                            | 记录 cardId/style-key、准确 demo identity、适配模式和选择原因；不保存可执行 loader，允许为空                              |
| ReferenceFidelityReceipt  | 上游镜头本地化后的 pass-only 保真凭据                          | exact 模式绑定来源、依赖闭包、本地源码、真实 Renderer/frame-state binding、配对证据和正常速度可辨识结果                   |
| SceneCoverageMap          | Story 中全部 meaningId 的 ScenePackage 覆盖状态                | 按 StoryBeat 顺序记录 ready、fallback、missing 或 stale；只影响 Scene/final gate，不阻断 Narrative Baseline               |
| StoryBeatTransition       | 相邻 StoryBeat 的视觉交接决定                                  | v1 为 hard cut 或等时长 overlay                                                                                           |
| NarrativeCore             | 最低可播放成片层                                               | 旁白、顶层字幕与绝对时间；不绘制背景，其余视觉区域透明                                                                    |
| EnhancementTrack          | 对 NarrativeCore 的可选运行时增强                              | visual、sound、global 只读消费上游；运行时分轨不等于 Scene 局部视听创作分离                                               |
| StoryVisualTrack          | 完整视觉增强轨                                                 | 从有序 ScenePackage 的视觉贡献与转场确定性汇总                                                                            |
| SoundDesignTrack          | 非旁白声音运行时轨                                             | M6 只汇总 ScenePackage 局部声音；M8 才增加全局声音计划，不建立第二份 Scene SFX 创作权威                                   |
| ResourceCatalog           | 统一资源、能力与制作期参考只读查询视图                         | 汇总视觉、音频、style profile、共享能力和 authoring-only recipe/demo/preview；按 allowed use 隔离，不是 runtime loader    |
| FinalMechanicalCheck      | Scene 分支的固定作品级机械报告                                 | 先绑定 current narrative，再校验 style/catalog/reference/coverage/package/registry/projection/assembly；不作审美判断      |
| Composition               | Remotion 最终渲染入口                                          | NarrativeCore 与各增强轨实时合成                                                                                          |
| `<Sequence>`              | Remotion 时间容器                                              | 可承载 Scene、Shot 或局部元素，不代表业务概念                                                                             |
