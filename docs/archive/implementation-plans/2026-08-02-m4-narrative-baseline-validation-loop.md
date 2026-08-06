# M4 Narrative Baseline Validation Loop Implementation Plan

> **归档说明：** 历史实施快照；其中命令、路径和状态不再代表当前仓库事实。

> **执行模式：** 本计划供下一轮在当前仓库对话中逐 Task 内联执行。按文末 checklist
> 顺序推进，不使用子代理、plan runner、`executing-plans` 或其他 skill。本轮只创建和自审
> 本文档，不实现、不提交、不 push。

**目标：** 把已经完成的 M1–M3 叙事主链收口为一个真实、可重复、fail-closed 的作品级
检查闭环：`gps-relativity` 的合同、StoryCheck、M2 sealed narration、SemanticTiming、
ProjectRegistry、Narrative Baseline 和 M3 evidence 生成严格的 AutoCheck；任何上游失效、
generated drift、媒体证据损坏或检查报告漂移都由固定身份传播阻断，而不是通过重生成旁白、
自动修复、二次 Agent 复核或视觉代码遮盖。

**架构：** 保持 M1–M3 源码、封存 PCM、SemanticTiming、generated registry 和真实 M3
媒体证据为受保护输入。先新增一个作品级机械 `NarrativeAutoCheckReport` 纯合同，再把现有
M3 evidence 写入逻辑拆出独立只读校验；最后用一个窄的 `scripts/project-check/` 入口聚合
已有 M1/M2/M3 检查。写模式只在全部机械检查通过后原子写 AutoCheck；默认模式只读重算并
做 byte drift check。失败结果可在内存和 stdout/stderr 中脱敏呈现，但不得覆盖最后一个
有效报告。

**技术栈：** TypeScript 5.9.3、Zod 4.3.6、Node.js 20+ built-ins、`tsx` 4.23.1、现有
canonical SHA-256、现有 host FFmpeg/ffprobe、现有 Remotion 4.0.489 CLI。无新依赖、无
Docker、无 VoxCPM、无网络调用。

## 1. Repo-truth planning baseline

本节记录的是 2026-08-02 本计划编写时重新核对的当前事实，不是把用户预期直接当作事实。

- Repository：`/data/projects/repos/remotion-story-producer`；环境中的
  `/home/zzzxc/projects/repos/remotion-story-producer` 指向同一 checkout。
- Branch：`codex/foundation`。
- M3 入口 HEAD：`6f5dc78f003b5b9fbf140cd4726e69617607d4a0`
  (`docs: close M3 narrative baseline milestone`)。
- 计划创建前 worktree 与 index 均干净。
- `.codegraph/` 存在；M1–M3 合同、checker、registry、runtime、evidence 及测试调用路径已先
  经 CodeGraph 核对，再按需读取具体文件。
- 当前 `npm test`：`112 / 112` pass，0 fail、0 skipped、0 todo。
- 当前 `narration:check`：10 chunks、10 CaptionCues，exit 0。
- 当前 `registry:check`：1 Story entry，byte drift check exit 0。
- 当前 Composition listing：

```text
CapabilityGallery    30 fps  1920x1080   150 frames
GpsRelativity        30 fps  1920x1080  1731 frames
```

- `GpsRelativity` metadata：30 fps、1920×1080、1731 frames、15 lead-in frames、15 tail
  frames；完整 Baseline 为 57.70 秒。
- M1、M2、M3 已由代码、测试、真实文件和 evidence 实现；`project:check` 和 AutoCheck 聚合
  当前不存在，M4 尚未开始。

### 1.1 受保护的 M2 时间权威入口

| 入口                                                                         | 当前 SHA-256 / identity                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/projects/gps-relativity/generated/sealed-narration.generated.json` 文件 | `b5ba5036d3fbca5d4227bb8d3b7cd8357a32893bc4888db331d9827599ff1cf6`        |
| sealed narration fingerprint                                                 | `sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5` |
| generation input fingerprint                                                 | `sha256:1b3d1abb5aa14bb8df07d2023a3ab947137a4e9f075234e82ae777a36cb39f96` |
| `src/projects/gps-relativity/generated/semantic-timing.generated.json` 文件  | `82058d891c7459b8b407c3df641f6ca0a14eb4b399dbba76089359c9076ec3bc`        |
| SemanticTiming fingerprint                                                   | `sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c` |
| complete WAV 文件/checksum                                                   | `9a6d9201d44f5926f48c7d017ade48e5d59639bbcb4c5bf4089c620d2ac38d98`        |
| complete WAV identity                                                        | 48 kHz、mono、s16le、`2721600` sample frames、56.700000 秒                |
| `docs/evidence/2026-08-01-gps-relativity-m2.md` 文件                         | `cae0de367837f2f88f00b5d84546119f982e28a5c6ee44401e86fc657fa60a9b`        |

M4 对以上入口只读。任何真实失效都必须阻断 M4；M4 不运行 `narration:generate`、
`narration:seal`、`--supersede`，不调用 VoxCPM，不重新生成 chunk，不重新封存完整 WAV，
不重算或改写现有 SemanticTiming。

### 1.2 受保护的 M3 registry、Baseline 与媒体 evidence 入口

| 入口                                                                            | 当前 SHA-256 / identity                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| registry generator ID                                                           | `project-registry-generator-v1`                                           |
| `src/projects/project-registry.generated.ts` 文件 / generated registry checksum | `6b2b697a8b1d56e8179b7dcf254ad62ea0e92385b7e39a9e660baaaf479b472c`        |
| generated entry checksum                                                        | `sha256:d39a9c87446efdc2796402b4154484371c080580cd8d9d79cd82f9e5e5bc46ec` |
| ProjectRegistry entry fingerprint                                               | `sha256:25f60e077179d5da6a13dda813a808095eb74c8e4afdfbb4e8f8bbe964ea6f59` |
| NarrativeCore version                                                           | `narrative-core-v1`                                                       |
| Narrative Baseline fingerprint                                                  | `sha256:8e55b2c7d31f4b56ee777e9d806744327f90ba76f973e41146e4809fa09458c9` |
| M3 generated receipt 文件                                                       | `2a3ced568dd31c2af9399e182215f8a3d2fbff45943856e999c86ecb82266964`        |
| M3 evidence fingerprint                                                         | `sha256:d265ee5c39b2f1777eea589e9f6b42ea50173944ecaca75904f25207de65c9d9` |
| frame 0 transparent PNG                                                         | `ff4af1a46528ccee81838756b0141504186853f2d2122b930f2328b3ff6a63af`        |
| frame 15 caption PNG                                                            | `4e61d1652e27b869bed3666eeb777d273b17c4887f89ba63b80739c1002aba64`        |
| 1731-frame H.264/AAC MP4                                                        | `475f47e72864f889325d2cd1d451400eb237682fbef45ab09d634eab92a5195f`        |
| `docs/evidence/2026-08-01-gps-relativity-m3.md` 文件                            | `ef0ac18a473cc639a82fc25af47cf2b1b8b1e9f1ac1736d44a1ff1fda3719dfa`        |

M4 可以修改 `scripts/baseline/evidence.ts`，仅用于抽出新的只读 receipt drift check；不得
修改 `src/projects/project-registry.generated.ts`、M3 generated receipt、两张 PNG、MP4、
M3 human evidence、NarrativeCore、Root 或 Story Composition 来迁就检查逻辑。

## 2. Global constraints

- 只使用宿主机 Node.js/npm、Remotion CLI 和现有 FFmpeg/ffprobe；不新增 Docker、容器、
  服务管理器或依赖。
- 所有 `remotion` 与 `@remotion/*` 包继续精确固定在 `4.0.489`。
- M4 runtime 不读取 `RSP_VOXCPM_PRIVATE_CONFIG`，不调用 provider、Agent、skill、MCP 或
  网络服务。
- M4 不增加二次 Agent 叙事质量审核。Story 与 `ttsChunks` 已是上游 Agent 创作决策，M4 只
  机械验证现有 StoryCheck 的合同、decision 和输入身份，不重新判断故事质量、旁白可懂度、
  字幕表达或整体叙事节奏。
- `ttsChunks` 继续是按语义、语气和朗读节奏创作的原子单元；M4 不按标点拆分，不做词级
  对齐，不修改字幕文本或范围。
- `pcm-cumulative-ceil-v1`、`BigInt` 累计 sample-frame、sealed complete WAV 和现有
  SemanticTiming 是受保护时间权威；M4 只调用现有纯函数和 file-backed checker 复验。
- 所有缺失文件、malformed JSON、unknown field、checksum 漂移、identity mismatch、
  registry drift、evidence 损坏和未知 CLI 参数都 fail closed。
- 默认检查模式不生成、不修复、不格式化、不重写任何产物。唯一允许的写入模式只原子写
  一份通过的 AutoCheck；失败尝试不能覆盖最后一个有效报告。
- AutoCheck 不保存绝对路径、stack/cause、token、provider endpoint、
  私有配置、reference audio、`.narration-work`、candidate/measured workspace 或任意自定义
  ignored 路径。AutoCheck 不重复展开 `out/` 路径，只引用 tracked M3 receipt 及其 checksum/
  fingerprint；M3 receipt 已负责绑定固定 PNG/MP4 路径。
- 不创建通用工作流 DSL、插件式 check graph、任意 check registry、通用 report engine、
  可配置命令图或多 level 框架。M4 只有固定 `narrative` level 和固定顺序检查。
- 不实现或设计 `final` level，不接受 `--level final`，不实现自动 repair。
- 不实现 SceneVisualCheck、FinalPreviewApproval、发布或视觉阶段能力。
- 不创建、修改或提前泄漏 SceneVisualPlan、ShotPlan、ScenePackage、RendererRegistry、
  ResourceCatalog、BaseCanvas、StoryVisualTrack、SoundDesignTrack、GlobalVisualLayers 或转场
  实现。
- 保护用户工作；只修改当前 Task 列出的文件，精确 staging，不 reset、不删除、不顺手整理
  无关文件。每个 Task 是下一轮的建议小提交边界；本轮不执行 commit。

## 3. Fixed M4 dependency direction

```text
M1 source + StoryCheck
        ↓ existing strict contracts
M2 manifest + chunk/complete WAV + SemanticTiming
        ↓ existing narration checker
M3 expected registry entry + generated registry byte check
        ↓ existing registry domain
M3 PNG/MP4 + persisted M3 receipt
        ↓ new read-only M3 evidence check
fixed mechanical outcomes
        ↓ NarrativeAutoCheckReport
atomic pass-only write / read-only drift validation
        ↓
project:check --project gps-relativity --level narrative
```

禁止的依赖方向：

```text
project:check   -X-> VoxCPM / private config / network / Agent / skill / MCP
AutoCheck       -X-> automatic repair / registry generation / narration seal
M4              -X-> second Agent narrative-quality review / subjective approval
M4              -X-> Scene / visual / sound / global / approval / release
failure path    -X-> overwrite last valid AutoCheck
report JSON     -X-> absolute path / stack trace / provider or private workspace data
```

## 4. Locked M4 command surface

M4 只新增一个 package entry：

```bash
npm run project:check -- --project gps-relativity --level narrative
```

它是默认只读 gate：

1. 重新执行固定 M1–M3 mechanical checks；
2. 重算期望 AutoCheck；
3. byte-for-byte 校验 persisted AutoCheck 无 drift；
4. AutoCheck 非 pass、缺失、malformed、identity mismatch 或 byte drift 时 exit 1。

唯一允许的写入形式为：

```bash
npm run project:check -- --project gps-relativity --level narrative --write-auto-check
```

固定参数边界：

- 参数顺序和数量严格固定为上述两种；
- `<project>` 必须先通过 `StoryIdSchema`，再匹配固定一级目录发现出的真实 Story entry；
- M4 只有 `gps-relativity` 具备完整 M3 evidence，因此它是唯一真实 proof；不为虚构项目
  建立手工 allowlist 或 fallback；
- level 只接受字面量 `narrative`；`final`、未知 level、参数重排、重复 flag、`--output`、
  `--root`、`--repair`、任意路径和额外参数全部失败；
- `--write-auto-check` 只写通过的 AutoCheck，不生成任何 Agent 审核报告。

## 5. Locked M4 file structure

```text
src/contracts/
├── auto-check.ts                         strict AutoCheck report + fingerprint
└── index.ts                              narrow exports

scripts/baseline/evidence.ts              add read-only M3 receipt validation; retain existing writer

scripts/project-check/
├── domain.ts                             fixed checks, identities, safe failure mapping
├── project-files.ts                      fixed project inputs and report paths
├── run.ts                                M1–M3 mechanical aggregation, no persistence
├── report-files.ts                       pass-only atomic write + read-only drift validation
└── cli.ts                                two exact argument forms

tests/contracts/
└── auto-check.test.ts

tests/project-check/
├── domain.test.ts
├── project-check.test.ts
├── report-files.test.ts
├── cli.test.ts
└── invalidation.test.ts

tests/fixtures/
└── m4-project.ts                         isolated gps-relativity mutation fixture

src/projects/gps-relativity/generated/
└── narrative-auto-check.generated.json  generated, tracked, pass-only current report

docs/evidence/
└── 2026-08-02-gps-relativity-m4.md       redacted human closure evidence
```

不创建 `auto-check-registry.ts`、`workflow.json`、`checks/` plugin tree、level adapter、Scene
目录或 M5 placeholder。

## 6. Locked contracts and semantics

### 6.1 AutoCheck constants and fixed check order

```ts
export const NARRATIVE_AUTO_CHECK_VERSION = "narrative-auto-check-v1" as const;

export const NARRATIVE_AUTO_CHECK_IDS = [
  "source-contracts",
  "story-check",
  "sealed-narration",
  "semantic-timing",
  "project-registry",
  "narrative-baseline",
  "m3-evidence",
] as const;
```

检查含义固定如下：

| checkId              | 必须复用/验证的事实                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `source-contracts`   | strict VideoBrief/StorySpec/NarrationSpec/RenderSpec、Story ID 与 source identity                            |
| `story-check`        | 当前 Story/Narration 对应的严格 StoryCheck，decision 必须 `proceed`                                          |
| `sealed-narration`   | 现有 file-backed M2 checker：chunk/complete WAV checksum、PCM measurement、ordered concat、manifest identity |
| `semantic-timing`    | 现有 `validateM1ArtifactBundle()` 重算 byte-equivalent `pcm-cumulative-ceil-v1` timing                       |
| `project-registry`   | fixed discovery、default export、expected entry identity、tracked generated source byte drift                |
| `narrative-baseline` | expected entry checksum/fingerprint、`NARRATIVE_CORE_VERSION` 与 Baseline fingerprint                        |
| `m3-evidence`        | persisted M3 receipt、PNG/MP4 bytes、alpha/media facts、upstream identities、receipt drift                   |

该数组既是报告顺序也是执行顺序；不得由 JSON、环境变量或 plugin 动态扩展。

### 6.2 AutoCheck report shape

计划中的公开形状：

```ts
export type NarrativeAutoCheckEvidenceId =
  | "story-check"
  | "sealed-manifest"
  | "complete-wav"
  | "semantic-timing"
  | "project-registry"
  | "m3-receipt";

export type NarrativeAutoCheckReport = {
  readonly schemaVersion: 1;
  readonly reportVersion: typeof NARRATIVE_AUTO_CHECK_VERSION;
  readonly storyId: string;
  readonly level: "narrative";
  readonly aggregateStatus: "pass" | "fail";
  readonly inputIdentity: {
    readonly storyFingerprint: Sha256Digest | null;
    readonly renderSpecFingerprint: Sha256Digest | null;
    readonly storyCheckFingerprint: Sha256Digest | null;
    readonly generationInputFingerprint: Sha256Digest | null;
    readonly sealedNarrationFingerprint: Sha256Digest | null;
    readonly semanticTimingFingerprint: Sha256Digest | null;
    readonly projectRegistryGeneratorId:
      | typeof PROJECT_REGISTRY_GENERATOR_ID
      | null;
    readonly generatedRegistryChecksum: Sha256Digest | null;
    readonly generatedEntryChecksum: Sha256Digest | null;
    readonly projectRegistryEntryFingerprint: Sha256Digest | null;
    readonly narrativeCoreVersion: typeof NARRATIVE_CORE_VERSION | null;
    readonly narrativeBaselineFingerprint: Sha256Digest | null;
    readonly m3EvidenceFingerprint: Sha256Digest | null;
  };
  readonly evidenceRefs: readonly {
    readonly evidenceId: NarrativeAutoCheckEvidenceId;
    readonly repositoryPath: string;
    readonly checksum: Sha256Digest | null;
  }[];
  readonly checks: readonly {
    readonly checkId: (typeof NARRATIVE_AUTO_CHECK_IDS)[number];
    readonly status: "pass" | "fail";
    readonly evidenceIds: readonly NarrativeAutoCheckEvidenceId[];
    readonly failureReasons: readonly {
      readonly code:
        | "missing"
        | "malformed"
        | "stale"
        | "checksum-mismatch"
        | "identity-mismatch"
        | "registry-drift"
        | "media-invalid"
        | "unexpected";
      readonly message: string;
    }[];
  }[];
  readonly reportFingerprint: Sha256Digest;
};
```

严格不变量：

- schema、所有 nested objects 均 `.strict()`；未知字段失败；
- checks 必须恰好包含七项且顺序固定，不允许重复、缺失或未知 check；
- evidence refs 必须使用固定 ID、固定顺序和由 `storyId` 推导的 repo-relative 路径；不接受
  caller 自定义路径；
- pass item 的 `failureReasons` 必须为空；fail item 至少一个安全 failure reason；
- `aggregateStatus=pass` 当且仅当七项全部 pass、所有 identity/checksum 非 null；
- fail report 仍可严格 fingerprint，便于测试和安全输出，但 persistence adapter 只允许写
  pass report；
- failure message 是固定、安全、无路径模板；原始 error、stack、cause 只用于进程内诊断，
  不进入 JSON；
- `reportFingerprint` 使用现有 `createFingerprint()`，namespace
  `narrative-auto-check-report`、version 1，覆盖除自身外的完整报告；
- `renderSpecFingerprint` 使用完整 strict RenderSpec，namespace `render-spec`、version 1；
- `storyCheckFingerprint` 使用已校验 StoryCheck，namespace `story-check-report`、version 1；
- 不增加第二套 canonical JSON 或 SHA 实现。

AutoCheck `evidenceRefs` 不重复保存 `out/` 或 `.narration-work`。M3 receipt 已通过自己的
fingerprint 绑定固定 PNG/MP4；AutoCheck 只引用 tracked M3 receipt。

### 6.3 AutoCheck write/check semantics

```text
runNarrativeAutoCheck()               -> strict in-memory pass/fail report
writeNarrativeAutoCheckIfPassed()     -> pass only, canonical pretty JSON, atomic
checkPersistedNarrativeAutoCheck()    -> recompute + read + strict parse + byte compare
```

- 写入目的地固定为
  `src/projects/<story>/generated/narrative-auto-check.generated.json`；
- 先完成全部 checks 和 report schema/fingerprint 校验，再允许打开临时文件；
- fail report、异常或中断不创建/覆盖 destination；
- pass bytes 与现有文件相同时完全不改写，保证重复执行 checksum 和 mtime 稳定；
- changed pass report 通过 sibling temp、fsync、rename、directory sync 原子替换；
- 默认 check 只在内存重算 expected bytes 并 byte-for-byte 比较；missing/stale 报告失败，
  不调用 writer、不生成 registry、不修复 receipt。

### 6.4 No second Agent narrative gate

M4 不定义 NarrativeCheck 合同、`proceed/revise` 语义、Agent 审核产物或叙事质量 gate。Story、
StoryBeat 与 `ttsChunks` 本来就是 Agent 已完成的创作输入；在同一里程碑再让 Agent判断 Story
完整性、旁白可懂度、字幕表达和整体节奏属于重复审核，不能提供新的机械确定性。

本里程碑只验证可由脚本确定的事实：strict contracts、已有 StoryCheck identity、sealed
narration、SemanticTiming、registry、Baseline、媒体 evidence 和 AutoCheck 自身 drift。未来
若需要独立编辑审阅，必须另立范围和权威来源，不能回填为 M4 完成条件。

## 7. Exact invalidation matrix

所有 destructive mutation 只在 `mkdtemp()` 临时副本或合成 fixture 中执行。真实 M2
content-addressed narration、active manifest、SemanticTiming、M3 registry、receipt、PNG 和
MP4 不作为 mutation target。

表中“保持”指未被该变化拥有的既有身份/真实文件应保持稳定；“变化/失效”指新的期望
fingerprint 必须变化，或旧 persisted 产物必须被识别为 stale。M4 不为负例生成新的权威
旁白或伪造 seal。

| 类别                 | 临时变化                                                             | 必须变化或失效                                                                 | 必须保持                                                                                       | 首个/关键失败 gate                                      |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 上游真实失效         | StorySpec 仅改 title/narrativePurpose，不改 chunks/ownership         | story、StoryCheck、Baseline、generated registry bytes、M3 evidence、AutoCheck  | generation input、sealed narration、SemanticTiming、registry entry fingerprint                 | `story-check`，随后 registry/Baseline/evidence stale    |
| 上游真实失效         | `ttsChunks` 文本、顺序或 meaning ownership                           | story + generation input；旧 seal/timing/Baseline/evidence 全部 stale          | 真实旧 sealed bytes 在 fixture 中不被改写                                                      | `sealed-narration` / `semantic-timing`；不得调用 VoxCPM |
| 上游真实失效         | NarrationSpec voice/allowed controls                                 | generation input；旧 StoryCheck、seal、timing 和全部下游 stale                 | StorySpec 原语义；真实 sealed bytes不改写                                                      | `story-check` / `sealed-narration`                      |
| 上游真实失效         | RenderSpec timing：fps/leadIn/tail                                   | SemanticTiming、registry metadata/entry、Baseline、M3 evidence、AutoCheck      | generation input、sealed narration、complete WAV                                               | `semantic-timing`                                       |
| 上游真实失效         | RenderSpec registration non-timing：compositionId/width/height       | render fingerprint、registry entry、Baseline、M3 evidence、AutoCheck           | generation input、sealed narration、SemanticTiming fingerprint                                 | `project-registry`                                      |
| 上游真实失效         | RenderSpec Baseline-only non-timing：locale/caption safe area/output | render fingerprint、Baseline、generated registry bytes、M3 evidence、AutoCheck | generation input、sealed narration、SemanticTiming、generated entry checksum/entry fingerprint | `project-registry` drift 或 `narrative-baseline`        |
| 上游真实失效         | valid-shape sealed manifest identity change                          | expected sealed fingerprint、timing 和全部下游                                 | Story/generation unless owned input changed；真实 active seal不覆盖                            | `sealed-narration`                                      |
| 媒体损坏             | complete WAV/chunk WAV 缺失或改一 byte                               | physical checksum/measurement validity                                         | persisted manifest/timing/registry fingerprints remain stored but unusable                     | `sealed-narration`                                      |
| generated drift      | SemanticTiming JSON 改 range/duration/fingerprint/one byte           | timing validity、registry/Baseline/evidence/AutoCheck                          | sealed narration + complete WAV                                                                | `semantic-timing`                                       |
| generated drift      | generated registry 手改一 byte、entry 缺失或 identity 不一致         | registry file checksum/drift，M3 receipt/AutoCheck invalid                     | Story、seal、SemanticTiming、expected entry identity                                           | `project-registry`；只读 check 不修复                   |
| runtime invalidation | `NARRATIVE_CORE_VERSION` 变化                                        | Baseline、generated registry bytes、M3 evidence、AutoCheck                     | Story、generation、seal、timing、generated entry checksum/entry fingerprint                    | `narrative-baseline` / registry drift                   |
| 媒体证据缺失         | frame 0 PNG、frame 15 PNG 或 MP4 删除                                | 当前 M3 evidence validity；AutoCheck unavailable/stale                         | M1/M2、registry entry、Baseline identity                                                       | `m3-evidence`                                           |
| 媒体证据损坏         | PNG/MP4 改 byte，或 alpha/codec/fps/frame count 不符                 | actual artifact checksum/facts；old receipt stale                              | M1/M2、registry entry、Baseline identity                                                       | `m3-evidence`                                           |
| check drift          | AutoCheck JSON 手改、删 field、改 fingerprint、缺失                  | persisted AutoCheck validity                                                   | upstream M1–M3 identity                                                                        | default `project:check` AutoCheck drift gate            |

对每个 matrix case，测试必须同时断言：

1. 预期变化的 fingerprint 变化，或旧产物被判 stale；
2. 不属于该变化所有权的 fingerprint 保持相等；
3. 真实/临时 protected input 的 byte snapshot 没被 checker 修改；
4. write mode 失败后最后一份有效 AutoCheck byte-identical；
5. 不出现 provider/private config/network 调用。

## 8. Execution entry after plan approval

下一轮开始时先运行：

```bash
git branch --show-current
git rev-parse HEAD
git status --short --branch
npx prettier --check docs/superpowers/plans/2026-08-02-m4-narrative-baseline-validation-loop.md
```

预期：branch `codex/foundation`，HEAD 仍为完整
`6f5dc78f003b5b9fbf140cd4726e69617607d4a0`，唯一未跟踪路径是本计划。若出现其他用户
修改，保护并精确 staging；只有与当前 Task 文件无法安全协调时才暂停。

在实现前重新捕获保护面：

```bash
sha256sum \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  public/projects/gps-relativity/narration/0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5/complete.wav \
  docs/evidence/2026-08-01-gps-relativity-m2.md \
  src/projects/project-registry.generated.ts \
  src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json \
  docs/evidence/2026-08-01-gps-relativity-m3.md \
  out/gps-relativity/m3-transparent-frame-0.png \
  out/gps-relativity/m3-caption-frame-15.png \
  out/gps-relativity/m3-narrative-baseline.mp4
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run narration:check -- --project gps-relativity
npm run registry:check
```

若 tracked M2/M3 入口与本节不同，先确认是否为已授权的新基线；若只是 drift/corruption，
停止 M4，不调用 VoxCPM、不 reseal、不重写 timing 或 M3 evidence。ignored M3 media若缺失，
这是 M4 proof 的真实 blocker；只能在单独确认现有 M3 source/identity 后按原 M3 固定命令
重建相同类别 evidence，不得伪造。

计划获批后先单独提交本计划：

```bash
git add docs/superpowers/plans/2026-08-02-m4-narrative-baseline-validation-loop.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: add M4 narrative validation plan"
```

随后按 Task 1–7 顺序内联执行；不重复讨论已批准边界，不 push。

---

### Task 1: Define the strict AutoCheck report and fingerprint contract

**Files:**

- Create: `src/contracts/auto-check.ts`
- Modify: `src/contracts/index.ts`
- Create: `tests/contracts/auto-check.test.ts`

**输入/输出：** 只消费已验证后的固定 identity、evidence refs 和固定 check outcomes；输出
strict `NarrativeAutoCheckReport`、RenderSpec/StoryCheck/report fingerprints。无文件 I/O、无
child process、无 registry/evidence读取。

- [ ] **Step 1 — 写 focused failing tests**

覆盖：

- 固定七项 check 顺序、pass/fail aggregate 不变量；
- pass report 所有 identity/checksum 必须非 null；
- fail item 必须有安全原因，pass item 不得有原因；
- evidence IDs、顺序和由 Story ID 推导的 repo-relative path；
- unknown/missing/duplicate/out-of-order checks 和 unknown nested fields 失败；
- `renderSpecFingerprint` 对 timing 与 non-timing 字段都敏感；
- `storyCheckFingerprint` 对 note/status/decision 敏感；
- report fingerprint 只排除自身，修改任一 identity/check/evidence/failure 都 stale；
- 报告拒绝 `/home/`、`/data/`、token、endpoint、`.narration-work`、stack/cause 和自定义
  `out/` reference；
- M2 seal、SemanticTiming 与现有 M3 identities 的 fixtures 精确不变。

- [ ] **Step 2 — 红灯命令**

```bash
node --import tsx --test tests/contracts/auto-check.test.ts
```

预期：FAIL，因为 `src/contracts/auto-check.ts` 尚不存在。

- [ ] **Step 3 — 最小实现**

用 strict Zod objects、固定 arrays 和现有 `createFingerprint()` 实现第 6.1–6.3 节。不要
实现 runner、文件读写、CLI 或通用 report base class。允许局部私有 helper，但不建立通用
工作流抽象。

- [ ] **Step 4 — 绿灯与聚焦验证**

```bash
node --import tsx --test tests/contracts/auto-check.test.ts
npm run typecheck
npx eslint src/contracts/auto-check.ts src/contracts/index.ts tests/contracts/auto-check.test.ts
git diff --check
git diff --exit-code -- \
  src/contracts/sealed-narration.ts \
  src/contracts/semantic-timing.ts \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json
```

预期：全部 exit 0；M1/M2 时间合同与产物无 diff。

- [ ] **Step 5 — 建议 commit**

```bash
git add src/contracts/auto-check.ts src/contracts/index.ts tests/contracts/auto-check.test.ts
git commit -m "feat: define narrative auto check contract"
```

---

### Task 2: Add a read-only M3 evidence drift checker

**Files:**

- Modify: `scripts/baseline/evidence.ts`
- Modify: `tests/baseline/evidence.test.ts`

**输入/输出：** 复用 M3 receipt schema、registry check、fixed PNG/MP4 paths 和 FFmpeg/ffprobe。
新增 current receipt collection 与 persisted receipt read-only comparison；保留原 writer 行为和
`baseline:evidence` CLI，不改 M3 receipt/media bytes。

- [ ] **Step 1 — 写 focused failing tests**

新增测试：

- `collectCurrentM3NarrativeBaselineEvidence()` 只返回严格 current receipt；
- `checkM3NarrativeBaselineEvidence()` 读取 persisted receipt、重算 expected，并做 canonical/
  byte-equivalent drift check；
- read-only check 成功和失败都不调用 writer、不改变 receipt mtime/bytes；
- missing receipt、receipt field drift、artifact checksum drift、PNG missing/corrupt/opaque、MP4
  missing/wrong codec/fps/frame count、registry drift、upstream identity mismatch 全部失败；
- current entry 从传入 `rootDir` 的 fixed discovery/validated entry 解析，不依赖 import 当前
  checkout 的 static registry，从而支持临时副本；
- 现有 writer 只在 collection 全部成功后原子写，且继续生成同一 M3 receipt bytes；
- 不接受任意 artifact/destination/root CLI 参数。

- [ ] **Step 2 — 红灯命令**

```bash
node --import tsx --test tests/baseline/evidence.test.ts
```

预期：FAIL，因为独立 read-only checker 尚不存在。

- [ ] **Step 3 — 最小实现**

把当前 `writeM3NarrativeBaselineEvidence()` 拆成：

```text
resolveCurrentM3Entry(rootDir, storyId)
collectCurrentM3NarrativeBaselineEvidence(...)
checkM3NarrativeBaselineEvidence(...)
writeM3NarrativeBaselineEvidence(...) = collect + existing atomic writer
```

`checkM3...` 不调用 `writeM3...`。先 `generateProjectRegistry({mode:"check"})`，再从当前
root 的 `discoverProjectEntries()`/`loadProjectRegistrationEntry()` 得到 expected entry；不
调用 `registry:generate`。保持 M3 的固定 `GpsRelativity`/30/1731 evidence 合同，不借机泛化
为任意媒体框架。

- [ ] **Step 4 — 绿灯与 M3 byte-protection verification**

```bash
node --import tsx --test tests/baseline/evidence.test.ts
npm run typecheck
npx eslint scripts/baseline/evidence.ts tests/baseline/evidence.test.ts
npm run registry:check
sha256sum \
  src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json \
  out/gps-relativity/m3-transparent-frame-0.png \
  out/gps-relativity/m3-caption-frame-15.png \
  out/gps-relativity/m3-narrative-baseline.mp4
git diff --exit-code -- \
  src/projects/project-registry.generated.ts \
  src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json \
  docs/evidence/2026-08-01-gps-relativity-m3.md
git diff --check
```

预期：receipt/media checksums 仍等于第 1.2 节，tracked M3 artifacts 无 diff。

- [ ] **Step 5 — 建议 commit**

```bash
git add scripts/baseline/evidence.ts tests/baseline/evidence.test.ts
git commit -m "feat: add read only M3 evidence check"
```

---

### Task 3: Aggregate existing M1–M3 checks into an in-memory project AutoCheck

**Files:**

- Create: `scripts/project-check/domain.ts`
- Create: `scripts/project-check/project-files.ts`
- Create: `scripts/project-check/run.ts`
- Create: `tests/project-check/domain.test.ts`
- Create: `tests/project-check/project-check.test.ts`

**输入/输出：** 消费 fixed project slug/root、现有 project source/StoryCheck loader、M2 checker、
registry domain/check、Task 2 read-only M3 checker；输出 strict in-memory AutoCheck。此 Task 不写
AutoCheck、不加 package CLI。

- [ ] **Step 1 — 写 focused failing tests**

测试必须证明：

- real/synthetic current GPS fixture 得到七项按序 pass；
- source contract、StoryCheck、sealed narration、timing、registry、Baseline、M3 receipt 的
  结果各自归入唯一 fixed check；
- identity 包含 full RenderSpec、StoryCheck、M2、registry、runtime、Baseline、M3 evidence；
- evidence refs 只含固定 tracked paths/content-addressed complete WAV，不含 `out/` 展开、
  `.narration-work` 或 absolute root；
- missing/malformed/stale/checksum mismatch/registry drift/media invalid 被映射为固定安全 code；
- raw Error message、stack、cause、临时根目录、token/endpoint 模拟值不进入 report；
- 一个 check 失败时返回 strict fail report，仍保留可安全计算的其他 check outcomes，不 throw
  出包含私有路径的聚合 JSON；
- `runNarrativeAutoCheck()` 不调用 registry writer、M3 writer、narration seal/provider 或网络。

- [ ] **Step 2 — 红灯命令**

```bash
node --import tsx --test \
  tests/project-check/domain.test.ts \
  tests/project-check/project-check.test.ts
```

预期：FAIL，因为 `scripts/project-check/` 尚不存在。

- [ ] **Step 3 — 最小实现**

`project-files.ts` 只允许：

```text
src/projects/<slug>/{brief,story,narration,render}.json
src/projects/<slug>/reviews/story-check.json
src/projects/<slug>/generated/{sealed-narration,semantic-timing,narrative-baseline-evidence}.generated.json
src/projects/project-registry.generated.ts
manifest 指向的 content-addressed public narration files
```

复用 `loadNarrationProjectFiles()` 和 `checkM2NarrationArtifacts()`；不要复制 M2 PCM 逻辑。
复用 `loadProjectRegistrationEntry()`、`createValidatedProjectRegistrationEntry()` 和
`generateProjectRegistry({mode:"check"})`；不要 parse/guess generated TypeScript。复用 Task 2
read-only M3 checker；不要调用 writer。

`domain.ts` 只定义固定 safe failure mapping、identity/evidence assembly 和 check ordering；
不得变成通用 workflow/check registry。

- [ ] **Step 4 — 绿灯与 side-effect boundary verification**

```bash
node --import tsx --test \
  tests/project-check/domain.test.ts \
  tests/project-check/project-check.test.ts
npm run typecheck
npx eslint scripts/project-check tests/project-check/domain.test.ts tests/project-check/project-check.test.ts
! rg -n "RSP_VOXCPM|voxcpm|generate-runner|seal-runner|narration:seal|registry:generate|writeM3Narrative|fetch\(|https?://|\.narration-work" \
  scripts/project-check
git diff --check
```

预期：focused tests/typecheck/lint 通过；production search 不出现 provider、writer、network 或
ignored candidate workspace 依赖。

- [ ] **Step 5 — 建议 commit**

```bash
git add scripts/project-check tests/project-check/domain.test.ts tests/project-check/project-check.test.ts
git commit -m "feat: aggregate narrative project checks"
```

---

### Task 4: Add pass-only persistence and the strict CLI

**Files:**

- Create: `scripts/project-check/report-files.ts`
- Create: `scripts/project-check/cli.ts`
- Create: `tests/project-check/report-files.test.ts`
- Create: `tests/project-check/cli.test.ts`
- Modify: `package.json`

**输入/输出：** 在 Task 3 in-memory report 上增加固定 destination、stable atomic pass writer、
read-only drift check 和两种 exact CLI forms；默认 gate 只校验 current AutoCheck。

- [ ] **Step 1 — 写 focused failing tests**

覆盖：

- pass report canonical pretty JSON + one newline；首次写入原子完成；相同 bytes 重跑不改 mtime；
- fail report、异常、schema/fingerprint failure 都不创建或覆盖 destination；
- read-only mode 对 missing、malformed、fingerprint stale、one-byte drift 失败且不修复；
- 默认 CLI 重算 current AutoCheck 并与 persisted AutoCheck 做 strict/byte drift check；missing、
  malformed、stale 或 aggregate fail 均 exit failure；
- `--write-auto-check` 只写通过的 AutoCheck；
- 两个 exact args form 成功；unknown project、`final`、重排/重复/额外 flag、path/output/root/
  repair 参数失败；
- stdout 只输出 storyId、level、aggregate status 和 AutoCheck fingerprint；
  stderr 只输出安全 fixed failure，不输出 absolute root/stack/provider data；
- writer destination 由 Story ID 固定推导，caller 不能覆盖。

- [ ] **Step 2 — 红灯命令**

```bash
node --import tsx --test \
  tests/project-check/report-files.test.ts \
  tests/project-check/cli.test.ts
```

预期：FAIL，因为 persistence/CLI 尚不存在。

- [ ] **Step 3 — 最小实现**

实现：

```text
writeNarrativeAutoCheckIfPassed()
checkPersistedNarrativeAutoCheck()
runProjectCheckCli()
```

原子写可复用 `scripts/narration/adapters/atomic-files.ts` 的 approved primitive，但先比较 bytes，
相同不写。默认 CLI 永不进入 writer。

`package.json` 添加：

```json
{
  "project:check": "node --import tsx scripts/project-check/cli.ts",
  "test": "<existing globs> tests/project-check/*.test.ts"
}
```

此 Task 暂不把 `project:check` 加入 `npm run check`，因为真实 AutoCheck 要到 Task 6 才存在，
避免中间提交故意留下 full gate 红灯。

- [ ] **Step 4 — 绿灯与 CLI boundary verification**

```bash
node --import tsx --test \
  tests/project-check/report-files.test.ts \
  tests/project-check/cli.test.ts
npm test
npm run typecheck
npx eslint scripts/project-check tests/project-check
! node --import tsx scripts/project-check/cli.ts --project gps-relativity --level final
git diff --check
```

预期：tests/typecheck/lint pass；最后的 `final` 命令必须非零并给安全 unknown-level 错误；真实
default gate 此时因 M4 AutoCheck 尚不存在而 fail closed，这是预期的 Task 6 red entry，不是用
placeholder 绕过。

- [ ] **Step 5 — 建议 commit**

```bash
git add scripts/project-check/report-files.ts scripts/project-check/cli.ts
git add tests/project-check/report-files.test.ts tests/project-check/cli.test.ts package.json
git commit -m "feat: add narrative project check CLI"
```

---

### Task 5: Prove the full invalidation matrix in isolated fixtures

**Files:**

- Create: `tests/fixtures/m4-project.ts`
- Create: `tests/project-check/invalidation.test.ts`
- Modify: `scripts/project-check/domain.ts`
- Modify: `scripts/project-check/run.ts`
- Modify: `scripts/project-check/report-files.ts`
- Modify only if a discovered classification gap requires it:
  `tests/project-check/domain.test.ts`, `tests/project-check/project-check.test.ts`,
  `tests/project-check/report-files.test.ts`

**输入/输出：** 创建完全独立的 `mkdtemp()` GPS fixture，复制 tracked M1–M3 source/sealed
inputs到临时根；用小型 synthetic M3 media bytes + injected FFmpeg/ffprobe facts 建立可变 evidence。
所有 mutation 和 write-failure proof 发生在临时根，真实仓库只读。

- [ ] **Step 1 — 建立 fixture 并写 matrix failing tests**

fixture helper 必须：

- 在 temp root 复制 `gps-relativity` source、StoryCheck、manifest、SemanticTiming、Composition
  和 content-addressed narration；
- 在 temp root 生成 expected registry；
- 用固定 synthetic PNG/MP4 bytes 与 injected process facts生成 temp M3 receipt；
- 生成一份 valid temp AutoCheck；
- 在每个 test 后递归删除**仅该 mkdtemp 返回的精确目录**；
- 暴露 protected byte snapshots 和 identity snapshot；
- 不读取/复制私有 config 或 `.narration-work`。

按第 7 节每一行写独立 test。至少拆出：Story semantic-only、ttsText/order、NarrationSpec、
Render timing、Render registration non-timing、Render Baseline-only non-timing、manifest、chunk/
complete WAV、SemanticTiming、registry byte、runtime version、两张 PNG、MP4 和 AutoCheck drift。

- [ ] **Step 2 — 红灯命令**

```bash
node --import tsx --test tests/project-check/invalidation.test.ts
```

预期：新 matrix 至少暴露尚未实现的精确 failure classification、partial identity 或
no-overwrite guarantee；不得通过弱化断言、删除 case 或修改真实 artifacts 解决。

- [ ] **Step 3 — 最小修正**

只在列出的 M4 domain/run/report-files 中补齐暴露的 gap：固定 safe code、正确 stable/null
identity、依赖 check 失败传播、pass-only write guard 或 read-only no-repair。不要修改 M1–M3
fingerprint 算法，不新增通用 invalidation engine。

runtime version case 使用纯 fingerprint 输入/fixture identity 注入证明：core version 变化只
改变 Baseline 及其下游；不在真实源码里临时改版本常量。

- [ ] **Step 4 — 绿灯与真实保护面验证**

```bash
node --import tsx --test tests/project-check/invalidation.test.ts
node --import tsx --test tests/project-check/*.test.ts
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run narration:check -- --project gps-relativity
npm run registry:check
sha256sum \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  public/projects/gps-relativity/narration/0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5/complete.wav \
  src/projects/project-registry.generated.ts \
  src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json \
  out/gps-relativity/m3-transparent-frame-0.png \
  out/gps-relativity/m3-caption-frame-15.png \
  out/gps-relativity/m3-narrative-baseline.mp4
npm run typecheck
npx eslint scripts/project-check tests/project-check tests/fixtures/m4-project.ts
git diff --check
```

预期：matrix/focused checks pass；真实 checksums 仍等于第 1 节。

- [ ] **Step 5 — 建议 commit**

```bash
git add tests/fixtures/m4-project.ts tests/project-check/invalidation.test.ts
git add scripts/project-check/domain.ts scripts/project-check/run.ts scripts/project-check/report-files.ts
git add tests/project-check/domain.test.ts tests/project-check/project-check.test.ts tests/project-check/report-files.test.ts
git commit -m "test: prove narrative invalidation boundaries"
```

若三份既有 test 未修改，不要将它们加入 staging。

---

### Task 6: Close the first real M4 proof with GPS Relativity

**Files:**

- Create at runtime:
  `src/projects/gps-relativity/generated/narrative-auto-check.generated.json`
- Create: `docs/evidence/2026-08-02-gps-relativity-m4.md`
- Modify: `package.json`

**Test files（本 Task 只复验，不修改）：**

- `tests/contracts/auto-check.test.ts`
- `tests/project-check/project-check.test.ts`
- `tests/project-check/report-files.test.ts`
- `tests/project-check/invalidation.test.ts`

**输入/输出：** 使用当前真实 M1–M3 文件和 ignored M3 PNG/MP4；生成 pass AutoCheck 并记录
脱敏 closure evidence。不得重渲染或修改 M3 media 来迁就 checker。

**最小落地：** 只增加一份真实 AutoCheck、一份脱敏 M4 evidence，并在机械检查通过后把真实 gate
接入 `npm run check`；不修改 checker implementation、M2/M3 artifacts 或 runtime。

- [ ] **Step 1 — 运行真实 red gate**

```bash
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- \
  --project gps-relativity --level narrative
```

预期：非零，因为真实 AutoCheck 尚不存在；M1–M3 mechanical facts仍可通过，
且命令不写任何报告。

- [ ] **Step 2 — 生成真实 pass AutoCheck**

```bash
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- \
  --project gps-relativity --level narrative --write-auto-check
```

检查生成 JSON：七项 pass，identity 与第 1 节完全一致，evidence refs 只有固定 repo-relative
tracked/content-addressed paths，无私有字段、absolute path、out 展开或 ignored workspace。

- [ ] **Step 3 — 运行真实 green gate 和重复稳定性 proof**

```bash
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- \
  --project gps-relativity --level narrative
sha256sum \
  src/projects/gps-relativity/generated/narrative-auto-check.generated.json
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- \
  --project gps-relativity --level narrative --write-auto-check
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- \
  --project gps-relativity --level narrative
sha256sum \
  src/projects/gps-relativity/generated/narrative-auto-check.generated.json
```

预期：全部 pass；前后 checksum 相同；相同 AutoCheck write 不改 mtime；两个只读 gate 不
修改任何文件。Task 5 已以 temp copy 证明失败不会覆盖最后一个有效 AutoCheck。

- [ ] **Step 4 — 写脱敏 M4 human evidence**

`docs/evidence/2026-08-02-gps-relativity-m4.md` 记录：

- M3 entry HEAD、112-test baseline 与两个 Composition metadata；
- M2 protected entry checksums/identities；
- M3 registry/Baseline/evidence/media identities；
- AutoCheck report checksum/fingerprint、七项结果、重复稳定性；
- invalidation matrix categories 与代表性 temp proof；
- read-only/no-repair、failed-write no-overwrite、no-provider/no-private/no-network 事实；
- M4 不执行二次 Agent 叙事质量审核，不创建 subjective review report；
- M4 未开始 Scene/BaseCanvas/任何增强轨，M5 仍需单独计划。

不记录绝对本机路径、provider、private config、candidate workspace 或超出事实的创意声明。

- [ ] **Step 5 — 将真实 gate 纳入完整 `npm run check`**

仅在真实 AutoCheck 存在且 green 后，把 package `check` 的最后一项增加为：

```text
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
```

保持 `registry:check` 在 `build` 之前，避免 prebuild generation 掩盖 drift。

- [ ] **Step 6 — 聚焦验证与隐私检查**

```bash
node --import tsx --test tests/contracts/auto-check.test.ts
node --import tsx --test tests/project-check/*.test.ts
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
! rg -n "/home/|/data/|/srv/|RSP_VOXCPM|Bearer |token|endpoint|referenceAudio|\.narration-work|candidate|measured" \
  src/projects/gps-relativity/generated/narrative-auto-check.generated.json
! rg -n "/home/|/data/|/srv/|Bearer [A-Za-z0-9]|VOXCPM.*TOKEN=.+|referenceAudioPath" \
  docs/evidence/2026-08-02-gps-relativity-m4.md
git diff --check
```

预期：tests/gate pass；AutoCheck JSON 无任何 private/provider/workspace match；human evidence 可
描述“不调用 VoxCPM”等公开边界，但不得包含私有路径、credential value 或 reference path。

- [ ] **Step 7 — 建议 commit**

```bash
git add src/projects/gps-relativity/generated/narrative-auto-check.generated.json
git add docs/evidence/2026-08-02-gps-relativity-m4.md package.json
git diff --cached --check
git commit -m "test: close gps relativity narrative validation loop"
```

---

### Task 7: Synchronize authority docs and run the complete M4 gate

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/contracts/NARRATIVE_CONTRACTS.md`
- Modify: `docs/PRODUCTION_WORKFLOW.md`
- Modify: `docs/ITERATION_STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DETERMINISTIC_EXECUTION.md`
- Modify: `docs/TERMINOLOGY.md`
- Verify unchanged unless a real contradiction is found: `docs/FINAL_PRODUCT_GOAL.md`
- Verify unchanged unless usage needs one narrow forward link:
  `docs/NARRATION_GENERATION.md`

**Test files（本 Task 只 fresh rerun，不修改）：**

- `tests/contracts/auto-check.test.ts`
- `tests/baseline/evidence.test.ts`
- `tests/project-check/*.test.ts`

**输入/输出：** 只根据 Tasks 1–6 已验证代码、报告、matrix 和真实 gate 更新状态。把 M4 标为
完成，把 M5 视觉规格保留为下一份单独计划；不开始 M5 实现。

**最小落地：** 只把已验证的 M4 repo truth 同步到列出的 usage/authority docs；目标定义
仍准确的文件保持不变，不借文档收口扩展 M5 设计。

- [ ] **Step 1 — 文档 red search**

```bash
rg -n "M4 尚未开始|M4 计划审阅为下一步|AutoCheck.*尚未实现|project:check.*未实现|当前唯一下一步.*M4|M4.*NarrativeCheck|NarrativeCheck.*M4" \
  AGENTS.md README.md docs/README.md docs/PRODUCTION_WORKFLOW.md \
  docs/ITERATION_STATUS.md docs/ROADMAP.md docs/ARCHITECTURE.md \
  docs/DETERMINISTIC_EXECUTION.md docs/TERMINOLOGY.md
```

预期：找到 M4 前状态，这是代码/evidence green 后的 intentional documentation-red。

- [ ] **Step 2 — 同步 usage/contracts**

- README/docs README：增加两个 exact `project:check` forms，解释 write AutoCheck 与 default
  read-only mechanical gate；链接 M4 evidence；不声称 final/Scene/approval/release 已实现。
- `NARRATIVE_CONTRACTS.md`：记录 AutoCheck shape、fingerprint、pass-only write、read-only drift
  和 invalidation dependency，并明确 M4 不增加二次 Agent 叙事审核。
- `TERMINOLOGY.md`：新增 AutoCheck 最小定义；不新增 Agent 审核报告术语。
- `NARRATION_GENERATION.md` 仅在需要时补充 M4 只读消费 `narration:check` 的链接；不改 M2
  generation/seal/recovery 语义。

- [ ] **Step 3 — 同步全部 authority status**

- `AGENTS.md`：M1–M4 完成；M2 sealed narration/SemanticTiming 继续受保护；下一步只允许另写
  并审阅 M5 视觉规格计划。
- `PRODUCTION_WORKFLOW.md`：AutoCheck 移入已实现主链，并移除 NarrativeCheck 作为 M4 gate 的
  目标描述；保持增强轨、Final Preview/Approval/Release future。
- `ITERATION_STATUS.md`：记录 exact command/report/evidence/matrix 事实；从未完成移除 M4，
  不把 M5+ 写成已实现。
- `ROADMAP.md`：M4 complete、Gate A pass only if current evidence remains valid；M5 planning next。
- `ARCHITECTURE.md`：列出 `src/contracts/auto-check.ts`、`scripts/project-check/`、read-only M3
  checker 和 report path；检查 runtime 仍不调用 Agent。
- `DETERMINISTIC_EXECUTION.md`：将 narrative `project:check` 标为实现，固定 check order、
  pass-only write/read-only default 与 failure semantics；`final` 仍是未来目标。
- `FINAL_PRODUCT_GOAL.md`：只检查冲突；若目标定义仍准确，不 churn。

- [ ] **Step 4 — 全部 fresh final gates**

先分别运行，保留失败层：

```bash
node --import tsx --test tests/contracts/auto-check.test.ts
node --import tsx --test tests/baseline/evidence.test.ts tests/project-check/*.test.ts
npm test
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run narration:check -- --project gps-relativity
npm run typecheck
npm run lint
npm run registry:check
npm run build
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run compositions
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
npm run check
git diff --check
```

预期：

- focused M4 tests、完整 test suite、narration checker、typecheck、lint、registry drift、bundle、
  listing、真实 project check 与 composed `npm run check` 全部 exit 0；
- listing 仍只有 `CapabilityGallery` 150 frames 与 `GpsRelativity` 1731 frames；
- `npm run check` 中 build 的 prehook 不掩盖 drift，因为更早的 registry check 已通过；
- project check 不修改 reports、registry、M2/M3 artifacts。

- [ ] **Step 5 — privacy/tracked-output gate**

```bash
git ls-files .narration-work out .env .env.local private
! git grep -n -E "Bearer [A-Za-z0-9]|VOXCPM.*TOKEN=.+|referenceAudioPath.*(/home/|/data/|/srv/)" \
  -- . ':!docs/superpowers/plans/2026-08-01-m2-real-narration-generation-sealing.md'
! rg -n "/home/|/data/|/srv/|Bearer |token|endpoint|referenceAudio|\.narration-work" \
  src/projects/gps-relativity/generated/narrative-auto-check.generated.json
```

预期：ignored/private probe 无 tracked files，secret scan 无真实敏感值，AutoCheck 无 match。

- [ ] **Step 6 — M2/M3 protected-surface diff and checksum gate**

```bash
git diff --exit-code 6f5dc78f003b5b9fbf140cd4726e69617607d4a0 -- \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  public/projects/gps-relativity/narration \
  docs/evidence/2026-08-01-gps-relativity-m2.md \
  src/contracts/narrative-baseline.ts \
  src/remotion/runtime/narrative-core \
  src/remotion/runtime/composition-assembly \
  src/projects/gps-relativity/Composition.tsx \
  src/projects/project-registry.generated.ts \
  src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json \
  src/Root.tsx \
  docs/evidence/2026-08-01-gps-relativity-m3.md
sha256sum \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  public/projects/gps-relativity/narration/0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5/complete.wav \
  src/projects/project-registry.generated.ts \
  src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json \
  out/gps-relativity/m3-transparent-frame-0.png \
  out/gps-relativity/m3-caption-frame-15.png \
  out/gps-relativity/m3-narrative-baseline.mp4
```

预期：protected tracked diff 为空；checksums 等于第 1 节。`scripts/baseline/evidence.ts` 不在
M3 code diff prohibition 中，因为 Task 2 只新增获批的 read-only validator；M3 receipt/media
仍不变。

- [ ] **Step 7 — no-M5 leakage gate**

```bash
git diff --name-only 6f5dc78f003b5b9fbf140cd4726e69617607d4a0 -- src scripts tests package.json public
! rg -n "SceneVisualPlan|ShotPlan|ScenePackage|RendererRegistry|rendererId|ResourceCatalog|BaseCanvas|StoryVisualTrack|SoundDesignTrack|GlobalVisualLayers|StoryBeatTransition|SceneVisualCheck|FinalPreviewApproval|release|publish" \
  src/contracts/auto-check.ts scripts/project-check
! rg -n "RSP_VOXCPM|voxcpm|fetch\(|https?://|MCP|skill|Agent" scripts/project-check
git diff --check
```

预期：implementation diff 仅为 locked M4 files、Task 2 narrow M3 checker extension、package
scripts 和 evidence；production boundary searches 无越界实现。

- [ ] **Step 8 — 文档绿灯与建议 commit**

重跑 Step 1 search。active status 不得再说 M4 未实现；历史描述必须明确是 prior state。

```bash
git add AGENTS.md README.md docs/README.md docs/contracts/NARRATIVE_CONTRACTS.md
git add docs/PRODUCTION_WORKFLOW.md docs/ITERATION_STATUS.md docs/ROADMAP.md
git add docs/ARCHITECTURE.md docs/DETERMINISTIC_EXECUTION.md docs/TERMINOLOGY.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "docs: close M4 narrative validation milestone"
```

只有发现真实冲突才精确 stage `docs/FINAL_PRODUCT_GOAL.md` 或
`docs/NARRATION_GENERATION.md`。commit 后停止；不开始 M5，不 push。

---

## 9. M4 completion evidence checklist

M4 只有在以下全部同时成立时完成：

- [ ] M4 入口仍可追溯到 HEAD
      `6f5dc78f003b5b9fbf140cd4726e69617607d4a0`，计划开始时基线 112/112 tests 与两个
      Composition metadata 已记录；
- [ ] M2 manifest、SemanticTiming、complete WAV、M2 evidence 的入口 checksum 与 fingerprint
      保持不变；
- [ ] M4 全程没有调用 VoxCPM、generate、seal、supersede，没有重算/改写 SemanticTiming；
- [ ] M3 registry file、generated entry、registry entry、Baseline、receipt、PNG/MP4 和 M3
      evidence identities 保持不变；
- [ ] AutoCheck strict schema、fixed check order、input identity、evidence refs、failure reasons 和
      report fingerprint 有测试；
- [ ] AutoCheck write 只允许 pass，canonical/stable/atomic；失败不覆盖有效报告；默认 check
      只读且不修复 drift；
- [ ] `project:check` 只接受两种 exact CLI forms、current project 和 `narrative` level；所有
      unknown 参数/identity/drift fail closed；
- [ ] project check 不调用 provider、Agent、skill、MCP 或网络，不接受 caller path；
- [ ] M4 不包含二次 Agent 叙事质量审核、NarrativeCheck 合同、`proceed/revise` 或 subjective
      review report；
- [ ] isolated matrix 覆盖 StorySpec、ttsChunks、NarrationSpec、RenderSpec timing/non-timing、
      sealed narration、SemanticTiming、registry、runtime version、PNG/MP4 和 AutoCheck report；
- [ ] matrix 明确区分 upstream invalidation、generated drift、media missing/corruption、
      AutoCheck/report drift，并逐行证明 change/stable/gate；
- [ ] matrix 不修改真实 artifacts、不调用 VoxCPM、不伪造新权威旁白；
- [ ] gps-relativity 真实 AutoCheck 已生成、脱敏、tracked；
- [ ] 同输入重复 write/check checksum 稳定，只读 check 不写，失败不覆盖最后有效 report；
- [ ] focused tests、完整 `npm test`、narration checker、typecheck、lint、registry check、build、
      Composition listing、真实 project check、`npm run check`、privacy、protected diff、
      `git diff --check` 全部通过；
- [ ] authority docs 只把 M4 标为完成，把 M5 视觉规格保留为下一份单独计划；
- [ ] 没有 Scene/BaseCanvas/visual/sound/global/transition/approval/release 实现泄漏；
- [ ] 每个实施 Task 按精确路径提交，本地无意外文件，无 push。

## 10. Failure recovery

- **出现无关用户修改：** 保留，不 reset；只 stage Task exact paths。只有与 active Task 同一
  文件且无法安全协调时暂停。
- **M2 narration check 失败：** 立即停止 M4。报告具体 stale/corrupt 层；不调用 VoxCPM、
  不 reseal、不运行 supersede、不改 timing。M2 恢复必须单独授权。
- **SemanticTiming 失败：** 把它视为受保护权威失效；不从秒数或 WAV 在 M4 中生成替代
  timing，不手改 JSON。
- **registry drift：** 默认/check mode 不修复。确认是 intentional source change 后，在拥有
  该变化的独立阶段重新生成；M4 negative fixture 永不改真实 registry。
- **M3 receipt 或 media 失败：** read-only checker 不写 receipt，不覆盖 PNG/MP4。缺失真实
  ignored evidence 是 proof blocker；不能仅改 checker 期望或伪造 checksum。
- **AutoCheck mechanical failure：** 输出 strict redacted fail result，保留最后有效 persisted
  AutoCheck byte-identical；修复 owned upstream 后再显式 `--write-auto-check`。
- **AutoCheck drift：** 默认 gate 只报告 drift。只有全部 current checks pass 时才允许显式
  write；不提供 `--repair`。
- **FFmpeg/ffprobe 不可用：** 报告 host dependency blocker；不跳过媒体 check、不使用 Docker、
  不把 persisted receipt 当作无需复验的真相。
- **报告写入中断：** sibling temp 可安全清理；destination 必须仍为旧有效 bytes 或不存在。
  先跑 read-only check，再重试 explicit write。
- **文档与代码冲突：** 以当前 executable code、tests、reports 和真实 evidence 为 repo truth；
  只同步 M4 status，不扩 scope。

## 11. Plan self-review record

### 11.1 Scope review

| 要求                | 计划落点                                                                |
| ------------------- | ----------------------------------------------------------------------- |
| 固定 M1–M3 基线     | 第 1 节完整 HEAD、112 tests、Composition、M2/M3 checksums/fingerprints  |
| 保护 M2 时间权威    | 全局约束、Tasks 3/5/7、completion/failure recovery                      |
| 作品级 CLI          | 第 4 节、Tasks 3–4，只有 narrative/default check 与 write-auto 两种形式 |
| AutoCheck 严格产物  | 第 6.1–6.3 节、Tasks 1/4                                                |
| 无二次 Agent 审核   | 第 2、3、6.4 节、Tasks 6–7                                              |
| 真实失效矩阵        | 第 7 节、Task 5                                                         |
| 真实 GPS 闭环       | Task 6                                                                  |
| TDD/小 Task/commit  | Tasks 1–7 的 red/minimal/green/focused/commit                           |
| 最终 gates/doc sync | Task 7、第 9 节                                                         |
| M4/M5 硬边界        | 全局约束、Task 7、self-review 11.5                                      |

### 11.2 Interface review and corrections

- **发现：** 现有 `baseline:evidence` 只有“重算并写”路径，若被 project check 直接复用会
  违反只读/no-repair 边界。**修正：** Task 2 先抽出 independent collector + persisted receipt
  checker；M4 默认 gate 只调用 read-only path。
- **发现：** 如果 fail report 与 pass report共用无条件 writer，真实失效测试可能覆盖最后
  有效 evidence。**修正：** 合同允许 strict fail report用于安全输出，persistence adapter
  明确 pass-only，且 Tasks 4–5 测 byte/mtime no-overwrite。
- **发现：** 原计划让 Agent 再验证由 Agent 已完成的 Story/`ttsChunks` 创作，会产生重复的
  subjective gate，却没有新的确定性权威。**修正：** 完全移除 NarrativeCheck 合同、报告、
  `proceed/revise` 和真实 Agent 复核步骤；M4 只保留脚本 AutoCheck。
- **发现：** 一个通用 check registry/level framework 会提前泄漏 final/M5。**修正：** fixed
  arrays、fixed paths、fixed narrative literal、无 plugin/DSL。
- **发现：** `rg`/拒绝参数测试在“无匹配/正确拒绝”时会以非零状态表达成功，若直接放入
  green gate 容易被误判。**修正：** 所有负向边界命令显式使用 `! rg` / `! command`，让
  预期拒绝转换为 gate exit 0。

### 11.3 Invalidation review and corrections

- **发现：** “RenderSpec non-timing”不是单一传播：width/height/compositionId 改 registry
  entry，而 locale/caption/output 只改 Baseline/registry generated bytes。**修正：** matrix
  拆成 registration non-timing 与 Baseline-only non-timing 两行，并分别声明稳定身份。
- **发现：** ttsChunks/NarrationSpec 负例若生成新 seal 会违反 no-VoxCPM/no-fake-authority。
  **修正：** fixture 保留旧 sealed bytes，证明旧 seal/timing stale；不产生新权威 fingerprint。
- **发现：** runtime version 与 registry entry fingerprint 所有权不同。**修正：** core version
  只改 Baseline/registry bytes/evidence，generated entry checksum/entry fingerprint 保持。
- **发现：** missing/corrupt media 不应反向改变 Baseline。**修正：** matrix 明确只使 M3
  evidence/AutoCheck gate失败，M1–M3 upstream identity保持。

### 11.4 Privacy review and corrections

- AutoCheck 只存 fixed repo-relative tracked/content-addressed refs，不复制 absolute root、
  raw error、stack/cause 或 `.narration-work`。
- 为避免重复暴露 ignored `out/` 细节，AutoCheck 只引用 tracked M3 receipt；PNG/MP4 仍由
  receipt fingerprint 间接绑定并由 read-only checker 实测。
- CLI 的 safe failure code/message 与原始 error 分离；测试显式注入 token、endpoint、absolute
  temp path，断言它们不进入 JSON/stdout/stderr。
- private config environment 在真实 gate 显式 unset；代码本身不读取该变量。

### 11.5 M4/M5 boundary review

- M4 只收口 Narrative Baseline 的机械身份，不做批量 Agent 叙事审核。
- M4 不实现 `final` level、SceneVisualCheck、FinalPreviewApproval、发布或用户 approval receipt。
- M4 不创建 SceneVisualPlan、ShotPlan、ScenePackage、RendererRegistry、ResourceCatalog、
  BaseCanvas、StoryVisualTrack、SoundDesignTrack、GlobalVisualLayers、转场或资产查询。
- M4 完成后只允许单独编写/审阅 M5 视觉规格计划；不能在本计划尾部顺手开始 M5。

## 12. Inline execution checklist

- [ ] 捕获并核对 branch/HEAD/status、M2/M3 checksums、112 tests 与 Composition listing
- [ ] 单独提交获批 M4 plan
- [ ] Task 1：AutoCheck strict contract/fingerprint
- [ ] Task 2：M3 evidence independent read-only check
- [ ] Task 3：M1–M3 in-memory project aggregation
- [ ] Task 4：pass-only atomic AutoCheck + strict CLI
- [ ] Task 5：isolated full invalidation matrix
- [ ] Task 6：real gps-relativity AutoCheck/evidence
- [ ] Task 7：authority docs + complete fresh gates
- [ ] 最终确认 M2/M3 protected diff、privacy、no-M5 leakage、clean worktree
- [ ] 停止，不开始 M5，不 push

## 13. Copyable prompt for the next inline execution turn

```text
请继续维护仓库：

/data/projects/repos/remotion-story-producer

请先读取 AGENTS.md、README、全部权威文档，以及：

- docs/superpowers/plans/2026-08-02-m4-narrative-baseline-validation-loop.md
- docs/evidence/2026-08-01-gps-relativity-m2.md
- docs/evidence/2026-08-01-gps-relativity-m3.md

先以 repo truth 核对 branch、HEAD、git status、M2/M3 protected checksums、现有测试数量和
Composition listing。预期入口是 codex/foundation / 6f5dc78f003b5b9fbf140cd4726e69617607d4a0，
但不要把预期直接当事实。

如果计划仍未提交，先只提交计划文件，commit message：
docs: add M4 narrative validation plan

然后严格按计划 Task 1–7 在当前线程 inline execution：每个 Task 先写 focused failing test，
记录真实 red reason，再做最小实现，跑该 Task 的 green/focused/protection gates，精确 staging
并本地 commit。不要使用 subagent、plan-runner、executing-plans 或其他 skill。scope 已批，
除非遇到 repo truth 无法解决的真实 blocker，否则不要停下来询问。

硬边界：只用宿主机 Node/npm、Remotion CLI、现有 FFmpeg/ffprobe；不新增 Docker；不调用
VoxCPM；不运行 narration:generate/seal/supersede；不修改、覆盖或 supersede M2 sealed
narration；不重算/改写 SemanticTiming；不修改 M3 registry、receipt、PNG/MP4、runtime 或
Composition 来迁就检查；失败不得覆盖最后有效 AutoCheck；默认 project check 必须只读且
不修复 drift；报告不得包含绝对路径、token、provider endpoint、私有配置或 ignored
candidate workspace。

M4 只实现 narrative project check、AutoCheck 和 invalidation proof；不实现 NarrativeCheck、
`proceed/revise` 或任何二次 Agent 叙事质量审核。禁止开始
final level、SceneVisualCheck、FinalPreviewApproval、发布、SceneVisualPlan、ShotPlan、
ScenePackage、RendererRegistry、ResourceCatalog、BaseCanvas、StoryVisualTrack、
SoundDesignTrack、GlobalVisualLayers 或转场。M4 完成后停止，不开始 M5，不 push。

最后简短汇报：完成 Task/commit、关键报告 fingerprints、真实 gates、M2/M3 protection、
已知问题、最终 git status，以及明确 M5 尚未开始。
```

## 14. Planning-only stop condition

本计划文件是本轮唯一允许创建的 artifact。本轮只运行 plan formatting、内容自审、diff 和
Git-state 检查；不创建 M4 contract/script/test/report，不生成或重写任何 evidence，不 commit，
不 push。完成自审后停止。
