---
name: axmorf-film
description: 用 AXMORF Studio 制作或修改讲解短视频。Agent 直接编写 Remotion 工程，用旁白、配乐、审片和交付命令完成一部片。
---

# AXMORF Film

这是 Claude Code 的发现入口。立即完整读取 `.agents/skills/axmorf-film/SKILL.md` 并按它执行；
它的 references 位于同目录的 `references/` 下。正文只维护在 `.agents/skills/axmorf-film/`，供所有 Agent 共用。

做片先读共享正文的 `references/direction.md`，按其中的节奏谱 → 配乐 → 小节分镜 → 画面 → 音效顺序执行。

新片使用共享 Skill 的 studio-v3 与经校准音量；v2 和既有影片保持兼容。

逐句旁白缓存按 provider/模型/素材内容哈希或 voiceId/生成参数/语速/文本复用，不含 Workspace 路径或连接配置；
新键可跨 Workspace 迁移，旧键不自动转换，旧 timing 与交付不受影响。保留完整 take 的方法读共享正文第 5 步。

L3 必须按 strength 分档；最强重音要有全片最大主体动作和镜头冲击，背景/非阅读主体不因口播全面减幅；阅读文字独立稳定。具体幅度与自检读共享 `references/direction.md`。

最强重音之前必须有至少 6 帧可见预备，不能藏起配方过程；效果由内容语义决定，AxiomMorph 只是可选的通用文字形变，无须解释未使用原因。

强重音冲击按 p99 审片；必须逐张看所有 `motion["strong-accent-strip"]`，在 review-notes 按帧号记录配方过程是否可见，不能用整帧像素运动代替人工确认。

文字不要横跨明暗交界，深色字不要放在深色背景上；逐条回应 `low-contrast-text` 的帧号、网格位置与比值，转场和同组形变不免检，unknown 不算通过。

风格、配色和参考方向从内容出发，写在 storyboard 开头，不默认深色科技风。每个镜头逐项写「图形元素 → 代表」，
说不出代表什么就不画；同时非文字主体最多 3 个，避免无意义交叉/重叠。每个物体在原生元素上标注
`data-axmorf-object`，关系与可辨认背景分别用 relation/background 角色；具体规则、静音描述测试与图形提示读共享正文。

用户或 Workspace 指定风格时读共享正文的对应配方；纸面拼贴 / 手绘线稿见 `references/styles/paper-collage.md`。示例配色不是默认值。

每章至少3种物件节拍反应，相邻小节主动作轮换；光闪和背景缩放仅作补充，文字阅读时固定。用共享节奏API上报物件/kind/frames，回应 beat-response-monotone；未上报为unknown。

回应 narration-static 的讲述段能量与最长静止起止帧；没有可用 animatic 为 unknown，只提示不拦交付。

讲述段持续极小、连续、非匀速桌面手持微移，全程非文字线稿 boil，每拍一个轮换物件反应；“停住阅读”只针对正在阅读的文字，自检连续超过 1 秒整帧不动的地方。

每镜头主信息由画出来的物件、生图剪纸或图解承载；文字卡只放数字、原话与短标签，不能单独撑镜头。标注可选 data-axmorf-object-kind="illustration|diagram|prop|card"（默认 prop），按共享正文解释类型，回应 text-card-only 的连续采样帧段。

纸面风格在本片 film.json 显式写 bookends.theme="light"，storyboard 风格声明写明主题并与正片一致；字段与例子见共享纸面配方，film:new 不改。

纸面关键人物、手与实物必须用宿主实际可用生图工具做单主体剪纸；storyboard 写统一风格及每个主体提示词。抠像后由代码加白边/投影/纸纹，按共享 artwork.md 用 film:asset --origin generated 登记；精确图解/数字/线条/印章印迹/红笔仍用 SVG。工具不可用时停下报告缺失主体，不用代码画人物和实物补数。

storyboard 每镜头写「桌面动作」动词（放下、撕开、翻开、盖章、圈画等），记入画→动作→收手及 anticipate/land 帧；手同样用生图剪纸。只有“卡片出现然后停住”不合格，自检逐镜头给帧号。
