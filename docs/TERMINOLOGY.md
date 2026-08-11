# 名词与边界

> 文档类型：当前名词权威
>
> 最后复核：2026-08-11

| 名词                        | 含义                                                                  | 明确不代表                                           |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| StoryBeat                   | 一个有稳定 meaningId 的叙事单元                                       | 自动按标点拆分的句子                                 |
| ttsChunks                   | Agent 已决定的朗读单元                                                | 工具可重写的文本切片                                 |
| ProducerConfig              | 新作品的 render、可读性、合集与通用 TTS 默认/选择 authority           | 已封存作品的可变 runtime 输入                        |
| NarrationExecutionSnapshot  | Run 级 provider-attempt 与 mastering policy 的 private-safe 冻结身份  | token、URL、私有路径、声线内容或 render runtime 配置 |
| SemanticTiming              | sealed PCM 实测导出的绝对 frame authority                             | 容器浮点时长估算                                     |
| ScenePackage                | 一个 meaningId 的视觉与局部声音成品合同                               | 字幕、旁白或全局背景 authority                       |
| GlobalVisualPackage         | Story 级背景、纹理、装饰和连续性 motif                                | Scene DSL、自动导演或字幕层                          |
| ProductionRun               | append-only events 与 immutable results 的一次执行                    | 可手改或恢复的任务状态                               |
| OwnerReceipt                | assignment identity 与 output manifest 绑定的 ready/failed inbox 回执 | Codex task 身份、heartbeat 或正式 production result  |
| waiting-for-owner-results   | watcher 等待缺失 assignment receipt 的无超时状态                      | task 失败、自动重试或 replacement thread 已创建      |
| WatcherLaunchReceipt        | detached watcher 的 OS `spawn` acknowledgement                        | production 已完成或 watcher 可安全重启               |
| ProductionRenderPlan        | 冻结 Composition、源码、帧和启动 policy 的渲染计划                    | 已渲染媒体                                           |
| ProductionRenderReady       | 所有 current render-critical identity 已汇合                          | MP4 已生成或已检查                                   |
| awaiting-automatic-delivery | render-ready 的固定 handoff                                           | 等待人工判断                                         |
| PublishingIntent            | Story 阶段冻结的发布元数据及一个配置合集选择                          | 自由文本合集或平台发布行为                           |
| CoverResult                 | 独立 Cover owner 封存的 exact PNG 结果                                | production watcher 输入                              |
| DeliveryLaunchManifest      | 非 MP4 包的 current identity 与 planned media facts                   | 渲染完成报告                                         |
| RenderLaunchIntent          | spawn 前 exactly-once 写入的启动意图                                  | 子进程已经启动                                       |
| RenderLaunchReceipt         | OS `spawn` acknowledgement 后写入的回执                               | exit code、完成状态或 MP4 有效性                     |
| delivery-render-started     | Skill 的自动终点                                                      | render completed、published 或 quality passed        |
| launch-ambiguous            | intent 存在而 receipt 缺失                                            | 可安全重试的失败                                     |
| Project deletion            | 用户明确授权后按 storyId 删除全部本地生产数据并重建 Registry/Catalog  | 只删 MP4、删除 core/其他作品/私有声线或自动清理策略  |

`deliveries/` 保存 immutable 非 MP4 package、intent、receipt 与未纳入 ledger 的计划 MP4；
`out/` 保存 Project baseline 媒体、诊断输出、detached Remotion log 与明确的 core proof 输出。
两者都是 ignored 本地产物，不是 core source authority；`project:delete` 只删除选中 storyId 的
Project-owned 子树，保留 core proof。
