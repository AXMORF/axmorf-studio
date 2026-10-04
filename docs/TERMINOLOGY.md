# 名词表

> 文档类型：术语 authority

<!-- prettier-ignore -->
| 名词 | 精确定义 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project authoring source | `src/projects/<storyId>/` 与显式 Project-local selected media 中的可变创作输入。 |
| Workspace capability gate | creator install/bootstrap 后由 `npm run doctor` 对当前 Workspace 声明能力执行的 readiness 检查；Agent 可准备宿主环境但不得修改 package internals、精确依赖或 validators。它不是 OS allowlist、production completion 或 Delivery evidence。 |
| shared Workspace resource | runtime package 中由 policy、asset manifest、checksum 与 license identity 共同覆盖并随 package 分发的媒体；bootstrap 只投影到保留的 `public/assets/axmorf-shared/` 和 Catalog，相同 bytes 幂等、冲突 fail closed。它不是 Project-owned，直到 create/import 将实际使用的 bytes 本地化。 |
| configured-authoring | `project:create` 已原子写入 Story/config 与 pending timing-bound authoring；narrated 模式含 TTS，visual 模式明确无旁白。尚未创建 production attempt 或 Delivery。 |
| structured authoring validation | create/revision 共用的 pre-mutation machine validation；顶层 `authoring-validation-failed` 包含 field-level issues。`caption-display-budget-exceeded` 使用 `caption-display-unit-v1`，每个 authored `ttsChunk` 上限 72 display half-units。 |
| ProjectRevisionInput | 修改现有 Project 的 strict raw input；绑定 storyId、exact base Revision/Delivery tuple 与非空 authored patch。 |
| revision base tuple | candidate 创建和 promotion 都必须重验的 `baseRevisionId + baseDeliveryBuildId`。 |
| revision base snapshot | candidate 创建时冻结的 source/public/narration/delivery canonical tree bytes identity；用于检测 create 与 promote 之间的 live drift。 |
| ProjectRevisionCandidateId | 由 canonical ProjectRevisionInput 内容寻址得到的 candidate routing identity；不进入 production content identities。 |
| Project revision candidate | `.producer-revisions/<storyId>/<candidateId>/` 中隔离 source/public/narration/work/attempt/out/delivery 的 same-Project 修改；promotion 前不是 current authority。 |
| Scene originality baseline | Project create 前其他 Project 的完整 Scene TS/TSX source graph 冻结快照；fingerprint/context 只进入 `scene-owner`，template-copy 豁免，缺失时 production fail closed。 |
| timing-ready | narrated 模式的 verified PCM/seal/master/timing，或 visual 模式的 authored frame timing 已存在，但 production authoring 仍可能待 fixed projection。 |
| production-inputs-ready | 所有 current authoring contracts 与模式对应的 timing/旁白记录齐全，可以只读计算 Revision/Task DAG；visual 的 narration/sealed/mastered 明确为 null。 |
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
| TaskExecutionContract | `inputs/task-contract.json` 中 attempt-neutral immutable Agent task input；定义 purpose/workflow/constraints、component signatures、exact outputs 与 ownership，不含 transport、binding、failure 或 command。 |
| TaskWorkerBinding | exact TaskRevision/attempt 绑定的 zero-write capability gate；只有 `task-worker-bound` 才允许读取三个 immutable inputs 和写 declared outputs。 |
| worker transport | 本次 production 的非持久宿主能力证据：`shared-workspace` 只开放 bind 返回的 relative workspace，`controller-io` 没有 filesystem access 且只使用 bound file-read/file-write；不进入 content identity。 |
| ArtifactAttestation | fixed validator 成功后对 TaskRevision、dependencies、policy 和 exact output bytes 的证明。 |
| Artifact Store | `.producer-artifacts/<storyId>/...` 中的 immutable、可跨 attempt 复用的 validated artifacts。 |
| ExecutionAttempt | `.producer-attempts/<storyId>/...` 中由 prepare 创建的等待/收敛诊断；不拥有 artifact 或 delivery。 |
| attempt recovery inspection | 对 terminal failed attempt 的严格只读、零 provider eligibility 检查；要求 same current Revision、无 active successor、无 fixed dirty/blocked flow，不要求 current Delivery。 |
| attempt reissue | recovery-ready 后创建 fresh same-Revision attempt/bindings 的显式零 provider 操作；旧 attempt immutable，复用 valid artifacts/合法 drafts，不是自动 retry。 |
| task-terminal event | task executor 对 exact attempt/TaskRevision 写入的首个 committed/current/failed 机械终态；同结果幂等，相反结果不可覆盖。 |
| Agent execution policy | inspect 前按用户提示词明确字段、独立 settings、内置 `subagents`/4 默认解析的当前 production 编排策略；选择 Root inline 串行或最多四个 subagents，不进入 production identity。 |
| GlobalVisual layer policy | 由 canonical SemanticTiming 固定派生的双层范围：base 覆盖完整 Composition；decoration 只覆盖首个至末个正文 Scene（narrated 或 visual）的连续窗口，并以该窗口起点作为 local frame zero。 |
| fixed continuation | Root 完成 inline execution 或 bounded admission 后启动的 attempt-bound 固定进程；one-shot atomic claim 后等待 immutable task-terminal event log，failure/attempt 创建起一小时 timeout 退出，all-success 内部 converge exactly once。 |
| convergence | fixed continuation 内部的只读重算 Revision、要求全部 artifact、受控物化 Project、刷新 derived packages/Composition 并交付。 |
| materialization | 把 attested bytes 从 Artifact Store 通过 staging/replace/rollback 写到 live Project-owned roots。 |
| artifact set fingerprint | 当前所有 required ArtifactAttestation identity 的稳定聚合，用于 downstream identity。 |
| DeliveryBuildId | revisionId、artifact set、Composition metadata 与 build policy 的内容寻址 identity。 |
| current delivery | `deliveries/<storyId>/` 下通过 exact-four-file 与 media validation 的唯一 current package。 |
| project-production-complete | 新 identity 已同步构建、验证并提升为 current delivery。 |
| project-production-current | 相同 identity 的 current delivery 重新验证完整，未重写媒体。 |
| project-revision-promoted | candidate expected Revision/Delivery 已通过受控事务成为 live current，Registry/Catalog 已刷新并复验。 |
| project-revision-current | 同一 candidate expected tuple 已经是完整 current，重复 promotion 未重写 current bytes。 |
| revision promotion | candidate exact-four Delivery 后，在 lock 内重验 live base 与 expected candidate Revision/Delivery，只受控替换 source/public/narration/delivery 并刷新 Registry/Catalog；失败完整 rollback。 |
| template-copy Scene | create 时复制到 Project-local 的 immutable template instance，由 fixed task 产出 artifact。 |
| template playback window | Story preset 中 fingerprint-covered 的 source-frame 播放区间，endFrame 不包含在内；不改变 immutable template bytes，null 恢复完整模板。 |
| visual-scene | 通过可见对象、动作与短文案表达含义的正文 Beat；有明确 durationInFrames，无 ttsChunks。一 Story 暂不与 narrated 正文混排。 |
| authored-frames-v1 | visual Story 的累计整数帧时序算法；sampleRate/narrationStartFrame 为 null、segments/captionCues 为空，包含边界与 lead/tail。 |
| SceneContinuityVisual | 公开 runtime 组件，消费两侧任务共同冻结的可选自由 SVG handoff；共享主体绘制，不生成整场景或证明审美质量。 |
| bound Scene preview | shared-workspace scene-owner 在 commit 前通过 exact binding 渲染 owning Scene 的诊断短片；不含相邻 Scene、GlobalVisual 或 Project BGM，不进入 Artifact/Delivery identity。 |
| sound envelope | contribution-local 的可选首尾线性增益；循环音频沿完整 contribution 时间应用，不每圈重启，不修改 source bytes 或 narration。 |
| scene-owner Scene | 需要一个 dirty Scene task executor 在独占 workspace 内创作的 Scene。 |
| SceneViewport | Composition 拥有的 safe-area-local Scene 容器；把本地 `(0, 0)` 映射到内容安全区左上角，并只向 Renderer 暴露 `viewportWidth`/`viewportHeight`。 |
| historical `.producer-runs` | 旧架构只读历史数据；current pipeline 不读取，只允许 Project 删除器按严格 ownership 清理。 |
