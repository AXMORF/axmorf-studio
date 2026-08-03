# M9 Product Comic Vertical Generalization Evidence

## 结论

M9 已用与 GPS 明显不同的产品漫画竖屏主题完成第二条真实生产链，并在 2026-08-04 获得用户对 current exact preview 的明确 `FinalPreviewApproval`。当前 `product-comic-vertical` 的 `final-mechanical-check-v2` 固定 15 项全部通过；M9 没有修改 GPS 的 Story、旁白、timing、字幕、ScenePackage、global assembly、approval 或 M8 evidence，没有发布或开始 M10。

## 批准与最终身份

| Identity | Current value |
| --- | --- |
| Preview checksum | `sha256:c70a25a898abe828e90664b061e2e18840420099bb82bbe33b49357642f05b30` |
| FinalPreviewEvidence | `sha256:d0e5a1ed1d78e166f9938881c577ad75247d64874b20be72ad17c5223786c514` |
| FinalAssembly | `sha256:47401e3499122f89e4eeb69b16b333101e793de223a19e4214540d69e599acb2` |
| FinalPreviewApproval | `sha256:836a7f16ddba659a69a6c28a4a9d591c31b64b0d8cdf4e35708226006661a66b` |
| final-mechanical-check-v2 | `sha256:8a52e146c2edeb422a77136707a35c54fa9e5e787b0bcdd35e95b0650b8d41b2` |
| fail-closed matrix | `sha256:4c9b2107ae5cb7d91562c7782831141125bee7f09157842bae6bd35a12baa875` |
| generalization report | `sha256:82cf48ddb70301962fd97c79e55edd6bca7655812f330acd5c6fb3f646bd8c4e` |

Approval authoring/generated artifacts 严格绑定 preview、evidence 与 FinalAssembly。缺少授权 token、free-form/Agent review、旧 checksum、旧 evidence、旧 assembly 或单字节漂移都会失败；脚本和 checker 不能代签。

## 第二主题生产事实

- 9:16 `ProductComicVertical` Composition，1080×1920、30 fps、5116 帧；十个 StoryBeat、十个独立 ScenePackage、十入口 literal RendererRegistry。
- 旁白来自受保护用户输入的 `high-fidelity-clone` authoring，禁止 `emotion`、`control` 和 `controlInstruction`；封存的 48 kHz mono s16le PCM 是唯一时间权威。
- Shotcraft 在冻结 commit `d4915443232e89527fdc9d7e79f132ba411fc440` 上完成 104 张 card、161 个 style/demo、161 个 preview 的全量 inventory/coverage；`product-reveal` 的 `draw-svg-trace` 走 exact lineage、最小本地化闭包、Renderer/frame binding 和配对 phase evidence，其余选择有显式非 exact 决策。
- 漫画设计系统、角色/系统 model sheet、十个 Scene renderer、Scene-local PCM、全片 BGM/ambience 和 `GlobalVisualLayers` 都保持 project-local；没有形成 Scene DSL、自动布局器或自动导演。
- 完整 MP4 为 H.264/AAC、48 kHz stereo；完整解码到 EOF，integrated loudness `-22.6 LUFS`，true peak/sample peak 均为 `-6.7 dB`，45 张 review still、contact sheet、360×640 可读性和正常速度批量 review 均通过。

## 两主题泛化结论

Canonical 机器报告位于 `src/projects/product-comic-vertical/generated/m9-generalization-report.generated.json`，review 位于 `src/projects/product-comic-vertical/reviews/generalization-review.json`。结论严格分为四类：

1. `reused-without-change`：Narrative contracts/seal/timing、ScenePackage/runtime contracts、FinalAssembly/Preview/Approval contracts、静态 registry 与顶层 CaptionLayer ownership。
2. `fixture-decoupling-fix`：Narrative Baseline 的项目解耦、Shotcraft 完整 closure 合同、high-fidelity clone provider gate、Scene Catalog 与 FinalAssembly Catalog identity 分离。
3. `project-local-by-design`：产品 source/story/voice authoring、漫画设计/model sheets、十个 ScenePackage、产品 GlobalVisual、项目音频与 M9 evidence orchestration。
4. `promotion-candidate`：确定性 PCM/WAV authoring、Final Preview 技术 evidence orchestration、显式 FinalPreviewApproval writer。三项都只是 proposal，没有迁移。

具体 source checksum、建议 API、目标文件、import changes、风险、测试、回滚和非目标见 [M9 Promotion Proposals](../promotions/m9-product-comic-vertical-promotion-proposals.md)。任何 promotion 仍需用户对单项范围和文件的明确批准。

## Fail-closed matrix

`tests/m9-product/fail-closed-matrix.test.ts` 对计划冻结的 42 类 mutation 逐项在隔离 JSON/字节副本中验证 source、Story、voice、sealed narration、timing、caption、registry、Shotcraft、Scene、global、media、approval 和 GPS protection。Canonical matrix 记录全部 42 项 `pass`，并绑定当前 approval 与 final-v2 report。

关键边界包括：

- 任一 Story/ttsChunk/voice source/sealed WAV/PCM/timing/caption 漂移使相应上游或叙事身份失效；
- inventory 少项、coverage 未决、ambiguous demo 选 exact、closure/license/Renderer/phase drift 均失败；
- Scene visual/sound/ownership、coverage/registry、GlobalSound/GlobalVisual、Composition order 漂移均向下游失效；
- MP4、audio stream、EOF、响度/peak、still/contact sheet/review 漂移使 evidence/approval 失效；
- approval 缺失或三项身份不匹配时 v2 不能通过；
- GPS 受保护路径相对 M9 baseline `f89bf6d95decde27c7a128eaa90568526db49942` 保持零差异。

## 验证命令

```bash
node --import tsx scripts/m9-product/approval.ts check
npm run project:check -- --project product-comic-vertical --level final
node --import tsx --test tests/m9-product/approval.test.ts
node --import tsx --test tests/m9-product/fail-closed-matrix.test.ts
npm run check
git diff --exit-code f89bf6d95decde27c7a128eaa90568526db49942 -- \
  src/projects/gps-relativity \
  public/projects/gps-relativity \
  docs/evidence/m8-gps-relativity-final-assembly.md
```

这些命令只读复算 current 产物；只有已执行过的显式 approval writer 和 `--write-final-check` 会写 approval/v2。M9 closeout 不 push、不发布、不自动启动 M10。
