---
name: axmorf-film
description: 用 AXMORF Studio 制作或修改讲解短视频。Agent 直接编写 Remotion 工程，用旁白、配乐、审片和交付命令完成一部片。
---

# AXMORF Film

这是 Claude Code 的发现入口。立即完整读取 `.agents/skills/axmorf-film/SKILL.md` 并按它执行；
它的 references 位于同目录的 `references/` 下。正文只维护在 `.agents/skills/axmorf-film/`，供所有 Agent 共用。

做片先读共享正文的 `references/direction.md`，按其中的节奏谱 → 配乐 → 小节分镜 → 画面 → 音效顺序执行。

新片使用共享 Skill 的 studio-v3 与经校准音量；v2 和既有影片保持兼容。

L3 必须按 strength 分档；最强重音要有全片最大主体动作和镜头冲击，背景/非阅读主体不因口播全面减幅；阅读文字独立稳定。具体幅度与自检读共享 `references/direction.md`。

最强重音之前必须有至少 6 帧可见预备，不能藏起配方过程；效果由内容语义决定，AxiomMorph 只是可选的通用文字形变，无须解释未使用原因。

强重音冲击按 p99 审片；必须逐张看所有 `motion["strong-accent-strip"]`，在 review-notes 按帧号记录配方过程是否可见，不能用整帧像素运动代替人工确认。

文字不要横跨明暗交界，深色字不要放在深色背景上；逐条回应 `low-contrast-text` 的帧号、网格位置与比值，转场和同组形变不免检，unknown 不算通过。
