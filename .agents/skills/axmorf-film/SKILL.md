---
name: axmorf-film
description: 用 AXMORF Studio 制作或修改讲解短视频。Agent 直接编写 Remotion 工程，用旁白、配乐、审片和交付命令完成一部片。
---

# AXMORF Film

你是这部片的导演兼动效设计师。每部片是 `src/films/<filmId>/` 下一个普通的 Remotion 工程，源码完全由你编写；
Workspace 只替你做不稳定的事：旁白与实测时序、确定性配乐与节拍、素材许可、渲染与交付校验。

画面好不好看取决于构思和反复看图修改，不取决于检查通过。开工前读 [画面手艺](references/craft.md)；
用配乐时读 [配乐与卡点](references/music.md)；需要图片或 SVG 时读 [素材](references/artwork.md)；
写代码时查 [运行时 API](references/api.md)，并按需读 `.agents/skills/remotion-best-practices/references/exemplar-scenes.md`
借鉴镜头、光影和层级技法（它的 `SceneRendererProps` 外壳属于旧接口，直接片里改用 `useCurrentFrame()` 与 `useVideoConfig()`）。

## 流程

1. **确认环境**：首次在这个 Workspace 制作时运行 `npm run doctor`，全部通过再继续。失败时报告 blocker，
   不修改 `node_modules`、依赖版本或检查器。
2. **构思**：先想清楚观众看完要记住什么、每一段的代表画面（主体、取景、光影、变化），再写剧本。
   把构思简要告诉用户：主题、时长、画面路线、配乐风格。
3. **建片**：
   ```bash
   npm run film:new -- --film <filmId> --title "<标题>"
   ```
   用户明确要求的尺寸、横竖屏、fps 用 `--width/--height/--fps` 写入本片，不修改 Workspace 默认配置。
4. **写剧本** `src/films/<filmId>/film.json`：
   - `narration` 按自然句写，每句是一行字幕，最多 72 个半角单位（一个汉字算 2）；需要停顿时给 `pauseAfterMs`。
   - 有旁白时删除 `timeline.durationInFrames`，总长由实测旁白加 `tailFrames` 决定；无旁白的纯视觉片保留它。
   - `narrationStartFrame` 留给开场画面；`publish` 写标题、简介和标签。
   - 需要配乐时写 `music.score`（见 [配乐与卡点](references/music.md)）。
5. **生成旁白**：`npm run film:voice -- --film <filmId>`。输出每句的起止帧。修改旁白文本后重新运行；
   没改过的句子来自缓存，不会重复调用 TTS。
6. **生成配乐**：`npm run film:music -- --film <filmId>`。输出段落起点与重音帧。旁白时长变了就重新运行。
7. **准备素材**（可选）：生成图片或原创 SVG 后用 `film:asset` 登记，见 [素材](references/artwork.md)。
8. **编写** `Film.tsx` 与 `Cover.tsx`：
   - 用 `useFilmTiming()` 读取每句旁白的帧区间和音乐网格，画面变化跟着旁白语义走，关键落点对齐重音或小节线。
   - 必须挂载 `<FilmSoundtrack />` 与 `<FilmCaptions />`（放在最上层）。
   - 按段落拆成子组件或 `scenes/*.tsx`；所有文件留在本片目录内。
9. **看图迭代**（必做）：
   ```bash
   npm run film:review -- --film <filmId>
   ```
   打开输出的 `contact-sheet.jpeg` 和单帧图片，按 [画面手艺](references/craft.md#审片) 逐条检查，修改后再次审片。
   至少完成一轮“审片 → 修改 → 再审片”。需要看某些帧时用 `--frames 120,240,360`。
   用户想实时预览时，可运行 `npm run dev` 打开 Remotion Studio。
10. **检查**：`npm run film:check -- --film <filmId>`。错误必须修复；警告逐条判断。
11. **交付**：`npm run film:deliver -- --film <filmId>`。它先检查，再渲染并复验
    `deliveries/<filmId>/video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`；旧交付自动移到 `.axmorf/history/`。
12. **报告**：交付路径、时长、关键画面与卡点所在帧、审片发现并修正了什么、还没验证的（例如没有实际听音）。

## 修改已有的片

直接修改 `film.json` 或源码，然后按需重新运行 `film:voice`、`film:music`，再审片、检查、交付。
`film:check` 会指出旁白或配乐是否与 `film.json` 不一致。不要修改 `generated/` 下的文件。
`npm run film:list` 列出所有片及其交付状态。

## 硬规则

`film:check` 只拦这些会导致渲染失败、交付不合格或许可问题的情况：

- TypeScript 必须编译通过。
- 渲染时不联网：不调用 `fetch`/`XMLHttpRequest`/`WebSocket`，不从 URL 加载图片、字体或脚本。屏幕上显示网址文字是允许的。
- 动画只由帧驱动：用 `useCurrentFrame()`、`interpolate`、`spring`；不用 CSS animation/transition 或 Tailwind 动画类。
- 渲染结果每次相同：用 remotion 的 `random(seed)`，不用 `Math.random()`、`Date.now()`、`new Date()`。
- 媒体只用 `staticFile("films/<filmId>/...")` 引用本片登记的文件，或 `assets/axmorf-shared/` 下的共享素材。
- 本片源码不从其他片的目录导入。

## 长片并行（可选）

宿主支持子 Agent 时，可以先写好 `film.json`、跑完旁白和配乐，在 `Film.tsx` 里按旁白区间排好各段
`<Sequence>`，再把各段 `scenes/<name>.tsx` 分给子 Agent 编写。给每个子 Agent 写清：该段的帧区间、对应句子、
代表画面、要对齐的重音帧、可用素材，以及“只写自己的文件”。全部完成后由你统一审片和修改，保证全片连贯。

## 故障

- TTS、生图等外部服务失败是外部问题：报告原文，不自动重试、不换 provider；用户同意后再重试。
- `film:deliver` 失败时原交付保持不变。按错误修复源码后重新交付。
- 命令报告 “Another Project operation is already active” 时，等待正在运行的命令结束；不要手动删除锁文件。
- 删除一部片只用 `npm run film:delete -- --film <filmId> --confirm-delete`，并且只在用户明确要求时执行。
