# Review and acceptance model

> 文档类型：操作边界

Current automatic flow 只有机械 acceptance，不把 Agent 自评或主观审美当成完成 authority。

| Gate                         | Writer/reader                   | 证明                                                                                                                                                             |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ProductionRevision parse     | fixed planner                   | explicit inputs、selected bytes、policy identities current                                                                                                       |
| Task DAG validation          | pure domain                     | no cycle/duplicate/unknown dependency; stable order                                                                                                              |
| `project:task:bind`          | zero-write fixed gate           | exact task/active attempt/three immutable inputs/contract current；返回 transport-scoped capability                                                              |
| `project:task:finalize`      | fixed derived projection        | 仅重建 contract 声明的 fixed-derived outputs，再运行同一 validator                                                                                               |
| `project:task:check`         | read-only fixed validator       | full binding 下 workspace exact outputs 满足 task-kind contracts                                                                                                 |
| bound `project:task:preview` | fixed diagnostic renderer       | shared-workspace owning Scene 的 source/media 快照、完整 Scene clip、fps/frame count/EOF/漂移；不证明审美，不包含 Project BGM 或相邻 Scene                       |
| `project:task:commit`        | fixed Artifact Store adapter    | check rerun + exact bytes + ArtifactAttestation atomic promotion                                                                                                 |
| authored `project:task:fail` | fixed attempt adapter           | full binding 下 exact attempt/task 的 immutable failed terminal event                                                                                            |
| spawn/fixed failure          | narrow fixed adapter            | 只记录真实 host transport/permission 或 immutable/controller fault；不能读取 task content                                                                        |
| artifact inspection          | fixed reader                    | schema/dependency/policy/path/type/size/checksum current                                                                                                         |
| fixed continuation           | fixed application               | atomic single-consumer claim；immutable event log；failure/attempt 创建起一小时 timeout 不 converge；all-success 内部 converge exactly once；Root 不参与 barrier |
| convergence                  | fixed application               | all artifacts present, current revision, rollback-safe materialization                                                                                           |
| materialized verification    | fixed reader                    | live Project exact bytes match attestations                                                                                                                      |
| delivery validation          | fixed media/filesystem adapters | exact four files, codec/channel/dimensions/fps/frames/checksum/EOF                                                                                               |

Scene validator 另外机械拒绝 Renderer 重新拥有 SceneViewport、raw readability/inset 或
`useVideoConfig()` full-frame dimensions。Scene 的可接受坐标合同是 task 中已派生的
safe-area-local viewport，裁剪、映射与 CaptionLayer 仍由 Composition exactly once 拥有。

Scene exact-reference checks可验证 lineage、license、source graph、phase pairing 与 renderer binding；不输出
“正常速度可辨识”“审美通过”等 Agent 判断。Scene authoring 仍遵循 repository-local
`remotion-best-practices`。

`project-production-complete` 与 `project-production-current` 都证明本地 current four-file package 完整；
workspace check 成功、executor chat 成功或 artifact commit 只证明各自较早阶段；continuation 非零退出明确不构成
delivery completion。

实际动作、字幕阅读、连续衔接和整片混音审阅是独立的感知证据，应清楚记录实际观看/听审范围与未验证项。
它们不改变机械 acceptance authority；不能以截图、计划声明或自填分数冒充完整审片。
NarrativeCheck、SceneVisualCheck、SceneSoundCheck 不在 current automatic acceptance 内。
平台发布和 capability promotion 仍需独立合同与相应授权。
