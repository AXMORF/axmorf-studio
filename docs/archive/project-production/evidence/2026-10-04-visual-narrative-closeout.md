# 视觉叙事源码与文档收口（2026-10-04）

本文记录未发布的 `axmorf/visual-narrative-quality` 分支，基线为 `c3431f6`，工程实现检查点为 `537c4a6`。
公开 npm runtime/creator 0.1.16 已发布；本轮提交和 feature 分支推送不构成新的 npm release。
当前能力以 [ITERATION_STATUS.md](../ITERATION_STATUS.md) 为准，历史失败记录保留原状态。

## 实现与证据边界

- 既有意图驱动 motionPlan、自由 SVG/Canvas/3D、计划消费检查、素材复用、隔离 revision 继续使用。
  新增纯视觉 Story/authored frames、bound Scene preview、公共 action timing helper 和可选共享 SVG 绘制状态。
  其中纯视觉、bound 预览和共享 SVG 已在正式站点/品牌样片中实际消费；helper 的 frame/seek 行为有 runtime 回归，
  不将它的存在写成每份样片均已使用。Attention/站点比较的具体范围见前序 evidence。
- 共享 SVG 的 DOM/扰动/字号检查证明受支持范围的实际消费，不证明完整浏览器 paint、遮挡或因果表达质量。
  单 Scene preview 不含相邻场景、GlobalVisual、Project BGM，也不改变完成或 artifact authority。
- 最新 boundary playback 与既有音乐 gain/fade 修订有 strict 输入、fixed projection、runtime 和回归覆盖，
  尚未经过新的整片 candidate/promotion/听审。不能把它写成已交付的缩短片尾或已验证混音。
- 早期 Attention/narrated 站点各有 raw create input 与旁白 bytes 一致的旧新配对；后续站点修订是另一个阶段。
  三份修订/品牌样片分别验证全部 1343、1500、1050 帧解码 RGB/PCM 重复性；抽样查看未替代完整观看/听审。
  用户对景别、颜色与节奏的批评仍是未解决的感知证据，不能报告审美等同示例库。
- 尚未执行两种新的中文 AI 概念泛化实验。下一验收应冻结相同脚本、voice/media/render、模型与创作预算，
  保留首次结果，限制自主修订次数并单独记录人工指导；连续观看、听审与技术重复性分别记录。
  两主题只证明初步泛化，多次独立生成后才评估稳定性。

## 工程检查点

`537c4a6` 使用本机 Node 24.15.0，source discovery 的218个测试文件全部且仅一次覆盖。
216个文件以 `--test-concurrency=4` 运行1162项，两个既有300ms/2s启动时序文件以
`--test-concurrency=1` 运行27项，总计1189 pass、0 fail/cancelled/skipped。
这是完整 check 的等价阶段覆盖，不能描述为字面 `npm run check` Green。
package build、bootstrap、typecheck、lint、文档链接、模板音频、Catalog、Registry、config build、
Remotion bundle 和 check:host 全部退出0，检查前后源码 hash 相同。
原默认调度失败和后续完整重跑分别保留；没有修改 runner、timeout 或 validator 来获得成功。

文档收口后独立重跑相同218文件覆盖：1162+27，共1189 pass，0 fail/cancelled/skipped。
两包 typecheck/build 及完整 check 的全部后续阶段均退出0；检查前后 source hash 一致，未改测试实现、时限或 runner。
它仍是完整 check 的等价调度，而不是字面 `npm run check`。补记结果后的文档与生成指南另跑 focused/scaffold/链接检查。
私有命令日志、worktree、Workspace 和媒体收据留在 Git 之外。

最新本地 pack 的 runtime/creator 分别包含288/41文件，发行边界检查退出0。包内 README、creator template
README/AGENTS/authoring guide 与源码 bytes 一致，无私有 Workspace roots。pack 收据的首次外部 reader
误将 Vite prepack 日志当 JSON；npm pack 本身退出0，保留原日志后正确提取收据并复验现有 tarball，没有改源码门禁。

随后仅从这两个 tarball 在独立空目录安装，creator 完成 install/bootstrap/browser/doctor，复跑 doctor、
compositions、create context 和公开 schema/API 检查均退出0。八个 revision patch 字段、`SceneContinuityVisual`、
`resolveSceneActionTiming` 可从安装包公开 surface 读取，生成指南 bytes 与源码一致。
该空 Workspace 没有创建 Project 或调用 provider，不构成最新 boundary/music 的正式整片验证。
补记后 focused 文档/Skill/scaffold 20/20、链接和格式检查通过；完整历史调度失败保持原结果。

## 文档与音乐工作区

README、权威文档、操作指南、contracts、repository Skill 和 creator 生成指南按实际源码对齐。
明确区分公开0.1.16与未发布分支、narrated/visual、机械验证与感知审阅、当前事实与历史 checkpoint。
不会将35秒特定主题的颜色、粒子和景别编排变成通用固定模板。

用户本地音乐库的循环原音/试听退役维护已完成交接。公共指南只保留通用规则：按当前许可/Catalog选原音，
退役前检查 resource/path/checksum 和 sealed 依赖，有依赖保留兼容，无依赖且获授权时使用可恢复方式。
本地音乐和 Library附件不属于 npm seed，私人 IDs、媒体、操作报告及上传地址不进入源码。
既有作品没有新增失败；工作区已有的 Catalog drift 并未因此被宣称修复。
