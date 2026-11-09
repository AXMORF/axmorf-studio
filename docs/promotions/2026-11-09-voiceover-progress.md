# 口播混音与 v6 对比进度

本任务方案取代早期 P8 中品牌母题、12–15 LU、讲述期全面减幅要求；P6 冻结。
只在 axmorf/voiceover-mix（基线 f053f7c）实施，不合并、推送或发布。

当前状态：代码验收及v6四件套交付/软件解码完成，待负责人亲自审阅；保留的局部混音/运动提示和unknown见末尾。

## 执行计划

1. 移除 AxiomMorph 强制提醒，加入可选 voiceover 静态 EQ；保留旧片无 profile 的行为。
2. 修正呼吸/镜头与运动能量提示，同步共享 Skill 和当前文档。
3. 使用原校准 fixture 测量混音起点，跑 focused tests、packages:build、完整 check。
4. 在独立 v6 Workspace 复用 v5 旁白 take，按指定画面/语义锚点修改、审片一轮再交付。
5. 复核 v5 保护文件和 v6 交付，记录数据与未验证项，精确本地提交。

## 已核对

- 开始时工作树干净，HEAD f053f7cb94b89f066b21a47ea5760564c94bcc06，无 CodeGraph。
- v0.3.0-rc.5 是 HEAD 与 origin/main 祖先；ahead 36 / behind 2，不更新远端。
- npm ci 按原 lock 安装成功；Remotion 4.0.489，不升级依赖。
- 开始时 v6 目标路径不存在；v5 片源存在。
- FilmStatusTag 已支持任意字符串标签，可直接显示“开放问题”，不扩充状态枚举。
- 本机禁止播放器；只做静帧、软件解码和音频测量。

## 校准（2026-11-09）

使用原 fixture 的 axmorf-p8-sound-lab/remotion narration.wav + timing.json，未调用 TTS。
真实 voiceover profile 先 EQ 后母带；runtime 实际逐句 duck 一次，bed 含三条生成 SFX。
.64/.60：旁白 -16.0 LUFS，speech bed -25.2 LUFS（差 9.2 LU），mix -1.7 dBTP，均满足硬目标，无需线性增益校准。
开场/结尾差 7.3/8.1 LU；6–8 LU 为参考，结尾超参考 0.1 LU 如实保留，不改母带设计。
数据：.axmorf/voiceover-calibration-initial/report.json。原校准脚本将 6–8 LU 写成硬断言；按本方案改为报告参考范围，speech/true peak 仍硬断言。
Focused 首轮有一项新增 fixture 缺少 v2 必需的 authored arrangement；已修正输入，第二轮全部通过。

## 代码验收

- Focused tests：80/80 通过（motion/rhythm-sync/energy/workflow/soundtrack、runtime rhythm、docs snippets、music-mix）。
- packages:build 通过；完整 npm run check 退出 0：主测试 548 通过、1 平台专属跳过，宿主 24 通过；typecheck/lint/docs/audio/Web/Remotion/creator/compositions 通过。
- 首次完整 check 在 lint 发现未使用的兼容参数；已显式 void 保留兼容，第二次完整检查通过。
- calibrate-v3 第二次退出 0，报告 .axmorf/voiceover-calibration/report.json，.64/.60 不变。
- @axmorf/studio check:package 通过，已从本 worktree 构建并 pack 本地未发布 0.3.0-rc.5 tgz。
- 创建独立 v6 Workspace；仅复制配置、所需原片源码/素材、同 take narration/timing，SHA256 相同。未复制旧 review 或 music/sfx 投影。

## 早期阻断快照：v6 首次安装（已由后续授权恢复）

标准 `npm install --save-exact <本工作树本地 tgz>` 退出 1，ERESOLVE unable to resolve dependency tree。
锁中 three=0.185.0；npm 报 Found: three@undefined，无法满足 @react-three/fiber@9.6.1 的 peer three>=0.156。
日志显示读取当前配置的 registry.npmmirror.com 元数据。只记录已知事实，未认定改版本可解决。
未重试、未切换 registry、未用 force/legacy-peer-deps，未改 node_modules 或配置；bootstrap/doctor 未执行。
负责人需决定安装恢复方式并授权后续尝试；依照“方案走不通停下报告”暂停 v6。
新目录已存在且只有必要复制品；续做应先核对，不再次创建或覆盖。

## 早期暂停时的保护与未验证（由后续完成记录取代）

v5 463 个受保护文件复核全部 SHA256 不变；v6 narration.wav/timing.json 与 v5 完全相同。
没有启动任何播放器，没有 TTS、push、merge、发布或系统改动。P6 冻结。
v6 画面、配乐、SFX、storyboard 改写尚未开始；film:check/review/animatic/deliver 未运行，四件套/联系表/强重音小图/实际混音窗口测量均未生成。
真实观看、听感及逐字精度未验证；校准数据只代表教学 fixture，不能当作 v6 测量结果。

## 绝对路径

- 工作树：/home/zzzxc/.config/CindyGlobal/owners/24ad0e43f9901a2b3b9e/bots/bot_1793619581836_kwfnjr/workspace/axmorf-studio-voiceover
- 分支：axmorf/voiceover-mix
- 校准报告：上述工作树 .axmorf/voiceover-calibration/report.json（同目录 sample.wav/mix.wav/bed.wav/events.json）
- 本地 tgz：上述工作树 .axmorf/voiceover-release/axmorf-studio-0.3.0-rc.5.tgz
- 日志与 hash：上述工作树 .axmorf/voiceover-evidence/（v5-protected-before.json、v5-protected-after.json、same-take.json）
- v6 复制品：/home/zzzxc/AgentWorkspace/axmorf-trial-v6-voiceover/workspace
- 安装日志：上述工作树 .axmorf/voiceover-evidence/axmorf-v6-install.log

## 执行命令与结果

只列实际执行的验收/生产命令；读代码、git diff/status、hash 脚本与文件复制另见上文。

- `npm ci`：退出 0，原 lock 安装；仓库依赖、版本、lock 未改。
- `npx prettier --write <本任务 TS/TSX 文件>` 两次：退出 0。
- `node --import tsx --test tests/films/film-music-mix.test.ts tests/films/film-motion.test.ts tests/films/film-rhythm-sync.test.ts tests/films/film-motion-energy.test.ts tests/films/film-workflow.test.ts tests/films/film-soundtrack.test.ts tests/runtime/rhythm.test.tsx tests/docs/film-skill-examples.test.ts`：首轮 1 项 fixture 输入错误；修正后第二轮 80/80 通过。
- `node --import tsx scripts/films/score/calibrate-v3.ts /home/zzzxc/AgentWorkspace/axmorf-p8-sound-lab/remotion/public/films/ai-small-lab-training-cost-20261106/narration.wav /home/zzzxc/AgentWorkspace/axmorf-p8-sound-lab/remotion/src/films/ai-small-lab-training-cost-20261106/generated/timing.json .axmorf/voiceover-calibration-initial`：首次因旧的音乐段硬断言退出 1，speech/peak 已达标；按方案改为参考后同参数输出到 `.axmorf/voiceover-calibration`，退出 0。
- `npm run packages:build` 两次：退出 0，第二次含兼容参数 lint 修复。
- `npm run check`：首次 lint 1；修复后第二次退出 0，所有门禁通过（主测试 548/1skip，宿主 24/0skip）。
- `npm --workspace @axmorf/studio run check:package`：退出 0。
- `npm pack --workspace @axmorf/studio --ignore-scripts --pack-destination .axmorf/voiceover-release`：退出 0（使用已完成构建，不发布）。
- v6 内 `npm install --save-exact <上述本地 tgz 绝对路径>`：退出 1，ERESOLVE；后续 bootstrap/doctor 因 && 短路未运行。
- `git diff --check`：通过；完成 diff 审阅和 active authority grep（剩余公理叙事仅为注明可选的示范/历史条目）。

最终 diff 审阅补齐 direction.md 第 7 节的新校准数值；两份共享 Skill 全文件与发现入口逐字一致。文档 snippets 5/5 与 docs:check-links 再验通过。

## 负责人补充决定（2026-11-09，待安装阻碍解除后实施）

- FilmStatusTagProps.status 的 `(string & {})` 已由负责人亲自核对；结尾直接使用 `<FilmStatusTag status="开放问题" detail="机制示意"/>`，不新增 enum/状态。
- candidate2 句首 f2263 早于旧 full-cost 场景 bars[34]=2267；采用负责人允许的第一种实现：场景提前至 land-10=f2253，使预备和筹码主体在落点前可见，原字幕不改。
- 强重音连续小图须逐张核对 f2255–f2267，另外看场景起始 f2253，确保预备及 f2263 落定未藏在场景切换之后。
- 全部实现、校准、检查结束后一次性交回；真正阻碍及时报告。当前首次安装 ERESOLVE 仍未解除，未自行重试；本补充未视为安装恢复方案或重试授权。

## 继续执行（2026-11-09）

负责人已确认 three 精确版本在官方 registry 存在，允许在 v6 显式官方 registry、fetch-retries=0 单次标准安装；只允许该新 Workspace lock 因本地 tgz 安装更新，仓库/v5 lock 不变。
EQ 原判据确有 bug：同相过零误作静音，之前频响测试遗漏同相场景。按新方案改为双声道至少 48 samples 的连续零串才清空，47 及以下正常滤波，旧 9.2 LU 校准结论待重新测量取代。
一并纳入 hits/breaks/ending 句子锚点指纹失效及 OP 配方起点同步，范围除此不扩大。

EQ 修正后重新运行同 fixture 校准（非沿用旧数据）：.64/.60，voice -16.0 LUFS，speech bed -25.2 LUFS（差9.2LU），mix -1.7dBTP；开场/结尾7.3/8.1LU。数值在0.1LU报告精度下与旧值相同，无需改变起点。报告 `.axmorf/voiceover-calibration-fixed/report.json`；零串阈值修正和同相回归独立通过。

修复后 focused mix/workflow/contracts/docs 共45/45通过；完整 check 退出0：主测试551通过、1平台跳过，宿主24通过；packages:build/repack成功。
官方 registry 单次安装成功；精确依赖逐项比较保持一致，runtime仍0.3.0-rc.5。bootstrap通过；doctor先提示浏览器缺失，按标准browser:prepare下载并真实小图检查通过，再doctor为workspace-ready。未改registry配置或绕过sandbox。
v6已按既定方案修改，7个句首锚点全部核对onsets包含落点，原beat/bar/section网格逐项相同；29条原创SFX与逐小节storyboard同步。

## v6 真实审片与测量

第一轮 animatic + 定点review已完成，全部六张强重音（15/506/600/2051/2067/2263）逐张查看；发现8,415被H100标签覆盖、两处边缘对比度提示与检验门取景问题，已修复并两次再审。
第三轮：readability/still/repetition warnings均0；motion unknown=0；readability unknown=30（NumberRoll裁切字形定位缺失），逐条列帧回应，不写成自动通过。f2067仍有1条accent-underplayed：峰值22.977 < p99 23.220，八帧可见预备；原编曲继发drop保留，提示与小图如实交负责人审阅。
金额f498–505连续滚动，f506落定；筹码f2255–2262连续展开，f2263落定，f2253场景出场明确早于落点。阅读文字独立稳定。
实际分轨按本片音频和runtime逐句duck一次（非未乘volume的原music WAV）：整片旁白[15,2577) voice -16.0 / bed -25.2 LUFS，差9.2LU，mix -15.7 LUFS/-2.3dBTP；纯有声句拼接差9.1LU。
bill[506,622)：voice -15.2 / bed -24.2 LUFS，差9.0LU，mix -15.0/-2.7dBTP。speculate[1942,2045)：voice -17.2 / bed -23.1，差5.9LU，mix -16.4/-3.2dBTP。后者未达8–10LU目标，留给负责人听审决定，未自行换母带或加侧链。
审片记录：v6/out/voiceover-evidence/review-notes.md（逐条warning、30条unknown、六张小图帧号）；最终review JSON：同目录round3-final.json。

## 完成交付与复验（2026-11-09）

film:deliver退出0，恰好video.mp4、cover-4x3.png、cover-3x4.png、publish.json，无旧交付替换。
完整FFmpeg -hwaccel none软件解码退出0；ffprobe为1920×1080/30fps、2922帧/97.4秒（正片2622+片头60+片尾240），AAC 48kHz stereo。
最终编码音轨含bookends：-15.9LUFS、-2.1dBTP；整片和两个口播窗口的离线分轨结果见前节，不能与最终AAC整体测量混为一项。
v5原463个保护文件全部SHA256不变；v6旁白/timing、producer.config.json、Cover.tsx相同，render/narration/timeline/publish/bookends逐字段相同，精确依赖版本不变。仓库lock和v5无修改。
未运行播放器、TTS、push、merge、publish或改系统设置；P6冻结。真实连续观看/听感/逐字精度仍未验证。
剩余审阅点：f2067峰值略低p99；speculate窗口差5.9LU；30条NumberRoll绘制定位unknown（逐条帧号已回应）。另open hit在f1263而原Capability从bar f1267出场，音乐锚点精确但门体出场晚4帧，未趁机改变其余章节时序。

## 本轮续做命令与结果

- `npx prettier --write scripts/films/music-mix.ts tests/films/film-music-mix.test.ts packages/studio/src/contracts/film.ts tests/contracts/storyboard-score.test.ts`：0；最终diff去掉三处无关的既有数组格式变动。
- `node --import tsx --test tests/films/film-music-mix.test.ts tests/films/film-workflow.test.ts tests/contracts/storyboard-score.test.ts tests/docs/film-skill-examples.test.ts`：45/45通过。
- `node --import tsx scripts/films/score/calibrate-v3.ts <原fixture voice/timing绝对路径，同上> .axmorf/voiceover-calibration-fixed`：0，修后profile重新测量；没有TTS或旁白变化。
- `npm run packages:build && npm run check`：0；主551通过/1跳过，宿主24通过。
- `npm pack --workspace @axmorf/studio --ignore-scripts --pack-destination .axmorf/voiceover-release-fixed`：0，本地未发布tgz，版本仍0.3.0-rc.5。
- 新v6内 `npm install --save-exact <voiceover-release-fixed中tgz绝对路径> --registry=https://registry.npmjs.org/ --fetch-retries=0`：授权单次安装0；bootstrap=0；首次doctor因无浏览器1；`npm run browser:prepare`=0；再doctor=0。
- v6 `npm run film:music -- --film ai-small-lab-training-cost-20261106`、`film:sfx`：均0；生成器登记29条原创音效。
- v6 `film:check` 两次均0、errors/warnings空；deliver内置check也通过。
- v6 `film:review -- --film ai-small-lab-training-cost-20261106 --animatic`，及第一轮47帧前的43帧定点review：0；第一轮修正后带47帧的animatic/review第二、第三轮均0。完整帧参数保留在日志，最终有声预览fresh。
- `node --import tsx .axmorf/voiceover-evidence/measure-v6.ts`：0，用真实生成音频+当前播放贡献解析器，逐句duck一次；输出bed/voice/mix WAV和report。
- v6 `npm run film:deliver -- --film ai-small-lab-training-cost-20261106`：0，四件套复验通过，无旧交付。
- `ffmpeg -hide_banner -loglevel error -hwaccel none -i <video.mp4> -f null -`：0，完整软件解码。
- `ffprobe -v error -count_frames -show_entries stream=index,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,sample_rate,channels:format=duration -of json <video.mp4>`：0；`ffmpeg -hide_banner -nostats -hwaccel none -i <video.mp4> -vn -af ebur128=peak=true -f null -`：0。
- `python3 .axmorf/voiceover-evidence/verify-protected.py`：0；两种封面与联系表/六张最终强重音小图已看图；`animaticReminder`最终返回null。
- 最后 `npm run docs:check-links`、`git diff --check`：0。没有扩展测试范围或降低检查阈值。

## 最终产物绝对路径索引

- worktree：/home/zzzxc/.config/CindyGlobal/owners/24ad0e43f9901a2b3b9e/bots/bot_1793619581836_kwfnjr/workspace/axmorf-studio-voiceover
- branch：axmorf/voiceover-mix
- v6Workspace：/home/zzzxc/AgentWorkspace/axmorf-trial-v6-voiceover/workspace
- animatic：/home/zzzxc/AgentWorkspace/axmorf-trial-v6-voiceover/workspace/out/films/ai-small-lab-training-cost-20261106/review/animatic.mp4
- contactSheet：/home/zzzxc/AgentWorkspace/axmorf-trial-v6-voiceover/workspace/out/films/ai-small-lab-training-cost-20261106/review/contact-sheet.jpeg
- reviewNotes：/home/zzzxc/AgentWorkspace/axmorf-trial-v6-voiceover/workspace/out/voiceover-evidence/review-notes.md
- reviewReport：/home/zzzxc/AgentWorkspace/axmorf-trial-v6-voiceover/workspace/out/voiceover-evidence/round3-final.json
- audioReport：/home/zzzxc/AgentWorkspace/axmorf-trial-v6-voiceover/workspace/src/films/ai-small-lab-training-cost-20261106/review-evidence/audio/report.json
- deliveryVerification：/home/zzzxc/AgentWorkspace/axmorf-trial-v6-voiceover/workspace/out/voiceover-evidence/delivery-verification.json
- calibration：/home/zzzxc/.config/CindyGlobal/owners/24ad0e43f9901a2b3b9e/bots/bot_1793619581836_kwfnjr/workspace/axmorf-studio-voiceover/.axmorf/voiceover-calibration-fixed/report.json
- tgz：/home/zzzxc/.config/CindyGlobal/owners/24ad0e43f9901a2b3b9e/bots/bot_1793619581836_kwfnjr/workspace/axmorf-studio-voiceover/.axmorf/voiceover-release-fixed/axmorf-studio-0.3.0-rc.5.tgz
- sourcePatch：/home/zzzxc/.config/CindyGlobal/owners/24ad0e43f9901a2b3b9e/bots/bot_1793619581836_kwfnjr/workspace/axmorf-studio-voiceover/.axmorf/voiceover-evidence/v6-source.patch
- changedFiles：/home/zzzxc/.config/CindyGlobal/owners/24ad0e43f9901a2b3b9e/bots/bot_1793619581836_kwfnjr/workspace/axmorf-studio-voiceover/.axmorf/voiceover-evidence/changed-files.txt
- protectedVerification：/home/zzzxc/.config/CindyGlobal/owners/24ad0e43f9901a2b3b9e/bots/bot_1793619581836_kwfnjr/workspace/axmorf-studio-voiceover/.axmorf/voiceover-evidence/v5-v6-protected-final.json
- 四件套和全部6张强重音图的逐个绝对路径：上述worktree `.axmorf/voiceover-evidence/artifact-paths.json`。
