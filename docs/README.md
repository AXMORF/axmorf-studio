# 文档导航

| 文档                                                                                 | 作用                                                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [FINAL_PRODUCT_GOAL.md](FINAL_PRODUCT_GOAL.md)                                       | 最终产品目标与不可偷换的边界                                   |
| [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)                                     | Scene 外部主链、生成服务、阶段产物与解耦边界                   |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                                   | 叙事主链、Composition 注册与未来 Scene 接口                    |
| [DETERMINISTIC_EXECUTION.md](DETERMINISTIC_EXECUTION.md)                             | 固定 CLI、产物封存、静态 registry、runtime 与失效机制          |
| [contracts/NARRATIVE_CONTRACTS.md](contracts/NARRATIVE_CONTRACTS.md)                 | 已实现的 M1–M3 叙事、封存、时间、registry 与 evidence 合同参考 |
| [NARRATION_GENERATION.md](NARRATION_GENERATION.md)                                   | M2 真实旁白生成、续跑、封存与恢复指南                          |
| [evidence/2026-08-01-gps-relativity-m2.md](evidence/2026-08-01-gps-relativity-m2.md) | GPS Relativity M2 真实旁白验收证据                             |
| [evidence/2026-08-01-gps-relativity-m3.md](evidence/2026-08-01-gps-relativity-m3.md) | GPS Relativity M3 Narrative Baseline 验收证据                  |
| [TERMINOLOGY.md](TERMINOLOGY.md)                                                     | 对话与代码共同使用的最小名词表                                 |
| [CAPABILITY_CATALOG.md](CAPABILITY_CATALOG.md)                                       | 已迁入能力与统一查询目录目标                                   |
| [REVIEW_MODEL.md](REVIEW_MODEL.md)                                                   | 简化后的检查与创意批准模型                                     |
| [ITERATION_STATUS.md](ITERATION_STATUS.md)                                           | 当前已实现、未实现和下一步                                     |
| [ROADMAP.md](ROADMAP.md)                                                             | 从当前基础到 Narrative、Visual、Final 与 Release 的阶段路线    |
| [BOOTSTRAP_IMPORT_MANIFEST.md](BOOTSTRAP_IMPORT_MANIFEST.md)                         | 新仓库初始化与白名单迁移来源                                   |

`src/remotion/runtime/` 已实现 M3 NarrativeCore 与必需装配，ProjectRegistry 和第一个 Story
Composition 也已落地。`src/remotion/catalog/`、Scene/optional enhancement runtime 与新的
`.agents/skills/` 仍为后续实现范围。
