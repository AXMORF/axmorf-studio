# 最小名词表

> 文档类型：名词权威
>
> 最后复核：2026-08-06

| 名词                         | 本项目含义                                                     | 与其他节点关系                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| VideoBrief                   | 用户内容、受众、时长和交付约束                                 | Story 创作的输入，不包含实现代码                                                                                                                      |
| VisualStyleSpec              | 项目级全片画风权威                                             | 在 Scene 制作前确定 profile、项目化 art direction、连续性规则和禁止项；不进入旁白封存或 SemanticTiming                                                |
| StorySpec                    | Agent 写入的稳定叙事声明                                       | 包含 Story、StoryBeat 和已创作 ttsChunks，不拥有渲染或 provider 配置                                                                                  |
| NarrationSpec                | 本次旁白生成声明                                               | 包含 voice profile 引用和允许的生成参数，不包含密钥或 provider 地址                                                                                   |
| RenderSpec                   | 用户每次制作直接提供的 Composition 与交付声明                  | 包含画幅、fps、locale、字幕安全区、音频输出与显式片头片尾范围；Agent 只结构化和机械校验，不重复确认                                                   |
| ProductionRequirementsFreeze | M9.5 完整制作要求冻结外壳                                      | 绑定 VideoBrief、Story、NarrationSpec、RenderSpec、StoryCheck identities，并结构化画幅、voice profile、资源政策和额外要求；摘要不得成为第二 authority |
| ProductionStartPreflight     | 新 Run 前只读环境诊断合同                                      | 固定检查 VoxCPM liveness/cold readiness 与正式 Chromium launch；不预热、不发送 TTS、不写 Run ledger 或作品 authority                                  |
| Story                        | 一条完整叙事                                                   | 对应一个 Composition                                                                                                                                  |
| StoryBeat                    | Story 中一个单一核心语义                                       | 对应一个 meaningId、NarrationUnit 和 Scene                                                                                                            |
| meaningId                    | 语义关联键                                                     | 连接 StoryBeat、旁白、字幕、Scene 与审核                                                                                                              |
| NarrationUnit                | StoryBeat 的语言表达                                           | 包含一个 `ttsChunks` 有序集合                                                                                                                         |
| TTSChunk                     | 一次 TTS 请求和实测音频片段                                    | 与一条 CaptionCue 精确一一对应                                                                                                                        |
| CaptionCue                   | 顶层字幕的一条精确时间提示                                     | 文本来自实际 `ttsText`                                                                                                                                |
| SealedNarrationManifest      | 完整旁白的封存凭证                                             | 记录 chunk、checksum、实测时长、完整音频和 fingerprint                                                                                                |
| SemanticTiming               | 由封存 PCM 的累计样本边界按固定算法量化出的绝对时间线          | 是 Caption、NarrativeCore 和所有增强轨的时间权威                                                                                                      |
| Narrative Baseline           | 不依赖任何增强轨的最低可播放视频                               | 由 NarrativeCore 独立检查、预览和渲染                                                                                                                 |
| AutoCheck                    | 对当前 Narrative Baseline 上游身份和真实产物的固定机械聚合报告 | 默认由 `project:check --level narrative` 只读重算并检查 persisted drift；只有全部通过时可显式原子写入，不包含主观叙事审核                             |
| ProjectRegistry              | bundle 前自动发现并生成的 Story Composition 静态注册表         | 元数据静态可枚举，组件通过 `lazyComponent` 和字面量 `import()` 按需加载；runtime 不扫描目录，也不依赖 RendererRegistry                                |
| Scene                        | StoryBeat 的独立视听制作任务                                   | 完成后对应一个 ScenePackage；内含视觉、Shot 与 Scene 局部声音，不拥有字幕、旁白或全局 BGM                                                             |
| ScenePackage                 | 一个 Scene 的可装配视听制作结果                                | 绑定一个 Scene 级 rendererId、SceneSoundPlan、资源引用、同步锚点与分层 fingerprint                                                                    |
| SceneRenderer                | Scene 对 runtime 暴露的单一视觉入口                            | v3 只拥有 Beat 语义视觉，由外层 SceneSafeArea 提供边界；可内含多个本地 Shot 组件，不拥有字幕、音频或 GlobalVisualLayers                               |
| SceneSafeArea                | v3 Composition-owned Scene 安全区 wrapper                      | exactly once 直接消费 frozen readability policy，并为 SceneText 提供同一 context；不推导第二套 inset                                                  |
| RendererRegistry             | composition-local 静态 renderer 绑定                           | 把 ScenePackage.rendererId 映射到 SceneRenderer                                                                                                       |
| Shot                         | Scene 内连续的镜头区间                                         | 绑定 meaningId，不绑定字幕、rendererId、组件或模块路径                                                                                                |
| SceneSyncAnchor              | Scene 内稳定的视听同步事件                                     | 由稳定 eventId 与局部帧定义；SceneSoundCue 可引用它，缺失或漂移时 fail closed                                                                         |
| SceneSoundPlan               | ScenePackage 内的局部声音声明                                  | 包含 Scene ambience、SFX、资源引用和同步锚点；不拥有旁白、全局 BGM 或跨 Scene 混音                                                                    |
| ExternalReferenceSnapshot    | 制作期外部参考源的不可变快照                                   | 绑定 repository、完整 commit、索引、license metadata 与 fingerprint；render runtime 不访问外部来源                                                    |
| ShotRecipeSelection          | Scene/Shot 对上游镜头配方的显式选择                            | 记录 cardId/style-key、准确 demo identity、适配模式和选择原因；不保存可执行 loader，允许为空                                                          |
| ReferenceFidelityReceipt     | 上游镜头本地化后的 pass-only 保真凭据                          | exact 模式绑定来源、依赖闭包、本地源码、真实 Renderer/frame-state binding、配对证据和正常速度可辨识结果                                               |
| SceneCoverageMap             | Story 中全部 meaningId 的 ScenePackage 覆盖状态                | 按 StoryBeat 顺序记录 ready、fallback、missing 或 stale；只影响 Scene/final gate，不阻断 Narrative Baseline                                           |
| StoryResourcePool            | M9.5 Story 级宽候选资源池                                      | 主 Agent 冻结整个 Story 可能使用的批准资源/参考；Scene Agent 精确选子集或零资源，不能自行扩池                                                         |
| SceneAssignment              | M9.5 单 Scene 冻结任务信封                                     | v3 另绑定 frozen policy 与 scene-composition-boundary-v1；一 meaningId 一份，v1/v2 保持兼容                                                           |
| SceneProductionResult        | M9.5 单 Scene 成功或失败结果合同                               | 只能由固定 submit/fail writer 创建；Scene Agent 不写中央 state，success 绑定 current ScenePackage，failure 绑定 ProductionError                       |
| StoryBeatTransition          | 相邻 StoryBeat 的视觉交接决定                                  | v1 为 hard cut 或等时长 overlay                                                                                                                       |
| NarrativeCore                | 最低可播放成片层                                               | 旁白、顶层字幕与绝对时间；不绘制背景，其余视觉区域透明                                                                                                |
| EnhancementTrack             | 对 NarrativeCore 的可选运行时增强                              | visual、sound、global 只读消费上游；运行时分轨不等于 Scene 局部视听创作分离                                                                           |
| StoryVisualTrack             | 完整视觉增强轨                                                 | 从有序 ScenePackage 的视觉贡献与转场确定性汇总                                                                                                        |
| SoundDesignTrack             | 非旁白声音运行时轨                                             | 汇总当前作品 ScenePackage 局部声音，再由 FinalSoundProjection 叠加 GlobalSoundPlan；不建立第二份 Scene SFX 创作权威                                   |
| GlobalSoundPlan              | 作品级全局声音创作声明                                         | 只拥有全片 BGM、跨 Scene ambience、ducking/gain-stage/mastering policy；不拥有或复制 Scene-local SFX                                                  |
| FinalSoundProjection         | Scene 声音投影与全局声音计划的确定性最终投影                   | 保留当前 SoundDesignProjection fingerprint，另绑定 GlobalSoundPlan、Catalog、全局资产、duck envelope 和 mastering policy                              |
| GlobalVisualLayers           | 作品级全局视觉运行时聚合                                       | 每个作品各自实现 project-local frame-driven 纹理、frame treatment 与连续性 motif；位于 Scene 上、CaptionLayer 下，不是通用 DSL                        |
| FinalAssembly                | 最终 Composition 装配 identity                                 | 绑定 narrative、Scene、global、Composition source、Remotion exact version 和固定 z-order/mix-order                                                    |
| FinalPreviewEvidence         | exact 最终预览的机械与批量审核凭据                             | 绑定 MP4/contact sheet/stills、技术测量、ducking evidence、Agent review 和 FinalAssembly；供用户批准当前完整预览                                      |
| FinalPreviewApproval         | 用户对 current exact 最终预览作出的唯一创意批准                | authoring/generated artifact 精确绑定 preview checksum、evidence 与 FinalAssembly；Agent、脚本和 checker 不可代签                                     |
| DeliverySpecification       | M10 Project-owned 本地交付声明                                 | future-only v1；包含标题、简介、6–7 个唯一主题词、显式 collection、章节与固定封面 source graph，不拥有平台账号或网络配置                                 |
| DeliveryRelease             | 已批准 exact preview 的不可覆盖本地交付包                      | 固定写入 `deliveries/<storyId>/<releaseId>/`；相同 identity 幂等复验，不同内容 fail closed，不改变 production 状态                                      |
| PublishingMetadata          | 本地发布所需的 canonical 内容元数据                             | 包含章节 frame/timecode、fps、总帧数、实际时长和交付文件名；章节名最多 11 个 Unicode 字符，不使用固定 collection 枚举                                   |
| DeliveryReleaseManifest     | M10 release 的机器可复验 identity 与文件清单                    | 绑定 Story/Composition、approval/evidence/FinalAssembly/passing final-v2、交付规格、payload checksum/大小/媒体参数与固定复验命令                          |
| ProductionError              | M9.5 制作期结构化错误                                          | 区分 expected/unexpected，保留脱敏 summary/description/code/remediation；不保存 raw stack、token、私有 endpoint 或绝对路径                            |
| ProductionRunState           | M9.5 制作期派生状态投影                                        | 由 append-only stage events、Scene results 和 current fingerprints 复算；不可手改、不进入 render runtime 或作品 authority                             |
| ProductionPreviewEvidence    | M9.5 无全局增强机械预览凭据                                    | 绑定完整 MP4、画幅/fps/帧数/流/完整解码、coverage/registry/projection/assembly；只能表示 mechanically-ready，不表示审美通过                           |
| ResourceCatalog              | 统一资源、能力与制作期参考只读查询视图                         | 汇总视觉、音频、style profile、共享能力和 authoring-only recipe/demo/preview；按 allowed use 隔离，不是 runtime loader                                |
| FinalMechanicalCheck         | 作品级固定机械报告                                             | v1 保留十项 Scene 基础；声明 final assembly 的作品使用 v2，追加 global sound/global visual/final assembly/evidence/approval 五项，不作审美判断        |
| M7SceneProductionEvidence    | 正式 Scene 批量审核与真实媒体的 current receipt                | 绑定五个 Scene review、四个连续性边界、15 张 still、contact sheet 和正常速度 review；不是用户最终创意批准                                             |
| M9GeneralizationReport       | 两个真实主题完成后的机械泛化结论                               | 将结果分为原样复用、fixture 解耦修复、按设计项目本地和 promotion candidate；proposal 不等于迁移授权                                                   |
| Composition                  | Remotion 最终渲染入口                                          | NarrativeCore 与各增强轨实时合成                                                                                                                      |
| `<Sequence>`                 | Remotion 时间容器                                              | 可承载 Scene、Shot 或局部元素，不代表业务概念                                                                                                         |

`Scene ambience` 只服务一个 Scene 的固定 Beat 窗口，由该 ScenePackage 的 SceneSoundPlan
拥有；`跨 Scene ambience` 是贯穿多个 Scene 边界的作品级总线，由 GlobalSoundPlan 拥有。两者
名称相近但不是同一创作权威，也不得互相复制以绕过 fingerprint。

上述 M9.5 名词已有 strict contracts、固定 CLI 和测试覆盖。它们只描述制作编排与机械
`preview-ready`，不表示 reviewed、approved、quality-pass 或 released。M10 名词只描述用户批准
之后的本地封存，不把 `LocallyDelivered` 解释为平台上传或网络发布。
