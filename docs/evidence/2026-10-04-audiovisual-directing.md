# 视听导演与正式样片（2026-10-04）

本轮样片检查点使用未发布的 `axmorf/visual-narrative-quality` 分支和隔离源码 worktree。
公开 npm 两包 0.1.16 已发布；此检查点没有回退、推送或发布新包。
之后的源码/文档收口和验证见 [当前状态](../ITERATION_STATUS.md)，不将后续检查结果改签为本轮首测通过。
原源码工作区、用户生产 Workspace、已认可视频和既有比较样片未修改。

## 参考与选择

四份用户提供的 Library MP4 已实际下载并核对身份；Muse、Notion、motion reel 与 motion principles
只作风格参考。实际抽查显示大字、色块、同一主体的变化、近景和结果镜头，而不是长期保持小网页。
未取得原作源码或重新使用这些文件的许可，不把标签/提示词当代码证明，不将其 bytes 或音轨放入新片。
既有 475 个提示词示例集合及原作/重制边界见前一份工程证据。

新片以 AXMORF Studio 的实际视频与双封面交付为主题。采用深墨色、暖白与青柠色，短主张放大；
几何碎片和粒子聚合成画面，再展开为同一组三张分镜，随后从画面引出波形、节奏和交付。
SVG 用于可控的字形、几何与共享绘制；没有伪造预约或站点业务功能，也没有把自由创作改成固定效果模板。

## 进入正式生成链路的改动

- `project:create:context` 新增 `soundResources`，只返回 Catalog 中 approved/runtime-approved、
  audio 且 license verified 的音效与音乐；示例实际选择可用的扫动、落位与确认音效。
- `soundDefaults` 返回是否配置 BGM 和音量，不公开其私有路径。音乐由既有配置及 create-time
  本地化启用，写在 brief 或 allowlist 中不会自动播放。
- Scene contract 和现有 brief 指导加入注意力层级、近景、大字主张、语义粒子/形变及合适读停。
  音效起音或声势中心通过 startFrame 对齐可见 anchor，完整媒体仍须留在 Scene 内；BGM 仍属顶层。
- 合同给出 `<SceneContinuityVisual handoff={continuity.incoming}/>` 及中性祖先的具体用法。
  此 API 说明在本轮样片完成后补清，未修改已安装运行包或任何任务输出。API 行为没有变化。

没有新审美分数、特效配额、主题模板或放宽 validator。回归覆盖音效选择、音乐配置状态、路径隐私和
只读 context；文字指导由既有 contract/Skill 完整性检查覆盖，不为指导句子编写逐字镜像测试。

## 实际生产与交付

全新 creator 安装本轮 dev runtime，bootstrap、浏览器准备、doctor 均实际成功。四个 fresh native
child 通过 shared-workspace 临时 challenge；本轮 resolver 为 subagents/4。严格 create、零 provider
inspect 和 prepare 后派发 2 Scene、1 GlobalVisual、1 Cover owner；固定首尾模板由 fixed tasks 处理。
渲染串行，Root 未读写其他 executor workspace、代 commit、降低沙箱或放宽校验。

先完成 10 秒开头、查看 8 个实际诊断帧，再完成 15 秒后段、查看 8 个实际诊断帧；原 owner 在 terminal
前修正参数/时序/可读性问题并提交相同已预览 bytes。唯一 continuation 实际退出 0，返回
`project-production-complete`。公开 `project:check --level final` 的 7 项全部 pass。

| 交付      | 实际结果                                                     |
| --------- | ------------------------------------------------------------ |
| video     | 1080×1920、30fps、1050 帧、35 秒画面，H.264/AAC 48kHz stereo |
| cover-4x3 | 1600×1200 PNG                                                |
| cover-3x4 | 1200×1600 PNG                                                |
| publish   | same Revision、ArtifactSet 与 DeliveryBuild；exact 四文件    |

Revision `revision-b4088495dad26e0b513d1a6c277f5ce0cccec28c7b8b33790692852e8aef752a`；
DeliveryBuild `delivery-513f4d6390910b1c0615c159cac4b49d4d56db0f12bf06c403be1d439810aeb0`。
MP4 SHA-256 `dd88e75924c83e48dea45b80695258aa30a812a194818bc60eb25688528f8be7`。

新片、两个匹配封面和开头预览已保存到 Library，逐项成功收据与本地身份保存在隔离 benchmark 的
`final-library-receipts.json`、`opening-library-receipt.json`，不把私有 Library 身份写入仓库。
保存助手在准备前报告接口不可用；失败原始结果保留，没有准备出的上传或未知写入。随后按不可用工具
的有序直接创建路径完成；Mac 本地元数据经 native xattr 回读核验，不宣称失败的 Python helper 通过。

## 音频、时序与审阅边界

本次为视觉品牌样片，无 TTS；普通 narrated 流程继续保留。六次正文音效来自现有 Apache-2.0
原创预制资源。背景音乐为已核验 Mixkit Stock Music Free License 的 Deep Urban 8.045714 秒节选，
seed checksum 为 `fefb0356c74c565377ec02a68e31d70f670595dab9a6a0969e3d6b8090c5d434`，
复制到新 Project owned resource 后在正文窗口播放。没有使用参考附件音频或收费第三方。

全片音轨已解码至 EOF，PCM peak 为 -2.15 dBFS、RMS -24.26 dBFS，削波样本 0。正文音乐较轻
（抽查分段 RMS 约 -33.6 至 -35.3 dBFS），继承片头/片尾更响；这些数字不能代替实际听审或证明混音
听感合适。AAC padding 使容器为约 35.0507 秒，视频帧时序仍严格为 35 秒。

最终实际查看帧 30/84/195/309/359/360/396/480/550/612/702/809/870/1010 及两张封面。正文接点 359/360 的
mean absolute RGB difference 为 `0.000003858`，同一组三分镜的姿态没有之前的小网页跳变；这一
相邻帧差只验证该接点，不是审美或运动质量分数。

在相同安装包、current Project 输入和宿主上，用正式相同参数于独立 out 路径重渲染整片。
1050 帧解码 RGB 全部相同，48kHz stereo PCM SHA-256 都为
`13466be4968ceca56853ff1f33b1785e586a59ac33151ca8d6fb585705f602b1`。
MP4 文件 bytes 不同：重复文件 SHA-256 为
`a4c316c9603d752653a734467c0a7465421a8152e83a18736793a32938a61508`。
没有新建 production attempt 或调用 provider，原 Delivery 不覆盖；完整逐帧 hash 与结果在
`repeatability-proof.json` 和两份 `*-rgb-framehash.txt`，不把编码文件相同作为重复性证明。

仍未完整连续播放或人耳听审，不宣称全帧无瑕疵、跨主题稳定率或与整个示例库等同。固定 2 秒片头和
8 秒片尾继续按未指定偏好的规则继承，片尾的通用长文案与正文品牌节奏仍不完全一致。动态 CSS scale
的保守可读性检查仍存在；worker 用数值布局重构图形景别、保持文字尺寸，未修改此门禁。

本地 benchmark 与独立交付副本保留在 Git 之外；正式四文件使用标准 `deliveries/<storyId>/` 结构。
focused 完整性/资源回归 22/22，package build、安装与真实渲染均通过。完整测试首次运行
1173/1177，4 个已有进程/浏览器 fixture 在 300ms/2s 启动时限失败；它们所在的两个测试文件原样
单并发复验 27/27。未改 timeout、实现或门禁，单独复验不能把首轮全量失败改签为 Green。
随后原样补跑 typecheck、lint、docs links、scene-template audio、Catalog、Registry、config build、
Remotion build 和 check:host，9 个阶段全部退出0。完整 `npm run check` 首轮仍是失败结果；
现有完整并发下的启动时序波动保留为工程风险，没有为本次视觉任务扩展或修改进程系统。
原始 native continuation、prepare 和媒体/时序/Library 收据保留，旧同输入两主题比较样片不覆盖。
