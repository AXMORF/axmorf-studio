# Remotion Story Producer Agent Guide

本文件定义仓库内 Agent 的执行规则。默认中文交流，先给结论，再给最少必要依据。

## 权威文档

- 产品最终目标：`docs/FINAL_PRODUCT_GOAL.md`
- 外部生产流程：`docs/PRODUCTION_WORKFLOW.md`
- 当前实现状态：`docs/ITERATION_STATUS.md`
- 实施顺序与阶段门槛：`docs/ROADMAP.md`
- 系统结构：`docs/ARCHITECTURE.md`
- 确定性执行：`docs/DETERMINISTIC_EXECUTION.md`
- 名词边界：`docs/TERMINOLOGY.md`

文档冲突时，先以可执行代码和测试确认当前事实，再同步状态文档；不能把目标设计说成
已经实现。

## 工程边界

- 只使用宿主机 Node.js/npm 与 Remotion CLI；不新增 Docker、docker-compose 或
  容器验证流程。
- 所有 `remotion` 与 `@remotion/*` 包保持完全相同的精确版本。
- 一 Story 对应一个 Composition；一 StoryBeat 对应一个 `meaningId` 和一个 Scene；完成
  视觉制作的 Scene 对应一个 ScenePackage。
- `ttsChunks` 是创作决策已经确定的朗读单元；工具不得按标点自动拆分，额外叙事停顿
  必须显式声明或来自封存音频的实测自然静音。
- 实测旁白时间是绝对时间权威；Scene 和转场不得移动、缩短或吞掉 spoken frames。
- TTS 波形不假定 bit-by-bit 可重复；生成结果必须经实测、checksum 和 fingerprint
  封存后才能成为后续时间权威。
- 字幕只由顶层 `CaptionLayer` 渲染；Scene renderer 只输出视觉。
- JSON/数据文件不得包含 JSX、任意代码、任意动态模块路径或可执行表达式。
- 每个 ScenePackage 只绑定一个 Scene 级 `rendererId`；ShotPlan 不绑定 `rendererId` 或
  模块路径。
- Scene renderer 必须通过 composition-local 静态 registry 绑定；它可以在内部拆分
  本地 Shot 组件并调用已批准共享能力，但这些内部组件不是 runtime registry 入口。
- render runtime 不调用 Agent、skill、MCP 或网络服务。
- 所有可见资产必须位于仓库 `public/`，有 manifest 元数据并通过校验。
- 所有 render-critical motion 使用 Remotion frame API；禁止 CSS animation、
  CSS transition 和 Tailwind animation utilities。

## 当前里程碑边界

- M1–M4 已实现 Scene 之外的叙事生产主链和机械验证闭环：VideoBrief、StorySpec、
  NarrationSpec、RenderSpec、StoryBeat、已创作的 `ttsChunks`、StoryCheck、真实 VoxCPM
  生成与封存、SemanticTiming、CaptionCue、透明 NarrativeCore、generated static
  ProjectRegistry、lazy-loaded Story Composition、真实 preview/render、M3 evidence，以及固定
  `project:check --level narrative`、可持久化 AutoCheck 和隔离失效矩阵。
- M4 只实现机械 AutoCheck，没有增加主观叙事质量复核或 `proceed/revise`。
- NarrativeCheck 没有实现。当前唯一下一步是单独编写并审阅 M5 视觉阶段规格，不得提前
  实现视觉合同或 runtime。
- 当前不设计或实现 SceneVisualPlan、ShotPlan、ScenePackage、Scene renderer、视觉资产
  查询、转场、SoundDesignTrack 或 GlobalVisualLayers。
- 已记录的 Scene 级 renderer 设计只定义未来接入接口。它不得成为 Narrative Baseline
  的前置条件，也不得反向修改 Story、旁白、字幕或实测时间线。
- ProjectRegistry 在 bundle 前按固定一级目录约定生成静态 TypeScript；注册元数据必须
  预先可枚举，Composition 代码通过 Remotion `lazyComponent` 和字面量 `import()` 按需
  加载。`Composition.tsx` 必须 default export。
- 目录发现只允许发生在固定生成步骤；render runtime 不扫描目录、不读取 JSON 模块路径，
  也不能为了列出 Narrative Baseline 而加载 Scene renderer。ProjectRegistry 与后续
  composition-local RendererRegistry 分离。
- RenderSpec 是用户每次制作直接给 Agent 的输入；Agent 只结构化并机械校验，不把它
  放进 StoryCheck，也不要求用户二次确认。
- 音频到帧必须按 sealed PCM 的累计整数 sample-frame 边界统一执行
  `ceilDiv(samples × fps, sampleRate)`；禁止逐 chunk 将浮点秒数转帧后累加。

## Scene 制作来源

制作新 Scene 只允许参考：

1. 当前 Story、StoryBeat、实测 timing、SceneVisualPlan 与相邻连续性；
2. 当前 `src/remotion/capabilities/` 中的共享能力；统一 catalog 实现后改用 catalog；
3. 当前方案显式选择并已本地化的上游来源。

不得搜索、打开、比较、模仿或复制旧生产 Scene、旧 Composition、still、
contact sheet 或历史布局来制作新 Scene。历史诊断必须与新 Scene authoring 隔离。

## 共享能力提取

新实现默认留在 `src/projects/<story>/`。只有形成带 fingerprint 的具体 promotion
proposal，并得到用户对范围、API、文件和目标位置的明确批准后，才允许移入
`src/remotion/capabilities/`。证据充分不等于授权，笼统认可不等于后续提取许可。

## 审核

- `AutoCheck`：固定聚合 source contracts、StoryCheck identity、sealed narration、
  SemanticTiming、ProjectRegistry、Narrative Baseline 与 M3 evidence 的机械检查；
- `StoryCheck`：调用外部旁白生成前，由 Agent 检查 StoryBeat 顺序、`ttsChunks`、叙事完整
  性和 voice profile 选择，不阻塞用户；
- `NarrativeCheck`：Agent 批量检查 Story 完整性、旁白可懂度、字幕对应和叙事节奏；
- `SceneVisualCheck`：仅在后续视觉阶段批量检查 Scene 语义、构图、运动与连续性；
- `FinalPreviewApproval`：默认唯一必须由用户作出的创意批准；
- Shotcraft fidelity、motion strip、benchmark、封面和 promotion review 仅在命中
  对应条件时执行。

不要为每个 Scene、每个 still 或每个脚本步骤反复要求用户审批。

## 修改与验证

- 保护用户现有未提交修改；不重置、不覆盖、不顺手整理无关内容。
- 删除、覆盖、强推、生产发布、密钥或权限变更必须有明确授权。
- 修改后先跑聚焦检查，再按风险运行 `npm run check`。
- 新 Composition 至少通过 `npm run compositions`，高风险视觉改动补真实 still 或短片。
- 完成代码或配置任务后检查 README、状态、架构和合同是否需要同步。
- 不 push，除非用户明确要求。
