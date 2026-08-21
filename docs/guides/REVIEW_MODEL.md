# Review and acceptance model

> 文档类型：操作边界

Current automatic flow 只有机械 acceptance，不把 Agent 自评或主观审美当成完成 authority。

| Gate | Writer/reader | 证明 |
| --- | --- | --- |
| ProductionRevision parse | fixed planner | explicit inputs、selected bytes、policy identities current |
| Task DAG validation | pure domain | no cycle/duplicate/unknown dependency; stable order |
| `project:task:check` | read-only fixed validator | workspace exact outputs 满足 task-kind contracts |
| `project:task:commit` | fixed Artifact Store adapter | check rerun + exact bytes + ArtifactAttestation atomic promotion |
| `project:task:fail` | fixed attempt adapter | exact attempt/task 的 immutable failed terminal event |
| artifact inspection | fixed reader | schema/dependency/policy/path/type/size/checksum current |
| fixed continuation | fixed application | atomic single-consumer claim；immutable event log；failure/六小时 timeout 不 converge；all-success 内部 converge exactly once；Root 不参与 barrier |
| convergence | fixed application | all artifacts present, current revision, rollback-safe materialization |
| materialized verification | fixed reader | live Project exact bytes match attestations |
| delivery validation | fixed media/filesystem adapters | exact four files, codec/channel/dimensions/fps/frames/checksum/EOF |

Scene validator 另外机械拒绝 Renderer 重新拥有 SceneViewport、raw readability/inset 或
`useVideoConfig()` full-frame dimensions。Scene 的可接受坐标合同是 task 中已派生的
safe-area-local viewport，裁剪、映射与 CaptionLayer 仍由 Composition exactly once 拥有。

Scene exact-reference checks可验证 lineage、license、source graph、phase pairing 与 renderer binding；不输出
“正常速度可辨识”“审美通过”等 Agent 判断。Scene authoring 仍遵循 repository-local
`remotion-best-practices`。

`project-production-complete` 与 `project-production-current` 都证明本地 current four-file package 完整；
workspace check 成功、child chat 成功或 artifact commit 只证明各自较早阶段；continuation 非零退出明确不构成
delivery completion。

NarrativeCheck、SceneVisualCheck、SceneSoundCheck、人工审美审核、平台发布和 capability promotion 都不在
current automatic acceptance 内，需要新的明确产品合同和用户授权。
