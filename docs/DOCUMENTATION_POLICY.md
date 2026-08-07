# 文档管理规则

> 文档类型：治理规则
>
> 最后复核：2026-08-07

## 单一事实来源

同一个问题只由一个文档负责：

| 问题                   | 权威文档                     |
| ---------------------- | ---------------------------- |
| 产品最终要成为什么     | `FINAL_PRODUCT_GOAL.md`      |
| 当前系统如何分层和依赖 | `ARCHITECTURE.md`            |
| 外部如何完成一次生产   | `PRODUCTION_WORKFLOW.md`     |
| 确定性、指纹和失效规则 | `DETERMINISTIC_EXECUTION.md` |
| 当前已经实现什么       | `ITERATION_STATUS.md`        |
| 下一阶段做什么         | `ROADMAP.md`                 |
| 名词的精确定义         | `TERMINOLOGY.md`             |

README 只做入口和快速开始；guide 只解释操作；evidence 只证明一次验收；archive 只保存历史。
其他文档需要当前事实时应链接到权威文档，不再复制整段里程碑清单、checksum 或状态描述。

## 目录与生命周期

- `docs/`：当前权威文档与文档导航。
- `docs/guides/`：仍在使用的操作和维护指南。
- `docs/contracts/`：对外数据合同说明；可执行 schema 仍以 `src/contracts/` 为准。
- `docs/evidence/`：不可替代当前状态的历史验收证据。
- `docs/promotions/`：待明确批准的能力提升提案。
- `docs/archive/`：已完成、已取代或不再维护的历史快照。

文档从 active 移入 archive 时必须在目标目录 README 说明原因。归档内容不再参与默认链接
门禁，因为其中的路径和命令属于历史上下文；主动传入文件路径时仍可单独检查。

## 修改规则

1. 代码和测试先确认 repo truth，再更新 `ITERATION_STATUS.md`。
2. 架构边界变化只更新 `ARCHITECTURE.md`；操作步骤变化只更新对应 guide 或 workflow。
3. 已完成任务只在状态表留一行摘要，详细过程放 evidence/archive，不回填到 README。
4. 新计划在执行完成后必须归档；被取代的方案不得继续留在 active 导航。
5. 所有当前存在的 active Markdown 必须通过 `npm run docs:check-links`；已从当前 Project 集删除
   的 tracked 历史路径不再被当作 active source，但任何保留文档指向缺失目标仍 fail closed。

## 文档完成定义

- 没有把目标设计写成当前实现；
- 没有两份文档同时声明同一状态权威；
- active 链接全部有效；
- 历史材料带明确归档说明；
- README、状态、路线和相关 guide 与代码一致。
