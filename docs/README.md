# 文档导航

> 文档类型：唯一导航入口
>
> 最后复核：2026-08-30

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
| 统一 Producer/TTS/Scene defaults 配置                                                                         | [guides/PRODUCER_CONFIG.md](guides/PRODUCER_CONFIG.md)                         |
| create 后的只读 inspect、显式 prepare、dirty task delegation、attempt-bound commit/fail 与 fixed continuation | [guides/PRODUCTION_ORCHESTRATION.md](guides/PRODUCTION_ORCHESTRATION.md)       |
| 同步 exact four-file delivery                                                                                 | [guides/LOCAL_DELIVERY.md](guides/LOCAL_DELIVERY.md)                           |
| 完整 Project 数据删除                                                                                         | [PRODUCTION_WORKFLOW.md#8-作品删除](PRODUCTION_WORKFLOW.md#8-作品删除)         |
| TTS generation cache、PCM seal 与 timing                                                                      | [guides/NARRATION_GENERATION.md](guides/NARRATION_GENERATION.md)               |
| 机械 acceptance 与完成事实                                                                                    | [guides/REVIEW_MODEL.md](guides/REVIEW_MODEL.md)                               |
| Project-owned profile 与复验命令                                                                              | [guides/FORMAL_PROJECT_VERIFICATION.md](guides/FORMAL_PROJECT_VERIFICATION.md) |
| 资源与共享能力目录                                                                                            | [guides/CAPABILITY_CATALOG.md](guides/CAPABILITY_CATALOG.md)                   |
| 新仓库初始化和白名单迁移                                                                                      | [guides/BOOTSTRAP_IMPORT_MANIFEST.md](guides/BOOTSTRAP_IMPORT_MANIFEST.md)     |
| Narrative data contracts                                                                                      | [contracts/NARRATIVE_CONTRACTS.md](contracts/NARRATIVE_CONTRACTS.md)           |
| DeliveryBuild identity、四文件提交与失败回滚                                                                  | [contracts/DELIVERY_BUILD_CONTRACT.md](contracts/DELIVERY_BUILD_CONTRACT.md)   |

## 证据、提案与历史

- `evidence/` 记录发生时的验收证据，不定义 current runtime。
- `promotions/` 保存尚未完全达到完成定义的提案和实施计划；每份文档必须明确自身批准/实施状态。
- [npm Workspace 开源方案实施计划](promotions/2026-08-30-npm-workspace-open-source-implementation-plan.md)
  已完成本地 package/scaffold vertical slice，公开发布和跨平台 gates 仍待完成。
- [archive/](archive/README.md) 保存已完成或被取代的 plans/specs，仅供追溯。

## 管理规则

[DOCUMENTATION_POLICY.md](DOCUMENTATION_POLICY.md) 定义单一事实来源、目录生命周期、归档与完成门槛。
active Markdown 本地链接和 current 操作文档引用的 npm scripts 必须通过：

```bash
npm run docs:check-links
```
