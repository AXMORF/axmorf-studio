# Cover output commit recovery incident

用户单独授权的工程修复；本记录不包含视频正文、媒体、private config 或 provider 数据。

- Workspace 安装版本：`@axmorf/studio 0.1.20`。
- Story：`dots-stable-agent-entry-20261009`。
- Revision：`revision-7c341726a635f8f09931c6963f78db3240b6e80545b78276e68edda6cda78b9c`。
- Attempt：`7f87973d-d914-4fab-aefd-fbd45785b299`。
- Cover TaskRevision：`task-66300eb816ddca0d8f1feb6580dd9a8bede5d2e487e09adce48ebe32a6027161`。

## 根因与证据

finalize 检查 regular output parents；缺少 `src` 时返回 `task-workspace-invalid`，尚不终止任务。
随后错误执行 commit；通用 checker 的 exact file-set 检查抛出普通 Error。CLI catch 将所有异常压缩成
`producer-task-commit-failed`，没有保存具体错误、缺失输出路径或 failure owner。
task-terminal event 不可改写，binding 因任务已终态失效。continuation 对任意失败 Agent task 写通用
delivery diagnostic `producer-agent-task-failed` 后退出，该 delivery code 不能证明具体 task fault。
recover-inspect/reissue 原来只接受 task outcome 的 `producer-agent-task-failed`，因此拒绝该通用 commit failure。

只读核对原始 attempt/events：Scene 与 GlobalVisual 各有 artifact-committed；cover 只有通用 commit failure；
无具体校验诊断。现有 cover draft 已有四个输出文件，不能代表失败时的文件集。
用户提供的两个 out 诊断文件能解释操作过程，但不是当时由 validator 生成并绑定的不可变输出校验证据。

## 修复及边界

common checker 为明确的输出缺失、JSON/TypeScript 语法错误抛出 typed output validation error。
commit 保留 strict、可选的 `outputFailure`：failure owner、allowlisted code、排序去重的安全 output paths。
CLI 返回同一结构化诊断。恢复要求匹配原 failed Agent task snapshot 的 declared outputs，并在 mutation lock 内重检。
旧 v3 records 仍可读取；TaskExecutionContract/validator 版本与旧 terminal bytes 不改。
unknown files、symlinks、non-file output、immutable drift、权限/I/O、Artifact Store conflict 和未知异常继续阻断。

该历史失败目前不能安全放行；缺失的原始原因不能从补写文件或文字材料还原，不引入人工标签覆盖机制。
安装修复 runtime 后仍应先运行正式只读命令，并保留其阻断：

```bash
cd /Users/ai/AgentWorkspace/axmorf
npm run project:attempt:recover-inspect -- --project dots-stable-agent-entry-20261009 --attempt 7f87973d-d914-4fab-aefd-fbd45785b299
```

只有有合格证据且正式返回 `attempt-recovery-ready`、旧 workers 全部退出、same-current-Revision gate 通过，才允许：

```bash
npm run project:attempt:reissue -- --project dots-stable-agent-entry-20261009 --attempt 7f87973d-d914-4fab-aefd-fbd45785b299
```

按返回的新 bind/worker/continuation commands 只执行 dirty tasks，不复用旧 binding、不重跑 prepare/TTS。
运行时 package policy 包含发行版本和实际代码校验和；升级仍可能使原 Revision stale，不能跳过 gate 或承诺升级后强行复用。
本请求要求的既有正文、1.2 倍旁白、2 秒片头、8 秒片尾均不改；实际新交付未制作。

## 验证范围

确定性隔离回归先 Red，复现没有记录 outputFailure；再 Green。
临时 Workspace 通过实际 bind/finalize/commit/continuation、recover-inspect/reissue CLI：
缺目录、缺文件、TypeScript syntax failure 创建 fresh attempt/binding，仅派发 cover；
复用已提交 Scene/GlobalVisual artifacts，重绑后完成 cover commit，原 attempt/events/claim 和既有 artifact bytes 不变。
回归还覆盖 JSON diagnostic、无效路径/owner/code、legacy 无证据阻断、fixed/host/unknown 故障及锁内重检。
不调用真实 TTS 或收费 provider。

最终验证：

- 针对性回归 26/26，零失败/skip；`tsc --noEmit` 通过。
- 完整 `npm run check` 退出 0：1425/1425 tests，零失败/skip，类型、lint、文档链接、静态构建与 Chromium
  compositions/source host gate 全部通过。首轮完整检查在全量 tests 通过后发现新增 CLI 测试的返回值类型收窄错误；
  修正测试断言后重新完整运行通过，未修改生产校验门槛。
- `npm run packages:build` 与 `npm run check:package --workspace @axmorf/studio` 退出 0。
- 临时 Workspace 使用构建后的 npm bin 符号链接入口：bind 退出 0，missing-output commit 退出 2；
  stderr 的结构化 diagnostic 与持久化 task-terminal `outputFailure` 一致，零 provider。
- 修复后 source CLI 对原真实 failed attempt 只读 recover-inspect，仍以退出码 2、
  `attempt-recovery-plan-not-recoverable` 阻断；前后哈希确认原 attempt 全树、已提交 artifacts、安装的
  `@axmorf/studio` 和 Project source 全部未变。
- 该修复阶段最终 diff 审阅和 `git diff --check` 通过；验证时尚未 commit/push，未发布或安装至视频 Workspace。
