# 已完成实施计划

这些文件是实施时的任务拆分、命令和边界快照。对应能力已经完成或方案已经被后续实现取代，
所以全部从 active 文档层移出。当前行为以代码、测试和 `docs/` 根目录权威文档为准。

2026-08-06 的工程结构治理计划完成了 milestone 脚本目录收口、正式作品静态验证 profile、
兼容层隔离、scaffold/边界硬编码治理与文档同步；计划快照见
`2026-08-06-engineering-structure-hardening-plan.md`。

2026-08-07 的 GlobalVisual contract production 计划完成了 future-only v4 requirements、N 个
Scene owner 与一个 GlobalVisual owner 的并行 assignment/result 汇合、static Preview 装配、
兼容矩阵和 Skill/authority closeout；计划快照见
`2026-08-07-agent-authored-global-visual-contract-production-plan.md`。

2026-08-07 的 Project 可删除性与产物解耦计划完成了 current-set Registry/Catalog、
Project-owned profile/tools/tests、source/media gate 分离、Run-owned PreviewEvidence 和 A–F 隔离
删除矩阵；计划快照见 `2026-08-07-project-deletability-implementation-plan.md`。其中“不新增
`project:delete`”是当时批准边界，已被 current
[`PRODUCTION_WORKFLOW.md`](../../PRODUCTION_WORKFLOW.md#8-作品删除) 的显式用户授权删除入口取代。

2026-08-20 的 Project Revision / Task DAG / Artifact clean-break 计划完成了唯一生产主链切换：
ProductionRevision、内容寻址 Task DAG、受控 task workspace、ArtifactAttestation、fixed/Agent artifact
复用、原子 Project 物化与同步 exact 四文件 DeliveryBuild 成为唯一 authority；旧 Run/receipt/boundary、
render-ready、detached delivery、旧 CLI、旧 Settings 字段和对应 tests 已删除。计划快照见
`2026-08-20-project-revision-task-dag-clean-break.md`。

2026-08-20 的 Project Create / Inspect / Prepare / Explainability clean-break 完成了 atomic `project:create`、
strict read-only `project:produce:inspect`、explicit costly `project:produce:prepare`、typed per-task invalidation
explanation、Settings diagnostic projection 与 converge read-only replan；旧 create/production 双入口已从 public
surface 和 active docs/tests 删除，不保留 alias/shim。diagnostics 不进入或改变 production/artifact/delivery
identity/authority。focused vertical tests 已取得 Green；完整 closeout gate 仍以该实施轮次的最终验证报告为准。
计划快照见 `2026-08-20-explainable-project-create-production-preparation.md`。
