---
name: axmorf-film
description: 用 AXMORF Studio 制作或修改讲解短视频。Agent 直接编写 Remotion 工程，用旁白、配乐、审片和交付命令完成一部片。
---

# AXMORF Film

你是这部片的导演兼动效设计师。每部片是 `src/films/<filmId>/` 下一个普通的 Remotion 工程，源码完全由你编写；
Workspace 只替你做不稳定的事：旁白与实测时序、确定性配乐与节拍、素材许可、渲染与交付校验。

**做片先读 [references/direction.md](references/direction.md)**，这是节奏驱动动效的导演手册，工作顺序、三层动效、混音、分镜和自检以它为准。
画面好不好看取决于构思和反复看图修改，不取决于检查通过。构思时读 [画面手艺](references/craft.md)；
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
   - `film:new` 已写入 10 秒占位 `studio-v3` 谱；按本片内容重写 `music.score`，不要沿用占位收尾帧。无配乐的片设 `music: null`；实测旁白后先写节奏谱、生成配乐，再按小节写 storyboard（见 [导演手册](references/direction.md#2-工作顺序不能倒过来)）。
5. **生成旁白**：`npm run film:voice -- --film <filmId>`。输出每句的起止帧。修改旁白文本后重新运行；
   相同 provider/音色执行指纹、语速和文本的句子在 `.axmorf/cache/voice/` 命中时不会重复调用 TTS。
   `generated/timing.json.inputFingerprint` 仅描述剧本/时序输入，不含 provider 或音色，不是 TTS 缓存键。
   跨 Workspace 要保留同一个 take：一起复制匹配的 `film.json`、`generated/timing.json` 与
   `public/films/<filmId>/narration.wav`（保持 filmId 和相对路径），直接运行 `film:check` 验证输入指纹和音频 checksum，
   不再运行 `film:voice`。要在新 Workspace 编辑旁白并复用未改句子，还需迁移 `.axmorf/cache/voice/`，
   配置相同 provider、音色素材、生成参数与语速；不要把混合、停顿、母带处理后的 narration.wav 当作逐句缓存。
6. **先写节奏谱并生成配乐**：按实测句子锚定 `music.score`，先定 sections、揭示 hits、揭示前 breaks 和 ending。
   一部讲解片一个 BPM（96–116），hook 直接进鼓、第一小节就有重音，证据段中、揭示前收、drop 爆、结尾落。
   新片使用 `studio-v3`；显式写 `volume: 0.64`、`underSpeechVolume: 0.34` 作为混音起点；实测讲述段底层比旁白低 12–15 LU。
   运行 `npm run film:music -- --film <filmId>`，取得 beatFrames、barFrames、sectionFrames、accentFrames 和 onsets。
   实际字段、锚点、残差见 [配乐与卡点](references/music.md)。无配乐的片不伪造网格；无旁白的片跳过 voice，先定音乐。
7. **按小节分镜 → 画面 → 音效**（顺序必做）：先写 `src/films/<filmId>/storyboard.md`，告知用户路径和画面路线。
   使用 [导演手册第 8 节](references/direction.md#8-storyboardmd-写法) 的表格，每行一个小节，列帧、段落、旁白句、L2、L3 和音效，
   并补章节世界、镜头路径、转场动机、配方起止和声音窗口；不按句子分页。
   **旁白出现旧公理或新公理候选时，必须用 AxiomMorph 从旧公理形变到新公理候选**，这是账号母题。
   先读 [横屏「旧公理文字形变」示例](references/examples.md#横屏19201080旧公理文字形变)，表中写清旧/新文字、句子 id、
   出现/碎裂/重组/阅读帧；碎裂挂 hook 第一个重音，重组挂 drop，不能用两个独立淡入标题代替。
   先搭 L1 每 kick 呼吸、L2 每小节构图变化、L3 每重音大动作，落点误差 0 帧，再填细节。
   strength ≥0.9 的重音之前必须有至少 6 帧可见预备；不能把配方过程藏起来只露出终值，详见导演手册。
   按第 9 步完成画面后，才从可见动作派生逐条 `sound.effects`，写 kind、动作长度、anchor、params 和 for，
   运行 `npm run film:sfx -- --film <filmId>`。默认本片原创，不用 track/共享音效库，除非用户指定。
   技法见 [镜头配方](references/recipes.md)，声音接线见 [音效轨](references/sound.md)；改片同步小节表，不能只在聊天口述。
   旁白长度变化时重做节奏谱和 `film:music`，再更新表、画面和音效；不挪旁白或字幕踩拍。
8. **准备素材**（可选）：生成图片或原创 SVG 后用 `film:asset` 登记，见 [素材](references/artwork.md)。
9. **编写** `Film.tsx` 与 `Cover.tsx`：
   - 用 `useFilmTiming()` 读取实测旁白与配乐网格；语义决定内容，网格决定动效时钟。
     用 `useBeatPulse` / `useNarrationActive`、`useBarCamera`、`useImpact` 搭三层动效，根组件调用以保持正片时钟，
     按 [可编译最小示例](references/direction.md#41-用运行时接好三层动效) 接世界镜头，不在阅读文字上做呼吸。
   - 推荐用 `FilmSceneTrack` 组织章节与场景：同章默认连续、不写 `enter`，跨章才选择有动机的转场。
     配方只解决怎么动，构图和世界从剧本出发，不原样粘贴配方卡。
   - 旁白有旧公理或新公理候选时，必须按 storyboard 用 `AxiomMorph` 呈现形变；旧公理或候选出现的句子都要有对应动作与帧号，
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
    命令只生成 `review/animatic.mp4`：短边 360、原帧率、带声音的连续预览，不属于交付四件套，默认 review 不生成。
    **本机不要启动任何播放器**（ffplay、VLC、mpv、浏览器等），也不要用 xdg-open、gio open 或自动播放打开它；在报告里写出它的路径，请用户在手机或 Mac 上连续看、听。
    你自己对照 `storyboard.md`，用联系表、强重音连续小图和音频测量核对镜头路径、因果推进、转场、停留和落点；
    节奏对了再精修画面，修改节奏后重新生成。实际观看与听感一律如实记为未验证，联系表不能代替。
11. **看图迭代**（必做）：
    ```bash
    npm run film:review -- --film <filmId>
    ```
    打开输出的 `contact-sheet.jpeg` 和单帧图片，按 [导演手册第 9 节](references/direction.md#9-自检看-animatic-时逐条回答写帧号) 逐条回答并写下帧号证据，
    修改后再次审片。输出里的 `stillWarnings` 列出相隔 2 秒以上却几乎没变的帧，必须改或说明理由。
    **每个 strength ≥0.9 重音都必须逐张打开 `motion["strong-accent-strip"]` 的连续小图**，确认预备至少 6 帧可见，
    数字/文字变化过程没有被藏起来只露出终值；在 `review-notes.md` 按帧号记录结论与小图路径。像素预备或 p99 通过不替代这项人工检查。
    `readabilityWarnings` 提示实测字号过小、文字越界、被字幕或前景遮挡、局部低对比；必须为空，或逐条给出理由。
    `repetitionWarnings` 只统计没有旁白的时段，提示同一画面在开场、转场、高潮里反复出现；同样逐条修改或说明理由。
    `readability` 中的 `missingFrames`、`truncatedFrames` 不为空时，补看对应单帧，不把测量缺失当作通过。这些提示不拦截交付。
    `film:review` 输出的 `motion` / `motionWarnings` 记录运动与声音提示：motionWarnings 必须为空，或按
    [导演手册自检](references/direction.md#9-自检看-animatic-时逐条回答写帧号) 对各条规则逐条说明理由与帧号；`unknown` 不是已通过。
    `low-contrast-text` 必须逐条回应帧号、最差网格位置与比值；文字不要横跨明暗交界，深色字不要放在深色背景上。
    底板、描边、阴影以实际像素为准，转场窗口与同组形变不免检；颜色或像素缺失为 unknown。
    `text-under-foreground` 必须逐条回应；`readability.unknown` 中无法定位绘制位置的文字（如 display:contents）
    要看图核对。`repeated-composition` 比较包含旁白的非相邻段落构图；没有场景轨的旧片保持 unknown。
    `axiom-morph-missing` 提醒全片缺母题遥测；有旧公理/新公理候选必须用 AxiomMorph，没有就说明理由，不把提醒当自动语义判断。
    内容状态标识必须用 `FilmStatusTag`；同时核对 `small-status-tag`，主词和副词都不低于字幕字号的 70%，
    看图确认底板、对比和手机可读性，写出帧号证据。这条提示不拦交付。
    对照 `storyboard.md` 逐小节核对 L2、L3、章节世界、镜头路径、配方落点、转场和音效，偏离计划就同步修改。
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
- 环境限制：不要在本机启动任何 GUI 视频或音频播放器（ffplay、VLC、mpv、mplayer、Totem、浏览器播放等），
  也不要用 xdg-open、gio open 或自动播放绕过；部分主机上播放器会触发显卡故障。只做渲染、抽帧、
  禁用硬件加速的软件解码（ffmpeg `-hwaccel none`）和音频测量，观看交给用户在手机或 Mac 上完成。
  执行被拒绝时不要提权、复制二进制、换播放器或修改权限与显示后端，如实报告未验证即可。
