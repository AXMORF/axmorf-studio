# Synthesized music diagnostic input incident

用户明确授权的源码修复；本记录不包含私有配置、代理地址/凭证或媒体内容。

## 原始失败与根因

本地候选 `@axmorf/studio 0.1.21` 的正式 prepare 已成功生成并 seal/master 12 段口播，随后退出 1：
`Task input ID is not diagnostic-safe: music-timing`。未返回派发 prompt 或 continuation，未派发 Agent task。

`buildAgentTasks` 已把 synthesizedMusic 网格加入 Scene task 的 `music-timing` input fingerprint。
`buildTaskDiagnosticSnapshots` 经 `toDiagnosticInputId` 构造严格诊断快照时，alias 和公开
`DiagnosticInputIdSchema` 尚未登记该输入，因此合法任务在准备阶段被拒绝。

## 最小修复与边界

在诊断 enum 和显式 alias 同时登记 `music-timing`；不使用任意字符串、跳过诊断或修改 input fingerprint。
未知字段、私有路径仍被原严格白名单拒绝。ProductionRevision/TaskRevision 的身份算法、校验版本、
封存口播、字幕、音乐网格和播放范围不变；无需重新请求 TTS。

隔离回归先 Red：实际 synthesized-music Scene task 进入诊断快照，以及音乐网格变化的 directChanges，
都复现完全相同的异常。修复后复验同一回归，并通过正常打包/安装进入测试 Workspace，
从 current inputs 创建新的正式 production；不修改 node_modules 或失败准备过程的记录。

## 最终验证

六项 focused 回归通过，包含真实合成音乐任务的诊断快照、音乐网格变化的 directChanges 与未知 ID 拒绝。
完整 tests 执行 1440 项，1438 通过、零失败、两项 macOS 测试在 Linux 跳过。全链首次在新增测试的
meaningId brand 标注处退出；使用已验证的 task.semanticId 修正后，focused/typecheck 通过，剩余 lint、
文档/模板/Catalog/Registry、Web/Remotion 构建及 Chromium/source host 检查逐项退出 0。
runtime prepack build/check/pack 通过，正常 npm install 更新测试 Workspace，doctor 六项与新的四路原生 probe 通过。

正式 inspect/prepare 复用封存口播，零新 provider 请求；prepare 退出 0 并仅派发三个 fresh workers。
最终唯一 continuation 返回 project-production-complete，正式 current four-file delivery 的 final check 七项通过。
具体 DeliveryBuildId、媒体 checksum 与抽样审片/混音测量见 [ITERATION_STATUS](../ITERATION_STATUS.md)。
已生成真实成片；完整连续播放、主观听审、实机手机和独立发布首用验收仍未评定，尚未 commit/push 或 npm 发布。
