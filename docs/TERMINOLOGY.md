# 名词表

> 文档类型：术语 authority

<!-- prettier-ignore -->
| 名词 | 精确定义 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project authoring source | `src/projects/<storyId>/` 与显式 Project-local selected media 中的可变创作输入。 |
| Workspace capability gate | creator install/bootstrap 后由 `npm run doctor` 对当前 Workspace 声明能力执行的 readiness 检查；Agent 可准备宿主环境但不得修改 package internals、精确依赖或 validators。它不是 OS allowlist、production completion 或 Delivery evidence。 |
| configured-authoring | `project:create` 已原子写入 Story/TTS/config 与 pending timing-bound authoring，尚未准备 narration。 |
| timing-ready | verified narration PCM/seal/master/timing 已存在，但 production authoring 仍可能待 fixed projection。 |
| production-inputs-ready | 所有 current authoring contracts 与 narration preparation receipt 齐全，可以只读计算 Revision/Task DAG。 |
| narration preparation receipt | prepare 写入的 redaction-safe source-local binding；把 active seal/mastering 绑定到精确 provider-attempt identity，不含私有配置、路径、prompt 或 voice bytes。 |
| ProductionInspection | 严格只读的 readiness、baseline、estimated cost、task explanation 与 nextAction 投影；不是 authority。 |
| TaskDecisionExplanation | 按 task/subject 分离 artifact state、direct changes、dependency changes 与 blockedBy 的诊断事实。 |
| diagnostic baseline | 从 current delivery 对应 succeeded attempt 或 latest verified attempt 选择的安全 task snapshot；不可用时不猜原因。 |
| ProductionRevision | 对一次生产所需全部显式输入与相关 policy fingerprint 的 immutable 内容快照。 |
| RevisionId | ProductionRevision 的内容寻址 identity；不含 attempt、时钟、PID 或绝对路径。 |
| ProducerTaskSpec | DAG node 的完整输入、依赖、declared read/output set 和 validator version。 |
| TaskRevision | ProducerTaskSpec 的内容寻址 identity。 |
| ProducerPlan | 当前 Revision 下每个 task 的 stable action、typed artifact state、direct/dependency changes 与 blockedBy。 |
| dirty Agent task | 缺少有效 artifact、且 task kind 为 scene-owner/global-visual-owner/cover-owner 的 task。 |
| `dispatch-agent` action | Task DAG 中“需要 Agent 创作”的稳定分类名；实际由已解析 execution policy 决定 Root inline 或 subagent executor，不强制代表创建 child。 |
| fixed task | 由确定性脚本生成或检查的 narration/template/convergence/delivery task，不委派 Agent。 |
| task workspace | `.producer-work/<storyId>/<taskRevision>/`；一个 Agent task 的唯一直接写入范围。 |
| ArtifactAttestation | fixed validator 成功后对 TaskRevision、dependencies、policy 和 exact output bytes 的证明。 |
| Artifact Store | `.producer-artifacts/<storyId>/...` 中的 immutable、可跨 attempt 复用的 validated artifacts。 |
| ExecutionAttempt | `.producer-attempts/<storyId>/...` 中由 prepare 创建的等待/收敛诊断；不拥有 artifact 或 delivery。 |
| task-terminal event | task executor 对 exact attempt/TaskRevision 写入的首个 committed/current/failed 机械终态；同结果幂等，相反结果不可覆盖。 |
| Agent execution policy | inspect 前按用户提示词明确字段、独立 settings、内置 `inline` 默认解析的当前 production 编排策略；选择 Root inline 串行或最多四个 subagents，不进入 production identity。 |
| fixed continuation | Root 完成 inline execution 或 bounded admission 后启动的 attempt-bound 固定进程；one-shot atomic claim 后等待 immutable task-terminal event log，failure/attempt 创建起一小时 timeout 退出，all-success 内部 converge exactly once。 |
| convergence | fixed continuation 内部的只读重算 Revision、要求全部 artifact、受控物化 Project、刷新 derived packages/Composition 并交付。 |
| materialization | 把 attested bytes 从 Artifact Store 通过 staging/replace/rollback 写到 live Project-owned roots。 |
| artifact set fingerprint | 当前所有 required ArtifactAttestation identity 的稳定聚合，用于 downstream identity。 |
| DeliveryBuildId | revisionId、artifact set、Composition metadata 与 build policy 的内容寻址 identity。 |
| current delivery | `deliveries/<storyId>/` 下通过 exact-four-file 与 media validation 的唯一 current package。 |
| project-production-complete | 新 identity 已同步构建、验证并提升为 current delivery。 |
| project-production-current | 相同 identity 的 current delivery 重新验证完整，未重写媒体。 |
| template-copy Scene | create 时复制到 Project-local 的 immutable template instance，由 fixed task 产出 artifact。 |
| scene-owner Scene | 需要一个 dirty Scene task executor 在独占 workspace 内创作的 Scene。 |
| SceneViewport | Composition 拥有的 safe-area-local Scene 容器；把本地 `(0, 0)` 映射到内容安全区左上角，并只向 Renderer 暴露 `viewportWidth`/`viewportHeight`。 |
| historical `.producer-runs` | 旧架构只读历史数据；current pipeline 不读取，只允许 Project 删除器按严格 ownership 清理。 |
