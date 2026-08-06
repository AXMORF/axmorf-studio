# M9 Product Comic Vertical Promotion Proposals

状态：`proposal-only`。本文件只记录候选，不构成迁移授权；未移动任何文件，未修改 GPS 或 M9 的 import。

下列 `scripts/m8-gps`、`scripts/m9-product` 路径和 checksum 是提案创建时的历史 source
identity，必须原样保留以便审计；当前等价的 project-local 工具位于
`scripts/project-tools/gps-relativity/` 与 `scripts/project-tools/product-comic-vertical/`。
该路径整理不构成 promotion，也不改变提案时的 source checksum。

## deterministic-pcm-audio-authoring

- GPS source：`scripts/m8-gps/generate-global-audio.ts`，`sha256:7b806de61960c7c33a0ee70f467e7e024056c0673867a272fa5929ad9d7c81f1`
- M9 source：`scripts/m9-product/global-audio.ts`，`sha256:e3f9532ed453a4f6a429b32961bb5b1ba8165e6cd4b46359a5f1af87f4d92587`
- 建议目标：`src/remotion/capabilities/audio-authoring/deterministic-pcm.ts`
- 建议 API：`createCanonicalPcmWav(spec)`、`inspectCanonicalPcm(bytes)`；只负责确定性 PCM/WAV 字节、采样事实和 checksum，不负责音乐创作。
- 明确非目标：音乐/音效 DSL、自动配乐、自动声音导演、render runtime 生成音频。
- 迁移 import：GPS 与 M9 两个 build-time audio writer 仅替换 WAV header、PCM clamp/serialize 和 canonical inspection；各项目波形、gain、role、manifest 仍留在项目目录。
- 验证：两主题既有 audio byte checks、48 kHz/PCM tests、FinalSoundProjection、完整 preview evidence；迁移前后资产 checksum 必须逐字节相同。
- 风险：浮点取整、WAV header、声道与 sample-frame 算法漂移会使全部下游身份失效。
- 回滚：恢复两个项目 writer 的本地 helper 和原 import；封存音频资产不重生成。
- 为什么不是 DSL/自动导演：API 只序列化已经创作完成的 sample function/PCM，不选择音乐、节奏、cue 或 Scene。

## final-preview-evidence-orchestration

- GPS source：`scripts/m8-gps/evidence.ts`，`sha256:ae8bccb9071f9bbab2e85210887468940a181c31b774a8d29f553b91b9306207`
- M9 source：`scripts/m9-product/final-evidence.ts`，`sha256:6c1ebb789abc6d61330ae310b4a426376c9f146b4fe8ecdc919c3d87bb480d3d`
- 建议目标：`src/remotion/capabilities/final-preview-evidence/index.ts`
- 建议 API：`inspectFinalPreview(spec)`、`bindFinalPreviewEvidence(input)`；共享 ffprobe、EOF decode、ebur128/true-peak、sample peak、channel 和 checksum 机械逻辑。
- 明确非目标：渲染编排、review frame 选择、主观批量 review、用户批准、网络媒体检查。
- 迁移 import：两个项目 evidence writer 调用共享 inspection；各自的输出路径、review schema、frame manifest、响度阈值和项目 identity 继续本地拥有。
- 验证：GPS 与 M9 当前 MP4/evidence checksum、technical facts、approval 和 final-v2 fingerprint 不变；两套 invalidation tests 都通过。
- 风险：ffmpeg 输出解析、duration tolerance、AAC padding 与 true-peak 字段差异可能误判 current media。
- 回滚：恢复项目本地 inspection 函数；不触碰 MP4、stills、contact sheet 或 approval。
- 为什么不是 DSL/自动导演：候选只测量既有媒体，不创建 Scene、镜头、布局、节奏或视觉选择。

## explicit-final-preview-approval-writer

- GPS source：`scripts/m8-gps/approval.ts`，`sha256:8921f75af924878b0941c0f699061da579ada3e4ce50980254ffed67e17c6f67`
- M9 source：`scripts/m9-product/approval.ts`，`sha256:54a05f15c37796207223a00ab1a0970da089cbc4b85162ced0ed88bbda27f945`
- 建议目标：`src/remotion/capabilities/final-preview-approval/index.ts`
- 建议 API：`validateApprovalAuthoring(input, current)`、`writeApprovalIfExplicit(authorization, current)`；固定绑定 preview checksum、evidence fingerprint 与 FinalAssembly fingerprint。
- 明确非目标：Agent 代签、从 review 推断批准、自由文本授权、发布或远程审批服务。
- 迁移 import：GPS/M9 wrapper 继续声明 story/composition/path，并把 current evidence/assembly 传给共享纯函数与原子 writer。
- 验证：两主题 approval tests、缺失/错误/过期身份 cases、15 项 final-v2 和字节级 persisted report check。
- 风险：把 CLI token 错当成用户决策来源，或弱化 strict authoring schema，会破坏唯一人工批准边界。
- 回滚：恢复两个项目 approval wrapper；保留既有 receipt 字节与 fingerprint。
- 为什么不是 DSL/自动导演：候选只验证一次已经明确作出的外部决策，不参与作品创作或镜头选择。

## 授权门槛

任何候选只有在用户分别批准范围、API、source files、target files、import changes、测试和回滚后才能实施。M9 完成、证据充分或笼统认可都不等于 promotion 授权。
