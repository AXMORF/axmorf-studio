# 简化审核模型

## 默认路径

```mermaid
flowchart LR
    Change["代码 / 数据 / 资产变化"] --> Auto["AutoCheck<br/>机械检查"]
    Auto --> Narrative["NarrativeCheck<br/>Agent 批量叙事检查"]
    Narrative --> Enhanced{"存在增强轨？"}
    Enhanced -->|"否"| Preview["完整 Preview"]
    Enhanced -->|"是"| Enhancement["EnhancementCheck<br/>按存在的轨道检查"]
    Enhancement --> Preview
    Preview --> User["FinalPreviewApproval<br/>用户最终创意批准"]
    User --> Render["Render / Release"]
```

## 检查层级

| 层级                 | 负责人      | 内容                                                                                                     | 是否每次阻塞用户     |
| -------------------- | ----------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| AutoCheck            | 脚本/运行时 | 合同、连续帧范围、封存产物、ProjectRegistry 漂移与 lazy import、fingerprint、typecheck、lint、build      | 否                   |
| NarrativeCheck       | Agent       | Story 完整性、旁白可懂度、字幕对应、无截断和整体叙事节奏                                                 | 否，批量汇报         |
| EnhancementCheck     | Agent       | 仅检查实际存在的 ScenePackage、global sound、global visual；SceneVisualCheck 与 SceneSoundCheck 属于此层 | 否，批量汇报         |
| FinalPreviewApproval | 用户        | 已选择轨道装配后的完整音画节奏与最终审美                                                                 | 是，默认唯一创意批准 |

当前已实现生成前 StoryCheck、narrative AutoCheck、M6 final-level Scene 机械基础，以及 M7
GPS 的 evidence-bound 批量 SceneVisualCheck、SceneSoundCheck 与四个相邻连续性检查。
NarrativeCheck 和包含 M8 global tracks 的完整 EnhancementCheck 仍未实现。Narrative Baseline
继续独立通过；GPS final 当前因五个 Scene 全 ready 而通过。Baseline/M7 checkpoint 都不新增
强制用户审批。

在调用 VoxCPM 前另有一次 Agent 内部 `StoryCheck`，用于检查 StoryBeat 顺序、已创作的
`ttsChunks` 和 voice profile 选择。它是生成前的成本控制，不是新的用户批准节点。

RenderSpec 是用户每次制作时直接给 Agent 的输入。Agent 将它结构化并执行类型、范围、
字段兼容性等机械校验；RenderSpec 不进入 StoryCheck，也不新增确认或审批节点。

## 条件检查

- VisualStyleSpec 新建或变化：执行 `VisualDirectionCheck`；
- 新视觉语言或高风险镜头：增加代表性 style-fidelity evidence；
- meaning-changing motion：增加 motion strip 或短 Preview；
- Shotcraft `exact-demo-localized` 来源：增加独立 ShotReferenceFidelityCheck；
- Shotcraft `inspiration-only`：记录 provenance，但不得显示 exact pass；空选择不执行
  Shotcraft fidelity，也不因此失败；
- 重场景或长片：增加代表性 benchmark；
- 需要发布：再检查封面、编码、音量与发布物；
- 共享能力提取：单独提交 promotion proposal，不能搭车批准。

静态布局不重复生成大量相似 still；Scene 默认以 contact sheet 批量查看。相同
fingerprint 的机械产物无需重复创意审批。

进入 Scene 制作阶段时，一个 ScenePackage 是单一并行交付与失效单位，但内部保留三个
聚焦子检查：

- SceneVisualCheck 检查完整 Scene renderer 输出，包括所有 Shot、连续运动、画风一致性和
  相邻 Scene 关系；
- ShotReferenceFidelityCheck 只检查 Scene 显式选择的上游 recipe：immutable commit、
  card/style-key、准确 demo/preview、最小本地化依赖闭包、真实 Renderer/JSX/frame-state
  binding、source/adaptation 配对证据、正常速度可辨识度，以及是否错误继承上游品牌皮肤；
- SceneSoundCheck 检查局部 ambience/SFX、资源准入、同步锚点、音量和 Beat 窗口边界。

第三方代码许可证与 bundled audio/image/font 的逐资产授权是机械准入项，不交给审美审核
兜底；来源或授权未确认的资源先 `blocked`，不能进入 ScenePackage 后再让用户承担风险。

M6 synthetic fixture 已机械绑定 exact reference 的 immutable lineage、准确 demo、本地源码、
真实 Renderer/frame-state binding、配对 evidence 和当前 Agent 正常速度 review record。checker
只验证该 record 与证据仍 current，不自动判断美感或可辨识度。M7 GPS 的五个正式 Scene 均为
`empty` recipe，因此 exact fidelity 为 not-applicable；它们的批量视觉、局部声音与连续性结论
由 Agent 明确写入 review record，再由脚本绑定 current package/projection/media fingerprints。

内部 Shot、音效 cue 或子 Agent 任务都不形成额外的用户批准节点。主 Agent 收集全部
ScenePackage 后批量汇总检查，用户仍默认只在 FinalPreviewApproval 作一次创意批准。

机械检查最终汇总为作品级 `project:check`，而不是在每个节点建立一套独立审批。目标
检查项见 [DETERMINISTIC_EXECUTION.md](DETERMINISTIC_EXECUTION.md)。
