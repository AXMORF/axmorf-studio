# M9.5 首次真实生产试跑与 hardening 实证

> 结论：2026-08-05，`rounded-airplane-windows` 的首次真实生产试跑在四个编排缺陷均按
> Red → 最小修复 → Green → immutable replacement 恢复后，到达
> `preview-ready / awaiting-user-preview`。该状态只表示机械 Preview 已就绪，不表示用户已
> 观看、批准、quality-pass、发布或 promotion。

## 1. 起点与保护基线

- 分支：`codex/foundation`；试跑前 HEAD：`f24fb6ea98bade75791c316341d4e55cff4e170f`。
- 起点的 M9.5 十提交为 `1acc9a5`、`8a2ff5d`、`78f8cb8`、`21fb6f7`、`161d82c`、
  `fca4c61`、`cda7e04`、`b209fb4`、`933c412`、`f24fb6e`。
- 起点 production tests 为 17/17；Node `v24.16.0`、npm `11.13.0`、Remotion
  `4.0.489`、FFmpeg/ffprobe `6.1.1-3ubuntu5`。
- Task 1 在 `out/m9-5-production-trial/protection-baseline.json` 记录 GPS 与
  ProductComicVertical 各五个正式 assembly/check/approval/evidence/media 的 SHA-256。
  Task 10 复算后十项均与 before 完全一致。
- `public/voice_profile/` 的文件字节从未读取，目录未修改、未 stage、未 commit。一次仓库根
  `git status --untracked-files=all` 意外枚举了该目录下的文件名；现场已脱敏记录为
  `001-preflight-protection-command-summary.json`，之后只使用普通 `git status --short`。
- 一次宽范围 CodeGraph 查询意外返回旧正式 Scene 的源码片段。未主动打开旧 Scene/媒体，
  返回内容未用于新 Scene 设计或实现；现场记录为
  `002-authoring-isolation-command-summary.json`，后续 authoring 只读当前项目输入、合同、测试
  和共享 runtime API。

## 2. Trial 身份

- Story：`rounded-airplane-windows`，Composition：`RoundedAirplaneWindows`，语言：`zh-CN`。
- 两个 meaningId：`rounded-load-path`、`square-corner-stress`。
- Render：1080×1920、30 fps、1102 frames；H.264 + 单声道 AAC。
- 旁白：`my-voice`、`controllable-clone`。私有配置默认读取 Git-ignored
  `voxcpm/voxcpm.private.json`，环境变量只作为可选覆盖；报告不保存私有 endpoint、token、
  prompt 或私有文件路径。
- 资源：StoryResourcePool 为空，两 Scene 均 project-local 自行实现；无 Scene-local sound，
  无 GlobalSoundPlan、BGM、跨 Scene ambience、ducking 或 GlobalVisualLayers。

关键 current identities：

| Artifact | Fingerprint / checksum |
| --- | --- |
| requirements | `sha256:350110707cd1b16c4ef694dadde948dad97d8ac39f5cae5700d1f4fbdd12a9d7` |
| Story | `sha256:caf59c89fef8bb098949e75ccb80e50f959fd0999f3a7dc593adeccb827e8fec` |
| sealed narration | `sha256:8fae057ac5a825cbb934931e3e78100205c60354e80e803140519ba951bf9dd8` |
| complete narration WAV | `sha256:76ec694ad23cb5193f75ad38ad08b2b9bcdaa6b09005a435e369e03f075f035f` |
| SemanticTiming | `sha256:296ef0b7a5a38fec7c1869134bd37a5d8e0e8f35c63c5e94da2b954b8156c8d6` |
| Narrative AutoCheck | `sha256:545a845806db6fe74dfb89fae0fa0d3aefb57b7a1100289143379cfbd692b2a2` |
| visual style | `sha256:7d4efd19833a38213af59a27c9347a2658632ace92fc3e26d9993737da3681a7` |
| resource pool | `sha256:b240b88dfb65223c1514253fac6a3f2da23a13b67418fe70bd107c1596e1e4c4` |
| Scene brief | `sha256:7fc62edb201e5a72bdf0f76e9bf6b6504ced563962603c73a1350f56076a26fd` |

## 3. Run 历史与恢复

所有 failed run 都保持 immutable terminal state；没有手改 event 或
`state.generated.json`。Scene deadline policy 固定为 1,800,000 ms，poll interval 为 1,000 ms。

| Run | 结果 | 关键 timeline / 分类 |
| --- | --- | --- |
| `rounded-airplane-windows-run-20260805061945-1cfdc1383d68` | failed, seq 3 | 前置真实 narrative 尝试；M4A 参考音频不满足 provider 的 absolute WAV 输入合同，修正私有输入后 replacement。 |
| `rounded-airplane-windows-run-20260805062223-22168317e4e3` | failed, seq 3 | 前置真实 narrative 尝试；sandbox 禁止 provider loopback 请求，改为授权的宿主环境执行后 replacement。 |
| `rounded-airplane-windows-run-20260805062336-f49b9e01831f`（Run A） | expected failed, seq 8 | 06:23:36 start；06:23:52 baseline-ready；06:29:56 scene freeze；06:34:04 watcher；`rounded-load-path` 在 06:38:43 先 accepted，`square-corner-stress` 在 06:39:26 显式 `TRIAL_EXPECTED_BLOCKER`。验证 partial/out-of-order success、fail-fast、无 coverage/preview。 |
| `rounded-airplane-windows-run-20260805064115-3c91f1ef7dd6`（Run B） | failed, seq 11 | 两 Scene accepted 后，post-scene 暴露 selected-resources envelope 校验缺口。 |
| `rounded-airplane-windows-run-20260805065108-063de5e46f08`（Run C） | failed, seq 11 | 两 Scene accepted 后，Composition listing 的 stdout 被错误抑制。 |
| replacement start attempt | 未创建 run | Run C 留下的 exact generated Preview scaffold 被误判为 hand-written Composition。 |
| `rounded-airplane-windows-run-20260805065759-2a5c81d4e142`（Run D） | failed, seq 11 | 实际视频时间线完全正确，但 container/AAC padding 被误当为视频时长漂移。 |
| `rounded-airplane-windows-run-20260805070223-e10d9e901f06`（Run E） | preview-ready, seq 13 | 07:02:23 start；07:02:34 baseline-ready；07:03:03 freeze；07:03:43 watcher；07:03:55/57 两 Scene accepted；07:04:25 post-scene succeeded、preview-ready。 |

Run E state fingerprint 为
`sha256:51e1408e67c0bb7caf07306a84e45a83655298b0c01601d38820be1a3390c4e7`，13 个
append-only events 连续，无 failure。watcher 在 Scene 等待、post-scene 与真实 render 全程由
当前主任务持有，没有 detached lifecycle。

## 4. 编排缺陷与 TDD hardening

1. **Selected-resources envelope 未在 submit 边界校验**
   - Symptom：Run B submit 接受缺少 `schemaVersion` 的 envelope，post-scene 才以 ZodError
     失败。
   - Root：submit 只提取内部数组，post-scene 才读取 strict envelope。
   - Red/Green：新增 malformed-envelope submit Red；submit、ScenePackage generation 与
     post-scene 复用同一 strict parser。
   - Commit：`4b25a92 fix(production): validate selected resource envelopes`；Run C replacement
     证明该关口通过。

2. **Composition listing 抑制了待解析 stdout**
   - Symptom：Run C 的 Remotion 命令退出 0，却报告 Composition 未列出。
   - Root：probe 使用 `--log=error` 后再搜索 stdout；该版本 Remotion 在此级别输出为空。
   - Red/Green：fake process Red 固定 argv/stdout 行为；仅从 listing probe 移除该参数。
   - Commit：`fea9a95 fix(production): preserve composition listing output`；后续 Run 正确找到
     `RoundedAirplaneWindows`。

3. **Replacement start 不识别 generated Preview scaffold**
   - Symptom：Run C 后的 replacement 在创建 run 前拒绝覆盖“hand-written” Composition。
   - Root：start 只识别 Narrative scaffold，没有识别失败 post-scene 留下的 exact generated
     Preview scaffold。
   - Red/Green：新增 replacement lifecycle Red；只允许 byte-exact、两种 scene-sound 变体的
     generated Preview scaffold 恢复为 Narrative scaffold，hand-written/drift refusal 保持 Green。
   - Commit：`497ed34 fix(production): restore preview scaffold on replacement`。

4. **媒体时长错误使用 container duration**
   - Symptom：Run D 的 H.264 为 1080×1920、30/1、1102 frames、36.733333 s，却因 AAC/container
     为 36.778667 s 被拒。
   - Root：inspector 用包含 AAC tail padding 的 container duration 对比 exact 视频时间线。
   - Red/Green：fake media Red 固定 10.000 s video / 10.045 s container；改用唯一 H.264 stream
     duration，同时保留 exact fps/frame/stream 与完整 EOF decode。
   - Commit：`a887566 fix(production): inspect preview video duration`；Run E Green。

另完成用户要求的可用性 hardening：默认私有 VoxCPM 配置为
`voxcpm/voxcpm.private.json`，`RSP_VOXCPM_PRIVATE_CONFIG` 仅为可选覆盖；commit `782a912`。

## 5. 最终 Preview 与机械证据

- Preview assembly：`sha256:e98bb1e5afc4a10d9e10d59636b61a706a5621d02b5be7c67a82155feb69b103`。
- Scene coverage：`sha256:c9d532be4bb2a329f4bc042272141dc5593f69959c350af1d8cc11b390980d90`，
  两 Scene 均 ready；package fingerprints 为 `sha256:9a338757...` 与 `sha256:ffe4f0bc...`。
- Preview evidence：`sha256:bc58b2d70dad81a799817858d02c448ecbb4e5c9d7bd3effcf8139f62cc2e510`。
- Mechanical check：`sha256:b670a8c941a07fc91a1a3c06f94f9aac55d50955cfc48f3c9376c6ca2cfcd160`，
  8/8 checks pass，aggregate 为 `mechanically-ready`。
- MP4：
  `out/rounded-airplane-windows/production/rounded-airplane-windows-run-20260805070223-e10d9e901f06/preview.mp4`，
  checksum `sha256:4c8c3ce6035ff52870f489f8faefcb05672c199ac4f10a8df6e1dc84baec4d86`。
- ffprobe/完整解码：1080×1920、30/1、1102 frames、36.733333 s、1 H.264 video + 1 AAC
  audio、decoded-to-EOF。
- Stills：frame 0 `sha256:30ebc949...`、frame 551 `sha256:367b60fa...`、frame 1101
  `sha256:30ebc949...`；contact sheet `sha256:2ce5ae71...`。

对 30 个 tracked/media/run 文件执行多次 `production:preview:check`，均为 no-op；events 保持
13、last sequence 保持 13，bytes + size + mtime 聚合值始终为
`b8efcd1768d3dc512961cff67cd2583d5f69089aca016575a674d64b78802859`。

## 6. 提交、验证与停止边界

试跑实现/hardening 本地提交：

```text
782a912 fix(production): default VoxCPM private config path
f0dc65e feat(trial): freeze rounded airplane windows production inputs
ba89fcd feat(trial): seal rounded airplane windows narrative baseline
733c766 feat(trial): freeze rounded airplane windows scene brief
da42a8d feat(trial): author rounded airplane load path scene
6a29d78 chore(trial): bind replacement scene assignments
4b25a92 fix(production): validate selected resource envelopes
0213b59 chore(trial): bind hardened replacement scene assignments
fea9a95 fix(production): preserve composition listing output
497ed34 fix(production): restore preview scaffold on replacement
4c4ef5f chore(trial): bind final replacement scene assignments
a887566 fix(production): inspect preview video duration
d1a6574 chore(trial): bind media-hardened scene assignments
77cd98f feat(trial): complete rounded airplane window scenes
9d6bf85 feat(trial): assemble m9.5 mechanical production preview
c1963f9 test(registry): include production trial project
```

验证结果：production preflight 17/17、全仓 tests 580/580、typecheck、lint、docs links、
22-entry catalog、3-entry registry、build、四个 Composition listing 和顶层
`npm run check` 全部通过；GPS/ProductComicVertical 的 narrative、M7/M8/M9 evidence、现有用户
approval 与 final-v2 gates 仍 current。

Task 11 commit 前的 `git diff --cached --name-only` 只包含 `README.md`、六份同步的 authority/
导航文档、本报告和本次实施计划，共九个文档路径；没有 source、media、run directory、正式
作品路径或 `public/voice_profile/`。

本试跑没有创建 `rounded-airplane-windows` 的 `FinalPreviewApproval`，没有执行
NarrativeCheck、Scene aesthetic gate、全局增强、promotion、M10、发布或 push。唯一交接状态是：

```text
preview-ready / awaiting-user-preview
```
