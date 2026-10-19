# 参考视频学习的 Skill 沉淀（2026-10-11）

用户要求高频抽帧学习同主题参考视频，并询问这些经验是否会影响未来制作。Root 将观察转成共享制作指南，
仓库入口、creator 模板入口和当前测试 Workspace 均引导新片/正文重设计落实构图与声画节奏。

## 观察来源

参考视频为 1280×720、30 fps、40.81 秒，共 1223 帧；SHA-256
`ab39375e360afec7240637cfac21209f7ea01592a7a1b34b2c781879d66805cc`。
全片以 10 fps 检查 408 张图，三个动作窗口以 30 fps 检查 102 张连续帧；合计观察 476 个不同帧，另检查原尺寸代表帧。
详细抽帧、比较、测量和报告保存在 `/workspace/axmorf-cloud-test/homepage-v3/reference-study-claude/`。
音频工具返回不支持输入，主观听审保持 not-assessed；混合音轨的频谱瞬态未被归因为独立 BGM/SFX。

## 已写入的制作方法

- 编排动作前先设计完整构图；通过主体尺度、色块面积、视觉重心与信息布局组织内容。
- 按冻结主题使用填充、明暗和对比；选定材质必须出现在实际像素中，统一风格允许构图变化。
- 明确启动、到达、适度回弹和停稳，按语义递进信息，保留阅读状态与动静对比。
- 用共同可见事件规划音乐拍点与音效，说明对齐的是启动、到达、最大遮挡或文字强调；核对音效源偏移。
- 检查转场覆盖、交接和露出时机；配乐增益、音效强弱与阅读停留共同规划，测量与听审分别记录。

这些方法写入 [film direction](../../.agents/skills/axmorf-video/references/film-direction.md#composition-and-audiovisual-rhythm)，
Root 在创建前落实到现有 filmPlan/artDirection/brief；Scene execution 同样引用该段，以当前冻结 brief 落地。
不增加 JSON 字段、权限、审批、场景配额或审美 validator。主题、屏幕、BPM、材质与特效按当前任务选择。
用户选择的横竖屏、继承首尾、口播实测时间和代码合成配乐继续作为权威；有口播时在语义窗口内安排音乐与动作。
Bound workers 只读当前 context 与准入资源，参考观察由 Root 转成当前 brief。

## 实际携带验证

三项现有 Skill 回归、文档链接检查和 creator package readiness 通过。
初次 Skill 检查暴露入口新增链接使正常制作上下文超过字符预算；精简入口后通过，预算未修改。
Root 规划上下文为 1890 words / 17701 characters，正常制作上下文为 1620 words / 17989 characters，
均在既定 1900 words / 18000 characters 内。

从本地源码实际打包 `create-axmorf-studio@0.1.21`，通过 tarball 内的公开 bin 执行
`future-workspace --yes --no-install`，退出 0，返回 `workspace-generated`。
仓库、creator 模板、当前测试 Workspace、解包模板和新 Workspace 的 film-direction 五份逐字一致；
后四处 Workspace SKILL.md 逐字一致，仓库入口为独立的短版路由。
验证命令、checksum 和生成结果见[验证记录](2026-10-11-reference-video-learning-verification.json)。
第一次打包因默认 `/home/agent/.npm/_cacache` 无法创建而退出 254；显式使用可写的独立缓存后正常打包退出 0。

本轮仅验证 Skill 读取路径、文档约束和真实模板复制；新 Workspace 未安装依赖、未 doctor、未调用 provider 或渲染新视频。
当前源码和测试 Workspace 已生效，GitHub/npm 尚未发布这次补充。其他环境需获得更新的 Skill；已存在的旧 Workspace
不会因安装 runtime 包自动覆盖自己的 Skill。跨会话依赖项目文件的读取，模型本身不因本次参考学习发生训练更新。
