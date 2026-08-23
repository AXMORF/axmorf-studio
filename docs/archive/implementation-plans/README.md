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

2026-08-23 的 AXMORF Studio Desktop App Phase A 计划完成了 repository adapter 与 Apple Silicon native gate。
evidence commit `e5b9b6bd81bbe229177a64ed326ab3e46eaf2220` 的 manual-only Actions run
[`32591197950`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32591197950) 验证 packaged arm64 App、
真实 four-file Delivery playback/seek、media/security/lifecycle/Agent gates 与 609/609 full check；artifact ID 为
`9480398272`。Hermes CLI 在 runner 不存在，因此 Hermes-specific smoke 按合同保持 pending。计划快照见
`2026-08-23-desktop-app-phase-a.md`；Phase B 只成为下一路线入口，未在该计划中实施。

2026-08-23 的 AXMORF Studio Desktop App Phase B 计划完成了 Workspace-owned production、embedded Runtime Pack、
`rsp-local-v2`、attested source-current、manual/automatic exact-four-file Delivery、bundled Preview Player 与 lifecycle
cleanup。evidence commit `04ca57ed5b6469eb9bc4acd8c86829ca0222576a` 的 hosted macOS 15 arm64 Actions run
[`32648089941`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32648089941) conclusion 为 success；
artifact ID `9495509231` 已人工复核 package/runtime identity、manual/automatic Delivery、Preview、loopback listener 与
failure/Quit/reopen cleanup。该 deterministic fixture 不等于外部创作 Agent、Intel x64、DMG、签名、公证或发行证据。
计划快照见 `2026-08-23-desktop-app-phase-b.md`；Roadmap 下一入口推进到 Phase C 双架构验收。
