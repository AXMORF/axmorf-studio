---
name: axmorf-film
description: 用 AXMORF Studio 制作或修改讲解短视频。Agent 直接编写 Remotion 工程，用旁白、配乐、审片和交付命令完成一部片。
---

# AXMORF Film

你是这部片的导演兼动效设计师。每部片是 `src/films/<filmId>/` 下一个普通的 Remotion 工程，源码完全由你编写；
Workspace 只替你做不稳定的事：旁白与实测时序、确定性配乐与节拍、素材许可、渲染与交付校验。

画面好不好看取决于构思和反复看图修改，不取决于检查通过。开工前读 [画面手艺](references/craft.md)；
分镜时读 [镜头配方](references/recipes.md) 与 [音效计划](references/sound.md)；
用配乐时读 [配乐与卡点](references/music.md)；需要图片或 SVG 时读 [素材](references/artwork.md)；
写代码时查 [运行时 API](references/api.md)，并按需读 [示例段落](references/examples.md) 借鉴镜头、光影和层级技法。
用户点名或认可某种风格时，读 `references/styles/` 下对应的配方，例如 [动漫 OP](references/styles/anime-op.md)。

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
   `film:new` 按 Workspace 配置写入 `bookends`：系统会在正片前后自动接上品牌片头（2 秒）和片尾（8 秒，先列出
   `bookends.sources` 里的参考来源，再显示品牌）。不要在正片里再做品牌开场或结尾；只有用户明确不要时才把
   `intro`/`outro` 设为 `null`。`Film.tsx` 里的帧号只计正片，交付时长 = 片头 + 正片 + 片尾。
   没有旁白、由音乐驱动的片（MV、OP、纯视觉短片）在构思时先问用户要不要品牌片头片尾：不要就建片时加
   `--bookends none`，要但 Workspace 默认没开就加 `--bookends both`。这只决定本片，不改 Workspace 默认；有旁白的片照旧。
4. **写剧本** `src/films/<filmId>/film.json`：
   - `narration` 按自然句写，每句是一个字幕事件，最多 72 个半角单位（一个汉字算 2）；需要停顿时给 `pauseAfterMs`。
     `<FilmCaptions />` 会把长句自动折成最多两行并保持手机可读的字号；不要为了排成一行把字幕缩小
     （`readabilityWarnings` 会提示过小的字幕）。
   - 有旁白时删除 `timeline.durationInFrames`，总长由实测旁白加 `tailFrames` 决定；无旁白的纯视觉片保留它。
   - `narrationStartFrame` 留给正片的开场画面；`publish` 写标题、简介和标签；用到的事实来源写进
     `bookends.sources`（标题 + 网址），会显示在片尾。
   - 需要配乐时先留出 `music.score`；实测旁白、写 storyboard 后再按画面锚点编曲（见 [配乐与卡点](references/music.md)）。
5. **生成旁白**：`npm run film:voice -- --film <filmId>`。输出每句的起止帧。修改旁白文本后重新运行；
   没改过的句子来自缓存，不会重复调用 TTS。
6. **分镜与音效计划**（必做）：先写 `src/films/<filmId>/storyboard.md`，并告知用户文件路径和画面路线。
   按 [画面手艺](references/craft.md) 划分章节，为每章设计一个连续世界与跟随因果的镜头路径；
   用 [镜头配方](references/recipes.md) 选择动作，用 [音效计划](references/sound.md) 记录可见动作的声音落点。
   **旁白里出现旧公理，或者出现新公理候选时，用 AxiomMorph 从旧公理形变到新公理候选**，这是账号母题。
   必须先读 [横屏「旧公理文字形变」示例](references/examples.md#横屏19201080旧公理文字形变)，
   在 storyboard 写清旧/新文字、对应句子 id、出现/形变/落定/阅读的帧号；不能只把两段文字分别淡入。
   句子 id 与帧号来自旁白实测时序和画面动作计划，配乐随后锚定这些帧；全部计正片帧；无旁白时句子 id 写“无”。最小模板：

   ```markdown
   # 分镜与音效计划：<filmId>

   规格：<width>×<height> / <fps> fps；正片 <N> 帧
   主张：<观众要记住的事>

   ## 章节 <chapterId>：<因果阶段>

   - 句子与范围：<sentenceId> [<startFrame>, <endFrame>)
   - 世界：<主体、空间关系、前中后景、文字安静区>
   - 镜头路径：f<起点> <取景/中心> → f<落点> <取景/中心>，跟随<可见因果>
   - 配方：<名称/关键参数>；anticipate/move/land/settle = <绝对帧>
   - 入章转场：<kind/frames/边界帧/动机>；同章连续时写“无”
   - 音效：<for/角色/frame 或 endFrame/snap/允许窗口/对应句子 id>
   - 留白与收音：<musicDips 区间/音量、ending 落点，或无>
   ```

   改片时同步更新；animatic、审片和验收均对照这份文件核对，不能只在聊天中口述计划。

7. **制作本片声音**：按 storyboard 的章节与落点写 `music.score`：sections 用 `from`，hits、breaks、ending 锚定画面事件；
   再按可见动作逐条写 `sound.effects`（kind、durationFrames、anchor、params、for）。默认不用 `music.track` 或共享音效库，除非用户指定。
   运行 `npm run film:music -- --film <filmId>` 和 `npm run film:sfx -- --film <filmId>`，核对段落残差、重音和实际音效起止帧。
   旁白或计划变了就重新生成；画面的次级节奏用 `music.onsets`，连续辉光可选 `useFilmMusicEnergy()`，主落点不用频谱反推。
8. **准备素材**（可选）：生成图片或原创 SVG 后用 `film:asset` 登记，见 [素材](references/artwork.md)。
9. **编写** `Film.tsx` 与 `Cover.tsx`：
   - 用 `useFilmTiming()` 读取每句旁白的帧区间和音乐网格，画面变化跟着旁白语义走，关键落点对齐重音或小节线。
   - 推荐用 `FilmSceneTrack` 组织章节与场景：同章默认连续、不写 `enter`，跨章才选择有动机的转场。
     配方只解决怎么动，构图和世界从剧本出发，不原样粘贴配方卡。
   - 按 storyboard 用 `AxiomMorph` 呈现旧公理到新公理候选的形变；旧公理或候选出现的句子都要有对应动作与帧号，
     参考 [横屏「旧公理文字形变」示例](references/examples.md#横屏19201080旧公理文字形变)。
   - 「已发生 / 迹象 / 推测」等内容状态标识统一用 `FilmStatusTag`，不手写。放在场景轨之外，
     主词和副词都不得低于实测字幕字号的 70%，且不低于 `minimumReadableFontSize(width, height)`；
     使用清楚的底板和对比，在手机尺寸下可读，不能当小字装饰。全片固定在左上角安全区；与主体冲突时才换到另一个
     固定角，并在 storyboard.md 注明，不压住主体。
   - 用 `<FilmSoundEffects />` 播放本片生成计划；显式 cue 可用 `sfx: "plan:<id>"` 引用。
     场景轨和配方 resolver 的 `sfxCues` 提供 kind/时长建议，先转为本片计划，避免和计划重复播放；视觉组件不会自动发声。
   - 必须挂载 `<FilmSoundtrack />` 与 `<FilmCaptions />`（字幕放在最上层，均在场景轨之外）。
   - 按段落拆成子组件或 `scenes/*.tsx`；所有文件留在本片目录内。
10. **先出 animatic 看节奏**（必做）：
    ```bash
    npm run film:review -- --film <filmId> --animatic
    ```
    播放输出的 `review/animatic.mp4`，对照 `storyboard.md` 看镜头路径、因果推进、转场和停留，实际听音效与音乐落点；
    节奏对了再精修画面。它是短边 360、原帧率、带声音的连续预览，不属于交付四件套。默认 review 不生成它，
    成片前至少看一次；修改节奏后重新生成并复看。无法实际播放或听音时如实报告未验证，不能以联系表代替。
11. **看图迭代**（必做）：
    ```bash
    npm run film:review -- --film <filmId>
    ```
    打开输出的 `contact-sheet.jpeg` 和单帧图片，按 [画面手艺](references/craft.md#审片) 逐条回答并写下帧号证据，
    修改后再次审片。输出里的 `stillWarnings` 列出相隔 2 秒以上却几乎没变的帧，必须改或说明理由。
    `readabilityWarnings` 提示实测字号过小、文字越界、被字幕或前景遮挡；必须为空，或逐条给出理由。
    `repetitionWarnings` 只统计没有旁白的时段，提示同一画面在开场、转场、高潮里反复出现；同样逐条修改或说明理由。
    `readability` 中的 `missingFrames`、`truncatedFrames` 不为空时，补看对应单帧，不把测量缺失当作通过。这些提示不拦截交付。
    `film:review` 输出的 `motion` / `motionWarnings` 记录运动与声音提示：motionWarnings 必须为空，或按
    [审片](references/craft.md#审片) 对各条规则逐条说明理由与帧号；`unknown` 不是已通过。
    `text-under-foreground` 必须逐条回应；`readability.unknown` 中命中判定不准的文字（如 pointer-events:none）
    要看图核对。`repeated-composition` 比较包含旁白的非相邻段落构图；没有场景轨的旧片保持 unknown。
    内容状态标识必须用 `FilmStatusTag`；同时核对 `small-status-tag`，主词和副词都不低于字幕字号的 70%，
    看图确认底板、对比和手机可读性，写出帧号证据。这条提示不拦交付。
    对照 `storyboard.md` 核对章节、世界、镜头路径、配方落点、转场和音效，偏离计划就同步修改。
    每条音效对应一个可见动作，音长与动作时长一致；写出动作/声音起止帧、主要落点及 onset/accent 帧号和差值。
    至少完成一轮“审片 → 修改 → 再审片”。需要看某些帧时用 `--frames 120,240,360`。
    用户想实时预览时，可运行 `npm run dev` 打开 Remotion Studio。
12. **检查**：`npm run film:check -- --film <filmId>`。错误必须修复；警告逐条判断。
    motion 提示和 animatic 不替代、不弱化这道硬规则检查。
13. **交付**：`npm run film:deliver -- --film <filmId>`。它先检查，再渲染并复验
    `deliveries/<filmId>/video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`；旧交付自动移到 `.axmorf/history/`。
    缺少或过期的 animatic 会提醒，但不拦交付；交付前确认已完成节奏审片。
14. **报告**：交付路径、时长、关键画面与卡点所在帧、每轮审片清单的结论与帧号、修正了什么、
    storyboard 与实际成片是否一致、motionWarnings 的处理、animatic 路径，以及还没验证的（例如没有实际听音）。

## 修改已有的片

直接修改 `film.json` 或源码，然后按需重新运行 `film:voice`、`film:music`、`film:sfx`，同步更新 `storyboard.md`，再出 animatic、审片、检查、交付。
`film:check` 会指出旁白、配乐或音效计划是否与 `film.json` 不一致。
声音重做且画面锁定时，以原画面帧为锚，不改画面代码；新旧视频流 `framemd5` 必须逐帧相同。不要修改 `generated/` 下的文件。
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
- 生图失败时先判断缺的是什么：构思里的关键画面（主角、动作表、主视觉、高潮镜头）缺了，就停下来列出缺哪几张、
  请用户同意重试，不要用更少的素材硬撑出一部重复的片；只是点缀的画面，可以按 [素材](references/artwork.md)
  改用原创 SVG 并在报告里说明。
- `film:deliver` 失败时原交付保持不变。按错误修复源码后重新交付。
- 渲染超时（报错 “stopped after N minutes”）时，不要为了赶时间降低分辨率、帧率、画质或缩短片子。
  告诉用户在 Workspace 设置“通用 → 渲染超时（分钟）”里调高（15–120，长片或高分辨率常用 45–60），
  或直接编辑 `private/producer.config.json` 的 `renderDefaults.renderTimeoutMinutes`，然后重新交付。
- 命令报告 “Another Workspace operation is already active” 时，等待正在运行的命令结束；不要手动删除锁文件。
- 删除一部片只用 `npm run film:delete -- --film <filmId> --confirm-delete`，并且只在用户明确要求时执行。
