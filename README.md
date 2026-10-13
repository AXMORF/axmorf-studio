# AXMORF Studio

[![npm @axmorf/studio](https://img.shields.io/npm/v/%40axmorf%2Fstudio?label=%40axmorf%2Fstudio)](https://www.npmjs.com/package/@axmorf/studio)
[![npm create-axmorf-studio](https://img.shields.io/npm/v/create-axmorf-studio?label=create-axmorf-studio)](https://www.npmjs.com/package/create-axmorf-studio)
[![macOS package gate](https://github.com/AXMORF/axmorf-studio/actions/workflows/macos-npm-workspace.yml/badge.svg)](https://github.com/AXMORF/axmorf-studio/actions/workflows/macos-npm-workspace.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**让你的 Agent 在本地搭好完整视频生产 Workspace，再从创作需求走到可验证交付。**

AXMORF Studio 是一个基于 [Remotion](https://www.remotion.dev/) 的 Agent-first 视频生产 Workspace。它把创作交给
你正在使用的 coding Agent，把项目、媒体、配置、生产 artifacts 和最终视频留在本地，并用固定 contracts 和
validators 判断一次生产是否真正完成。

- **Agent-first**：支持 Codex、Claude Code、Cursor、Gemini CLI、GitHub Copilot，以及其他能读写文件并运行 npm 的
  Agent。
- **Local-first**：Workspace 和视频资产属于用户，不需要 AXMORF 云端账号。
- **可恢复、可复用**：内容寻址 artifacts 让未变化的 Scene、封面和旁白无需重复生产。
- **可验证交付**：完成结果固定为视频、两张封面和发布清单四个文件，不把聊天中的“完成了”当作成功。

> 当前为 `0.x` public beta。生产前请保留 Workspace 备份，并查看
> [当前实现状态](docs/ITERATION_STATUS.md)。

制作 Agent 可通过 `project:create:context` 查看既有视觉能力的公开 API 与示例，并按 Scene 语义选择。
源码新增的能力路由会在新片创建时冻结已批准的内置能力，让 Scene 按用途和可编译配方选择；媒体仍需显式准入。
固定演示组件在目录中标注，颗粒和甩镜已支持作品内容。实际调用仍须声明，自绘和安静镜头均有效，不以能力数量评价质量。
新的正文画布可铺满画面，文字保留独立安全区；固定首尾和旧作品的几何保持不变。创建入口按题材选择
生成图片、原创 SVG 或空间几何，先确定主体、构图、材质、光影和动作，再进入制作。Root 可在首次 inspect 前
把原创图片/SVG 准入指定 Scene，worker 只读取已验证的本地素材。配乐 helper 也支持调性、和声与分段编曲。
这些源码改进尚未发布，已安装的 0.1.21 不会自动获得；具体验证范围由当前实现状态记录。

当前公开版本为 **0.1.21**，两个 npm 包的 `latest` 均已回读确认；发布、验收和限制由
[当前实现状态](docs/ITERATION_STATUS.md)维护。[发布与全新公开安装记录](docs/evidence/v0.1.21-publication.json)
保留精确包和来源校验；本版按维护者批准复用此前验收，没有新的独立原生首用认证。
安装后的 Workspace 以自身 public schemas 和生成指南为准；推送源码不会升级现有安装或迁移作品。

有口播视频先生成、封存配音，再以实测 PCM 时间制作字幕和画面。无口播可选 `visual-scene` 的
`durationInFrames`，或显式 `authored-frames` 的 silent owner preset；两者都不调用 TTS，使用相同正式生产流程。
[连续视频创作](docs/guides/CONTINUOUS_VIDEO_AUTHORING.md)通过 filmPlan、相邻 Beat 分组、共享主体与相机组织整片，
允许长 Scene 和安静转场。横竖屏、尺寸和帧率服从用户本次选择；场景数量和示例风格不是固定门槛。

新片 Skill 默认在创建前用代码合成原创配乐，冻结 WAV 与同源音乐时间轴；整片音轨替换模板和 Scene 配乐，
保留旁白及独立音效。prepare 将同一音乐网格投影为 Scene-local `musicTiming`；关键动作可在语义窗口内选落点，
封存口播、字幕和语义边界保持实测时间。兼容的自动/指定/文件选曲仍在正文连续播放，保留首尾模板配乐；
`backgroundMusic:null` 明确禁用配乐。方法见[配乐与时序](.agents/skills/axmorf-video/references/film-direction.md#code-synthesized-music-and-shared-timing)。

[创作手册与示例](docs/guides/VIDEO_CREATIVE_PLAYBOOK.md)沉淀完整构图、材质、动作阶段、共同声音事件和阅读停留，
并提供剪纸案例及独立教学小片。它们是设计方法，不锁定配色、BPM、画幅或版式。Scene worker 用 binding 的
exact `commands.preview` 在提交前检查实际画面；全片接缝、混音、连续观看和听审仍须分别记录。

当前版本还包含明确输出缺失/语法错误的受检恢复证据、正文选曲与模板配乐隔离，以及五首获授权的原始循环
BGM seed，供兼容选曲使用。曲目与许可见[音乐指南](docs/guides/SCENE_SOUND_EFFECTS.md#循环音乐与试听版本)。
现有作品通过[隔离修订](docs/guides/PROJECT_REVISION.md)修改；封面专用局部修订接口尚未提供。

## 把这段提示词交给你的 Agent

复制下面一句，只需替换本地目标路径：

```text
请根据 https://github.com/AXMORF/axmorf-studio 项目最新 README 中的步骤，在 <本地目标路径，例如 /path/to/my-video> 完成 AXMORF Studio Workspace 的本地搭建与可用性验收，本次不要开始制作视频。
```

## 快速开始

如果你希望自己先创建 Workspace：

```bash
npm create axmorf-studio@latest my-video -- --yes
cd my-video
npm run doctor
npm run dev
```

creator 会安装精确依赖、生成 `package-lock.json`，并在原子提升目标目录前运行无 provider 的
`bootstrap`/`doctor`。`bootstrap` 同时从 runtime package 投影经过清单与 checksum 验证的共享素材；当前包括
片头 cinematic impact、片尾 8 秒电子 BGM、可复用 AXMORF 标记，以及
[24 条预制动效音效](docs/guides/SCENE_SOUND_EFFECTS.md)，含鼠标单击/双击、按下/松开与滚轮声。
共享 seed 还包含五首原始循环 BGM；bootstrap 自动投影并登记，供兼容的 auto/selected 选曲使用。
默认首尾 Scene 会在 Project 创建时把所用音频复制为
Project-local 资产；正文 Scene 从 Catalog 选择已制作的音效并按帧安排卡点。
兼容的选曲 BGM 只在正文连续播放，片头、片尾保留模板配乐；旧整片音轨可通过
[正式音乐修订](docs/guides/PROJECT_REVISION.md#边界播放与音乐包络)收窄范围。
`npm run dev` 会同时启动 loopback-only Web 控制中心和 Remotion Studio：前者用于配置、诊断、
进度和 current Delivery，后者用于 Composition 实时预览。

### 环境要求

- Node.js `>=20.19.0`
- npm `>=10`
- 当前 Workspace 声明的精确 Remotion 和 React 版本
- 渲染、浏览器与 provider 所需的宿主能力；以 `npm run doctor` 这个 `doctor` capability gate 为准

AXMORF 不用操作系统 allowlist 预先阻止安装。Agent 可以准备声明的宿主前置条件，但不能篡改 package internals、
依赖版本或 validators 来制造 Green。

## 它如何工作

```text
视频 brief
  → 用户自有 Workspace
  → strict Project create / isolated revision candidate
  → 本次宿主 capability 验证与 execution resolve
  → read-only inspect（readiness、成本、复用、blocker）
  → explicit prepare（唯一允许调用 provider 的入口）
  → Agent 创作 dirty Scenes / GlobalVisual / Covers
  → fixed validation、convergence 和 render
  → verified current Delivery
```

每个 Story 对应一个 Remotion Composition。生产会冻结内容 revision，复用仍然有效的 artifacts，只让 Agent 处理真正
dirty 的任务；fixed continuation 在所有任务终态后完成 materialization、渲染和机械复验。修改现有作品时先在隔离
candidate 中生产，成功后才受控替换 current Project 和 Delivery。

最终交付固定为：

```text
deliveries/<storyId>/video.mp4
deliveries/<storyId>/cover-4x3.png
deliveries/<storyId>/cover-3x4.png
deliveries/<storyId>/publish.json
```

## 常用命令

| 目标                                      | 命令                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- |
| 检查当前环境                              | `npm run doctor`                                                      |
| 同时打开控制中心与 Remotion Studio        | `npm run dev`                                                         |
| 只打开 Web 控制中心                       | `npm run web`                                                         |
| 只打开 Remotion Studio                    | `npm run preview`                                                     |
| 读取创作示例与能力                        | `npm run project:create:context -- --project <story-id>`              |
| 创建 Project                              | `npm run project:create -- --project <story-id> --input <input.json>` |
| 只读检查生产计划                          | `npm run project:produce:inspect -- --project <story-id>`             |
| 开始有成本的准备                          | `npm run project:produce:prepare -- --project <story-id>`             |
| 交付后复核每个 Scene 的关键画面           | `npm run project:scene:review -- --project <story-id>`                |
| 从有效 artifacts 生成审阅草稿（当前源码） | `npm run project:preview -- --project <story-id>`                     |
| 本地参考视频切换/运动/帧证据（当前源码）  | `npm run reference:analyze -- --input public/<reference.mp4>`         |
| 交付后审阅完整 Scene 与衔接               | `npm run project:scene:review -- --project <story-id> --motion`       |
| 复验当前四文件交付                        | `npm run project:check -- --project <story-id> --level final`         |

日常使用建议让 Agent 消费结构化输出和返回的 exact commands，不要手工拼接内部参数。完整顺序见
[生产流程](docs/PRODUCTION_WORKFLOW.md) 和 [生产编排指南](docs/guides/PRODUCTION_ORCHESTRATION.md)。

新建视频时，提示词明确指定的横竖屏、尺寸、帧率优先于配置；未指定字段继承配置，单次覆盖不改写长期默认值。
worker 的提交前 Scene 预览使用 bind 返回的 exact `commands.preview`；完整动作与音乐仍需连续观看和听审。
用户本地循环音乐与包内共享资源分开维护，选曲和试听退役规则见 [音效与音乐指南](docs/guides/SCENE_SOUND_EFFECTS.md)。

<details>
<summary>Agent / 高级生产命令参考</summary>

执行策略默认是 `subagents`，最大并发 4，受宿主可用 child 容量限制。用户或配置可明确选择 `inline`。
Agent 先按 [host probe](.agents/skills/axmorf-video/references/execution-capabilities.md) 验证原生 child 读写，
再把实际容量与 transport 作为本次证据传给 resolver；没有能力时阻塞，不自动降级：

```bash
npm run project:execution:resolve -- --mode subagents --max-concurrency <n> --runtime-max-concurrency <n> --worker-transport shared-workspace|controller-io
```

修改现有 Project 必须先取得 exact current base，并在隔离 candidate 中完成：

```bash
npm run project:revise:context -- --project <story-id>
npm run project:revise:validate -- --input <revision.json>
npm run project:revise -- --project <story-id> --input <revision.json>
npm run project:revision:promote -- --project <story-id> --candidate <candidate-id> --revision <revision-id> --delivery <delivery-build-id>
```

每个 Agent task 在读取或写入 task content 前必须先通过 attempt-bound zero-write bind；后续只运行 prepare 返回的
exact commands：

```bash
npm run project:task:bind -- --task <task-revision> --attempt <attempt-id> --binding <binding-id> --transport shared-workspace|controller-io
npm run project:task:finalize -- --task <task-revision> --attempt <attempt-id> --binding <binding-id>
npm run project:task:check -- --task <task-revision> --attempt <attempt-id> --binding <binding-id>
npm run project:task:commit -- --task <task-revision> --attempt <attempt-id> --binding <binding-id>
```

Root Agent 的最后一个生产动作是启动 exact continuation；之后由 fixed continuation 处理 terminal barrier、converge
和 Delivery：

```bash
npm run project:produce:continue -- --project <story-id> --revision <revision-id> --attempt <attempt-id>
```

terminal failed attempt 不可重开。用户明确要求恢复时，先进行只读、零 provider inspection，再为同一
same-Revision reissue fresh attempt；它不要求 current delivery：

```bash
npm run project:attempt:recover-inspect -- --project <story-id> --attempt <failed-attempt-id>
npm run project:attempt:reissue -- --project <story-id> --attempt <failed-attempt-id>
```

commit 对明确的输出缺失、JSON/TypeScript 语法错误保留 task-local `outputFailure`，恢复时复核原任务声明的
输出路径。仅有通用 `producer-task-commit-failed` 的历史记录仍阻塞；不从后来补写的文件或文字说明猜测原故障。

Project 删除是破坏性操作，必须由用户明确授权，并且只能使用完整 storyId-owned 清理命令：

```bash
npm run project:delete -- --project <story-id> --confirm-delete
```

</details>

## Packages

| Package                                                 | 用途                                                   |
| ------------------------------------------------------- | ------------------------------------------------------ |
| [`create-axmorf-studio`](packages/create-axmorf-studio) | 创建独立、可重装、Agent-ready 的用户 Workspace         |
| [`@axmorf/studio`](packages/studio)                     | 提供 CLI、contracts、Remotion runtime 和预构建本地 Web |

生成的 Workspace 是普通 npm application，不是本 monorepo 的副本。它拥有自己的 Project、媒体、private config、
artifacts、attempts、revision candidates、render output 和 Delivery；这些内容默认不会进入 Git。

## 文档

- [文档导航](docs/README.md)：按问题找到唯一 authority 或操作指南
- [Agent 兼容性](docs/guides/AGENT_COMPATIBILITY.md)：支持的入口、最低能力和 host 边界
- [生产流程](docs/PRODUCTION_WORKFLOW.md)：Project、Revision、Task、Artifact 与 Delivery 主链
- [配置指南](docs/guides/PRODUCER_CONFIG.md)：TTS、render、readability、模板和发布集合
- [Project revision](docs/guides/PROJECT_REVISION.md)：安全修改已有作品
- [视觉叙事](docs/guides/VISUAL_NARRATIVE_QUALITY.md)：视觉机制、连续主体、预览与验证边界
- [本地交付](docs/guides/LOCAL_DELIVERY.md)：四文件 Delivery 结构与验证
- [首次用户发布验收](docs/guides/FIRST_USE_RELEASE_GATE.md)：按变更分层校验、必要原生首用与发布后安装复验
- [当前实现状态](docs/ITERATION_STATUS.md)：已实现能力和验收事实

README 只负责产品入口和快速开始；精确 contracts、当前状态与操作顺序以上述 active 文档和生成 Workspace 中当前版本的
`AGENTS.md`/Skill 为准。

## 开发与贡献

```bash
npm install
npm run bootstrap
npm run packages:build
npm run check:static
```

`packages:build` 提供固定模板编译所需的公共包类型导出。涉及 Chromium、Remotion 或宿主 Project gate 时，再运行：

```bash
npm run compositions
npm run check
```

提交 issue 前请附上 Node/npm 版本、操作系统、失败命令和已脱敏的结构化输出。不要提交 private config、provider
credentials、voice profile 内容或用户 Project 数据。

## License

[Apache-2.0](LICENSE)。第三方依赖保留各自许可证；详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。Remotion
不因 AXMORF Studio 的许可证而被重新授权。

### npm 使用稳定性

生成 Workspace 的 creator 先串行准备固定版本浏览器，doctor 真实执行小图渲染后才报告 ready。
直连下载受阻时可用 `AXMORF_BROWSER_EXECUTABLE` 指定宿主已安装的兼容 Chrome/Chromium 绝对路径；创建、doctor 与渲染阶段需保持该环境变量，真实小图验证仍执行。
Agent 用 `project:create:context` 获取完整输入示例与当前风格/模板配置；校验错误给出准确文件行列和修正方式。
新视频通过 `visualStyle.theme` 选择深色、浅色或已校验的自定义配色，统一 Composition 兜底底色、文字与品牌角色，
固定首尾沿用主题；默认深色。当前源码的新全幅正文可按题材安排图片、材质与光色，文字保留独立安全区并按实际
背景保证可读。Logo 的形状、排版与动画固定。详见 [主题合同](docs/contracts/VISUAL_THEME_CONTRACT.md)。
continuation 的媒体进程具有期限、进程组清理和独立诊断日志。进程意外退出后通过显式
`project:attempt:interrupt-inspect` / `interrupt` 验证旧执行者死亡并记录失败，再沿 recover-inspect/reissue 复用产物。
原 claim 和 content identity 保持不变，不能手动删锁继续。随包 Skill 说明长任务宿主句柄、默认继承与恢复边界。

Workspace 的 `project:check --level final` 只读复验当前 Revision、artifacts 和四文件交付，输出结构化失效原因；
不要求补造历史 baseline 证据。浏览器清理仅在确认进程组已退出时接受 macOS 退出竞态，真实权限失败保留原始结果并阻断。
