# 名词与边界

> 文档类型：当前名词权威
>
> 最后复核：2026-08-16

| 名词                        | 含义                                                                     | 明确不代表                                           |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| StoryBeat                   | 一个有稳定 meaningId 的叙事单元                                          | 自动按标点拆分的句子                                 |
| ttsChunks                   | Agent 已决定的朗读单元                                                   | 工具可重写的文本切片                                 |
| ProducerConfig              | 新作品的 Scene 默认、render、可读性、合集、TTS 与可选 BGM authority      | 已封存作品的可变 runtime 输入                        |
| NarrationExecutionSnapshot  | Run 级 provider-attempt 与 mastering policy 的 private-safe 冻结身份     | token、URL、私有路径、声线内容或 render runtime 配置 |
| SemanticTiming              | silent preset 固定帧与 sealed PCM 累计边界共同导出的全片 frame authority | runtime 重算、伪造静音 TTS 或容器浮点时长估算        |
| ScenePackage                | 一个 meaningId 的视觉与 Scene 音效 contributions 成品合同                | 字幕、旁白或 Project BGM authority                   |
| SoundContribution           | 一个有资源、绝对起止帧、独立音量与循环策略的非旁白声音                   | 独立音轨文件、额外声音层级或 Remotion 强制分类       |
| ProjectSoundPlan            | Project 级 contribution 选择；当前用于 narrated 内容窗口的循环 BGM       | 片头片尾声音、旁白或自动 ducking                     |
| reusable Scene template     | 可复制源码、Renderer、plans/cues/frames/resources 的已批准普通 Scene     | 既有 Project 的共享 runtime dependency 或位置限定    |
| template-copy Scene         | `project:configure` 复制冻结、由脚本验证 identity 并直写结果的 Project-local Scene | 通用 Scene check、Scene owner 或 owner receipt        |
| GlobalVisualPackage         | Story 级背景、纹理、装饰和连续性 motif                                   | Scene DSL、自动导演或字幕层                          |
| ProductionRun               | append-only events 与 immutable results 的一次执行                       | 可手改或恢复的任务状态                               |
| Project production progress | source Project/current Run 的最新关键步骤只读投影                        | output-only 清理目标、PID 监控或 MP4 完成状态        |
| Repository operation lock   | configure/start/delivery/delete 共用的 Project mutation 互斥边界         | 跨 checkout 锁或自动恢复策略                         |
| OwnerReceipt                | assignment identity 与 output manifest 绑定的 ready/failed inbox 回执    | Codex task 身份、heartbeat 或正式 production result  |
| waiting-for-owner-results   | watcher 等待缺失 assignment receipt 的无超时状态                         | task 失败、自动重试或 replacement thread 已创建      |
| WatcherLaunchReceipt        | detached watcher 的 OS `spawn` acknowledgement                           | production 已完成或 watcher 可安全重启               |
| ProductionRenderPlan        | 冻结 Composition、资料引用、正文/成片帧与启动 policy 的渲染计划          | 已渲染媒体                                           |
| ProductionRenderReady       | 所有 current render-critical identity 已汇合                             | MP4 已生成或已检查                                   |
| awaiting-automatic-delivery | render-ready 的固定 handoff                                              | 等待人工判断                                         |
| PublishingIntent            | Story 阶段冻结的发布元数据及一个配置合集选择                             | 自由文本合集或平台发布行为                           |
| CoverResult                 | 独立 Cover owner 封存的 exact PNG 结果                                   | production watcher 输入                              |
| DeliveryLaunchManifest      | 非 MP4 包的 current identity 与 planned media facts                      | 渲染完成报告                                         |
| RenderLaunchIntent          | spawn 前 exactly-once 写入的启动意图                                     | 子进程已经启动                                       |
| RenderLaunchReceipt         | OS `spawn` acknowledgement 后写入的回执                                  | exit code、完成状态或 MP4 有效性                     |
| delivery-render-started     | Skill 的自动终点                                                         | render completed、published 或 quality passed        |
| launch-ambiguous            | intent 存在而 receipt 缺失                                               | 可安全重试的失败                                     |
| Project deletion            | 明确确认后按 storyId 删除全部本地生产数据并重建 Registry/Catalog         | 只删 MP4、删除 core/其他作品/私有声线或自动清理策略  |

`deliveries/<storyId>/` 是每个 Project 唯一的 current slot，保存当前 identity 的 immutable 非 MP4
package、intent、receipt 与未纳入 ledger 的计划 MP4；新 identity 通过 staging 受控替换旧 package。

声音业务分类固定为 `narration`、`background-music`、`sound-effect`。旁白由 NarrativeCore 独立拥有；
背景音乐和音效都投影为 `SoundContribution`，由同一个 SoundDesignTrack 挂载，但每个 contribution
仍有独立资源、时间窗口、音量与循环策略。Remotion render 最终把它们混入配置的输出声道，不保留
可供剪辑软件重新拆分的物理音轨。
`out/` 保存 Project baseline 媒体、诊断输出、detached Remotion log 与明确的 core proof 输出。
两者都是 ignored 本地产物，不是 core source authority；`project:delete` 只删除选中 storyId 的
Project-owned 子树，保留 core proof。
