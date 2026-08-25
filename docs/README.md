# 文档导航

> 文档类型：唯一导航入口
>
> 最后复核：2026-08-26

先按问题选择文档，不要从历史计划或 evidence 反推 current implementation。

## 权威文档

| 问题                                | 文档                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| 最终产品目标与不可偷换边界          | [FINAL_PRODUCT_GOAL.md](FINAL_PRODUCT_GOAL.md)                       |
| Desktop App 产品、Agent 与数据边界  | [DESKTOP_APP_PRODUCT.md](DESKTOP_APP_PRODUCT.md)                     |
| macOS v1 维护、发行与公开发布门槛   | [DESKTOP_APP_MACOS_MAINTENANCE.md](DESKTOP_APP_MACOS_MAINTENANCE.md) |
| Ubuntu x64 维护、打包与安装验证     | [DESKTOP_APP_UBUNTU_MAINTENANCE.md](DESKTOP_APP_UBUNTU_MAINTENANCE.md) |
| 模块、依赖方向与写入所有权          | [ARCHITECTURE.md](ARCHITECTURE.md)                                   |
| Revision/DAG/Artifact/Delivery 流程 | [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)                     |
| identity、失效、原子性与幂等        | [DETERMINISTIC_EXECUTION.md](DETERMINISTIC_EXECUTION.md)             |
| 当前已实现与未实现事实              | [ITERATION_STATUS.md](ITERATION_STATUS.md)                           |
| 下一里程碑与进入条件                | [ROADMAP.md](ROADMAP.md)                                             |
| 精确名词边界                        | [TERMINOLOGY.md](TERMINOLOGY.md)                                     |

文档冲突时先用 executable code/tests 确认 repo truth，再修正文档；不能把目标写成实现。

## 当前阶段入口

- Phase A repository adapter、Phase B Workspace production 与 Phase C darwin arm64/x64 native gate 均已
  `verified-complete`；Phase A/Phase B 实施计划分别归档为
  [Phase A](archive/implementation-plans/2026-08-23-desktop-app-phase-a.md) 和
  [Phase B](archive/implementation-plans/2026-08-23-desktop-app-phase-b.md)。Phase C exact workflow/artifact evidence 见
  [ITERATION_STATUS.md](ITERATION_STATUS.md)；下一入口是 Phase D unsigned public beta 许可与发行 Gate，阶段边界见
  [ROADMAP.md](ROADMAP.md)。

## 操作与维护指南

| 主题                                                                                                          | 文档                                                                           |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 主流 Agent 入口、最低能力与宿主适配边界                                                                       | [guides/AGENT_COMPATIBILITY.md](guides/AGENT_COMPATIBILITY.md)                 |
| Desktop Phase A 自动化与 Apple Silicon 原生 smoke                                                             | [guides/DESKTOP_PHASE_A_SMOKE.md](guides/DESKTOP_PHASE_A_SMOKE.md)             |
| Desktop Phase C arm64/x64 本地与 manual-only CI native gate                                                   | [guides/DESKTOP_PHASE_C_NATIVE_GATE.md](guides/DESKTOP_PHASE_C_NATIVE_GATE.md) |
| 统一 Producer/TTS/Scene defaults 配置                                                                         | [guides/PRODUCER_CONFIG.md](guides/PRODUCER_CONFIG.md)                         |
| create 后的只读 inspect、显式 prepare、dirty task delegation、attempt-bound commit/fail 与 fixed continuation | [guides/PRODUCTION_ORCHESTRATION.md](guides/PRODUCTION_ORCHESTRATION.md)       |
| source-current 与 optional exact four-file DeliveryBuild                                                      | [guides/LOCAL_DELIVERY.md](guides/LOCAL_DELIVERY.md)                           |
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
- `promotions/` 是需要用户明确批准的共享能力提升提案。
- [archive/](archive/README.md) 保存已完成或被取代的 plans/specs，仅供追溯。

## 管理规则

[DOCUMENTATION_POLICY.md](DOCUMENTATION_POLICY.md) 定义单一事实来源、目录生命周期、归档与完成门槛。
active Markdown 本地链接和 current 操作文档引用的 npm scripts 必须通过：

```bash
npm run docs:check-links
```
