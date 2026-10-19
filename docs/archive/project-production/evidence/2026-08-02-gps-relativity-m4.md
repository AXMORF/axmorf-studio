# GPS Relativity M4 Narrative Validation Evidence

> 验收日期：2026-08-02
>
> 范围：M1–M3 Narrative Baseline 的作品级机械 AutoCheck、只读 drift gate 与隔离失效矩阵。

> 维护刷新：2026-08-02 将 CaptionLayer 改为响应式布局并把 NarrativeCore 升至 v2；M2
> sealed narration 与 SemanticTiming 未变，下面的 M3/M4 下游身份已按新 runtime 重新生成。

## 1. 入口与保护基线

- M3 入口 HEAD：`6f5dc78f003b5b9fbf140cd4726e69617607d4a0`；M4 从该提交后的
  112/112 tests 基线开始。
- 入口 Composition listing：`CapabilityGallery` 为 30 fps、1920×1080、150 frames；
  `GpsRelativity` 为 30 fps、1920×1080、1731 frames。
- M2 active manifest 文件 checksum：
  `b5ba5036d3fbca5d4227bb8d3b7cd8357a32893bc4888db331d9827599ff1cf6`。
- M2 SemanticTiming 文件 checksum：
  `82058d891c7459b8b407c3df641f6ca0a14eb4b399dbba76089359c9076ec3bc`。
- sealed narration fingerprint：
  `sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5`。
- SemanticTiming fingerprint：
  `sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c`。
- complete WAV checksum：
  `sha256:9a6d9201d44f5926f48c7d017ade48e5d59639bbcb4c5bf4089c620d2ac38d98`；
  48 kHz、mono、s16le、`2721600` sample frames。

M4 全程只读消费以上权威；没有调用 VoxCPM、generate、seal 或 supersede，也没有重算或
改写 SemanticTiming。

## 2. M3 受保护身份

- generator ID：`project-registry-generator-v1`。
- NarrativeCore version：`narrative-core-v2`。
- generated registry checksum：
  `sha256:9de9699e25f17fb7d46ec31520b00da27b37c7b68692b11c0e378d7d1924fb19`。
- generated entry checksum：
  `sha256:d39a9c87446efdc2796402b4154484371c080580cd8d9d79cd82f9e5e5bc46ec`。
- ProjectRegistry entry fingerprint：
  `sha256:25f60e077179d5da6a13dda813a808095eb74c8e4afdfbb4e8f8bbe964ea6f59`。
- Narrative Baseline fingerprint：
  `sha256:ee5a1af1f9dc9017cdb3fa43cb781defad184654fcd93873812122d748650244`。
- M3 receipt 文件 checksum：
  `ba472fbec49a55afed6292e3b60082f7b416dc4b8d387cf742f28aa21e144f05`。
- M3 evidence fingerprint：
  `sha256:92f66128c1223995d8436db2fcbbbe4bef2fbe5bf81473ea4fa28109220bd605`。
- frame 0 PNG、frame 15 PNG、MP4 checksum 分别为
  `ff4af1a46528ccee81838756b0141504186853f2d2122b930f2328b3ff6a63af`、
  `871886dd5bda8ceb85cca66137262637ca6e75e7b4d5f6a7fc6b0dc1d00c3170`、
  `0673835883c7ebd9fdaa046d3a4af22ffd08cc867ee1e7a989e5058b5402bece`。

## 3. AutoCheck 结果

- 命令：`npm run project:check -- --project gps-relativity --level narrative`。
- 显式写入：在上述参数末尾追加 `--write-auto-check`；只有全部机械检查通过时允许原子写。
- AutoCheck 文件 checksum：
  `236097631118ba269007f856c0c93039df89d823b166b704e8439ad3f1960220`。
- AutoCheck report fingerprint：
  `sha256:dd1dc79547123cc2a3c69a3f95ce81cdf951f3e569afbbdb94b51345bc52424c`。

| 固定检查           | 结果 |
| ------------------ | ---- |
| source-contracts   | pass |
| story-check        | pass |
| sealed-narration   | pass |
| semantic-timing    | pass |
| project-registry   | pass |
| narrative-baseline | pass |
| m3-evidence        | pass |

连续执行 default check、相同报告 write 和再次 default check 后，AutoCheck checksum 与纳秒
mtime 均保持不变。默认模式只读重算并做 strict/byte drift check；缺失、malformed、stale 或
one-byte drift 不会被修复。

## 4. 隔离失效矩阵

16 个独立测试均在精确 `mkdtemp()` 副本中执行并通过，覆盖：

- Story semantic-only、`ttsText`、NarrationSpec；
- RenderSpec timing、registration non-timing、Baseline-only non-timing；
- valid-shape manifest identity、complete WAV 缺失、chunk WAV 单字节损坏；
- SemanticTiming generated drift、generated registry 单字节 drift、NarrativeCore version；
- frame 0 PNG 缺失、frame 15 PNG 损坏、MP4 损坏；
- persisted AutoCheck drift。

每个失败 case 都在 mutation 后捕获完整 byte snapshot；checker 运行后 snapshot 不变，失败
report 不能进入 pass-only writer，最后一份有效 AutoCheck 保持 byte-identical。RenderSpec
timing 变化只使 SemanticTiming 及其下游失效，sealed PCM 与 generation identity 保持有效；
媒体缺失或损坏只阻断 M3 evidence/AutoCheck，不反向改变 Narrative Baseline identity。

## 5. 隐私与范围

- AutoCheck 只含固定 repo-relative tracked/content-addressed evidence refs；不展开 M3 `out/`
  产物路径，不含绝对路径、credential、provider endpoint、reference audio、ignored candidate
  或 measured workspace、stack/cause。
- project check runtime 不读取私有配置，不调用 provider、Agent、skill、MCP 或网络，不生成
  registry、M3 receipt 或旁白产物。
- M4 没有新增 NarrativeCheck、`proceed/revise`、Agent 叙事质量审核或主观 review report。
- M4 没有开始 Scene、BaseCanvas、视觉/声音/全局增强轨、final level、approval、release 或
  publish；M5 仍需单独编写并审阅实施规格。
