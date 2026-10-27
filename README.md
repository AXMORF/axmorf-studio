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

0.3.0 删除了 0.2.0 之前的 Project production 主链（内容寻址任务、attempt 与 continuation），只保留 direct film
（[迁移方案](docs/promotions/2026-10-14-direct-film-production.md)）。已有 Workspace 用
`npx create-axmorf-studio@latest upgrade` 同时升级 Skill 与运行时；升级会列出旧 Project 留下的目录，但不会删除它们。
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

已有 Workspace 升级到最新版本时，在 Workspace 目录运行下面的命令。它同时更新 Skill、指南和 `@axmorf/studio`，
被替换的托管文件会先备份，作品、交付与私有配置不受影响：

```bash
npx create-axmorf-studio@latest upgrade
```

creator 会安装精确依赖、生成 `package-lock.json`，并在原子提升目标目录前运行无 provider 的
`bootstrap`/`doctor`。`bootstrap` 从 runtime package 投影经过清单与 checksum 验证的共享素材：片头 cinematic
impact、片尾 8 秒电子 BGM、AXMORF 标记、24 条动效音效与五首循环 BGM。`npm run dev` 会同时启动 loopback-only
Web 控制中心和 Remotion Studio：前者用于作品与交付预览、配置和环境诊断，后者用于实时预览。

VoxCPM 可使用配置中的本机或远程 HTTP(S) 地址（例如 Tailscale 内的自托管服务）。环境诊断只访问该服务的
`/health` 与 `/ready`，不合成、不预热、不跟随重定向。高保真克隆的参考音频通过 Workspace 自带的 Remotion
FFmpeg 转成 48 kHz、单声道、16-bit PCM WAV；参考音频和逐字确认的文本仍保存在私有配置指定的位置。

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
| 删除一部片（源码、素材与交付）     | `npm run film:delete -- --film <film-id> --confirm-delete` |
| 升级 Workspace                     | `npm run workspace:upgrade`                                |

新建视频时，提示词明确指定的横竖屏、尺寸、帧率写入该片的 `film.json`；未指定字段继承配置，单次覆盖不改写长期默认值。
制作方法见 Workspace 内的 `.agents/skills/axmorf-film/SKILL.md`。

## Packages

| Package                                                 | 用途                                                   |
| ------------------------------------------------------- | ------------------------------------------------------ |
| [`create-axmorf-studio`](packages/create-axmorf-studio) | 创建独立、可重装、Agent-ready 的用户 Workspace         |
| [`@axmorf/studio`](packages/studio)                     | 提供 CLI、contracts、Remotion runtime 和预构建本地 Web |

生成的 Workspace 是普通 npm application，不是本 monorepo 的副本。它拥有自己的作品、媒体、private config、
render output 和交付；这些内容默认不会进入 Git。

## 文档

- [文档导航](docs/README.md)：按问题找到唯一 authority 或操作指南
- [Agent 兼容性](docs/guides/AGENT_COMPATIBILITY.md)：支持的入口、最低能力和 host 边界
- [架构](docs/ARCHITECTURE.md)：包、模块、一部片的数据流与写入所有权
- [配置指南](docs/guides/PRODUCER_CONFIG.md)：渲染默认值、片头片尾与 TTS provider
- [发布流程](docs/guides/RELEASE.md)：tag 触发 CI 发布到 `next`，真实 Agent 验收后发布到 `latest`
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

`packages:build` 提供模板编译所需的公共包类型导出。涉及 Chromium 或 Remotion 时，再运行：

```bash
npm run compositions
npm run check
```

提交 issue 前请附上 Node/npm 版本、操作系统、失败命令和已脱敏的结构化输出。不要提交 private config、provider
credentials、voice profile 内容或用户作品数据。

## License

[Apache-2.0](LICENSE)。第三方依赖保留各自许可证；详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。Remotion
不因 AXMORF Studio 的许可证而被重新授权。

### npm 使用稳定性

生成 Workspace 的 creator 先串行准备固定版本浏览器，doctor 真实执行小图渲染后才报告 ready。
直连下载受阻时可用 `AXMORF_BROWSER_EXECUTABLE` 指定宿主已安装的兼容 Chrome/Chromium 绝对路径；创建、doctor 与渲染阶段需保持该环境变量，真实小图验证仍执行。
