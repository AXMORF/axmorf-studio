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

## 把这段提示词交给你的 Agent

复制下面一句，只需替换本地目标路径：

```text
请打开 https://github.com/AXMORF/axmorf-studio，按照最新 README 中的步骤在 <本地目标路径，例如 /path/to/my-video> 完成 AXMORF Studio Workspace 的本地搭建与可用性验收，本次不要开始制作视频。
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
`bootstrap`/`doctor`。`npm run dev` 会同时启动 loopback-only Web 控制中心和 Remotion Studio：前者用于配置、诊断、
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

| 目标                               | 命令                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| 检查当前环境                       | `npm run doctor`                                                      |
| 同时打开控制中心与 Remotion Studio | `npm run dev`                                                         |
| 只打开 Web 控制中心                | `npm run web`                                                         |
| 只打开 Remotion Studio             | `npm run preview`                                                     |
| 创建 Project                       | `npm run project:create -- --project <story-id> --input <input.json>` |
| 只读检查生产计划                   | `npm run project:produce:inspect -- --project <story-id>`             |
| 开始有成本的准备                   | `npm run project:produce:prepare -- --project <story-id>`             |
| 检查 Project                       | `npm run project:check -- --project <story-id>`                       |

日常使用建议让 Agent 消费结构化输出和返回的 exact commands，不要手工拼接内部参数。完整顺序见
[生产流程](docs/PRODUCTION_WORKFLOW.md) 和 [生产编排指南](docs/guides/PRODUCTION_ORCHESTRATION.md)。

<details>
<summary>Agent / 高级生产命令参考</summary>

执行策略默认是 `inline`。只有当前宿主确实支持 bounded runtime-native children，并为本次生产验证了
`shared-workspace` 或 `controller-io` transport，才使用 subagents：

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
- [本地交付](docs/guides/LOCAL_DELIVERY.md)：四文件 Delivery 结构与验证
- [当前实现状态](docs/ITERATION_STATUS.md)：已实现能力和验收事实

README 只负责产品入口和快速开始；精确 contracts、当前状态与操作顺序以上述 active 文档和生成 Workspace 中当前版本的
`AGENTS.md`/Skill 为准。

## 开发与贡献

```bash
npm install
npm run bootstrap
npm run check:static
```

涉及 Chromium、Remotion 或宿主 Project gate 时，再运行：

```bash
npm run compositions
npm run check
```

提交 issue 前请附上 Node/npm 版本、操作系统、失败命令和已脱敏的结构化输出。不要提交 private config、provider
credentials、voice profile 内容或用户 Project 数据。

## License

[Apache-2.0](LICENSE)。第三方依赖保留各自许可证；详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。Remotion
不因 AXMORF Studio 的许可证而被重新授权。
