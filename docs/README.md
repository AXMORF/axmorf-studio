# 文档导航

> 文档类型：唯一导航入口
>
> 最后复核：2026-10-13

先按问题选择文档，不要从历史计划或 evidence 反推 current implementation。

## 权威文档

| 问题                                | 文档                                                     |
| ----------------------------------- | -------------------------------------------------------- |
| 最终产品目标与不可偷换边界          | [FINAL_PRODUCT_GOAL.md](FINAL_PRODUCT_GOAL.md)           |
| 模块、依赖方向与写入所有权          | [ARCHITECTURE.md](ARCHITECTURE.md)                       |
| Revision/DAG/Artifact/Delivery 流程 | [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)         |
| identity、失效、原子性与幂等        | [DETERMINISTIC_EXECUTION.md](DETERMINISTIC_EXECUTION.md) |
| 当前已实现与未实现事实              | [ITERATION_STATUS.md](ITERATION_STATUS.md)               |
| 下一里程碑与进入条件                | [ROADMAP.md](ROADMAP.md)                                 |
| 精确名词边界                        | [TERMINOLOGY.md](TERMINOLOGY.md)                         |

文档冲突时先用 executable code/tests 确认 repo truth，再修正文档；不能把目标写成实现。

## 操作与维护指南

| 主题                                                                                                          | 文档                                                                           |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 主流 Agent 入口、最低能力与宿主适配边界                                                                       | [guides/AGENT_COMPATIBILITY.md](guides/AGENT_COMPATIBILITY.md)                 |
| 现有 Project 的 exact-base candidate revision 与 promotion                                                    | [guides/PROJECT_REVISION.md](guides/PROJECT_REVISION.md)                       |
| 统一 Producer/TTS/Scene defaults 配置                                                                         | [guides/PRODUCER_CONFIG.md](guides/PRODUCER_CONFIG.md)                         |
| create 后的只读 inspect、显式 prepare、dirty task delegation、attempt-bound commit/fail 与 fixed continuation | [guides/PRODUCTION_ORCHESTRATION.md](guides/PRODUCTION_ORCHESTRATION.md)       |
| 同步 exact four-file delivery                                                                                 | [guides/LOCAL_DELIVERY.md](guides/LOCAL_DELIVERY.md)                           |
| 整片规划、连续 Scene、纯视觉时间轴、冻结草稿与参考节奏分析                                                    | [guides/CONTINUOUS_VIDEO_AUTHORING.md](guides/CONTINUOUS_VIDEO_AUTHORING.md)   |
| 创意构思、完整构图、音乐落点与可运行的剪纸案例                                                               | [guides/VIDEO_CREATIVE_PLAYBOOK.md](guides/VIDEO_CREATIVE_PLAYBOOK.md)         |
| 完整 Project 数据删除                                                                                         | [PRODUCTION_WORKFLOW.md#8-作品删除](PRODUCTION_WORKFLOW.md#8-作品删除)         |
| TTS generation cache、PCM seal 与 timing                                                                      | [guides/NARRATION_GENERATION.md](guides/NARRATION_GENERATION.md)               |
| 机械 acceptance 与完成事实                                                                                    | [guides/REVIEW_MODEL.md](guides/REVIEW_MODEL.md)                               |
| 视觉机制、跨 Scene 连续对象与当前验证边界                                                                     | [guides/VISUAL_NARRATIVE_QUALITY.md](guides/VISUAL_NARRATIVE_QUALITY.md)       |
| bound Scene 预览与时序审阅                                                                                    | [guides/CONTENT_MOTION_REVIEW.md](guides/CONTENT_MOTION_REVIEW.md)             |
| 音效、音乐选择与循环素材维护                                                                                  | [guides/SCENE_SOUND_EFFECTS.md](guides/SCENE_SOUND_EFFECTS.md)                 |
| Project-owned profile 与复验命令                                                                              | [guides/FORMAL_PROJECT_VERIFICATION.md](guides/FORMAL_PROJECT_VERIFICATION.md) |
| 资源、能力配方与原创图片/SVG 准入                                                                              | [guides/CAPABILITY_CATALOG.md](guides/CAPABILITY_CATALOG.md)                   |
| 新仓库初始化和白名单迁移                                                                                      | [guides/BOOTSTRAP_IMPORT_MANIFEST.md](guides/BOOTSTRAP_IMPORT_MANIFEST.md)     |
| Narrative data contracts                                                                                      | [contracts/NARRATIVE_CONTRACTS.md](contracts/NARRATIVE_CONTRACTS.md)           |
| DeliveryBuild identity、四文件提交与失败回滚                                                                  | [contracts/DELIVERY_BUILD_CONTRACT.md](contracts/DELIVERY_BUILD_CONTRACT.md)   |

发布使用[两道门的发布流程](guides/FIRST_USE_RELEASE_GATE.md)：tag 触发的 CI 完成完整检查、最小真实渲染与全新安装后发布；预发布版本先进入 `next`，真实 Agent 宿主完成一部视频后再发布正式版本到 `latest`。

## 证据、提案与历史

- `evidence/` 记录发生时的验收证据，不定义 current runtime。
- 2026-10-13 的[能力工程验证](evidence/2026-10-13-capability-routing.json)、
  [内容画面与编曲验证](evidence/2026-10-13-content-quality.json)及
  [Edge TTS 修复后的本地成片](evidence/2026-10-13-edge-tts-endpoint-incident.md)
  覆盖当前未发布源码；本地 tarball 的版本号不代表这些改进已在 npm 发布。
- 连续视频源码、fresh packed Workspace 与局部修订的原工程验证见
  [连续视频验收](evidence/2026-10-08-continuous-video-acceptance.md)；Oct7记录保留为前一工程快照。
- [合并后完整成片](evidence/2026-10-09-post-merge-video-verification.json)验证 60 秒连续正文；
  0.1.20 的[新 Workspace 原生首用](evidence/v0.1.20-first-use.json)与
  [六场景成片](evidence/2026-10-09-v0.1.20-native-video-verification.json)已通过。
  0.1.19 未发布，原标签和[失败记录](evidence/v0.1.19-ci-failure.json)保留。
- `promotions/` 保存尚未完全达到完成定义的提案和实施计划；每份文档必须明确自身批准/实施状态。
- npm Workspace 开源方案已经完成并
  [归档实施计划](archive/implementation-plans/2026-08-30-npm-workspace-open-source-implementation-plan.md)。
  0.1.21已公开发布新的代码配乐与创作方法，[发布与公开安装](evidence/v0.1.21-publication.json)验证两包
  latest、精确内容与来源；本版使用[获批的验收复用](evidence/v0.1.21-acceptance-reuse.json)，没有新的原生首用认证。
  当前边界以[ITERATION_STATUS.md](ITERATION_STATUS.md)为准，历史[0.1.20发布证据](evidence/v0.1.20-publication.json)保留其原冻结范围。
- [archive/](archive/README.md) 保存已完成或被取代的 plans/specs，仅供追溯。

## 管理规则

[DOCUMENTATION_POLICY.md](DOCUMENTATION_POLICY.md) 定义单一事实来源、目录生命周期、归档与完成门槛。
active Markdown 本地链接和 current 操作文档引用的 npm scripts 必须通过：

```bash
npm run docs:check-links
```
