# 口播混音与 v6 对比进度

本任务方案取代早期 P8 中品牌母题、12–15 LU、讲述期全面减幅要求；P6 冻结。
只在 axmorf/voiceover-mix（基线 f053f7c）实施，不合并、推送或发布。

当前状态：代码验收完成；v6 在首次 npm 安装阶段阻断，等待负责人决定下一步。

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

## 阻断：v6 首次安装

标准 `npm install --save-exact <本工作树本地 tgz>` 退出 1，ERESOLVE unable to resolve dependency tree。
锁中 three=0.185.0；npm 报 Found: three@undefined，无法满足 @react-three/fiber@9.6.1 的 peer three>=0.156。
日志显示读取当前配置的 registry.npmmirror.com 元数据。只记录已知事实，未认定改版本可解决。
未重试、未切换 registry、未用 force/legacy-peer-deps，未改 node_modules 或配置；bootstrap/doctor 未执行。
负责人需决定安装恢复方式并授权后续尝试；依照“方案走不通停下报告”暂停 v6。
新目录已存在且只有必要复制品；续做应先核对，不再次创建或覆盖。

## 保护与未验证

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
