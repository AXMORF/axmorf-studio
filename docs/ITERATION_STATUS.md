# Iteration Status

## Workspace 共享资源升级修复（2026-11-10，未发布）

**升级提示：已发布的 0.3.0-rc.7 从共享资源仍为旧版的 Workspace 升级会失败，但会安全回滚，私有配置不会改变。
请改用 0.3.0-rc.8 升级；本分支修复尚待负责人调整版本并发布。**

rc.5 Workspace 升 rc.7 时，未修改的 `assets.manifest.json` 因与新版包字节不同被 bootstrap 判成冲突，导致回滚。
upgrade 现于 install 前读取旧运行时种子的实际 SHA-256，优先于历史记录交给 bootstrap；bootstrap 维护独立
`.axmorf/shared-resources.json`，仅替换匹配旧哈希的资源，确认匹配新版的资源并补齐缺失资源。
本地修改及无旧哈希依据的差异仍报冲突。资源与父目录保留符号链接检查，更新为原子替换；共享资源及清单纳入备份/回滚，
新版新增的文件在失败时移除。模板托管清单不收录共享资源，避免误删。
bootstrap 在写入前一次列出全部字节冲突，指引先备份本地改动，再删掉冲突文件或换成新版包字节后重跑 upgrade；
若要保留自己的修改，则保留文件并继续用旧版。旧运行时缺失、旧包不含该路径或记录缺少该路径且无法确认旧字节时均不覆盖。

定向 35 项通过，包含 rc.5 原始清单回归、包哈希优先/历史兜底、缺失补写、本地冲突、无依据拒绝、全部冲突汇总、符号链接保护及
bootstrap/doctor 中途失败恢复。`npm run packages:build` 与完整 `npm run check` 退出 0：
主测试 623 通过、1 macOS 专属跳过，宿主 43 通过，合计 **666 通过、1 跳过、0 失败**。
类型、lint、链接、音频投影、Web/Remotion 构建、creator 包与 compositions 门禁通过。
另新增独立真实打包 E2E `node --import tsx --test scripts/tests/check-workspace-upgrade.ts`，构建后运行：1 通过、0 跳过、0 失败。
该用例生成 rc.5 Workspace、真实安装 rc.5 node_modules 并核对原始 fixture 字节，随后用当前 runtime tgz 和实际 CLI/npm 完成
upgrade、bootstrap、doctor，确认旧资源已更新、备份保留旧字节、配置不变；不模拟安装或运行时命令，不混入普通单元测试的网络依赖。

生产 Workspace 连同 node_modules 只读复制后，以本分支 runtime/creator tgz 实际升级：rc.5 → 本地 rc.7 验收包成功，
doctor 五项通过，`private/producer.config.json` 逐字节不变，40 项共享资源与包种子及新哈希记录一致。
旧片 `ai-small-lab-training-cost-20261106` 的 film:check 通过，无错误/警告；示例 `accel-01-ai-name-20261031`
在原目录即缺旁白和配乐，检查失败事实保留，未重生成。原生产运行时仍 rc.5，记录的 3869 个原文件 SHA-256 全部未变。
证据与说明在 `/home/zzzxc/AgentWorkspace/upgrade-fix-evidence-20261110/`、
`/home/zzzxc/AgentWorkspace/2026-11-10-upgrade-fix-notes.md`。版本与仓库 lockfile 未改；rc.8 版本调整及发布留给负责人。

## 0.3.0-rc.7 发布审计修复（2026-11-10）

`v0.3.0-rc.6` tag CI 在开发依赖审计失败（minimatch，GHSA-g3hv-75wg-m249），未发布；该 tag 保留作废。
上游 typescript-eslint 尚无依赖 minimatch ≥11.0.1 的版本，故只对 `@typescript-eslint/typescript-estree` 的 minimatch 加最小 override
（11.0.5），lint 前后结果一致、审计为 0；以 0.3.0-rc.7 重新发布。原因、验证与移除条件见
[发布审计修复](evidence/2026-11-10-rc7-npm-audit.md)。

## 0.3.0-rc.6 / P6 本地准备（2026-11-10，未发布）

P6 **进行中：发布 0.3.0-rc.6 到 next**。v8 终版按用户反馈已通过；这不是本机 Agent 的实际播放/听审结论。
当前 `@axmorf/studio` 公共 dist-tag 仍为 next=0.3.0-rc.5、latest=0.2.1；版本 manifest 与 lock 保留原值，版本准备和对外发布由负责人执行。
以下日期段落是各批次当时的验收记录；其中「P6 冻结」「待 v8」已由本段及[实施计划当前状态](promotions/2026-11-06-cinematic-motion-and-sound.md)取代。

当前能力：studio-v3 确定性合成器、每片 SFX/纸面拟音、节奏驱动 L1/L2/L3 与导演手册、口播静态 EQ 频段避让和逐句 ducking；
语义帧先于音乐 hit，句中关键词仍需人工/外部帧依据，没有 ASR 逐字对齐。纸面配方要求关键人物/手/实物生图剪纸、来源登记、
代码白边投影合成；精确图解可用 SVG。图形语义、重叠、文字卡、节拍轮换、强重音和讲述段静止均有软提示，unknown 不作通过。
字幕两轮均已实现：caption 显示文本/paper 纸条/字幕带；可选 karaoke 与离线分句估时（分句内线性，非逐字识别）。
本机不启动播放器或浏览器自动播放，只渲染/抽帧/测量及 `ffmpeg -hwaccel none` 软件解码，实际看听由用户在手机或 Mac 完成。

旁白缓存根因：VoxCPM safeDescriptor.privateConfigFingerprint 包含展开后的素材绝对路径，导致相同素材跨 Workspace 的
providerAttemptFingerprint 不同。逐句缓存现改用独立音频内容指纹，正向选取 provider/模型/素材内容哈希或 voiceId/生成参数/语速/文本，
排除路径、连接配置与显示名称；旧执行指纹、timing/inputFingerprint 算法不变，旧缓存键不自动转换。
v7/v8 只读副本的执行描述仅 privateConfigFingerprint 不同，新内容指纹相同。副本内离线将已确认的 25 个旧逐句缓存写入新键后迁移，
当前 film voice CLI 25/25 命中、网络/TTS=0，narration.wav 与原 v8 8,324,822 bytes 逐字节一致，2656 帧和句边界/输入指纹不变。
旧 v7/v8 timing 均通过新 film:check，检查前后字节不变。缓存/流程等 focused 34 项、内容身份 3 项通过。
构建产物补验还发现 synth-score 的独立 CLI 在 bundle 中误判自身为入口，导致 film voice 报 usage；
入口现额外限定原模块 URL，避免触发独立合成命令，不改音频算法；打包复现/独立参数校验两项回归覆盖。
详细证据和最终完整 check 结果见本地 `/home/zzzxc/AgentWorkspace/2026-11-10-p6-prep-notes.md`。

## P11 字幕显示、纸条与字幕带（2026-11-10，未发布）

narration 句子增加可选 caption；text 保留 TTS 念法，caption 写屏幕数字/型号/货币符号，各自最多 72 half-units。
新 timing 透传 caption，useFilmTiming 读取当前 spec 的显示文本；caption 不进入原 timing 指纹或 voice 缓存，不需重合成。
FilmCaptions 增加 paper 白纸条/胶带，底纸固定倾斜 0.65°、字保持水平；caption/paper 用确定性标点优先断行并保护数字/英文词。
为保留旧片像素，未写 caption 的旧 box 沿用原排版；style 仍可覆盖。审片输出字幕框位置与只提示的
caption-spoken-numerals（连续至少 3 个中文数字且无 caption）、graphic-in-caption-band（非 background 图形伸入字幕框外扩 24px，转场照报）。
四份 Skill 文档及 creator 模板同步字幕写法、variant 与手/道具避让规则。

v8 只读副本校准：6 条念法提示（size/bill/hours/split/cluster/data）；f692/f700/f708 命中手伸入字幕带，图形 unknown=0。
副本补 caption/paper 后 f700/f2600 已渲染并看图：白纸与桌面分层清楚，f2600 在逗号后断行，字保持水平；两帧旧 box 与原组件 PNG 字节一致。
完整 `npm run check` 退出 0：主测试 586 通过、1 macOS 专属跳过，宿主 40 通过；合计 626 通过、1 跳过、0 失败。
旧 12 个 system composition 的 46 张 PNG 与 2cd92a9 原始源码逐字节一致，0 张变化；纸条两帧实测最低对比 11.78:1 / 11.70:1。
证据见 `/home/zzzxc/AgentWorkspace/2026-11-10-p11-captions-notes.md`，未安装依赖、未改 lockfile 或原片，未 push/publish/merge。

## P10 讲述段像素运动与图解主体（2026-11-10，未发布）

新增 `narration-static`，复用 animatic 正片 160×90 灰度相邻帧 MAD。首次使用连续 30 帧判据时，v5/v7 都有 54 帧停留，
无法区分有意收尾与大面积冻结；后续 2cd92a9 已改为讲述段中位数 <0.2，或能量 <0.15 的帧占讲述段一半以上。
最长静止段只供人工参考。复校准 v5 不报、v7 命中；无可用 animatic/讲述样本为 unknown，仅提示不拦交付。

新增可选 object-kind=illustration/diagram/prop/card（默认 prop，旧遥测兼容）。`text-card-only` 提示可见 subject
全为 card 的连续命中采样段，给出 frames/sampledFrames，不推断未采样帧；缺失/unknown/截断及非卡/空主体断段。
新 TextCardReview gallery 的图解+金额卡正例 0 提示，两卡反例 f0–29（采样 0,10,20,29）1 条提示，真实 Chromium 验证。
PaperCollageExample 只补类型标注，f0–38 印章入场前如实命中；7 个旧示例 27 张 PNG 与 47a1036 基线逐字节一致。

四份 Skill 入口和正文镜像同步：只稳定正在阅读的文字，讲述段持续非匀速桌面微移、全程非文字 boil、每拍轮换物件反应；
自检超过 1 秒整帧不动。每镜头 storyboard 增「桌面动作」，只有卡片出现后停住不合格；纸面 bookends 显式 light。
关键人物/手/实物用实际可用宿主生图剪纸；统一/逐主体提示词写入 storyboard，缺工具停下，不用代码凑人物/实物。
完整抠像/登记/代码白边投影纸纹流程已补齐，保留精确 SVG 图解；现有 sprite/drawing 辅助及 FFmpeg 透明度验证通过。
现有 frame API 足够排手入画→动作→收手的 anticipate/land，不新增可选 resolver 或依赖；本任务未调用生图、未制作 v8。

完整 `npm run check` 退出 0：主测试 577 通过、1 macOS 专属跳过，宿主 37 通过；合计 614 通过、1 跳过、0 失败。
类型、lint、文档链接、音频投影、Web/Remotion 构建、creator 包检查与 compositions 均通过。
进度与说明在 `/home/zzzxc/AgentWorkspace/p10-PROGRESS.md`、`/home/zzzxc/AgentWorkspace/2026-11-10-p10-notes.md`；
证据在 `/tmp/axmorf-p10-evidence/`。未安装依赖、未改 lockfile、未推送/发布/合并，已有作品文件只读，未启动播放器。

## P9 F 纸面拟音（2026-11-10，未发布）

film:sfx新增stamp（短低频压按+纸面闷响）、tape（胶带噼啪调制滤波噪声）、pen（笔触调制带通摩擦噪声）。
统一参数、PCM时长、start/end/center锚点、缓存/登记校验沿用；stamp基底跟score主音，纯噪声tape/pen不自动跟调。
新增分支不改旧12类算法，版本保留film-sfx-v2；24组旧音效PCM哈希全部一致。
音效focused 22项通过，包含新3类参数/确定性/时长/锚点及真实film:sfx生成登记/缓存；实际听感未验证。
D/E/F完成后统一完整npm run check退出0：主测试574通过、1项macOS专属跳过，宿主36通过，合计610通过、1跳过、0失败。
packages:build、类型/lint/文档/音频投影/Web/Remotion构建/creator包/宿主compositions均通过；Skill格式校验通过。
原12个system composition的46张PNG与fb2d96a原始源码逐字节一致，旧12类音效24组PCM哈希不变。
详细校准数据在out/p9/def-calibration/，交付说明追加D/E/F章节；未安装依赖、未改lockfile、未推送/发布/合并。

## P9 D/E 纸面风格与物件节奏反应（2026-11-10，未发布）

纸面拼贴/手绘线稿配方已加入四份Skill入口与creator镜像；米白/牛皮纸/笔记纸按内容选，固定seed纸纹，白边投影与深灰手绘线，
仅主色+强调色。已查本机中文字体，未发现手写字体，示例用Noto CJK纸条回退；不使用科技舞台或无含义装饰。
PaperCollageExample的账单/笔/印章均标注语义；图形三条提示在f0/54/60/64/70/128/179均为0，最大3主体。

通用rhythm导出pickRhythmResponse、resolveBoilSeed/useBoilSeed、useRhythmResponse与可选useBreathScale。
章节要求至少三类物件动作，相邻小节主动作轮换，文字阅读时固定；global光闪/缩放不计入物件种类，旧纯函数兼容不变。
beat-response-monotone只提示，summary.beatResponses列出章节物件与kind，缺遥测/边界/测量保留unknown。
真实gallery正例4类物件动作、0单调提示；global-only反例0类物件动作、1条提示，相关unknown均为0。
定向46测试、36宿主测试、6项Skill编译/同步与实际film:check示例通过；完整check结果见上方F记录。

## P9 图形语义与风格规则（2026-11-10，未发布）

四份 Skill 同步：storyboard 开头声明风格、配色、参考方向及内容理由，不默认深色科技风；
每镜头逐项写「图形元素 → 代表」，最多 3 个非文字主体，环境分层可指认，关系线须对应旁白；按帧记录静音描述测试。
示例换成暖白编辑插画（电表/账单）与夜间观测（月亮/望远镜），均声明配色只是示例；旧 gallery 视觉保留。

`film:review` 的 `graphicWarnings`/`graphics` 复用已有 readability 采样，只提示不拦交付。
按 DOM/SVG `data-axmorf-object` 与 subject/relation/background 角色汇总可见绘制边界，
提示不同 subject 重叠 >15%、同帧 subject >3、未标注绘制边界面积和 >10%；列出逐帧可见标注，转场照报并注明。
零透明度、文字、系统标识、全帧背景板与转场覆盖层排除；缺失、失败、复杂裁切与截断保留 unknown。
面积采用包围盒之和，可超过 100%，不是像素覆盖率或自动语义/美学判定；仍需人工静音描述。

真实 gallery 正例三项均为 0，反例重叠 60.95%、4 个主体、未标注面积 15.625%，恰好报三项，无图形 unknown。
v6 只读副本复用默认与既有审片帧的并集 78 帧，78 帧均提示 unlabeled-graphic，图形 unknown/缺失/坏行均为 0；
原目录 21 个片源文件及 172 个公共素材文件哈希未变。证据见本地 `out/p9/` 与
`/home/zzzxc/AgentWorkspace/2026-11-10-p9-graphics-notes.md`。
完整 `npm run check` 退出 0：主测试 557 通过、1 macOS 专属跳过，宿主 33 通过；合计 590 通过、1 跳过、0 失败。
packages:build、packages:typecheck、Skill 格式验证通过；旧 12 个 system composition 的 46 张 PNG 与 fb2d96a 原始源码渲染逐字节一致。
未安装依赖、未改 lockfile/版本或 v6 原片，未 push/publish/merge；没有选定作品最终风格。

## 口播规则修正（2026-11-09，v6 已交付待审阅，未发布）

本条取代下文历史记录中强制品牌母题、12–15 LU、讲述段全面减幅、非旁白运动必须高于口播的要求。P6 冻结，未修改其判据。
AXMORF Studio 是通用视频工具；效果由内容语义决定。AxiomMorph 保留可选，legacy 提醒枚举不再发出。
可选 voiceover 静态 EQ 在唯一母带入口前处理两路配乐；省略保持旧语义。新口播起点 .64/.60，实测目标低 8–10 LU。
事件按句首或经确认绝对帧与精确 hit 同步；当前 timing 只有句级。背景/非阅读主体不因口播全面减幅，阅读文字独立稳定。
首轮80项focused通过；负责人复验后补修同相过零bug：仅连续48 samples双声道零串才作为休止，47及以下保留滤波状态。
同步所有字符串句子锚点指纹失效与OP配方，补充focused45项通过；完整check：551主测试通过、1平台跳过，24宿主通过，packages:build/repack通过。
修后同fixture重新校准：.64/.60 + voiceover，speech gap9.2 LU、mix -1.7 dBTP；官方registry单次授权安装成功，标准browser:prepare及doctor通过。
v6同take、原beat/bar/section网格、配置/封面/publish/bookends保留；三轮审片后交付97.4秒1920×1080/30fps四件套，完整软件解码通过，AAC -15.9LUFS/-2.1dBTP。
负责人最终补充已修：speculate句级musicDips绝对音量0.41990519760136413，与speech取min，Film/测量共用选项；重测窗口差9.0LU、整片旁白区间差9.3LU，默认.64/.60不变。
Open场景1253出场、4帧遮罩，门体1255–1262连续预备、1263全开且标签首次出现。SFX只改for并更新指纹，29条PCM及原music/narration/timing不变。
仅保留负责人接受的f2067软提示（语义揭示在2051，2067为编曲继发拍）及30条NumberRoll定位unknown；本轮无runtime改动，不重复工程全检。负责人独立完整check仍551主测通过+1skip、24宿主通过；真实听感和逐字精度未验证。
实施和验收进度见 [口播混音与 v6 对比进度](promotions/2026-11-09-voiceover-progress.md)。

## P6 局部文字对比提示（2026-11-09，未发布）

`film:review` 新增 `low-contrast-text`：复用已有审片 JPEG 与文字 rect/computed RGBA/textGroup，
4×2 网格估计背景亮度，任一格 WCAG 对比低于 3:1 就提示文字、正片帧、最差位置与比值。
同组碎字和转场命中照报并标注；描边/阴影/底板以实际像素为准，像素/颜色不可用保留 unknown。
`readability.contrast` 记录阈值、测量文字数与像素解码/分析耗时；只分析已有帧图，不额外解码整片，不进入 check/deliver 门禁。
四份 Skill 入口及两份 direction/craft 自检同步，要求文字不跨明暗交界、深色字不放深背景。

v5 复制品全片范围采样 43 帧（原审片 36 帧 + 7 个定点回归帧）、625 个文字块×帧，按 snippet 合并 27 条、86 份低对比测量；
其中 1 条含转场（1 份）、14 条同组形变（63 份），不代表逐帧穷举。新增规则 unknown=0，原前景定位 unknown=102 保留。
「训练账单」f165/f180/f190/f200 全部命中，f190 右上格 1.447:1；像素解码与分析 12498ms。
gallery 的 5 个稳定阅读帧零提示；AxiomMorph f40 的 8 条淡化碎字、SceneTrack f60 的 1 条光带转场、
AxiomStory f190 的 1 条淡入标签已看图并逐条解释。7 张既有示例 PNG 前后逐字节不变。
原 v5 只读，18 个源码/文档/JSON 和 60 个非审片媒体与复制品一致；没有依赖、lockfile、版本或影片变更。

完整 `npm run check` 退出 0：主测试 543 通过、1 macOS 专属跳过，宿主回归 24 通过，合计 567 通过、1 跳过、0 失败；
另通过 studio 包类型检查。说明及前 10 条帧/比值、全量 JSON 索引在
`/home/zzzxc/AgentWorkspace/2026-11-09-contrast-notes.md`（本地产物）。未安装、发布、push 或 merge。

## P6 发布前运行时修复（2026-11-09，未发布）

- studio-v3 的 resolve ending accent 以常量导出 strength=.6（段落档），保留原合成事件/增益；cut/ring 不自动生成结尾 accent。
  真实 v4/v5 重跑 film:music 后 WAV 逐字节不变，music.json 仅 f2590/f2600 强度 1→.6；两份导演手册同步。
- 前景检测使用 20×7 原生命中，临时启用 pointer-events 后同步恢复，按 SVG/HTML 真实绘制顺序判断；
  任一确认命中即提示，unknown 不抵消。修复 AxiomMorph clipping 缺席时把共享祖先当作文字位置、误认背景为前景的问题。
  同组碎字仍排除，不同组件仍能互遮；overlay/overlap 内命中保留，message 标注「转场窗口内」。
- 真实 Chromium 全扫 v5 正片 f0–2621：2622 份测量，0 缺失/截断/坏行/错误；35 条前景提示全部在转场窗口内
  （147 个文字×帧、59 个不同帧），非转场提示 0，f2318 的「变／便」提示 0。5955 个文字×帧定位不完整记录保留 unknown。
  指定两处的芯片/纸张实际绘在文字后方，按用户后续「只报警真正绘在文字上方」要求不伪造前后层级；
  v4 f472–487 另检出两个标签文字框相交的 8.57% 前景采样，前景为「采样参数量」，不是芯片。
- film:voice 保留 provider/音色/语速/文本的单句 PCM 缓存契约；timing.inputFingerprint 只证明剧本/时序匹配。
  两份 Skill 与 architecture 明确整片 take 迁移后 film:check、跳过 film:voice；逐句编辑还需迁移 .axmorf/cache/voice。
  回归覆盖复制整片输出仍调用当前 voice service、迁移单句缓存命中与 voiceId 变化 miss，不调用真实 TTS。

真实宿主遮挡回归接入 check:host：14 项（含父测试）覆盖 SVG/HTML/层级/细边/两种原样布局/合规阅读卡/分组/clipping。
最终 packages:build 与完整 npm run check 退出 0：主测试 532 通过、1 项 macOS 专属跳过，宿主回归 14 通过，合计 546 通过、1 跳过、0 失败。
类型、lint、链接、音频、Web/Remotion 构建、creator 包与宿主 compositions 均通过；5 张既有示例 PNG 与 8 张影片抽检 JPEG 逐字节不变。
详细交付说明与逐帧证据索引在 `/home/zzzxc/AgentWorkspace/2026-11-09-p6-prefix-notes.md`（本地，不随 npm 分发）。
没有依赖、lockfile 或版本修改，没有 push/publish/merge，原 v4/v5 只读。

## P8 p99 判据与强重音连续小图（2026-11-08，未发布）

按方案负责人修订，强重音冲击门槛改为线性 p99：要进入全片（含转场）最大动作之列。
MOTION_ENERGY_ACCENT_PERCENTILE=.99 有注释和回归；summary.motionEnergy.p99 为判据，p95 保留作旧报告对照。
像素预备仍按 [f-8,f-1] 至少 6 帧严格 > 全片中位数 2 倍，只检查整帧运动；message 和 Skill 明确不能据此判断具体配方过程是否被隐藏。

`film:review` 新增 `motion["strong-accent-strip"]`：每个 strength ≥.9 重音返回 frame/strength/frames/image/message，
无论有无告警，均导出 [f-8,f+4] 正片逐帧联系表（边界截断）。复用原 contact-sheet Still 与现有分批 review renderer，
不借稀疏采样、36 格联系表或 6fps 预算代替；重叠帧只渲染一次，缺帧报错，无 animatic 时仍能从当前片源导出。
两份共享 Skill/方向/API 与两份发现入口同步：每张必须人工逐格确认预备、数字/文字过程可见，在 review-notes 按帧号记录结论；
p99/像素预备通过也不能跳过。AxiomMorph 必须规则及缺席提醒未改，以上仍不拦交付。

**校准**：v4 2632 个正片差分，p99=21.706276、p95=4.693455；f490/f2100/f2310/f2590 峰值为
6.278472/4.869653/6.224306/2.443472，四个均报“冲击不够”，另有 beat-sections-static，共 5 条、0 unknown。
gallery p99=32.286433，f30/f150/f270 峰值 124.747361/125.405625/119.236389，预备 6/8/6，能量提示 0、unknown 0。
v4 四张、gallery 三张强重音小图均已逐张看图；f490 的 f482–487 仍“约22亿”，f488 才切出近终值 $21,024，
f489 $21,036，f490 $21,038，确认金额过程只有两帧提前可见，不能把像素预备 8/8 当作过程可见。
抽图解码 v4 3172ms、gallery 862ms。图在 `out/films/v4-strong-accent-calibration/review/strong-accent-strips/f490.jpeg`，
全部逐格结论与路径在 `out/p8-impact-validation/p99-review-notes.md`，数值在 p99-v4-results.json / p99-gallery-results.json。
此修订已按正式决定解决上一阶段的验收矛盾，下面原 p95 阶段的待决状态仅为历史记录。

**验证**：完整 `npm run check` 退出 0：530 项测试，529 通过、1 项 macOS 专属测试在 Linux 跳过、0 失败；
类型、lint、文档/音频、Web/Remotion 构建、creator 包和宿主 compositions 全通过。新增 p99 与连续小图 5 项回归。
43 项定向测试、5 项 Skill 编译/同步测试与 Skill 规范验证通过。三个既有 still（MusicSyncGallery f150、SceneTrackGallery f45、
Recipe-CameraMove f45）再次与初始基线逐字节相同；本轮没有改任何 Remotion 视觉源码或既有交付。
未安装依赖、未改 lockfile/版本/node_modules、未 push/publish/merge。详细交付说明末尾的“判据修订”记录数值、路径及人工结论。

## P8 追加预备动作与母题提醒（2026-11-08，未发布）

`accent-underplayed` 对 strength ≥.9 增加预备判据：[f-8,f-1] 至少 6 帧能量严格 > 全片中位数 2 倍；
冲击仍用 [f-1,f+3] 峰值 ≥ p95。同一重音最多一条，message 区分“缺预备”“冲击不够”，可列两原因。
窗口、帧数、倍率均为注释常量，summary 新增 median / anticipationThreshold / anticipationFrames；旧报告保持兼容。
`axiom-morph-missing` 在完整遥测中全片没有 AxiomMorph 时软提醒一次，任一时段存在就不提醒；
缺失/截断且未发现时 unknown，不按旁白关键词猜测，也不接交付门禁。

两份共享 SKILL.md/direction.md 与两份发现入口同步强化：最强重音前必须至少 6 帧可见预备，不能藏过程只露终值；
旧公理/新公理候选必须用 AxiomMorph 的要求没有弱化。编译示例提前 8 帧后移/收缩主体，镜头适度后拉蓄力。

**校准**：更新 gallery 300 帧的 median=1.158194、2 倍阈值=2.316389、p95=11.206083，
f30/f150/f270 合格预备帧数 6/8/6，冲击峰值 124.747361/125.405625/119.236389，为全片最大三帧。
节拍/讲述窗口中位数 2.053125/.739583，能量两项提示 0；解码/计算 339ms。
真实浏览器母题正反例各 20 份完整遥测，保留 AxiomMorph 为 0 提示，去掉后恰好 1 条，相关 unknown 0。
v4 完整遥测 176 份，AxiomMorph 33 次采样/3 个唯一事件，缺席提示 0；只移除该配方的对照版为 1。

**未通过的验收项**：指定的全画面 MAD 判据无法让 v4 f490 报出“缺预备”。
全片中位数 .237257，2 倍阈值 .474514；f482–489 能量为 6.065694/3.884792/4.535417/3.631042/
3.136736/2.551736/9.293333/1.994514，八帧全部合格，且冲击峰值 6.278472 > p95 4.693455。
已看给定序列图，隐藏 NumberRoll 的问题属实；全画面运动可来自其他物体/镜头，不能证明该主体过程可见。
已报告方案负责人，等待保留指定判据记录漏报或另定主体可见性判据的选择，不改阈值、不硬编码帧号、不伪造命中。
所以不能把追加任务的全部验收宣称通过。详细数值与证据追加在原 impact notes，工程文件在 out/p8-impact-validation。

**工程验证**：完整 `npm run check` 退出 0：525 项，524 通过、1 项 macOS 专属跳过、0 失败。
新增 5 项边界/预备原因/母题回归；43 项定向测试全通过。类型、lint、链接、音频、Web/Remotion 构建、creator 包、宿主 compositions 均通过。
三个既有 still 与原基线 byte-identical；教学示例只因可见预备的后移/收缩与镜头蓄力而有意变化，f23/f26/f29 已看图。
无依赖、lockfile、版本或旧交付修改，无 push/publish/merge。工程检查通过不等于 f490 漏报验收通过。

## P8 重音力度与节拍段运动（2026-11-08，未发布）

`useImpact` / `resolveImpact` 暴露当前窗口选中的 `strength`，旧帧数组默认 1，原包络数值保持兼容。
`resolveImpactLevel` 按 <.5 / [.5,.9) / ≥.9 提供三档单调幅度；强档主体峰值 1.12、镜头 zoom 增量 .12、
shake 16px、可选闪光 .5（示例最多 4 帧）、40 粒子。单测锁住数值、边界、下一事件蓄力选择与单调性。

两份共享 direction/API 与两份 Claude 发现入口按原机制同步；强重音必须有全片最大主体形变/碎裂/数字落定之一
及镜头冲击，转场不得盖过它，节拍段 L1/L2 幅度高于讲述段。RhythmDirectionExample 同步改用强度预设，
主体形变、镜头、粒子与短闪光在重音同帧落点；逐字同步与 TypeScript 片段编译测试通过。

`film:review` 增加 `accent-underplayed` / `beat-sections-static`，仍只提示、不接交付门禁。
从 fresh animatic 解码全部连续正片帧，排除片头片尾；160×90 灰度相邻帧 MAD，差分标在右侧帧 f，不伪造 E[0]。
强度 ≥.9 的 [f-1,f+3] 峰值低于全片 p95 提示；非旁白中位数不高于讲述段提示。
summary.motionEnergy / motion.energy 保存数值与逐帧 JSON 路径。缺失/过期/不完整 animatic、缺强度或缺比较组保持 unknown。
Workspace FFmpeg 不含 rawvideo/select，使用已有 trim + 无损灰度 PNG，逐张读取、自有 scratch 清理，单次解码 120 秒上限。

**校准**：v4 只读交付偏移 60 帧，2633 正片帧解码/计算 1819ms，p95=4.693455；
强重音 f490/f2100/f2310/f2590 峰值 6.278472/4.869653/6.224306/2.443472，仅 f2590 触发力度提示；
节拍中位数 .160903 ≤ 讲述 .240000，触发静止提示，总计 2 条、0 unknown。
独立系统 FFmpeg + 原 NumPy 算法对照 2632 差分，最大误差 .000001797（浮点精度）。
合规 300 帧 gallery 的 f30/f150/f270 峰值 122.312708/123.475694/117.607014，恰好全片最大三帧；
p95=11.418556，节拍中位数 1.261875 > 讲述窗口 .626806（2.013 倍），0 新提示、0 unknown，解码/计算 326ms。
gallery 使用明确标注的工程阅读窗口，无旁白音轨，不代表新 Agent 成片或真实旁白听审。

**验证**：完整 `npm run check` 退出 0：520 项测试，519 通过、1 项 macOS 专属测试在 Linux 跳过、0 失败；
含类型、lint、文档/音频检查、Web/Remotion 构建、creator 包和宿主 compositions。新增 11 项回归。
Skill 规范校验通过。MusicSyncGallery f150、SceneTrackGallery f45、Recipe-CameraMove f45 三对 still 逐字节相同。
教学示例 RhythmDirectionExample 因本次要求的分级动作与 L1/L2 调整有意变化，已看 f150 冲击和 f155 回弹真实 still。
未改依赖/lockfile/版本、旧影片或交付，没有 push/publish/merge。工程证据在 `out/p8-impact-validation/`；
详细说明在 `/home/zzzxc/AgentWorkspace/2026-11-08-p8-impact-notes.md`，v4 素材全程只读。

## P8 studio-v3 音色与默认流程（2026-11-08，未发布）

已移植声音实验室的合成做法：分层 kick click/body、snare 噪声/音高体、开合 hat、鼓 fill、咬合 bass、调内 pad/pluck、
短房间卷积、3:1 RMS 总线压缩和峰值限制。Gaussian PRNG、Butterworth 与 FFT 均在 JS 内确定性执行，无新增依赖。
保留旧 v2、bars-only 和原始引擎音频/时间线哈希。sections.from/hits/breaks/ending/bpmRange 两代引擎通用。

v3 onsets 新增可选 fills/breaks {from,to} 与 accents {frame,strength}，accentFrames 一致；pulse 支持 fill/break，impact 支持强度，
rhythm-sync 识别新增重音。单测从 PCM 实测 24/30/59/120fps 起音、fill、数字零 break 和母带后起音，0 帧误差。
原 loudnorm 会预振铃使 f30 kick 的第一非零采样落到 f29；v3 独立测量 R128 后线性缩放原 PCM，v2 母带不变。
没有移植离线旁白侧链，仍由 FilmSoundtrack 逐句 duck 一次。

film-sfx-v2 对未显式 pitch 的 chime/shimmer/swell/riser/impact/thud/tick 读取 score tonic/mode，对齐基音或滑音落点到主音。
显式 pitch（含 0）与噪声拟音保持原样；旧 v1 指纹、PCM、许可按 v1 核验，检查不因版本升级强制重生成。
新片脚手架和两份共享 Skill/两份发现入口改用 v3，推荐显式 .64/.34；旧 schema 隐式 .24/.09 不变。
30 秒教学谱 + 现有 -16 LUFS 旁白 + 三条 SFX（intensity .18–.30），实测讲述低 14.0 LU、开场/收尾低 7.1/7.9 LU，
混音 -3.6 dBTP。MusicSyncGallery 使用独立 v3 fixture id，保护既有工程预览。

校准入口：`node --import tsx scripts/films/score/calibrate-v3.ts <existing-voice.wav> <timing.json> <output-dir>`。
不调用 TTS，输入素材只读；样例是教学谱的 30 秒母带配乐，播放音量尚未乘入。主观质感仍需用户试听。

**验证**：完整 `npm run check` 退出 0：509 项，508 通过、1 项 macOS 专属测试在 Linux 跳过、0 失败；
含类型、lint、文档、音频种子、Web/Remotion 构建、creator 包和宿主 compositions。另与 29b2c3e 独立加载的引擎比较
原始/手写原始编曲、v2 bars-only、v2 storyboard 共 10 组，原始 WAV、时间线和母带 WAV 均逐字节相同。
真实浏览器 v3 校准各 20 份完整遥测：合规计划四项 5/5，0 条提示；移除 f150 impact 后恰好新增 1 条
f150 accent-without-visual。没有场景轨的旧规则仍为 unknown，不作通过。工程预览和原始测量在 out/p8-v3-validation/ 与
.axmorf/v3-calibration/；两次母带 MD5 一致，30 秒样例 MD5 为 eea849cd3dad86d6334a9b4fd79e9b8a。

## BPM 自动选择修正（2026-11-08，未发布）

`bpmRange` 仍扫描 0.01 BPM 网格、端点与中点，先筛选所有 section 锚点残差都在 ±3 帧内的候选，
再取最接近显式 `bpm`（未写时为范围中点）的速度；同距取残差平方和更小者，仍相同取较小 BPM。
无可行候选时最小化 Σ(残差 / 每小节帧数)²，消除原始帧误差对快速度的偏好；可行性与 `film:music`
警告共用 3 帧常量，警告文案不变。固定 BPM 的 bars-only 与 storyboard score 三种风格音频/timeline 哈希不变。

预期示例变化：MusicSyncGallery fixture 从 119.76 → 118.28 BPM，章节从 f0/120/240 → f0/122/243，
残差 `[0,2,3]`，小节期望为 f0/61/122/183/243；30 秒 music.md 教学谱从 100.06 → 100.48 BPM，
章节期望由 f0/216/504/576/720 改为 f0/215/502/573/717，残差断言由全 0 改为全部在 ±3 帧内，
精确 hit f576 不变。两份共享 music.md 同步，两个 `.claude` 入口继续引用共享 Skill；示例 `[96,116]`
与 direction.md 讲解片范围一致。没有改合成器音色、混音、接口、依赖或 lockfile。

**验证**：完整 `npm run check` 退出 0（501 项：500 通过、1 项 macOS 专属测试在 Linux 跳过、0 失败），
含类型、lint、文档/音频检查、Web/Remotion 构建、creator 包检查和宿主 compositions。新增 6 项回归，覆盖
上限偏差、全锚点可行性、显式 BPM、归一化回退、同距排序/确定性、固定 BPM 字节及 3 帧警告边界。
MusicSyncGallery f150/f152 和 RhythmDirectionExample f150 still 已渲染并看图：kick 灯从 f150 改为新 onset f152，
精确 hit 仍为 f150。新网格的真实浏览器校准各取得 20 份完整遥测：合规版 accents/landings/sounds/bars 全部 5/5，
0 条提示；删除 f150 impact 后恰好报 1 条 f150 accent-without-visual。没有场景轨的旧规则仍为 unknown。
证据在 `out/bpm-selection-validation/`，未更新图像快照，也未提交片源、媒体或生成投影。

## P8 节奏运行时与导演 Skill（2026-11-08，未发布）

完成音乐网格驱动动效的方法与工具，不改合成器引擎、旧片源码、依赖/lockfile 或版本，不 push/publish/merge。
声音实验室的音色升级未移植，本批不代表全新 Agent 重做整片的 P8.4 审美/听审验收。

- `@axmorf/studio/remotion` 新增 `lastAtOrBefore`、`resolve/useBeatPulse`、`resolve/useNarrationActive`、
  `resolveBreathScale`、`resolve/useBarCamera`、`barCameraShots` 与 `resolve/useImpact`。
  L1 默认讲述段 1.2%、节拍段 3.5%；L2 小节起点 spring（18/120）走向下一机位后稳住，耗尽后停住；
  L3 前 6 帧蓄力、落点开始 spring（11/260/.6）回弹、后 6 帧确定性 shake。机位接原生世界 center/zoom，固定视差锚点。
  hook 在 Film 根使用，Sequence 内可传正片根 frame；旧 track 缺 onsets 时 kick 回退 beatFrames，无配乐 pulse=0。
- review-only 遥测上报完整事件计划，稀疏采样仍保留精确落点；音效日志保留真实 start/end/center anchor，不改播放。
  `motion.summary.rhythmSync` 统计重音/落点/声音/小节的 total/matched；新增 accent-without-visual、visual-without-sound、
  sound-without-visual、bar-without-change。诊断容差 ±2 帧，导演 L3 要求仍为 0 帧。
  缺配乐/精确遥测、截断或歧义保持 unknown；软提示不拦检查或交付。
- 两份 `.agents` Skill 正文与 references 全树一致，两份 `.claude` 保留共享正文的发现 adapter 且互相一致。
  新增 `references/direction.md`，统一音乐先行顺序、每小节 storyboard、三层动效、动作派生音效、混音、审片与反模式。
  craft/music/sound 去除冲突与重复规则。完整 TSX 片段与 `RhythmDirectionExample.tsx` 逐字一致，由测试实际编译。
  文档和 film:new 的配乐建议为显式 .24/.145；film:new 仍默认 music:null，schema 的旧隐式 .09 不变。

**验证**：完整 `npm run check` 退出 0：495 项测试，494 通过、1 项 macOS 专属测试在 Linux 跳过、0 失败；
包括类型、lint、文档链接/命令、种子音频、Web/Remotion 构建、creator 包检查和宿主 compositions。
新增 16 项测试覆盖边界、衰减、回退、旁白区间、camera 越界/耗尽、impact 落点/过冲/确定性、四条同步规则、
start/end/center 声音锚点、未知/截断/歧义与完整 Skill 同步；默认 music.md 的 30 秒 JSON 谱也实际生成，
避免配置因不足一小节的段落而无法运行。Skill 规范验证通过；独立只读前向验证未发现 API 接线阻断。
既有 Zod 4.6.7 / Remotion 建议 4.3.6 提示仍保留，不为消除提示改依赖。

**真实浏览器校准**：用 MusicSyncGallery 的配乐网格（重音 f0/120/150/240/270，小节 f0/60/120/180/240）
渲染新最小示例，沿用 ReviewMotionProvider/ReviewMeasure 每 15 帧采样，共 20 份完整遥测，无坏行/缺帧。
合规版本 accents/landings/sounds/bars 全部 5/5 匹配，0 warning；删除 f150 impact 后 accents 变为 4/5，
恰好新增 f150 的 accent-without-visual。未配置场景轨的旧规则仍为 unknown，不当作已通过。
新示例 f150 still 已看图；它是接线示例，不是成片构图模板或声音质感验收。

**旧画面回归**：MusicSyncGallery f150（含真实 music/sfx props）与 SceneTrackGallery f45 在独立 80ff22a checkout
和当前代码渲染；Recipe-CameraMove f45 对比改动前基线。三对 PNG 均 cmp 逐字节相同。
证据在仓库外 `/home/zzzxc/AgentWorkspace/p8-validation/`，交付说明在
`/home/zzzxc/AgentWorkspace/2026-11-08-p8-runtime-skill-notes.md`。未做完整旧影片逐帧比对、真实人耳听审或新 Agent 成片；
没有替换原交付。

## P7 每片原创声音与帧级同步（2026-11-07，未发布）

本批完成声音工具链与 10 秒工程示例；不改版本、不发布、不 push。没有重做 v3 整片声音、没有替换原交付，
不代表 P5 用户听审或 P6 通过。v3 原 Workspace 只读，19 个片源文件 SHA256 与此前基线完全一致。

- `film.json.sound.effects` 为严格 schema：唯一 id、12 种 kind、正片帧、动作时长、start/end/center anchor、
  pitch/brightness/intensity/tail/stereo/seed 与可见用途。`film:sfx` 离线确定性合成每片 WAV，记录合成器版本、
  内容指纹、PCM 样本时长、实际起止/对齐帧；按指纹和音频 checksum 缓存，登记原创 Apache-2.0，来源进入 publish.json。
  `film:check` 核验计划、投影、音频、对齐和许可，过期提示重生成。删除计划后重新生成空投影，不 broad-delete 原 WAV。
- studio-v2 支持 `sections.from` 句子 id/正片帧与 bars 混排、`bpmRange` 搜索、精确 hits、真正的编曲 breaks、
  resolve/cut/ring ending。搜索步长 0.01 BPM，另含端点与中点，最小化整数帧残差平方和；同分取最接近范围中点者。
  breaks 同时排除未保留乐器的干声、混响和延迟尾音。锚定配乐不循环、不挪旁白字幕；残差超过 3 帧给建议，
  提醒锁定画面不得为卡拍移动。三种旧 bars-only 风格的音频和 timeline 哈希与修改前完全相同。
- `generated/music.json.onsets` 导出 kick/snare/clap/hat/bass/hits/sections，时刻直接来自合成事件。
  `<FilmSoundEffects />` 默认播放本片计划，显式 cue 支持 `plan:<id>`；review 计入计划音效。
  配方/场景轨新增 kind/动作时长建议；旧共享角色、track、显式 cues 继续兼容。
- `useFilmMusicEnergy()` 用现有 media-utils 4.0.489 的窗口 PCM 和 visualizeAudio，输出对数低/中/高能量；
  只做次级辉光/呼吸，主要落点用事件帧。固定 PCM 邻域和无状态平滑消除加载顺序影响；
  对 pinned API 拼接不连续 Range 窗口的行为显式等待，避免长音频缺中间窗口时误读后段数据。
- 两份 Film Skill 镜像逐字一致，默认流程改为 storyboard → 锚定 score → 逐动作 effects → film:music/film:sfx →
  onset 次级运动；除非用户指定，不选 track 或共享音效。审片要求逐条给动作/声音起止帧、onset/accent 帧号及偏移。
  README、architecture、API、术语和 creator 命令同步。

**验证**：完整 `npm run check` 通过（479 项：478 通过，Linux 跳过 1 项 macOS 测试），覆盖类型、lint、文档链接、
音频种子、Web/Remotion 构建、creator 包检查与宿主 compositions；runtime `build:runtime`、`build:types` 通过。
新增 36 项测试，覆盖全部音效 kind/参数/anchor、字节确定性与缓存、损坏/过期/许可、CLI→registry→check→publish、
速度搜索/残差、hits/breaks/ending、三种风格旧哈希、onset 与合成样本起点、句子同总长变时序的 fingerprint、
计划播放/review 计数，以及对数能量、乱序加载、20 秒长音频缺窗口。
Remotion 保留当前依赖的既有 Zod 版本提示（4.6.7 / 建议 4.3.6）；未为消除提示改依赖或检查器。

**真实预览**：`MusicSyncGallery`，1920×1080 / 30fps / 300 视频帧（10 秒；AAC 容器含 48ms 编码尾垫）。
`[96,124]` 搜索得到 119.76 BPM，章节 f0/f120/f240 残差均 0；break f120–150 只留 pad，hit f150，解决和弦 f270。
Kick onset 为 f150/165/180/195/210/225，灯在同一帧亮，辉光读取 low。12 种音效各有可见动作区间。
f165 两次独立 PNG 渲染逐字节相同，已看图。fixture `film:check` 服务通过，无错误或警告；
CLI 路由与生成 Workspace 的 npm script 在测试中覆盖，本仓库 checkout 无 Workspace marker，不伪造 marker 跑 doctor。

预览目录 `/home/zzzxc/AgentWorkspace/backups/axmorf-p7-preview/`：`preview.mp4`、`music.wav`、`sfx/<kind>.wav`、
两张 still、输入/生成 JSON、`media-validation.json`。FFmpeg 全部完整解码、非静音；预览 −21.66 LUFS / −7.21 dBTP，
独立配乐 −14.23 LUFS / −2.66 dBTP；12 种 SFX 真峰值 −7.35 至 −5.92 dBTP，均低于 −1 dBFS。
少于 400ms 的 tick/click/glitch 没有有效 integrated LUFS，以非静音峰值验证，不把 −∞ 响度误作静音。
代码与验证记录在 `out/p7-validation/` 和 `out/p7-*.log`，不提交片源、媒体或生成投影。

可复现入口（仓库开发用途，首次创建保留本地 fixture，已有同名片时拒绝覆盖）：

```bash
node --import tsx scripts/films/preview-sound.ts
npx remotion render src/index.ts MusicSyncGallery out/p7-preview.mp4 --props=out/p7-validation/gallery-props.json
```

**尚未验证**：人耳音色/混音/连续听审、更多实际片型、全新包安装升级；v3 整片声音重做和新旧视频流 `framemd5` 尚未执行。
该项仍遵守第 9.5 节：后续锁定画面代码及帧号，逐帧 md5 全相同并经用户听审后，才能继续后续验收。

## P5-v3 rc 前运行时与审片修正（2026-11-07，未发布）

本批修正 mask-wipe、文字组遮挡采样与状态标识；用 v3 片源复制品复测，没有新 Agent 重做片子，
不改版本、不发布、不进入 P6。v3 原 Workspace 只读，19 个片源文件的 SHA256 复验未变。

- `mask-wipe` 从硬边纯色路径改为确定性的羽化渐变光带：半透明暖白、窄亮边、低不透明度中心，
  可选 `enter.tint` 调色。仅透传外观参数，resolver 的窗口、Sequence 时长、场景时钟和 cue 不变；其他转场不变。
  gallery 改为深→浅默认色、浅→深自定义 tint，分别渲染约 25%/50%/75% 的 1920×1080 still；
  v3 f1014/f1019/f1023 与 f2276 也已渲染、看图。gallery f30 独立渲染两次 PNG 逐字节一致。
- `AxiomMorph`、`NumberRoll` 的根字形容器带 `data-axmorf-text-group`。前景采样只忽略同一最近组元素内的字形互挡，
  不按属性字符串把不同实例合并；外部图形、其他组与嵌套组仍判遮挡。pointer-events:none 的同组兄弟排除，
  被测文字自身或外部前景命中不可靠时仍为 unknown。没有放宽采样、opacity 或覆盖阈值。
- 新增公共 `FilmStatusTag` 与 props 导出，六种默认状态文案和自定义文本、detail、position、style；
  默认字号由当前画布的正文最低字号和默认字幕字号共同推导，主副词同字号、同暖白颜色、独立不透明深底。
  `data-axmorf-status-tag` 进入 review；`small-status-tag` 用实测（含缩放）字号与实测字幕的 70% 比较，
  句间没有字幕时用画布默认字幕字号。遥测新字段 optional，兼容旧日志；字幕字号公式共享后原导出与计算结果保持一致。
  该提示只在 review，不接入 `film:check` 或 deliver。两份 Skill 的 craft/api/SKILL 逐字一致，
  要求内容状态标识统一用该组件，并核对 `small-status-tag`、底板与实际对比。

**v3 实测**（1920×1080 / 30fps；DOM computed style + review 几何测量，f61/f545/f2106/f2100）：

| 项 | 替换前字号 / 颜色 | 替换后字号 / 颜色 |
| --- | --- | --- |
| 主词 | 38px / `#eaf3ed` | 43.03px / `#fff4e3` |
| 副词 | 34px / `#a7bdc2` | 43.03px / `#fff4e3` |
| 字幕 | 48.09px / `#eaf3ed` | 48.09px / `#eaf3ed`（不变） |

新组件 computed font-size 为 43px，字幕为 48px；上表保留 review 对布局取整后的实测值。
底板实测 `#101c28`。复制品只改 `scenes/design.tsx` 中的手写 Status 为 `FilmStatusTag`，
并把状态栏放到上方空位（left=900、top=24），避免新增底板压住原有移动标题；其他 18 个片源文件逐字节一致。
五个全尺寸前后帧（另含 f1783「可能没公开」所在镜头）的完整 RGB 比较，在状态栏所在 y=[24,153) 之外差异均为 0；
没有改其他画面、旁白、音乐、字幕或时序，也没有修改原片。

**真实 review**：同一组 53 个帧、177 个运动样本、7 场景、29 cue；修复前复现 19 条 `text-under-foreground`，
修复后按 snippet 合并为 **13 条**，同组碎字的非转场误报消失；没有 `small-status-tag` 或其他可读性规则提示。
两轮测量的 missingFrames/truncatedFrames/errors/unknown 均为空、badLines=0；最终 motionWarnings 为空。
剩余前景提示全部在转场帧：

- f1223（match-scale）：此前实验、数据准备、人力、未计入，共 4 条，两世界短暂叠合。
- f2276（mask-wipe）：`$21k`、一次训练、＝、便、宜、训、练、研、发，共 9 条。
  羽化带中心可透出画面，但现有 elementsFromPoint 按几何命中，不按渐变每个像素的 alpha 判断，仍可能高估覆盖。
  新光带几何范围比旧路径更宽，新增「训/练」两条转场命中；未通过跳过转场、放宽阈值或扩大本批判定方案来消除它们。

完整 `npm run check` 通过（443 项：442 通过，Linux 跳过 1 项 macOS 专用测试），含 typecheck、lint、
文档/素材检查、Web/Remotion 构建、creator 包检查及宿主 compositions。新增 6 项回归覆盖 tint 时序不变、
同组/不同组/嵌套组/外部前景与 unknown、状态文案/自定义样式/画布字号、主副词 70% 临界值及旧遥测兼容；
包级 typecheck、runtime `build:types` 与 `check:package` 也通过。现有检查未降低，未新增依赖。

预览在 `/home/zzzxc/AgentWorkspace/backups/axmorf-prerelease/`：`mask-wipe-{25,50,75}.png`、
`mask-wipe-tint-*.png`、`mask-wipe-v3-*.png`，以及 f61/f545/f2106/f2100/f1783 的
`status-tag-before-*.png`、`status-tag-after-*.png`、`status-tag-compare-*.png`（左旧右新）。
审片、原始日志、字号/颜色、源文件 hash、RGB 对比、修改前后片源与检查记录保存在本 worktree 的
`out/prerelease-validation/`；临时片已通过仓库 film CLI 的 delete owned-path 清理，不提交片源、媒体或输出。

尚未验证：人工连续播放与听审、手机真机观感、更多片型的提示泛化、完整成片重渲/交付及新包安装升级；
本批没有让新 Agent 重新制作，也不代表 P5 用户验收通过。

## P5 审片反馈修正（2026-11-07，未发布）

本批只改运行时、Skill 与文档，没有重做、交付或发布影片；后续由全新 Agent 做 P5-v3 验证 Skill 引导。

- Skill 的分镜/编写流程与 craft 构思/章节明确要求：旁白出现旧公理或新公理候选时，用 `AxiomMorph`
  从旧公理形变到候选，必读横屏示例并在 storyboard 写句子 id 与出现/形变/落定/阅读帧。
  补入空容器约 0.3 秒内开始出内容、不得等待超过约 0.5 秒、前景避让阅读文字、状态标识正文级字号
  （不低于 `minimumReadableFontSize`）与清楚对比、手机亮度建议，并逐条审片；两份 Skill 逐字一致。
- `NumberRoll` 的所有列改由同一个单调递增的定点整数生成（非负从 0 起，负目标从显示目标的两倍起）；
  保持 props 签名与原有返回字段类型，新增当前 `displayText` 与位移 `offsetInEm`。
  千分位、小数、符号、前后缀保持支持，`turns` 保留为递增速度控制；回弹只动位置，不动数值。
  显示精度向下取值，避免舍入后超过事实目标；配方卡提醒过程数值不得大于目标或与旁白矛盾。
- `text-under-foreground`：对非字幕的可见文字矩形做 10×3 点 `elementsFromPoint` 测量，
  累积 opacity ≥0.3 的非字幕前景覆盖 ≥20% 时在 `readabilityWarnings` 提示，附帧与覆盖比例。
  忽略透明布局容器；pointer-events:none 等不可靠命中在 `readability.unknown` 中保留，不报遮挡警告。
  新遥测字段 optional，兼容旧日志；采样、opacity 与覆盖阈值均为待校准常量。
- `repeated-composition`：以单一完整场景轨的边界和内部候选切点分段，排除转场窗口与不足 1 秒的切点碎段，
  渲染精确中点，比较所有非相邻段落的 64×64 灰度签名，MAD <12 时提示两个帧号，包含有旁白时段。
  无场景轨、日志不完整/歧义或缺中点签名为 unknown。阈值待校准；没有添加新的镜头识别器。
- release 指南、根 README/creator 升级说明和模板 README 记录 npmmirror + prefer-offline 的 `three@undefined`
  （ERESOLVE）及官方 registry / prefer-online 环境变量；未改依赖或使用安装绕过参数。

真实验证只读取试用 Workspace，复制 17 个片源文件及媒体到当前 worktree 的临时 fixture，确认片源 SHA256
逐项一致；没有向主 checkout、ai Workspace、试用 Workspace 写入，也未调用 TTS。
更新 runtime build 后跑 P5 `film:review`，2643 帧正片 / 30fps，177 个运动样本、6 场景、31 cue；
readability/motion 无 missingFrames、badLines、truncated 或 unknown。`text-under-foreground` 输出 9 条：

```text
"64 × H100": f873，20%
"此前实验": f1161，37%
"接口匹配 · 证明能用": f2176 / f2215，67% / 33%
```

`repeated-composition` 的 P5 输出为 `[]`：结尾在同一场景 `[1936,2643)`，没有检测到内部切点，
只取到一个中点 f2289，无法把结尾三个镜头互相比对。六段的中点为 f135/f645/f1188/f1494/f1782/f2289；
非相邻中点均未达到 MAD <12 的提示阈值（另以 0.25 scale 中点图复核，最小 MAD 约 23.65）。
曾评估改为按旁白句子分段（取句中点签名，两两比较句序相差 ≥2 的句子）：结尾 candidate2/question 的 MAD 为 23.46，
要报出它须把阈值放到 23.46 以上，此时另有 47 对误报（40 对跨章节，如 lab/counter、cluster/people）。现有低清灰度 MAD 签名
分不开“同构图”与“同画风”，故未采用，保留场景/切点分段；结尾构图雷同改由 Skill 审片清单人工核对（craft.md 跨段构图与第 2 条）。没有为制造命中而放宽阈值或新增镜头分段；
这条规则的正例/反例、仅相邻不报、阈值边界与 unknown 已有单测，但 P5 结尾仍是已知漏检，不能宣称该处已被识别。

新增 16 项回归：NumberRoll 10 项（逐帧解析实际列、千分位/小数/带数字前后缀、负数/0、高精度、
不同 turns 与向下舍入）；前景 3 项（20% 边界、字幕/离屏跳过、跨帧合并、unknown/旧日志及 schema）；
构图 3 项（非相邻/旁白、阈值、unknown、场景/内部切点与转场排除）。
完整 `npm run check` 通过（437 项：436 通过，Linux 跳过 1 项 macOS 专用测试），含 typecheck、lint、
文档/素材检查、Web/Remotion 构建、creator 包检查与宿主 compositions；
两包构建、包级 typecheck、runtime `build:types` 和 `check:package` 也通过。
NumberRoll gallery 已重渲 1920×1080 / 30fps / 108 帧 H.264 + AAC 双声道短片及 f25/40/63/65/100 still；
运动与停稳画面已看图，完整解码至 EOF 通过，f40 为 ¥10,097.35、f100 为 ¥12,804.75。

证据在本 worktree `out/p5-fixes-validation/`（ignored）：review.json、review-original.json、review/、
fixture-source/、source-sha256.json、midpoints/（中点图与距离对照）、gallery/（预览、still、media-validation.json）。
临时片已按 `film:delete` 的 owned-path 清理；片源副本、媒体和验证输出不提交。
尚未验证：P5-v3、新 Agent 是否遵循新增 Skill 规则、更多片型的提示阈值泛化、人工连续播放听审、
npmmirror 安装修复环境变量的本次重现实跑。两条新提示均未接入 `film:check` 或交付门禁，现有检查未降低。

## 审片运动提示与 animatic P3（2026-11-07，未发布）

按 [实施方案](promotions/2026-11-06-cinematic-motion-and-sound.md) 完成第 4 节及 deliver 提醒：

- review 专用 context 收集场景轨边界/kind/mode/窗口、已解析音效 cue、六个配方关键帧与镜头预设、
  WorldCamera 使用情况（含 FilmSoundtrack 的 ending 音效）。沿用 readability 的 warn 日志通道、固定标记 +
  单行 JSON、contracts schema、ANSI/tag 容错；正片/封面/片头片尾不输出 review 遥测。
- 默认每 0.5 秒以 0.125 scale 采样，用既有 readFrameSignature 生成 `motion-curve.json`（每秒变化量、候选切点及
  采样区间）和内部 Still 绘制的 `motion-curve.png`。`motion.boundaryChecks` 将候选切点区间与已知场景边界核对，
  不把半秒采样伪装为逐帧精确切点。每批最多 48 帧、遥测每帧最多 16 KB，避免进程 1 MiB 日志尾部截断。
- 新增纯函数提示 enter-then-hold、hard-cut-heavy、no-sound-effects、off-beat-cuts、static-camera；
  motion 摘要包含统计、曲线路径、密集帧路径、unknown、missingFrames/badLines。旧手写 Audio/Html5Audio
  （含 import 别名）和 sound-effects/staticFile 识别为 unknown；无带 chapter 的场景轨不报 static-camera。
  enter-then-hold 和 stillWarnings 重叠时不重复报；不确定的精确踩拍判断写 unknown。
- 标记时段以 6 fps、每段最多 3 秒输出 `dense/<rule>-<from>-<to>/`，全片最多 108 张，另报 denseSkipped。
  `--animatic` 默认关闭，开启时用交付组合（含系统片头片尾）、短边 360、原 fps、H.264/AAC 双声道输出
  `review/animatic.mp4`，沿用 Workspace 渲染超时；不写入 deliveries。普通 review 保留已有 animatic。
- deliver 新增 animaticReminder，按本片源码、film.json、generated 与本片媒体 mtime 判断缺失/过期；
  读取失败也只提醒，未改变现有错误/许可/画质检查，未把 motion 提示接入 film:check 或交付门禁。

旧片校准：仅从 ai Workspace **读取并复制** `ai-small-lab-training-cost-20261106` 的片源、实测 timing/music 和媒体，
在当前 worktree 的临时 fixture 运行真实 film:review；未向 ai Workspace 写入或调用 TTS。正片 2643 帧 / 30fps
（88.1 秒），177 个连续样本，无遥测缺帧/坏行；stillWarnings 为空。初始切点阈值 8 把持续平移也算成切点（48 个），
校准为 45 后得到 16 个候选切点；旧片的连续运动可达 MAD 35，背景硬切超过 130。入场后的停留允许 20% 的
采样含收尾/字幕变化，同时要求平均变化 <3，避免用单次字幕切换否定整段停留。阈值仍注释「待校准」，P5 再复验。
最终 motionWarnings：enter-then-hold `[0,120)`、`[120,285)`；hard-cut-heavy `[0,2643)`；
no-sound-effects `[0,2643)`。cueCount=0；off-beat-cuts（缺精确边界）与 static-camera（旧片无场景轨）为 unknown。
四个标记区间生成 72 张密集帧，无预算跳过。示例：

```json
{
  "rule": "no-sound-effects",
  "frames": [0, 2643],
  "message": "Narrated film exceeds 30 seconds and has no sound-effect cues; consider sound tied to visible actions."
}
```

真实验收：P1 gallery 派生 fixture 识别 3 场景、4 cue、NumberRoll/CameraMove 关键帧、push-in 及 2 个
WorldCamera 样本；跨章节两段 static-camera 提示产生 12 张密集帧，曲线与边界核对正常，无 missingFrames/badLines。
animatic 为 640×360 / 30fps / 390 帧（90 帧正片 + 300 帧系统片头片尾），846,036 字节；
inspectFilmVideo 校验与完整解码通过，AAC 双声道，解码 PCM 峰值 7553、79,311 个非零 mono samples，确认为有声音。
曲线与密集帧已看图；另以 warn 级别实渲正常正片确认无 review 日志，普通 review 实跑确认 animatic 大小/mtime 未变。
证据保存在当前 worktree 的 `out/p3-validation/`（ignored）：两片各有 review.json、review-original.json、
review/ 和 fixture-source/；整理后的 review.json 路径已指向保留目录。预览：
`out/p3-validation/p3-motion-probe/review/animatic.mp4`，媒体复验数据在 media-validation.json。
临时片已用 film:delete 的 owned-path 清理，片源、媒体和验证输出不提交。

新增 16 项回归覆盖五条规则的正反例、旧片 unknown、字幕/收尾容忍、切点校准、边界互核、日志容错、密集帧预算、
review 新字段 schema、animatic 参数/声音/超时与 deliver 缺失/过期/新鲜提醒；既有交付测试追加缺预览仍成功的断言。
完整 `npm run check` 通过（419 项：418 通过，Linux 跳过 1 项 macOS 专用测试），含 typecheck、lint、文档/素材检查、
Web/Remotion 构建、creator 包检查及新 motion-curve Still 的宿主 compositions；runtime 包 typecheck、
两包构建与 runtime check:package 通过。

尚未验证：人工实际播放听审、提示阈值在更多片型上的泛化、独立新 Workspace 安装/升级实跑和 P5 新旧生产样片对比。
未新增依赖；未改 Skill、模板、README 或其他任务持有的文档，未发布。

## 镜头配方 P2（2026-11-07，未发布）

按 [实施方案](promotions/2026-11-06-cinematic-motion-and-sound.md) 完成第一批六个配方：

- `@axmorf/studio/remotion` 新增 `AxiomMorph`、`NumberRoll`、`BarGrow`、`CameraMove`、`ParticleField`、
  `ParallaxLayers`，每个组件有独立的 `resolve* (frame, options)` 纯函数，返回状态、绝对关键帧与
  `FilmSoundEffectCue[]`，可直接展开到 `FilmSoundEffects`。组件可传根时间轴 `frame`，在嵌套 Sequence 内保持音画同钟。
- 新增 `ProducerRecipeMeta` 与 `PRODUCER_RECIPE_CATALOG`：使用/避用场景、建议秒数、
  anticipate/move/land/settle 语义、建议音效落点。仅新增导出，未改旧 API 或依赖。
- AxiomMorph 用 `@remotion/layout-utils` 逐 grapheme 实测布局，测量与帧 resolver 分离；支持 assemble、scatter、
  shatter、reform，中英文共有字按 FIFO 一对一匹配（含重复字）；字形按三角 clip 碎裂，轨迹用 `random(seed)`。
  NumberRoll 支持逐位过冲后精确 land、千分位、小数、固定前后缀；BarGrow 含基线/刻度与每柱错峰 land cue。
- CameraMove 的五种预设复用世界镜头和按长度取点，统一缓动；motion blur 仅在快速段开启，默认 4、上限 8 次采样，
  源码标注约采样数倍的子树渲染成本。ParticleField 按 SVG path 长度采样，默认 120、最多 400 粒子。
- ParallaxLayers 评估了固定三槽的 `ProducerLayeredStage` / `ProducerShotStage`，选择薄封装已支持任意深度层的
  `ProducerWorldCamera`，复用投影和边界校验，默认背/中/主/前景深度为 0.15/0.5/1/1.5，不重复实现变换引擎。
- 六个 `Recipe-*` gallery 组合均为 1920×1080 / 30fps / 108 帧，音效由配方 cue 直接接入。
  实现为项目内原创，没有拷贝外部项目代码或新增素材，许可清单无需修改。

验证：新增 22 项回归覆盖各 resolver 的阶段边界、land、cue 帧与角色、参数校验、重复字匹配、确定性状态、
前后缀数字不滚动及嵌套时间轴。完整 `npm run check` 通过（403 项：402 通过，1 项 macOS 专用测试在 Linux 跳过），
含六个新 composition 的宿主 Chromium 枚举；两包构建、typecheck 和 runtime `check:package` 通过。
`scripts/tests/check-recipe-pixels.ts` 为独立宿主 Chromium 检查：AxiomMorph、ParticleField 的第 40/100 帧各独立渲染两次，
1920×1080 PNG 全部逐字节相同（比像素相同更严格），共 4 对/8 张；不使用灰度缩略签名代替完整像素验证。
六张 still 已看图；六段 H.264 + AAC 短片全部解码至 EOF，108 帧/3.6 秒画面，容器 3.648 秒，PCM 检查音轨非静音。
五种镜头预设及快速段 motion blur 有真实 Chromium still 冒烟。
预览目录：`/home/zzzxc/AgentWorkspace/backups/axmorf-p2-preview/`，每个配方各有同名 `.png`/`.mp4`，
另附 `determinism.json`、`media-validation.json` 与 `camera-presets/`。开发预览使用共享 seed 的 public-dir。
Remotion CLI 仍有既存 zod 4.6.7 / 建议 4.3.6 提示，未改依赖或检查。

尚未验证：人工实际听审、跨机器/字体环境的像素一致性、motion blur 性能基准、独立新 Workspace 安装/升级实跑与生产样片对比；
后两项按 P5 验收。Skill、api.md 与配方卡按计划留到 P4。

## 场景轨与音效轨 P1（2026-11-06，未发布）

按 [实施方案](promotions/2026-11-06-cinematic-motion-and-sound.md) 完成 P1：

- `@axmorf/studio/remotion` 新增 `FilmSceneTrack` / `resolveFilmSceneTrack`：句子 id 或绝对帧编排，
  4 种覆盖式与 8 种重叠式转场，窗口居中，补偿 Sequence 时长，保持正片长度与名义边界；提前出现时本地帧钳到 0。
  resolver 校验边界、窗口和相邻场景长度，并产出可直接传入音效轨的 `sfxCues`。
- 新增 `FilmSoundEffects` / `resolveFilmSoundEffects`：共享角色/id、已登记素材、起点/终点锚定、
  beat/bar/accent/section 有界吸附、同帧去重及旁白压低。本片素材复用 `FilmAssetSchema`，由调用方传入登记条目与实测时长。
- `FilmSoundtrack` 增加 `musicDips` 和 `ending`；留白与旁白压低取较低音量，复用 8 帧斜坡。
  ending 默认选最后一个有效重音（无重音取正片末尾），可指定帧，收尾音效尾端也对齐该帧。
  不传新参数时输出逐字段保持原状，旧转场映射的类型与行为保留。
- 扩展既有 `scripts/sound-effects/generate.ts` 确定性 PCM 合成器，生成 riser-short、reverse-swell、
  low-impact、glitch-tick、whip、shimmer；冻结 WAV、Apache-2.0 许可与媒体元数据进入共享 seed、manifest 和打包校验，
  沿用创建/升级 Workspace 的资源分发路径。

验证：新增 18 项回归测试通过；完整 `npm run check` 通过（381 项，380 通过，1 项 macOS 专用测试在 Linux 跳过；
含 typecheck、lint、文档/素材检查、Web/Remotion 构建、creator 包检查与宿主 Chromium compositions）。
两包 typecheck/build、runtime `check:package`、六个 WAV 两次逐字节复现及 manifest 校验通过。
12 种转场分别通过真实 Chromium 中点 still 冒烟；gallery 的 match-scale + flash + 多音效示例已渲染、看图，
预览为 960×540 / 30fps / 87 帧（视频 2.9 秒，含 AAC 的容器 2.944 秒），H.264 + AAC 完整解码通过，音轨非静音。
预览目录：`/home/zzzxc/AgentWorkspace/backups/axmorf-p1-preview/`（`scene-track.png`、`scene-track.mp4`、`transitions/`）。
开发仓库预览用 `--public-dir=packages/studio/src/runtime/workspace-seed/files/public` 读取共享 seed。
现有 Remotion CLI 仍提示仓库锁定的 zod 4.6.7 与其建议 4.3.6 不同；此次检查与渲染均成功。

尚未验证：人工实际听审、独立新 Workspace 的安装/升级实跑、生产片新旧对比；后续按 P5 验收。
Skill、api.md 和其他权威文档的能力说明按计划留到 P4 同步。

## VoxCPM 参考音频转换与远程服务诊断（2026-10-28，0.3.0-rc.5 候选）

已在本机复现高保真克隆上传前 `FFmpeg prompt normalization failed with exit code 234`：
Remotion bundled FFmpeg 不含 raw `s16le` muxer。改为写入可 seek 的 WAV 文件，严格解码 PCM，再生成标准
48 kHz / mono / 16-bit WAV；不改原始参考文件、不引入另一套 FFmpeg、不重试或切换 provider。

VoxCPM 诊断按配置的 HTTP(S) 地址访问 `/health` 和 `/ready`，支持 Tailscale 等远程自托管部署，
不再因非 loopback 地址直接失败；仍不合成、不预热、不跟随重定向，错误不暴露地址或 token。
回归覆盖真实 Remotion FFmpeg、转换失败/空音频/截断 WAV、远程/localhost/IPv6 地址及诊断错误脱敏。
验证：完整 `npm run check` 通过（363 项测试、typecheck、lint、文档与素材检查、Web/Remotion 构建、creator
检查及宿主 Chromium compositions），两包 typecheck/build 与 `npm audit --audit-level=low` 通过。
`DefaultIntroPreview` 真实渲染为 1080×1920 / 30fps / 60 帧 H.264 + AAC stereo，完整解码到 EOF。

用两个候选 tarball 创建全新外部 Workspace，安装、doctor 与 compositions 通过。通过该 Workspace 的公开
`film:voice` 和既有已确认参考声线向原 VoxCPM 服务合成中性测试句，`/clone_with_prompt` 返回 HTTP 200
`audio/wav`，最终音频约 5.181875 秒、48 kHz / mono / `pcm_s16le`，完整解码通过。连续两次公开配音命令
只有一次真实合成请求，第二次复用缓存。生产默认配置未改。未实际听审，尚不作为 `latest` 的 Agent 晋级验收。

前述画面、OP、超时改进已经随 `0.3.0-rc.4` 合入默认分支并通过
[发布 CI](https://github.com/AXMORF/axmorf-studio/actions/runs/40550067560) 发布到 npm `next`；下方“未发布”是各条实现时的历史状态。

## 讲解片画面优化与渲染超时设置（2026-10-28，未发布）

用同一份固定旁白脚本（瑞利散射，12 句）让 Codex 在 AXMORF Workspace 内外各做一部讲解片：Workspace 内的一组画面更有
电影感、空间连续，但字幕被压成约 30px 的单行，镜头只在原地推拉（平移不超过 80px），画面标注少，静音时不如
Workspace 外的一组易懂。据此：

- `film:review` 的 `readabilityWarnings` 新增 `small-caption`：字幕实测字号低于短边 4%（1080 宽约 43px）时提示；
  Skill 写明一句是一个字幕事件、可折成两行，不要为排成一行缩小字号。
- `@axmorf/studio/remotion` 新增 `ProducerWorldCamera`（比屏幕大的世界里平移、跟拍、推拉，各层按深度视差）、
  `resolveProducerWorldCamera`、`resolveProducerWorldPlane` 与 `resolveProducerPathPoint`；示例段落新增
  “镜头在大场景里跟着过程走”。
- 画面手艺：推拉不算取景变化，每章至少一次平移、跟拍或换位；文字预算放宽为一个标题加最多 3 个贴在物体上的短标注；
  旁白里的数字要画成可见的数量；审片新增静音测试、镜头类型与字幕字号三项。
- Producer config 的 `renderDefaults.renderTimeoutMinutes`（15–120，缺省 15）决定 `film:deliver` 与 `film:review`
  单次渲染的时限；Web 设置“通用”可改。超时报错提示调高设置而不是降低画质、尺寸或帧率，Skill 同步。

## MV / OP 类片子的支持（2026-10-23，未发布）

用同一份需求让 Codex（gpt-6.1-sol，max）分别在 AXMORF Workspace 内外各做一部原创动漫 OP：Workspace 外的一组
插画更多、画面更丰富。差距主要来自 Workspace 规则在这类片子上的约束：生图失败后不重试只剩 6 张图、配乐只能合成、
60 秒里 10 秒是品牌片头片尾、审片查不出素材反复使用。据此按“讲述段 / 节拍段”的时间段思路改进，讲解片的默认行为不变：

- `@axmorf/studio/remotion` 新增 `ProducerSpriteSheet` 与 `resolveProducerDrawing`（播放动作表）、`ProducerBeatCamera`、
  `ProducerWhipIn`、`ProducerSpeedLines` 及其纯函数 resolver。
- `film.json` 的 `music` 二选一：`score`（合成）或 `track`（已用 `film:asset` 登记来源与许可的音频）。`track` 的节拍网格
  由作者写定，缺失时 `film:music` 从音频估计 `bpm` 与首个强拍并停下；登记的音频变了 `film:check` 报 `music-stale`。
  `AGENTS.md`、产品目标与架构文档同步。
- `film:review` 新增 `repetitionWarnings`：只在没有旁白的时段每 0.5 秒取样（最多 120 帧），同一画面超过这些时段 25%
  时提示，不拦截交付。
- `film:new --bookends workspace|both|none` 只决定本片的品牌片头片尾，Workspace 默认不变。
- Skill：画面手艺新增“讲述段与节拍段”；配乐新增授权曲目流程；素材新增绿幕动作表的生成与抠像；OP 配方新增素材预算、
  片头片尾与审片项；生图失败缺关键画面时停下请用户同意重试。creator 模板镜像同步。

## 动漫 OP 风格配方与图形处理组件（2026-10-22，未发布）

`@axmorf/studio/remotion` 新增 `graphic-fx` 组件，全部用 SVG filter、clip-path 与帧驱动计算实现，不依赖
WebGL 或实验性的 HTML-in-Canvas（`@remotion/effects` 只能挂在 `<Img>` 与 `HtmlInCanvas` 上，后者需要 Chrome 148 及 flag）：
`ProducerBeatCutSeries` 与 `selectProducerCutFrames`（按音乐网格硬切）、`ProducerGradientMap`（双色调 / 伪彩）、
`ProducerChromaticSplit`（RGB 错位）、`ProducerGlitchSlices`（切点撕裂，装饰副本 aria-hidden 且只在 burst 内存在）、
`ProducerHalftoneOverlay`、`ProducerFlashCut` 与 `ProducerCreditTitle`（职员表式宋体文字，`entrance` 可选砸入或淡入），
以及对应的纯函数 resolver。Skill 新增 `references/styles/anime-op.md` 风格配方，`SKILL.md` 指向 `references/styles/`，
`api.md` 增加组件说明；creator 模板镜像同步。原有 `producerStyleProfiles` 未改动。

配方初稿只依据每 3 秒一帧的抽样，误把高潮段的霓虹故障当成整体风格，样片观感很差。随后对两部参考 OP 逐镜头抽帧
（150 / 196 段）并实测色彩与切点：基调是高调白灰金或靛蓝夜色，高饱和像素约 13–14%；切点与节拍网格的对齐只比随机略好，
停留镜头多为 0.6–1.75 秒并夹有长镜头，快感主要来自镜头内作画。配方据此重写为作画优先、实测色板、意象体系、
五段结构与特效上限，并要求缺少插画时说明只能做纯图形版；示例段落改为只演示组件用法的占位实现。

配乐引擎新增 studio-v2 专用的 `drive` 风格：失真强力和弦 `guitar` 与 `tom` 声部、按 `energy` 分三档的军鼓反拍鼓型、
八分音符贝斯、每 4 小节过门与段落前通鼓滚奏、可重复的两小节旋律钩子。合同的 `style` 增加 `drive`，事件增加可选 `beat`；
所有 studio-v2 事件按精确拍位置合成，不再四舍五入到视频帧（原先 30fps 下鼓点最多偏差约 16ms）。
`electronic` / `organic` 的编曲不变，但重新生成后起音时间更准确；原始引擎与其金样校验不受影响。
用 `drive`（172 BPM）与 Codex 生成的插画、绿幕作画序列重做的原创样片在临时 Workspace 中交付复验通过，成片约 -14.8 LUFS；
节奏感只做了起音自相关等粗略测量，未经人工听审。

验证：完整 `npm run check` 通过（338 项测试，含新增 10 项组件测试；风格配方的示例段落纳入 `film:check` 用例）。
用本地打包的 runtime 新建临时 Workspace（doctor 通过），制作 1920×1080 / 30fps 纯视觉样片：`film:check`、`film:review`
（`stillWarnings` 与 `readabilityWarnings` 为空）、`film:deliver` 通过，交付 22 秒（含片头片尾）四文件复验通过；
审片确认伪彩、网点、撕裂、闪白与金色大字在宿主 Chromium 中生效，并据此调低撕裂染色、把镜像倒影改到文字下方。

未验证：人工连续观看与听审、竖屏样片、生图角色素材上的效果、非 macOS 宿主的宋体回退；配乐引擎仍只有
`electronic` / `organic` 音色，未新增摇滚音色。本次未发布。

## 清理 contracts 旧主链残留（2026-10-21，未发布）

按[实施计划](promotions/2026-10-21-contracts-old-chain-cleanup.md)，从公开的 `@axmorf/studio/contracts` 删除
`story`、`semantic-timing`、`scene-readability`、`generation-input`、`generated-artwork`、`render` 整模块，
以及资源目录、Scene 模板实例、旧运动验证和仅服务这些模块的导出。媒体授权描述、模板 ID、可选运动组件所需的合同及
传递依赖保留，现行合同未做全量未用导出清扫；旧素材描述的 `generatedSource` 字段随 generated-artwork 删除。
这是 0.3.0 范围内的公开导出破坏性变更，外部调用方需移除对退役合同的引用。

`CAPTION_MAX_DISPLAY_HALF_UNITS` 与 `countCaptionDisplayHalfUnits` 移入 `film.ts`，仍从 contracts 导出；
`pauseMsToSampleFrames` 移入旁白脚本的 PCM 内部模块，不再从 contracts 导出。名称和计算保持不变，仍执行 72 half-units
上限和 round-half-up 停顿 samples 换算。`@axmorf/studio/remotion` 的导出（含 `ProducerMotionObject`）、依赖与版本不变。

验证：完整 `npm run check` 通过（328 项测试，含 typecheck、lint、文档链接、素材、Web / Remotion 构建、creator 包检查与
宿主 Chromium compositions 门禁），runtime 完整构建及 `build:types` 通过，定向 43 项测试通过。原有字幕预算与 PCM
换算测试保持通过，迁移实现与原代码逐字一致；另用构建产物确认 ASCII / 中文 / emoji 的 72 half-units 边界。
首轮完整检查的进程超时测试未在 300ms 内捕获子进程启动输出，单独运行 14 项和第二轮完整检查均通过，未修改该测试。

测试由 330 项降至 328 项，仅删除：

- generation fingerprint 用例：验证已删除的 Story / generation-input 指纹；其中现行旁白 schema 的两条严格校验断言移入旁白测试。
- composition ID 用例：只验证已删除 render 合同使用的 ID schema。

已删的 122 个导出名在 `packages/`、`scripts/`、`settings/`、`src/`、`tests/` 中检索无匹配；另有上述停顿函数迁入内部。
清空后重建的 contracts 声明树也无退役名称（含 `StorySpec`、`SemanticTiming` 和资源目录专用名称）：
声明树由 5328 行 / 232059 字节降到 2692 行 / 113951 字节，`dist/contracts.js` 由 4505 行 / 167160 字节降到
2202 行 / 81310 字节；入口 `dist/contracts.d.ts` 仍为 5 行 / 199 字节，实际声明位于 `dist/contracts/`。

未验证：真实 TTS、成片渲染或交付、生成 Workspace 的全新安装 / 升级验收、仓库外调用方迁移；本次未提交、推送或发布。

## 审片渲染实测可读性提示（2026-10-20，未发布）

按[实施计划](promotions/2026-10-20-review-readability-measurement.md)，`film:review` 新增 `readabilityWarnings`：
在审片组合内等待字体与布局稳定后测量文字，提示非字幕文字的实际字号过小、部分越界与字幕框遮挡；相同规则和文字摘要
合并列出正片帧号与实测值。`readability` 列出测量帧数、缺失帧、坏日志、截断帧与测量错误。提示不拦截 `film:check`
或交付，静态小字号警告复用同一阈值，`stillWarnings` 保持原行为。Skill 与 creator 模板镜像同步。

验证：完整 `npm run check` 通过（330 项测试，含 typecheck、lint、文档链接、素材、Web / Remotion 构建、
creator 包检查与宿主 Chromium compositions 门禁）；focused tests 18 项通过，React Doctor 改动扫描无新增诊断。
仓库根目录用无旁白临时片实测 1080×1920、`--scale=0.5` 的 f10、f150、f294：缩放文字 16px、SVG 文字 12px
均低于 26px 阈值，右侧文字越界约 329.84px，正常 64px 文字无警告；3 帧测量齐全，无坏日志或截断。
联系表与单帧正常生成并看图，`stillWarnings` 与改动前渲染一致，`film:check` 与 HEAD 版本的同片输出完全相同；
同质量、同缩放的 f10 正片 still 与审片 JPEG 字节一致，测量容器未改变该帧像素。
Remotion 4.0.489 非 TTY 子进程确认 `console.warn` + `--log=warn` 在 stderr 输出完整测量行，其他渲染保持 error 级别。
临时片已通过 `film:delete --film readability-probe --confirm-delete` 清理。

未验证：字幕遮挡只做单元测试（含 10% 边界），未进行带旁白真实渲染，未调用 TTS；对比度和文字停留时长仍未实现。
本仓库根目录没有生成 Workspace 的 marker / producer config，验收直接调用仓库 film CLI 服务与本地 Remotion，
未做生成 Workspace 的 doctor / 新安装验收；本次未交付或发布成片。

## 0.3.0：删除 Project production 主链（2026-10-19，0.3.0-rc.1 已发布至 next）

2026-10-20 核实：`@axmorf/studio` 与 `create-axmorf-studio` 的 npm `next` 均为 `0.3.0-rc.1`，
`latest` 仍为 `0.2.1`；0.3.0 正式版尚未发布。

按[迁移方案](promotions/2026-10-14-direct-film-production.md)第 2 步删除旧主链，只保留 direct film：

- 删除 `project:*`、`catalog`、`registry`、`renderer`、`scene`、`narration`、`reference` 等 CLI 与其实现，45 个旧合同，
  旧 Remotion 运行时（story-visual、narrative-core、composition-assembly 等）、资源目录 catalog、`proofs/`、
  `axmorf-video` Skill、旧 Agent 首用审计工具，以及只服务旧 attempt 恢复的进程登记与期限作用域。
  `@axmorf/studio/remotion` 保留 film 组件、片头片尾与 Skill 文档列出的可选组件。
- 配乐引擎从 `axmorf-video` Skill 移到 `scripts/films/score/`；成片检查函数移到 `scripts/films/inspect-media.ts`。
- Web 控制中心改为“作品 / 通用 / 片头片尾 / TTS”：作品页读 `film:list` 并按 `publish.json` 记录的文件大小预览交付，
  删除需输入完整 ID；去掉旧的 Agent 执行、画面安全区、合集与全局 BGM 设置（配置字段为兼容保留）。
- Workspace：bootstrap 与 doctor 不再创建或要求 `src/projects/`、`.producer-*` 和资源目录；doctor 五项检查。
  升级删除退役的 `axmorf-video` 与旧 `remotion-best-practices` Skill、`src/runtime/` 兼容层、仍是原值的旧脚本，
  并清理留下的空目录；旧 Project 目录只在有内容时列入 `legacyProjectData`，不删除。
- `axmorf-film` Skill 新增两个可编译的[示例段落](../.agents/skills/axmorf-film/references/examples.md)，由测试保证
  它们放进 film 后 `film:check` 零错误零警告。
- 文档收敛为 11 份 active 文档；旧主链的文档、合同、guides 与 0.2.0 之前的证据移入
  [archive/project-production/](archive/project-production/)，0.1.22–0.1.23 状态移入
  [归档](archive/iteration-status-0.1.23-and-earlier.md)。

验证：`npm run check` 通过（320 项测试，耗时由 5 分 42 秒降到约 2 分 10 秒）；运行时包由 314 个文件、40.7MB 降到
246 个文件、32.8MB。用本地 tarball 新建 Workspace，doctor 通过、无旧目录，交付一部 240 帧无旁白片
（片头片尾在内 540 帧，H.264/AAC 双声道），Web 作品页列出作品并播放交付视频与封面。用 npm 上的 0.2.1 新建
Workspace、交付一部片并放入旧 Project 残留后升级：删除 49 个退役文件、无本地改动冲突、doctor 通过，旧片重新交付
并归档上一版，新片完整交付。带旁白的片首次在 Edge TTS 第一句失败（外部阻塞）；维护者同意后重试一次，两句均成功，请求间隔
10 秒。该片两段分别用 Skill 的两个示例段落，按第二句起点切换，审片一轮后把模块落点改到配乐重音第 144 帧，
`film:check` 零错误零警告，交付 568 帧（60 + 268 + 240），片尾列出参考来源。带旁白的升级后生产留待发布前验收。

## 0.2.1 发布与宿主验收（2026-10-18）

`0.2.1-rc.1`（Edge TTS 请求节奏、`/axmorf-film` 入口）与 `0.2.1-rc.2`（片头片尾、审片自查）先后发布到 `next`，
维护者的 Workspace 用 `npx create-axmorf-studio@next upgrade` 就地升级，doctor 六项通过。

Codex（gpt-6.1-sol，高推理）在 rc.2 上按 `axmorf-film` 流程完成 `dns-address-journey-v2`：

- 交付 1400 帧 = 片头 60 + 正片 1100 + 片尾 240，1080×1920、30fps，46.67 秒；片尾列出 3 条参考来源。
- 抽帧确认片头片尾与音频都在；第一版“顶部标题 + 居中物体 + 底部字幕”的版式改为同一场景内的物体与贴附标签，
  各级服务器造型不同，镜头在对象之间移动，结尾无长时间静止。剩余倾向：多数段落仍以单个居中物体为主。

发布流程同时修正：新版本在公共 registry 可见可能超过 10 分钟，rc.2 因原 5 分钟等待误判失败（runtime 已发布、creator 未发布，
人工重跑后完成）。现在发布后最多等待 30 分钟；`npm publish` 报版本已存在时不再直接失败，而是等待并核对 registry integrity
与本次 tarball 一致。

未验证：人工连续观看与听审。

## 片头片尾与审片自查（2026-10-16，随 0.2.1 发布）

0.2.0 的 direct 流程没有接 Workspace 配置里的 `sceneDefaults.introSceneTemplateId/outroSceneTemplateId`，
Codex 制作的 `dns-address-journey` 因此没有片头片尾。现在：

- `film.json` 新增可选 `bookends`（`intro`、`outro`、`theme`、`sources`），`film:new` 按配置写入；省略即无片头片尾，既有片不变。
- 交付组合在正片前后自动接上系统模板 `axmorf-brand-reveal-v1`（2 秒）与 `axmorf-source-follow-v1`（8 秒），各带模板音频；
  其他帧率按秒换算。`Film.tsx`、`useFilmTiming()`、审片与配乐仍只计正片。交付校验与 `publish.json` 使用总长。
- `film:review` 新增 `stillWarnings`：相隔 2 秒以上、64×64 灰度缩略图平均差小于 3 的相邻审片帧。阈值用该片校准：
  结尾静止 4 秒的两帧差 2.37，有变化的相邻帧 4.9–14.3。只提示，不拦截交付。
- Skill 要求审片清单逐条给出帧号证据，新增“每段顶部标题 + 居中物体 + 底部字幕”的失败信号与替代做法，结尾同样需要次级运动。

验证：film 测试 19 项通过；本地打包的 runtime 在测试 Workspace 交付 510 帧（60 + 210 + 240），抽帧与分段音量确认片头、
正片、片尾参考来源与品牌落版及各自音频都在。

## Edge TTS 请求节奏与诊断（2026-10-15，随 0.2.1 发布）

隔离诊断的五次低频请求全部获得 HTTP 101 与可解码音频：当前 API/v1 与 Bing/v2 均通过代理和应用层直连，
当前 API/v2 也通过代理。未复现 429，不能认定旧 GEC 是当前 API 的失败原因，也未证实出口 IP 持续被封。
历史突发请求后 429、稍后恢复的表现仍支持短时节流假设，具体阈值与计数范围未知。

源码 Edge adapter 现在串行发送真实请求，前一次结束后至少间隔 10 秒；首句立即发送，缓存命中不等待。
10 秒是待真实生产验证的缓解初值，不是已测得的微软配额。失败会立即停止该 adapter 的排队请求，仍无自动重试或 fallback。
stderr 只记录开始/结束时间、chunk ID、代理/直连标签、耗时和固定 HTTP/超时状态，不含旁白、URL 或凭据。
保留 `node-edge-tts@1.2.11`、当前端点和握手参数；不改变音频停顿、缓存 identity 或实测时序。

离线假时钟、假客户端及缓存集成验证覆盖上述行为；108 项相关回归、类型、定向 lint、格式与文档链接检查通过。
本次实现未新增真实 TTS 请求；随 `0.2.1-rc.1` 发布到 `next`，同版还带有 Claude Code 的 `/axmorf-film` Skill 入口。
诊断与验证边界见[记录](evidence/2026-10-15-edge-tts-pacing.md)。

## 0.2.0 发布与宿主验收（2026-10-15）

`0.2.0-rc.1` 经 tag 触发的 CI 完整检查后发布到 `next`。维护者的 Workspace 用 `npx create-axmorf-studio@next upgrade`
从 0.1.23 就地升级：新增 `axmorf-film` Skill，更新 5 个托管文件，无本地改动冲突，doctor 六项通过，既有作品与交付保留。

Claude 作为宿主按 `axmorf-film` 流程完成 `https-handshake-direct`（与 0.1.23 验收片同一脚本）：

- 源码先在测试 Workspace 中用估算时序起草并审片一轮，修正重叠、裁切和过小元素后复制到正式 Workspace。
- Edge TTS 首次在第 5 句超时（外部故障，未自动重试）；维护者同意后重试一次，已缓存的前 4 句未再请求，8 句全部完成。
- 按实测时长重排配乐，使最满段落及重音落在第 692 帧，与两端金钥匙合成同帧；尾声段落起点第 1038 帧对应地址栏小锁亮起。
- 审片联系表确认取景逐段变化、两个落点对齐；交付 38.87 秒、1080×1920、30fps、1166 帧 H.264 与 AAC 双声道，
  exact 四文件复验通过，-15.7 LUFS。

未验证：Codex 宿主的表现、人工连续观看与听审。

## Direct film 制作方式（2026-10-14，随 0.2.0 发布）

按[实施计划](promotions/2026-10-14-direct-film-production.md)第 1 步实现，计划作为 0.2.0 发布；0.1.23 的
Project production 主链保持不变，只处理既有作品。

- 合同：`FilmSpec`（`film.json`）、`FilmTiming`、`FilmMusic`、`FilmAssets`、`FilmPublish`，以及 `filmCompositionIds`。
  旁白每句最多 72 caption display half-units；时序按实测 samples 用 `ceilDiv(samples × fps, sampleRate)` 换算。
- 运行时（`@axmorf/studio/remotion`）：`useFilm`、`useFilmTiming`、`FilmCaptions`、`FilmSoundtrack`
  （旁白、循环配乐、旁白下 ducking、结尾淡出）、`FilmCompositions`；每部片注册正片、`--review` 与两张封面 Still，
  另有共享的 `axmorf-contact-sheet` Still。计划中的独立 `@axmorf/studio/film` 入口改为并入 `/remotion`：
  两个 bundle 会各带一份 React context，Provider 与 hook 将无法互通。
- CLI：`film:new`、`film:voice`（按 provider 与文本缓存每句 TTS）、`film:music`、`film:asset`、`film:review`、
  `film:check`、`film:deliver`（临时目录渲染、复验后替换，旧交付按其交付时间归档）、`film:list`、`film:delete`；
  写操作共用 `.project-operation.lock`。bootstrap 生成 `src/films/index.ts` 静态注册表。
- 审片：review 组合与正片等长（Remotion 会把冻结帧裁剪到组合长度），CLI 只渲染前 N 帧；联系表由 Remotion
  渲染，因为随 Remotion 发行的 ffmpeg 没有 `tile` 等滤镜。
- 检查：硬错误为 TypeScript、渲染时联网（按调用和属性判断，屏幕上的 URL 文本允许）、CSS 动画、
  `Math.random`/`Date.now`/`new Date()`、未登记或已改动的媒体、跨片导入、缺少字幕/声音组件、旁白或配乐过期；
  小字号只给警告。计划中的“渲染后实测可读性”尚未实现。
- 模板与 Skill：新 Skill `axmorf-film`（流程、画面手艺、配乐与卡点、素材、API），Workspace `AGENTS.md`、
  README 与 9 个 `film:*` scripts；`workspace:upgrade` 镜像新 Skill。首尾品牌组件尚未提供。

验证：film 单元与流程测试 12 项（含真实 TypeScript 检查、伪造 TTS 的旁白时序、交付替换与回滚、删除范围）。
用本地打包的 runtime 与 creator 新建 Workspace（doctor 六项通过），完成一部无旁白的 7 秒测试片：
`film:music` → `film:check` → `film:review`（联系表帧内容正确）→ `film:deliver`（29 秒，H.264 210 帧、AAC 双声道，
配乐与重音音效实际混入）。同一次运行中 Edge TTS 对第二句返回 HTTP 429（外部阻塞，未重试），第一句的真实 TTS、
归一化与缓存成功；带旁白的完整真实生产留待发布前验收。

## 2026-11-10：可选 KTV 双色字幕

FilmCaptions 新增 highlight="karaoke"（默认 none），用可选 clauses 分句估时连续扫色，两行依次推进，字不抖不缩放；box/paper 有各自高对比默认色，支持 sungColor/unsungColor。
新增独立 film:captions 从已生成 narration.wav 离线计算 timing.json 的可选 clauses；保留音频、句边界和旁白指纹，未运行的旧片不变。
10ms RMS / 6% 句峰 / 120ms 内部停顿与念法半角单位比例位置做确定性最优顺序匹配（DP）：多余停顿忽略，缺失边界在相邻已匹配停顿间按比例补齐。
各分句分别标 pause/proportional；含比例分句的句子标 estimated:proportional，CLI 报告 mixed 与边界来源，避免丢弃部分可用停顿。
精度为分句级估计、分句内线性；caption/text 分句数不符或旧 timing 没有 clauses 时整句扫过，karaoke-clause-mismatch 只提示。四份 Skill 与 creator 模板同步。
