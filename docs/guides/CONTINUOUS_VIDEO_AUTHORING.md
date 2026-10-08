# 连续视频创作

本指南对应仓库当前源码的未发布升级；公开 npm 0.1.17 的能力仍以已安装 contracts/生成指南为准。
保留一 Story 一个 Composition 和逐 Beat 的语义时间轴，同时用显式视觉分组决定 Renderer 所有权。

## 先设计整片，再决定视觉边界

新片与整片改造先读项目 Skill 的[创作指南](../../.agents/skills/axmorf-video/references/film-direction.md)：
从观众需要看懂的因果变化确定主体、空间、相机动机与节奏，再写各 Beat。技术 proof 和元素/镜头数量不能代替创作验证。
同一指南随 creator 生成到 Workspace，并从 Root 和 Scene 实作入口路由；局部修订仍只实现 priorSource 的目标 delta。

Root 在 `project:create:context` 的完整输入中填写 `story.filmPlan`：

```json
{
  "concept": "把复杂的路线收束成今天可以走的一步",
  "subject": "同一位行动者与同一条路径",
  "cameraIntent": "俯看路线，靠近行动者，再跟随第一步",
  "rhythmIntent": "拥挤和停顿，选择后推进，结果停留",
  "soundIntent": "路线收束和脚步落点卡音，旁白清晰"
}
```

这些是创作意图，不能声明代码已经实现或主观质量已经通过。正文 `beats` 仍逐个描述意义、旁白或作者帧时长，
`scenes` 的完整 brief 列表仍逐 Beat。若主体、空间和因果动作连续，将这些 Beat 合成一个 `visualScenes`：

```json
{
  "visualScenes": [{ "meaningIds": ["stuck-goal", "next-step"] }]
}
```

分组必须按 Story 顺序完整覆盖正文，不能重排、漏掉、重复或混入 fixed 首尾。第一 Beat 是路径/task owner；
上例只有 `scenes/stuck-goal/Renderer.tsx`，但 Coverage、字幕与章节仍有两个 meaningId。Renderer 在整个窗口
只挂载一次，`sceneFrame` 不在第二 Beat 开始时归零。一个 Renderer 可包含声明范围内的多个模块，整片创作不要求单文件。

短片优先考虑一个连续正文 Scene；换空间、叙事章节或素材技术时可拆成几个视觉单元。不要按旁白句数机械切镜。
省略 visualScenes 保持旧的每 Beat 一个 Scene。已有 Project 通过完整 `patch.story` 显式重组，不能原地改 live。
共享 Scene 任一 Beat 的局部 brief 变化会重做整个 owning source graph；组外有效 artifacts 继续复用。

## 两种时间来源

旁白 Story 缺省 `timingSource` 是 sealed-narration：原子 `ttsChunks` 的实测 PCM samples 定义绝对时间。作者保留这些
不可变语义定位，允许画面动作跨 chunk/Beat 延续。只读 `coveredBeats` 和 Scene-local `narrationCues` 定位变化，
不要重估语速、裁掉口播帧或在 Scene 内渲染字幕。

已发布的 `visual-scene` 以 `durationInFrames` 定义正文时间，narration/sealed/mastered 保持 JSON null，零 provider。
它支持同样的 filmPlan/visualScenes 连续创作，沿用 `authored-frames-v1`，不自动转换已有作品。

另一种纯动效路径显式指定 `story.timingSource: "authored-frames"`，正文使用 `silent-scene`、`scene-owner` preset。
以公开 `buildSilentScenePreset` 构造包含 fingerprint 的输入；`preset.durationInFrames` 是正文 Beat 的帧数。
所有正文都是这种 Beat，不能混入 narrated-scene。配置首尾 template-copy 可保留或按用户要求禁用，仍不参与正文分组。
该分支没有 provider call、seal、mastered WAV 或字幕；`sampleRate`/`narrationStartFrame` 是 null。
publishing.chapters 可为空；需要章节时仍逐正文 Beat 完整按序声明，固定首尾不进入章节。旁白分支继续要求完整章节。
GlobalVisual decoration 只使用正文范围。新建 Project 的自动/选定 BGM 使用完整 Composition；
显式 `content-window` 音轨仍排除 fixed 首尾，旧 `content`/`narrated-content` 范围保留。
`backgroundMusic:null` 禁用配乐，音效与旁白独立。交付保留 H.264/AAC，纯静音内容输出静音音轨。

Story `resources.allowedResourceIds` 是准入池；silent preset 的 `resourceIds` 则要求实际精确消费，不能把候选池
全部冻结进去。先去重排序，再通过公开 builder 生成；对应 brief 的 candidateResourceIds 必须与 preset 一致。
按本片实际动作选择能力与音效，避免为满足过宽列表而强塞无关效果。输入生成/校验失败时不继续调用 create。

新建 authored-frames Project 使用 readability policyVersion 2、`captionBand: "none"`，Scene 四边只保留
safe-area inset，不再为空字幕留出底部区域。旁白模式继续使用 policyVersion 1 的字幕布局；既有 Project
及其 revision 保留已冻结 policy，不静默改变几何或 fingerprint。所有 Scene 仍只使用派生 viewport，不能越过安全区。
新 credits 模板也按实际 viewport 分配正文/引用空间，长引用显式省略为标题与来源域名；完整值保存在 Story。
新实例不替换既有 immutable template。几何预算与分页停留的具体边界见
[能力目录](CAPABILITY_CATALOG.md#当前已迁入能力)，不能把文字未裁切当成阅读停留充分。

跨 owner 的连续交接按实现所有权判断：narrated/visual Scene 和 silent scene-owner 都可以使用 Root 冻结的
`outgoingHandoff`，不依赖是否有旁白。fixed template-copy 保持切换边界，最后一个正文 owner 不能承诺后续交接。
多 Beat 分组只取组尾 handoff 建立外部接缝；组内 brief 仍完整保留，不另挂载 Renderer。

## 共享世界与语义事件

公共 `@axmorf/studio/remotion` 提供以下纯函数；Catalog 的 `capability.motion` 指南给出参数：

| 用途                         | API                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| 无限二维世界、相机与坐标换算 | `resolveProducerWorldCamera2D`, `projectProducerWorldPoint2D`, `unprojectProducerWorldPoint2D` |
| 无历史状态的落定与跟随       | `resolveProducerSettle`, `resolveProducerFollow2D`                                             |
| 索引对应的点形变与收束       | `resolveProducerPointMorph2D`, `resolveProducerGather2D`                                       |
| 语义时间与事件重定时         | `mapProducerSemanticFrame`, `retimeProducerSemanticEvents`                                     |

用同一组有意义的 event IDs 安排视觉变化、sync anchors 与 `SoundContribution`。角色声音从已批准素材中选择，
Renderer 不播放音频；同一个多 Beat Scene 的音效只展开一次。保持整片声场与音量意图一致，机械检查不代替听审。

例如，两个语言版本的同一动作使用严格递增的 sourceFrame/targetFrame 语义锚点：

```ts
import {
  mapProducerSemanticFrame,
  retimeProducerSemanticEvents,
} from "@axmorf/studio/remotion";
const anchors = [
  { id: "open", sourceFrame: 0, targetFrame: 0 },
  { id: "choose", sourceFrame: 40, targetFrame: 65 },
  { id: "result", sourceFrame: 100, targetFrame: 120 },
];
const authoredFrame = mapProducerSemanticFrame(
  anchors,
  sceneFrame,
  "target-to-source",
);
const events = retimeProducerSemanticEvents(anchors, [
  { id: "step", frame: 60, resourceId: "approved-step" },
]);
```

视觉在 source 时间求值，声音事件移到 target 时间；最终整数 sync/sound frame 才按明确规则取整。
映射不外推、不改 sealed PCM/字幕。当前旁白提供 chunk 级 cues；此工具不会自动翻译、识别单词时间或生成其他语言版本。
相机、跟随和形变支持分数帧及任意 seek，不能使用上一次渲染的可变状态。运动模糊应控制范围，避免影响可读文字。

## 正式渲染前看冻结草稿

全部必要 fixed/owner artifacts 有效后，Root 可先等待 worker 原生终态，在唯一 continuation 前运行：

```bash
npm run project:preview -- --project <storyId>
npm run project:preview -- --project <storyId> --candidate <exactCandidateId>
```

命令只读当前 authoring、资源与 artifacts，在 `out/<storyId>/preview/<previewBuildId>/` 的私有冻结 view 物化和渲染。
候选输出位于其隔离 scope 的 out。它不调用 provider、不创建 attempt、不改 live Project/current Delivery、不 promotion。
profile 保留原布局尺寸、fps、帧数和声音，用 Remotion scale 降低像素，最大缩放 0.5、最长边 960，CRF 28。
只支持存在严格等比且偶数尺寸的缩小规格。receipt 绑定 source/public/runtime/artifacts/profile，并复验 H.264/AAC/checksum/EOF。

先看完整动作、Beat 内部边界、结果停留和听感。receipt 的 motion/continuity/listening 都是 `not-assessed`，
输出文件存在不等于完成审片。草稿不是 current，也不能代替四文件交付；正式终点仍是唯一 continuation 的
`project-production-complete/current`。需要审阅时不能先启动 continuation 后暂停它；总期限仍从 attempt 创建起算。
已提交的 artifact 不可覆盖，现有作品内容修改继续使用 exact-base revision；此入口不会开放任意草稿源码写入。

将观察另记到诊断记录，绑定所看媒体 checksum 和 previewBuildId/DeliveryBuildId，并注明完整播放、帧采样或
技术音频测量的范围。实际看过的主体延续、因果动作、阅读停留和相机路径可以记录为观察；没有主观听审时
保留该未验证项。需要返工时完成当前交付后创建 exact-base candidate，不覆盖已提交任务。

当前未发布源码的 `project:scene:review --motion` 对带完整非空章节的 authored-frames 作品仍有 narrated-only
比较误判；这是已诊断、未修复的审阅工具缺陷。合法章节不应删除来绕过它，正式交付与实际观察分别报告。
具体匹配事实和创作 Skill 的经验沉淀见[创作经验记录](../evidence/2026-10-08-creative-video-skill.md)。

正式和草稿使用同一音频输出主链：Remotion 生成无音轨 H.264 与 lossless PCM WAV，再由 Workspace-local
FFmpeg 一次编码 AAC 并封装 MP4，保留编码器的 priming/skip 元数据。mono/stereo 在该次编码中选择，
H.264 只 stream copy；不调整 authored frame、PCM、字幕或 Scene 时间，也不使用固定毫秒数移位。
渲染统一禁用 parallel encoding，保留帧采样 concurrency，以完整帧序列编码保证极短片的精确帧时间基。
编码阶段不再与帧采样重叠；渲染和封装在独立 staging 完成后才替换输出，失败保留原文件。

## 参考素材与真实内容

对显式放在本地 `public/` 的参考视频，可运行 `reference:analyze -- --input public/<reference.mp4>`。
新诊断流程保留输入 checksum、规格、工具能力、参数和解码图像哈希：先做有界粗采样，再对最强候选区间
细化，报告实际测试过的 nominal frame bracket 与分辨率；它不把 requested seek position 当成已测得的源 PTS，
也不保证检出同一区间内的全部快速切换。

图像平移/中心缩放估计给出匹配残差、重叠、纹理和歧义证据；纹理不足、重复图案或模型不匹配时拒估。
这描述图像变化，可能来自主体运动、视差或相机，不能自动命名为镜头语言。彩色预览保留比例并标明请求时间、
nominal frame 和 checksum，配套 JSON、Markdown 和本地静态页面供 Agent 查看。Agent 的相机/语义解释须指向
对应帧并注明推断，机器报告的 semantic/quality 保持未评估。

分析使用 pinned Workspace-local FFmpeg、总处理期限、目录 staging 与 exact-file/checksum 复验；输出只在
独立诊断目录，不进入 production identity 或素材目录。检测 threshold 是算法参数，分析不下载素材，也不授予入片许可。

展示产品 UI 时用当前、可复核的本地内容重建关键操作状态；数据图表明确单位、来源和数值，动画不能改变结论。
不要用伪 UI 和随机数字填充“技术感”。若复用第三方 source/media，分别验证 license/attribution 并按现有准入流程本地化。

本升级吸收 [OneTake](https://github.com/feitangyuan/onetake) 的整片概念、连续主体/相机、统一事件和先预览再审片方法，
实现仍是原创 Remotion 代码。参照仓库的许可证不因此改为本项目许可证，不能把方法借鉴当作复制其实现的授权。

工程示例与检查分别为 `npm run proof:continuous-world:render` 和 `npm run proof:authored-frames:render`。
输出在独立 `out/*-proof/`，用于验证当前源码的连续时钟/相机与跨 Beat 音效，没有替代真实用户作品的 production 或听审。
