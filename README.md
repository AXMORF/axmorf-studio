# AXMORF Studio

[![npm @axmorf/studio](https://img.shields.io/npm/v/%40axmorf%2Fstudio?label=%40axmorf%2Fstudio)](https://www.npmjs.com/package/@axmorf/studio)
[![npm create-axmorf-studio](https://img.shields.io/npm/v/create-axmorf-studio?label=create-axmorf-studio)](https://www.npmjs.com/package/create-axmorf-studio)
[![macOS package gate](https://github.com/AXMORF/axmorf-studio/actions/workflows/macos-npm-workspace.yml/badge.svg)](https://github.com/AXMORF/axmorf-studio/actions/workflows/macos-npm-workspace.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**让你的 Agent 在本地搭好完整视频生产 Workspace，再从创作需求走到可验证交付。**

AXMORF Studio 是一个基于 [Remotion](https://www.remotion.dev/) 的 Agent-first 本地视频工作室。你正在使用的 coding
Agent 像导演兼动效设计师一样，直接用 Remotion 代码制作讲解短视频；Workspace 替它完成旁白与实测时序、原创配乐与节拍、
素材许可、审片联系表和交付校验。项目、媒体、配置和最终视频都留在本地。

- **Agent-first**：支持 Codex、Claude Code、Cursor、Gemini CLI、GitHub Copilot，以及其他能读写文件并运行 npm 的
  Agent。
- **直接创作**：每部片是 `src/films/<film-id>/` 下一个普通的 Remotion 工程，构图、镜头、转场和字幕样式都由
  Agent 决定，并通过审片联系表看图迭代。
- **Local-first**：Workspace 和视频资产属于用户，不需要 AXMORF 云端账号。
- **可验证交付**：完成结果固定为视频、两张封面和发布清单四个文件，不把聊天中的“完成了”当作成功。

> 当前为 `0.x` public beta。生产前请保留 Workspace 备份，并查看
> [当前实现状态](docs/ITERATION_STATUS.md)。

源码已经实现 direct film 制作方式（[实施计划](docs/promotions/2026-10-14-direct-film-production.md)），将作为 0.2.0 发布；
已发布的 0.1.x 仍使用 Project production 主链（内容寻址任务、attempt 与 continuation），0.3.0 将删除该主链。
公开版本、验收范围与限制以[当前实现状态](docs/ITERATION_STATUS.md)为准。

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

已有 Workspace 升级到最新版本时，在 Workspace 目录运行下面的命令。它同时更新 Skill、指南、runtime facade 和
`@axmorf/studio`，被替换的托管文件会先备份，Projects 与私有配置不受影响：

```bash
npx create-axmorf-studio@latest upgrade
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
视频需求
  → film:new 建立 src/films/<film-id>/（film.json 剧本 + Film.tsx + Cover.tsx）
  → film:voice 逐句 TTS，按实测音频给出每句起止帧
  → film:music 按编曲配方合成原创配乐，给出段落、重音与小节帧
  → Agent 用 useFilmTiming() 编写画面，挂载 <FilmSoundtrack /> 与 <FilmCaptions />
  → film:review 渲染联系表，看图修改（至少一轮）
  → film:check 硬规则检查
  → film:deliver 渲染并复验四个交付文件
```

最终交付固定为：

```text
deliveries/<film-id>/video.mp4
deliveries/<film-id>/cover-4x3.png
deliveries/<film-id>/cover-3x4.png
deliveries/<film-id>/publish.json
```

`film:check` 只拦会导致渲染失败、交付不合格或许可问题的情况：TypeScript 错误、渲染时联网、CSS 动画、
不确定的随机数与时间、未登记的媒体、跨片导入，以及与 `film.json` 不一致的旁白和配乐。审美和可读性靠
Skill 中的创作方法和看图回路。修改作品就是修改源码后重新交付，上一版交付自动移到 `.axmorf/history/`。

## 常用命令

| 目标                               | 命令                                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| 检查当前环境                       | `npm run doctor`                                           |
| 同时打开控制中心与 Remotion Studio | `npm run dev`                                              |
| 新建一部片                         | `npm run film:new -- --film <film-id> --title "<标题>"`    |
| 生成旁白与时序                     | `npm run film:voice -- --film <film-id>`                   |
| 生成配乐与节拍网格                 | `npm run film:music -- --film <film-id>`                   |
| 登记生成图片或原创 SVG             | `npm run film:asset -- --film <film-id> --file <path> ...` |
| 渲染审片联系表                     | `npm run film:review -- --film <film-id>`                  |
| 交付前检查                         | `npm run film:check -- --film <film-id>`                   |
| 渲染并复验四个交付文件             | `npm run film:deliver -- --film <film-id>`                 |
| 列出所有片与交付状态               | `npm run film:list`                                        |

新建视频时，提示词明确指定的横竖屏、尺寸、帧率写入该片的 `film.json`；未指定字段继承配置，单次覆盖不改写长期默认值。
制作方法见 Workspace 内的 `.agents/skills/axmorf-film/SKILL.md`。

<details>
<summary>0.1.x Project production 主链命令（0.3.0 删除）</summary>

0.2.0 之前制作的作品位于 `src/projects/<story-id>/`，仍由 `axmorf-video` Skill 与下列命令处理。

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
- [发布流程](docs/guides/FIRST_USE_RELEASE_GATE.md)：tag 触发 CI 发布到 `next`，真实 Agent 验收后发布到 `latest`
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
