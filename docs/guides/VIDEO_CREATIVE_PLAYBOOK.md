# 视频创作手册入口

通用创作方法的唯一维护位置是视频 Skill 的 [创作手册](../../.agents/skills/axmorf-video/references/creative-playbook.md)。它将用户提供的 Claude Opus 5.5 资料整理为完整构图、叙事变化、落点、代码配乐、口播衔接和真实媒体验证方法。

- [原创图片与 SVG](../../.agents/skills/axmorf-video/references/generated-artwork.md)：在新片首次 inspect 前准备并准入实际素材，支持主体、环境与遮挡分层。
- [分段配乐](../../.agents/skills/axmorf-video/references/score-arrangement.md)：按题材选择调性、和声、乐器、密度、力度与 swing。
- [纸拼贴 / Vox 案例](../../.agents/skills/axmorf-video/references/paper-collage.md)：材质、折面、分层、动作和原始对比图。
- [设计与代码示例](../../.agents/skills/axmorf-video/examples/README.md)：口播/无口播 brief 与可运行的横竖屏落点小样。
- [来源记录](../../.agents/skills/axmorf-video/examples/opus-playbook/README.md)：原始全文与图片，保留来源但不把历史命令当生产合同。

源仓库与 `create-axmorf-studio` template 同步携带这些内容。源码 Skill 与 Workspace Skill 在新片、正文重做时都引导 Root 阅读；工作者仍按绑定的当前 brief 和合同执行。模板进入已发布 npm 包后，新建 Workspace 才会通过该发布版本获得资料；修改源仓库本身不等于已经发布。

本文只做导航。正式生产所有权、不可变时序、资源准入、revision 和四文件交付以当前 Skill、公共合同和可执行流程为准。

本次整理与小样检查见 [验证记录](../evidence/2026-10-12-video-playbook-verification.json)。
