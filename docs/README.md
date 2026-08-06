# 文档导航

| 文档                                                                                                                                                                     | 作用                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [FINAL_PRODUCT_GOAL.md](FINAL_PRODUCT_GOAL.md)                                                                                                                           | 最终产品目标与不可偷换的边界                                                 |
| [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)                                                                                                                         | Scene 外部主链、生成服务、阶段产物与解耦边界                                 |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                                                                                                                       | 叙事主链、Composition 注册与未来 Scene 接口                                  |
| [DETERMINISTIC_EXECUTION.md](DETERMINISTIC_EXECUTION.md)                                                                                                                 | 固定 CLI、产物封存、静态 registry、runtime 与失效机制                        |
| [PRODUCTION_ORCHESTRATION.md](PRODUCTION_ORCHESTRATION.md)                                                                                                               | M9.5 固定 production CLI、状态投影、Agent返工与流程缺陷边界                  |
| [remotion-story-producer-video](../.agents/skills/remotion-story-producer-video/SKILL.md)                                                                                | 新对话从完整内容直接制作到机械 Preview 的项目级 Skill                        |
| [evidence/2026-08-05-m9-5-production-trial-and-hardening.md](evidence/2026-08-05-m9-5-production-trial-and-hardening.md)                                                 | M9.5 首次真实两 Scene 试跑、replacement、hardening 与机械 Preview 证据       |
| [contracts/NARRATIVE_CONTRACTS.md](contracts/NARRATIVE_CONTRACTS.md)                                                                                                     | 已实现的 M1–M4 叙事、封存、时间、registry、evidence 与 AutoCheck 合同参考    |
| [NARRATION_GENERATION.md](NARRATION_GENERATION.md)                                                                                                                       | M2 真实旁白生成、续跑、封存与恢复指南                                        |
| [evidence/2026-08-01-gps-relativity-m2.md](evidence/2026-08-01-gps-relativity-m2.md)                                                                                     | GPS Relativity M2 真实旁白验收证据                                           |
| [evidence/2026-08-01-gps-relativity-m3.md](evidence/2026-08-01-gps-relativity-m3.md)                                                                                     | GPS Relativity M3 Narrative Baseline 验收证据                                |
| [evidence/2026-08-02-gps-relativity-m4.md](evidence/2026-08-02-gps-relativity-m4.md)                                                                                     | GPS Relativity M4 机械验证闭环与失效矩阵证据                                 |
| [TERMINOLOGY.md](TERMINOLOGY.md)                                                                                                                                         | 对话与代码共同使用的最小名词表                                               |
| [CAPABILITY_CATALOG.md](CAPABILITY_CATALOG.md)                                                                                                                           | 已迁入能力与统一查询目录目标                                                 |
| [REVIEW_MODEL.md](REVIEW_MODEL.md)                                                                                                                                       | 简化后的检查与创意批准模型                                                   |
| [ITERATION_STATUS.md](ITERATION_STATUS.md)                                                                                                                               | 当前已实现、未实现和下一步                                                   |
| [ROADMAP.md](ROADMAP.md)                                                                                                                                                 | 从当前基础到 Narrative、Visual、Final 与 Release 的阶段路线                  |
| [superpowers/plans/2026-08-04-m9-5-contract-driven-production-orchestration-plan.md](superpowers/plans/2026-08-04-m9-5-contract-driven-production-orchestration-plan.md) | M9.5 完整制作要求、运行状态、Scene 结果 watcher 与机械 Preview 实施计划      |
| [superpowers/plans/2026-08-05-m9-5-production-trial-and-hardening-plan.md](superpowers/plans/2026-08-05-m9-5-production-trial-and-hardening-plan.md)                     | M9.5 首次真实生产试跑、故障分类、Red/Green hardening 与 Preview handoff 计划 |
| [BOOTSTRAP_IMPORT_MANIFEST.md](BOOTSTRAP_IMPORT_MANIFEST.md)                                                                                                             | 新仓库初始化与白名单迁移来源                                                 |

`src/remotion/runtime/` 已实现 NarrativeCore、Scene/global enhancement runtime 与显式装配；
ProjectRegistry、两个正式 Story Composition、M4 narrative AutoCheck、M6–M9 final checks、
evidence 和用户 approval 均已落地。M9.5 的 `ProductionRequirementsFreeze`、ProductionRun、
通用 `production:*` scripts、Scene watcher 与 mechanical Preview 已实现；首次真实试跑也已到达
`preview-ready / awaiting-user-preview`。直接生产 Skill 默认按 meaningId 创建独立 Scene 子
Agent，并用 non-terminal `production:scene:check` 在 submit 前返工 Agent 输出。NarrativeCheck、
用户预览后的 Scene 修改循环、promotion 与发布仍未实现。

M4 exact commands：

```bash
npm run project:check -- --project gps-relativity --level narrative
npm run project:check -- --project gps-relativity --level narrative --write-auto-check
```

第一种形式只读重算并检查 persisted AutoCheck drift；第二种形式只在全部机械检查通过时
原子写入，失败不覆盖最后一份有效报告。
