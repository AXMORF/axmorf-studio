# 文档导航

> 文档类型：唯一导航入口
>
> 最后复核：2026-08-06

先按问题选择文档，不要从历史计划反推当前实现。

## 权威文档

| 要回答的问题                     | 文档                                                     |
| -------------------------------- | -------------------------------------------------------- |
| 最终产品目标和不可偷换边界       | [FINAL_PRODUCT_GOAL.md](FINAL_PRODUCT_GOAL.md)           |
| 当前模块、依赖方向和运行时所有权 | [ARCHITECTURE.md](ARCHITECTURE.md)                       |
| 一次生产的阶段、输入输出和责任   | [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)         |
| 指纹、时间、生成和失效规则       | [DETERMINISTIC_EXECUTION.md](DETERMINISTIC_EXECUTION.md) |
| 当前已实现与未实现事实           | [ITERATION_STATUS.md](ITERATION_STATUS.md)               |
| 下一里程碑和进入条件             | [ROADMAP.md](ROADMAP.md)                                 |
| 精确名词边界                     | [TERMINOLOGY.md](TERMINOLOGY.md)                         |

文档发生冲突时，先用代码和测试确认 repo truth，再修正文档。状态只在
`ITERATION_STATUS.md` 维护，README 不复制完整里程碑清单。

## 操作与维护指南

| 主题                                | 文档                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| 固定 production CLI、状态与 handoff | [guides/PRODUCTION_ORCHESTRATION.md](guides/PRODUCTION_ORCHESTRATION.md)       |
| VoxCPM 生成、续跑、封存与恢复       | [guides/NARRATION_GENERATION.md](guides/NARRATION_GENERATION.md)               |
| 检查层级与用户批准边界              | [guides/REVIEW_MODEL.md](guides/REVIEW_MODEL.md)                               |
| 正式作品静态 profile 与复验命令     | [guides/FORMAL_PROJECT_VERIFICATION.md](guides/FORMAL_PROJECT_VERIFICATION.md) |
| 资源与共享能力目录                  | [guides/CAPABILITY_CATALOG.md](guides/CAPABILITY_CATALOG.md)                   |
| 新仓库初始化和白名单迁移            | [guides/BOOTSTRAP_IMPORT_MANIFEST.md](guides/BOOTSTRAP_IMPORT_MANIFEST.md)     |
| Narrative 数据合同说明              | [contracts/NARRATIVE_CONTRACTS.md](contracts/NARRATIVE_CONTRACTS.md)           |

## 当前待实施计划

- [Project 可删除性与产物解耦实施计划](PROJECT_DELETABILITY_IMPLEMENTATION_PLAN.md)：使任意具体
  Project 和 `out/` 媒体都不再成为核心系统健康的前置条件；当前仅为计划，尚未实现。

## 证据、提案与历史

- `evidence/`：一次里程碑或作品验收的历史证据，不承担当前状态。
- `promotions/`：尚需用户明确批准的共享能力提升提案。
- [archive/](archive/README.md)：已完成或被取代的计划和规格，仅供追溯。

## 管理规则

[DOCUMENTATION_POLICY.md](DOCUMENTATION_POLICY.md) 定义单一事实来源、目录生命周期、归档和
完成门槛。所有 active Markdown 必须通过：

```bash
npm run docs:check-links
```
