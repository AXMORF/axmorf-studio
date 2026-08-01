# Remotion Story Producer Roadmap

> Status：已获用户批准；M0、M1、M2 已完成，M3 计划审阅为下一步
> 更新日期：2026-08-01

## 1. 用途

本文档只回答三个问题：下一步做什么、做到什么算完成、什么时候可以进入下一
阶段。它是依赖驱动的 Roadmap，不是日期承诺，也不是把全系统一次性实现的巨型计划。

每个 Milestone 在开始前单独编写可执行实施计划，明确文件、接口、测试、命令和提交边界；
一次只执行当前 Milestone。

## 2. 当前起点

当前代码已完成基础工程、已迁入共享能力、`CapabilityGallery`、M1 合同内核，以及
`gps-relativity` 的 M2 真实旁白生成/续跑/测量/封存/时间产物。目标架构、Composition
组合模型和 Narrative Baseline 主链已写入文档，但下列内容仍未实现：

- NarrativeCore、ProjectRegistry、lazy Story Composition 和 Narrative Baseline；
- Scene、Sound、Global 增强轨与发布工具。

因此当前不应直接开始 Scene 视觉制作，也不应先实现三个可选增强轨的空壳。

## 3. 全局硬边界

- 只使用宿主机 Node.js/npm 和 Remotion CLI，不新增 Docker。
- 所有 `remotion` 与 `@remotion/*` 包保持完全相同的精确版本。
- `ttsChunks` 是已创作的朗读单元，工具不按标点重新切分。
- 封存 PCM 样本时间线是唯一时间权威；所有帧边界使用
  `pcm-cumulative-ceil-v1`。
- NarrativeCore 必需；StoryVisualTrack、SoundDesignTrack 和 GlobalVisualLayers 可选。
- 四个语义聚合由小型底层能力组合，CompositionAssembly 使用显式插槽，不使用
  万能 Track 类型或无约束 track 数组。
- render runtime 不调用 Agent、skill、MCP、VoxCPM 或网络服务。
- JSON 和数据文件不保存 JSX、代码、函数或动态模块路径。
- 当前新能力保持 composition-local；第二个不同主题验证前不提取共享能力。
- 每个 Milestone 都必须同步测试、使用文档和 `ITERATION_STATUS.md`，不把目标设计
  写成已实现状态。

## 4. 路线总览

```mermaid
flowchart LR
    M0["M0 设计收口<br/>已完成"] --> M1["M1 合同与确定性内核<br/>已完成"]
    M1 --> M2["M2 真实旁白生成与封存<br/>已完成"]
    M2 --> M3["M3 Narrative Baseline Runtime<br/>下一步：先审阅计划"]
    M3 --> M4["M4 叙事闭环与失效验证"]
    M4 --> G1{"Gate A<br/>Baseline 真实闭环？"}
    G1 -->|"是"| M5["M5 视觉阶段规格"]
    G1 -->|"否"| M1
    M5 --> M6["M6 资源目录与 Scene Runtime"]
    M6 --> M7["M7 第一个完整视觉证明"]
    M7 --> M8["M8 Sound / Global / Final Assembly"]
    M8 --> M9["M9 第二主题与泛化"]
    M9 --> M10["M10 发布收口"]
```

## 5. Milestone 定义

### M0：设计收口

**状态：** 已于 2026-08-01 获得用户批准。

**目标：** 固定能够指导下一阶段实现的产品边界、Composition 组合模型和实施顺序。

**交付物：**

- 已对齐的最终目标、架构、生产流程、确定性执行和当前状态文档；
- 本 Roadmap；
- M1 的硬边界，但不提前写 Scene、Sound 或 Global 的实现。

**完成门槛：**

- 用户批准 Roadmap 顺序和 M1 范围；
- 文档不再存在“四个聚合是否互相包含”或“先做视觉还是旁白”的歧义；
- 批准后为 M1 单独编写实施计划。

### M1：数据合同与确定性内核

**状态：** 已于 2026-08-01 完成并通过 M1 验收。

**目标：** 在不调用 VoxCPM、不渲染视频的情况下，先建立所有下游依赖的可版本化
合同、纯函数和失效语义。

**范围：**

- `VideoBrief`、`StorySpec`、`NarrationSpec`、`RenderSpec`、`StoryBeat`、`TTSChunk`；
- 显式叙事停顿、`SealedNarrationManifest`、`SemanticTiming`、`CaptionCue`；
- `StoryCompositionProps` 和 Narrative Baseline 所需的最小项目文件合同；
- canonical serialization、hash algorithm、algorithm ID 和分层 fingerprint；
- `BigInt` 累计样本边界与 `pcm-cumulative-ceil-v1` 时间算法；
- 合法、非法和失效传播 fixtures 及单元测试。

**明确不做：** VoxCPM 调用、Remotion runtime、ProjectRegistry、Scene 数据合同。

**完成门槛：**

- 合同具有 schema version，未知字段、重复 ID、无序 chunk 和非法范围均 fail closed；
- 文档中的 PCM 示例可由测试精确复现，无浮点秒数或逐 chunk 帧累加；
- 相同输入得到相同 fingerprint，上游变化使预期下游失效；
- 测试、typecheck 和 lint 通过，合同文档与代码一致。

### M2：第一个真实主题的旁白生成与封存

**状态：** 已于 2026-08-01 完成并通过真实音频、恢复、封存、隐私和范围验收。

**目标：** 用一个全新真实主题打通
`authored ttsChunks → VoxCPM candidates → measured/sealed narration → SemanticTiming`。

**范围：**

- 真实 `StorySpec`、`NarrationSpec`、`RenderSpec`，以及 `StoryCheck` 报告合同和非阻塞用户的
  执行流程；
- voice profile 引用与宿主机 VoxCPM provider adapter；
- 逐 chunk 生成、候选产物续跑、PCM 规范化、实测和 checksum；
- 显式停顿插入、完整 WAV 拼接、原子封存与 timing 生成；
- 私有 provider 地址、token 和模型配置与项目产物分离。

**明确不做：** NarrativeCore、ProjectRegistry、Scene 或视觉选材。

**完成门槛：**

- 中断批次可在相同 generation input fingerprint 下续跑，但不产生 sealed receipt；
- 只有完整候选集合通过测量、checksum 和指纹校验后才能原子封存；
- 已封存结果不被重试静默覆盖；complete WAV 样本数与所有 segment 之和一致；
- CaptionCue 与 TTSChunk 一一对应，时间线无累计漂移、重叠或未解释空洞；
- provider 不可用时，仍匹配当前输入的旧 sealed narration 可继续使用。

真实验收见
[GPS Relativity M2 Narration Evidence](evidence/2026-08-01-gps-relativity-m2.md)，操作与恢复见
[Narration Generation and Recovery](NARRATION_GENERATION.md)。M2 没有开始 NarrativeCore、
ProjectRegistry、Composition、Scene 或 BaseCanvas。

### M3：Narrative Baseline Runtime 与 Story 注册

**目标：** 在完全没有 ScenePackage 和增强轨的情况下，使第一个真实 Story 可列出、
预览和渲染。

**范围：**

- `NarrationAudioTrack`、顶层 `CaptionLayer` 和不绘制背景的 `NarrativeCore`；
- 只实现 `CompositionAssembly` 的必需 `narrativeCore` 插槽，不建立三个增强轨空壳；
- `src/projects/<story>/Composition.tsx` 的 default export 和项目本地静态数据读取；
- generated static ProjectRegistry、字面量 `import()`、`lazyComponent` 和漂移检查；
- Composition listing、Baseline preview/render 和 evidence fingerprint。

**明确不做：** Scene renderer、ResourceCatalog、SoundDesignTrack、GlobalVisualLayers。

**完成门槛：**

- `npm run compositions` 同时列出系统 Composition 和 lazy-loaded Story Composition；
- Root 不扫描目录、不读 Story JSON、不静态导入所有 Story Composition；
- 完整旁白只挂载一次，`playbackRate=1`，CaptionLayer 只消费已生成绝对帧；
- NarrativeCore 除 CaptionLayer 外不绘制任何视觉，其余区域保持透明；
- 没有任何视觉增强仍能产生可理解的 Baseline Preview 和成片；
- registry 缺失、漂移、重复 ID 或非字面量 loader 全部 fail closed。

### M4：Narrative Baseline 真实闭环

**目标：** 把 M1–M3 收口为一个可重复、可检查、可证明失效正确的作品级主链。

**范围：**

- `npm run project:check -- --project <slug> --level narrative`；
- 已有 StoryCheck 报告的消费，AutoCheck 与 NarrativeCheck 的报告格式和作品级汇总；
- Story、NarrationSpec、停顿、RenderSpec timing/非 timing、registry 变化的失效场景；
- 真实 Baseline preview/render、证据指纹和使用说明；
- README、架构、状态、合同和命令的最终对齐。

**完成门槛：**

- `project:check --level narrative`、typecheck、lint、bundle 和 compositions 全部通过；
- 修改每类上游输入后，旧 timing、registry、Baseline 和 evidence 按设计精确失效；
- NarrativeCheck 确认 Story 完整、旁白可懂、字幕对应、无截断且整体节奏可接受；
- 上述检查不查询 ResourceCatalog，不加载 Scene renderer，不要求任何视觉产物。

### Gate A：是否允许进入视觉阶段

只有 M4 全部通过后才允许编写 M5 实施规格。如果真实主题暴露了 Story、旁白、时间或
Composition 注册问题，必须回到 M1–M4 修正，不得用 Scene 代码遮盖。

### M5：视觉阶段规格

**目标：** 在不实现新 Scene 的情况下，把已保留的视觉接入边界细化为可审阅合同。

**范围：**

- `SceneVisualPlan`、`ShotPlan`、`SelectedResourceRef`、`ScenePackage`；
- SceneRenderer props、composition-local RendererRegistry 与 scaffold 边界；
- ResourceCatalog descriptor/query 合同、VisualCoverageMap 和 fallback 状态；
- hard cut 与不改变总时长的 visual-only overlay；
- Scene/Story 分层 fingerprint、SceneVisualCheck 与 final-level 检查项。

**明确不做：** 通用 Scene DSL、自动布局器、自动导演、双 Scene overlap handles、新共享
能力提取。

**完成门槛：**

- 规格明确数据声明、静态源码和 runtime 的边界；
- 每个 ScenePackage 恢复为一个 Scene 级 rendererId，ShotPlan 不保存 renderer 或模块路径；
- CaptionLayer 与旁白仍由 NarrativeCore 独占；
- 用户审阅并批准视觉阶段规格后，才开始 M6。

### M6：资源目录与 Scene Runtime 基础

**目标：** 建立可查询、可校验、静态绑定的 Scene 制作基础，但不在这一里程碑追求
完整作品的视觉质量。

**范围：**

- ResourceCatalog 生成、漂移检查、按 kind/tags/text 查询和资产路径校验；
- Scene 数据合同、renderer scaffold、静态 RendererRegistry 和未知 ID fail-closed；
- Scene/shot local frame 计算、StoryVisualTrack 装配、hard cut 与等时长 overlay；
- `project:check --level final` 所需的视觉合同和 registry 机械检查。

**完成门槛：**

- Catalog 只是权威源的读取视图，runtime 不通过 Catalog 动态加载组件；
- Scene renderer 只输出视觉，局部 Shot 组件不成为 registry 入口；
- 视觉轨只读消费 StoryBeat 和 SemanticTiming，不修改旁白、字幕或总时长；
- Narrative Baseline 在 Catalog 或 ScenePackage 缺失时仍可独立通过。

### M7：第一个完整 StoryVisualTrack 证明

**目标：** 为 M2–M4 的同一真实 Story 完成所有 Scene，证明视觉轨可被独立制作、替换和
审核。

**范围：**

- 按 StoryBeat 和实测 timing 创作 SceneVisualPlan/ShotPlan；
- 查询已注册共享能力和本地资产，新组件默认保留 composition-local；
- 逐 Scene Renderer 制作、资源准入、VisualCoverageMap 和 fallback；
- contact sheet、必要时 motion strip、SceneVisualCheck 和连续性检查；
- StoryVisualTrack 与 NarrativeCore 的实时叠加预览。

**明确不做：** 参考或复制旧生产 Scene/旧 Composition，自动提取共享能力，Sound/Global
完整装配。

**完成门槛：**

- 每个 StoryBeat 都有已校验 ScenePackage 或显式 fallback；
- SceneVisualCheck 覆盖语义、构图、运动、可读性和相邻 Scene 连续性；
- 修改 Scene 只使对应视觉证据和下游 Preview 失效，NarrativeCore 保持有效；
- 没有将 Shot 与 TTSChunk 或 CaptionCue 错误绑定。

### M8：Sound、Global 与最终装配

**目标：** 在不改写 NarrativeCore 或 StoryVisualTrack 的前提下，完成可选声音和全局视觉增强。

**范围：**

- SoundDesignPlan/Track：BGM、ambience、SFX、旁白 ducking 和指纹；
- GlobalVisualPlan/Layers：全局纹理、装饰和统一视觉效果；
- CompositionAssembly 的三个可选显式插槽、固定图层顺序和 assembly fingerprint；
- EnhancementCheck、Final Preview 与 FinalPreviewApproval receipt。

**完成门槛：**

- 每个增强轨可独立缺失、替换和失效；
- SoundDesignTrack 不拥有旁白，GlobalVisualLayers 不渲染字幕；
- 最终用户批准绑定完整 assembly fingerprint，任一装配输入变化使旧批准失效；
- `project:check --level final` 只检查实际选择的增强轨。

### M9：第二个不同主题与泛化检验

**目标：** 用第二个语义和视觉结构明显不同的真实主题重跑全链，证明系统不是只服务
第一个样例。

**范围：**

- 第二 Story 的旁白、Baseline、Scene、增强轨、检查和预览；
- 对比两个 Story 中真正稳定的合同、runtime 和制作能力；
- 为可证明复用的能力准备带 fingerprint、API、文件范围和目标位置的 promotion proposal；
- 工作流稳定后再固化 Agent skills。

**完成门槛：**

- 第二主题不修改主线合同也能完成，否则先修正主线再讨论 promotion；
- 新共享能力只在用户对具体 proposal 明确批准后迁入 `src/remotion/capabilities/`；
- 不因“看起来可复用”而抽取一个未被两个主题证明的抽象。

### M10：发布收口

**目标：** 在已验证生产主链之上补齐发布产物，不把发布逻辑混入 Story 或 Scene runtime。

**范围：**

- 封面、编码参数、音量和发布物完整性检查；
- render/release evidence 与 assembly fingerprint 绑定；
- 发布说明、失败恢复和可重复的交付命令。

**完成门槛：**

- 发布命令只消费已批准 assembly，不调用 Agent、skill 或网络生成服务；
- 成片、封面、编码和音量证据可追溯到同一 assembly fingerprint；
- README、生产流程和交付文档与实际命令一致。

## 6. 独立后续 Epic

以下内容不阻塞 M0–M10，必须单独设计和批准：

- 双 Scene overlap transition 的 input/output handles 模型；
- 更高阶的 ResourceCatalog 代表帧、motion strip、画幅和 render cost 元数据；
- 网络发布集成、账号、密钥或权限管理；
- 任何通用 Scene DSL、自动布局器或自动导演方向。

## 7. 当前唯一下一步

M1、M2 已实现并通过验收。当前只编写并审阅 **M3：Narrative Baseline Runtime 与 Story
注册** 的实施计划；没有单独获批计划前，不开始 NarrativeCore、CaptionLayer、
ProjectRegistry、Composition 或任何 Scene/BaseCanvas 实现。
