# Film direction

Root reads this for new films, substantial creative revisions and media review. Bound Scene executors use
[Scene execution](#scene-execution) after binding. A local correction preserves priorSource and applies only its delta.
This guide supplies creative decisions, not new JSON fields, file access or a visual approval gate.

## Plan the film

Choose the audience takeaway and observable change. Match complexity to the brief; a pipeline proof is not a creative film.
Choose generated imagery, original SVG, actual UI or supported 3D for the subject. Prepare missing assets through
[generated artwork](generated-artwork.md); software availability alone does not make a visual asset available to Scenes.
Root 新片/正文重做读 [创作手册](creative-playbook.md)；按需读 [案例与示例](../examples/README.md)。

Write concept, subject, cameraIntent, rhythmIntent and soundIntent in story.filmPlan. In each Beat's scenes[] brief, describe
the visible cause, action and consequence, focal subject, framing and result hold. Make each consequence motivate the next
Beat. A list of headings, decorative motion or camera drift alone does not explain a process.

Choose visualScenes by subject/space/action continuity: one owner may cover many semantic Beats; another space may justify
a cut. Preserve per-Beat meaning/timing and freeze cross-owner handoffs through supported contracts; fixed bookends stay
separate. Briefs must suffice without the Root conversation. No Scene count, camera or transition-sound quota applies;
long Scenes, quiet cuts and fades are valid. Do not split a world merely to allocate workers.

Before coding, apply [Visual craft](#visual-craft), [audiovisual rhythm](#composition-and-audiovisual-rhythm) and the
[visual quality bar](visual-quality-bar.md) in existing artDirection and Scene briefs. Verify sources; keep only real
facts. An early hook is useful when the inherited opening permits it.

Budget the requested total including inherited bookends and lead/tail. For authored-frames, allocate only the remaining
body frames; narration estimates still need PCM measurement. Bookend soundCues are independent of body BGM. A request
for no music or audio needs their inspection too. Resolve conflicting requirements before create using existing user
instructions, asking only if a material conflict remains; do not silently disable inherited boundaries.

按 create-context 的 capabilityIndex/useCases/recipes，把主体、动作、空间、数据、材质对应到 API；
先定表现手法，再选技术，不把第一个示例或 editorial-tech 当通用风格。实拍/插画/3D/文字/图表按内容选择。
新片 resources.capabilityAccess 默认 all-approved：创建时冻结已批准内置能力为可选项，正文 executor 自动收到指南。
explicit 仅用于刻意限制。素材仍需 Story pool 与 Scene candidate 显式准入；silent preset.resourceIds 必须全部消费，
不得填满可选能力。旧片/revision 保留冻结范围。Scene 按 availableResources 选择并声明实际调用，不用 demoOnlyExports
的固定样例充当作品内容，不设使用数量要求。自绘按实际创作需要决定，不写形式化拒用清单。能力选择在编码前完成。

## Visual craft

Root 在写 create input 前定整片设计；新建/大幅改造的 Scene executor 绑定后按 brief 落地，局部修订保留 priorSource。
这些是设计判断，不增加 JSON 字段、资源权限或审美 validator；示例数值不是硬性门槛。

- **设计方案**：明确配色角色（底色、正文、辅助、强调）、已安装字体的搭配、材质配方、动作与镜头语言，以及应避免的效果。
  先 `fc-list : family` 核对字体；theme 锚定文字/品牌与兜底底色，新 full-frame 正文可自定环境色彩。选协调材质贯穿全片；纸张可用纤维边、轻颗粒、胶带、柔和投影，
  霓虹可用受控光晕与光轨。按主题选择，不强制纸拼贴、纯 SVG 或拒绝已批准的图片/3D。
- **主角与构图**：每个叙事时刻有一个明确焦点，标题、插图、标签围绕它分主次；连续长 Scene 可交接焦点，不必切镜。
  用一个符合内容的空间隐喻展示动作和结果，避免把介绍做成轮流出现的文本卡片。画面空时先调整主角尺度、留白和层次，再考虑有意义的物件。
  保留安静区；对比色帮助主体从背景分离，不能让同色物件消失。强调色用于关键落点，不把所有元素同时高亮。
- **景深与材质**：按需要组合后景形状、主体、前景遮挡和注释；用一致的边缘、投影、透明度表达前后关系。
  重叠要能看懂谁在上方。纹理提供触感，不把颜色染脏；相机/滤镜极值也不能掩盖内容。稳定阅读层留在世界相机之外；
  新 full-frame Scene 可用子层铺满环境、图片与前景，root 保持透明；SceneTextSafeArea 单独保护文字，字幕仍归 Composition。
  旧 safe-area-local Scene/固定首尾保留原边界。先设计完整画面再编码：主角尺度、接触面、光源方向、遮挡与安静区应具体，轻微漂移不能代替空间关系。
- **文字工艺**：建立主标题、正文、标签的字号层级，以实际 sceneViewport/minFontSizePx 和最终缩小画面判断可读性，
  不照抄 1920×1080 的像素表。自然断句；短标签可 nowrap，长句按测量宽度换行。核对字体真实字重与 CJK 字形，
  不依赖合成粗体、描边或粗略字符宽度来补救拥挤。品牌逐字拼贴时让点号/标点保持清晰，网址必须准确。
- **动作与停留**：共同计划预备、到达、轻微回弹、稳定阅读；视觉触地帧对齐音效落点，而不是在落点才开始入场。
  标题约两秒、逐项保留到读完可作初始估算，最终服从内容、实测口播与既定时序。密集动作后给呼吸空间；不让每层持续抖动。
  小幅镜头冲击只服务重要动作；纸张定格抖动须按帧确定、主要阅读文字保持稳定，不要求每次动作发声或相机震动。
- **转场与成本**：连续动作可用落点或焦点变化；确需遮挡换镜时核对遮挡覆盖与新主体露出时机，不能遮住应读文字或吞口播。
  安静淡出同样有效。检查过滤/变换父层中的 blend-mode 实际效果；复用纹理，避免无意义的逐元素 turbulence 和全屏颗粒拖慢渲染。

审片时先看主角能否立即辨认、文字是否清楚、颜色/材质/图标是否一致，再看动作与音效。
检查完整展开、运动中段、相机极值与转场内部画面，特别找标签遮挡、缩放越界、低对比、换行、纹理过脏、闪光过强和装饰遮正文。
发现问题先修拥有者的可变草稿再检查；已提交 artifact 用 revision，不覆盖。精致来自这些具体取舍，不来自增加特效数量。

## Composition and audiovisual rhythm

新片与正文重设计把以下判断落实到 filmPlan、artDirection、Scene brief 和可见成片；局部修订保持拥有者范围。
这些是跨风格制作方法，不固化参考片的配色、横竖屏、BPM、场景数或特效，不增加字段、权限或用户审批。

- **完整构图**：先设计代表段落的完整展开画面，再编排动作。通过材质、字体和动作语言保持统一；
  按内容改变主角尺度、重心、色块比例和信息布局。静镜头、有设计的卡片、列表与图解都可承载内容，
  连续世界可以交接焦点和形态。用可辨认的主体、留白与层级组织画面。
- **颜色与材质**：theme 的文字/品牌色与场景美术分别设计，用填充、明暗、对比和面积分出前后层次。
  纸边、纹理、胶带、投影等选定特征须在实际像素中可见；小幅相机漂移不能替代材质和排版。
  图片/场景上的字用局部安静区、衬底或遮光层保证对比；不要假定文字对兜底底色可读就对图片可读。旧 Scene 保持其冻结合同。
- **动作层次**：把主要变化拆成启动、到达、适度回弹和停稳；按语义递进信息，完成后保留阅读状态。
  对比密集动作与安静停留，保持阅读层稳定。动作数量与同步锚点数量不证明节奏感。
- **共同事件**：在现有 brief、shot-plan、sync-anchors、sound-plan 中描述同一可见事件，明确音乐卡点绑定
  启动、到达、最大遮挡或文字强调中的哪一个；音效起音、source offset 与其接触/确认点或运动 swell 配合。
  拍点可以组织启动与分拍回弹，不要求所有动画在强拍开始并立即停稳。旁白窗口与局部 musicTiming 仍是 authority。
- **转场与混音**：复用完成度高的转场语言，检查旧内容覆盖、画面交接和新主体露出；安静转场同样有效。
  合成音乐维持脉冲与能量，独立音效突出有意义事件；配乐增益、音效强弱和阅读停留共同规划。
  最终 AAC 响度/峰值与实际听审各有用途，固定 volume 或合格峰值不等于混音听感通过。
- **参考学习**：用户指定参考片由 Root 观察并把可迁移方法写入当前 brief；绑定 checksum、抽帧频率和观察窗口。
  从混合音轨测得的瞬态不直接命名为某种 SFX，无法听音时保留 listening not-assessed。
  Bound workers 继续只使用 current context 与允许资源，不读取历史作品或未准入参考媒体。

## Code-synthesized music and shared timing

新片配乐由 Root 按 [原创编曲](score-arrangement.md) 在 create 前本地合成，明确调性/和声、段落、配器、疏密、力度与休止。
合成 WAV 与 timeline 同源；create 冻结 bytes，composition 从帧0连续播放，保留独立音效。旧六字段配方保持兼容，
新片填写 arrangement，不以改变 seed/BPM 代替编曲。显式无音乐仍用 null。

Voice-led: normal prepare generates/seals/masters speech; cumulative PCM samples/SemanticTiming determine duration,
captions and boundaries. The previously synthesized loop cannot dictate speech. Prepared `scene.musicTiming` supplies
immutable Scene-local beatFrames/barFrames on that measured window. Choose landings inside permitted action windows;
semantic turns may stay off-beat. Chunk ranges are not word timestamps. Plan explicit pauses; never insert silence,
move captions, regenerate TTS or change speech speed for a beat.

Music-led: explicit no-narration content may budget authored durations/reveals by beats/bars. Whole bars are optional;
preserve reading holds, quiet joins and continuous owners. Choose visual/SFX cues together: impact at landing, anticipation
earlier, whoosh offset at swell. Use approved SoundContributions; workers neither synthesize music nor mount Audio.
Cues can be silent. Timeline metadata never authorizes new outputs or immutable timing changes.

## Scene execution

Use only bound current context, allowed resources and the shipped exemplar Scenes; never use historical Project Scenes or images as a creative template. Preserve
object identity and causal state across coveredBeats using the uninterrupted sceneFrame. Evaluate motion from frames,
including arbitrary seeks; analytic follow/settle can express inertia without accumulating render history.
Apply [Visual craft](#visual-craft), [audiovisual rhythm](#composition-and-audiovisual-rhythm) and the
[visual quality bar](visual-quality-bar.md) to the frozen brief and actual viewport; preserve the assigned scope.

Separate world geometry, camera transforms and stable reading text. Give each transform one owner; do not accidentally
apply the same rotation or scale in two camera layers. Move the camera to reveal detail, follow an action or expose a
relationship. Use depth/parallax when it clarifies space, and let the camera settle for the result. Choose indexed shape
correspondence, foreground occlusion or matched action when they carry the subject into the next state; a deliberate cut
or fade is also valid. Check position, scale, direction and motion phase at the join instead of resetting at each Beat.

Plan anticipation, change, settle and a readable result within the frozen timing. Contrast motion density with genuine
pauses; do not keep every layer moving. Keep important text in a stable reading layer when world-camera scaling would
compromise it. Declare provable sizes on text-bearing elements and check actual viewport size, scale, contrast and spacing.

Use the same meaningful events for visual actions, sync anchors and sound-plan contributions. When musicTiming is supplied,
its beatFrames/barFrames are Scene-local; do not add the global Scene offset again or reset the score at an internal Beat.
Select a beat only inside the permitted causal window; keep narration ranges authoritative. Align an impact to its
onset or a whoosh to its described swell center, including the required source offset. Use only approved audio; the
SoundDesignTrack owns playback. Music-led editing needs an available, inspected track and its phrasing; cue-led effects
are a different choice. No universal BPM, cue quota or loudness follows from a previous film. Leave space for narration
and quiet; source selection and technical synchronization do not establish a good mix.

## Review the actual media

When creative quality is central, plan frozen project:preview before the unique continuation, after native worker
completion. Budget review within the attempt deadline. Committed artifacts remain immutable; improvements use the
strict exact-base revision flow after current delivery, without rerunning providers to change visual taste.

Watch complete cause/action/result windows and inspect internal Beat joins, owner seams, camera extremes and dense text.
Still samples can show layout and state, but cannot prove smooth velocity or timing. Assess audible accents, masking,
balance and silence by listening when available. Muted playback and decoded-audio measurements are technical evidence.
Inspect built/mid-action frames for glyphs, collisions and contrast. Check Hooks across relevant transitions, not only the
first 30 frames. Measure final AAC loudness/true peak (-14 LUFS, <= -1.5 dBTP reference targets); source WAV and correlation
alone do not prove mix or visual sync. Compare arrival frames with audible onsets; report actual listening capability.
RenderSpec controls dimensions/fps. Optional mobile exports preserve aspect ratio (1280x720 landscape, 720x1280 portrait).
Mobile/audio/source extras stay outside, and never replace, the authoritative four-file Delivery.

Bind observations to the media checksum and previewBuildId or DeliveryBuildId. State sampled frames versus continuous
viewing, audio measurements versus listening, observed defects and unobserved items. Keep unavailable judgments
not-assessed; task counts, review receipts and EOF success do not certify creative quality. A diagnostic tool failure
is reported separately from a verified delivery; do not rewrite chapters, artifacts or checks to conceal it.
