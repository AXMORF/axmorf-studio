# 名词表

> 文档类型：术语 authority

| 名词 | 精确定义 |
| --- | --- |
| Project authoring source | `src/projects/<storyId>/` 与显式 Project-local selected media 中的可变创作输入。 |
| ProductionRevision | 对一次生产所需全部显式输入与相关 policy fingerprint 的 immutable 内容快照。 |
| RevisionId | ProductionRevision 的内容寻址 identity；不含 attempt、时钟、PID 或绝对路径。 |
| ProducerTaskSpec | DAG node 的完整输入、依赖、declared read/output set 和 validator version。 |
| TaskRevision | ProducerTaskSpec 的内容寻址 identity。 |
| ProducerPlan | 当前 Revision 下每个 task 的 reused/dirty/missing/incompatible/blocked 分类与稳定 reason。 |
| dirty Agent task | 缺少有效 artifact、且 task kind 为 scene-owner/global-visual-owner/cover-owner 的 task。 |
| fixed task | 由确定性脚本生成或检查的 narration/template/convergence/delivery task，不委派 Agent。 |
| task workspace | `.producer-work/<storyId>/<taskRevision>/`；一个 Agent task 的唯一直接写入范围。 |
| ArtifactAttestation | fixed validator 成功后对 TaskRevision、dependencies、policy 和 exact output bytes 的证明。 |
| Artifact Store | `.producer-artifacts/<storyId>/...` 中的 immutable、可跨 attempt 复用的 validated artifacts。 |
| ExecutionAttempt | `.producer-attempts/<storyId>/...` 中的一次计划/等待/收敛诊断；不拥有 artifact。 |
| convergence | 重新计算 Revision、要求全部 artifact、受控物化 Project、刷新 derived packages/Composition 并交付。 |
| materialization | 把 attested bytes 从 Artifact Store 通过 staging/replace/rollback 写到 live Project-owned roots。 |
| artifact set fingerprint | 当前所有 required ArtifactAttestation identity 的稳定聚合，用于 downstream identity。 |
| DeliveryBuildId | revisionId、artifact set、Composition metadata 与 build policy 的内容寻址 identity。 |
| current delivery | `deliveries/<storyId>/` 下通过 exact-four-file 与 media validation 的唯一 current package。 |
| project-production-complete | 新 identity 已同步构建、验证并提升为 current delivery。 |
| project-production-current | 相同 identity 的 current delivery 重新验证完整，未重写媒体。 |
| template-copy Scene | configure 时复制到 Project-local 的 immutable template instance，由 fixed task 产出 artifact。 |
| scene-owner Scene | 需要一个 dirty Scene task child 在独占 workspace 内创作的 Scene。 |
| historical `.producer-runs` | 旧架构只读历史数据；current pipeline 不读取，只允许 Project 删除器按严格 ownership 清理。 |
