# Roadmap

> 文档类型：阶段门槛 authority
>
> 当前完成事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 当前基线

Agent 直接编写 Remotion 工程并看图迭代，见 [FINAL_PRODUCT_GOAL.md](FINAL_PRODUCT_GOAL.md) 与
[ARCHITECTURE.md](ARCHITECTURE.md)。迁移按 [Direct Film 生产方案](promotions/2026-10-14-direct-film-production.md)
完成：

- 0.2.0：direct film 成为默认，旧 Project 主链冻结；
- 0.2.1：系统片头片尾、审片帧证据与静止提示、Edge TTS 请求节奏；
- 0.3.0：删除 Project production 主链、相关 contracts、CLI、Web 视图、测试与文档；Workspace 升级移除旧 Skill
  与旧脚本，列出残留的旧 Project 目录但不删除。

当前预发布基线：`@axmorf/studio@next` 为 `0.3.0-rc.5`，稳定 `latest` 为 `0.2.1`。
P1–P10 的场景轨、六种配方、studio-v3、口播频段避让/语义帧对拍、三层节奏动效与导演手册、纸面风格和生图剪纸流程已实现；
图形/节奏/局部对比审片均为提示，缺测保留 unknown。字幕已支持 caption 显示文本、paper 纸条和可选 karaoke 分句估时。
本机只做软件解码/抽帧/测量，实际看听交给手机或 Mac，不启动播放器或浏览器自动播放。

v8 终版已获用户认可。**P6 进行中：发布 0.3.0-rc.6 到 next**；本地准备包含旁白内容缓存、文档同步和合入 main，
不代表已经发布。随后升级实际 Workspace 并完成一部日常片，再考虑 `latest`；详见[当前实施与验收](promotions/2026-11-06-cinematic-motion-and-sound.md)。

## 下一步候选

以下方向尚未批准，进入前需要单独的方案与验收标准：

- 在现有可编译导演示例和纸面配方之外，补充更多片型的完整短片示范；
- 文字停留时长实测提示；字号、越界、字幕避让、前景遮挡与局部对比提示已实现，更多片型仍需校准；
- 更稳定的 TTS provider 选择与说明。

## 发布门槛

见[发布流程](guides/RELEASE.md)：

1. `npm run release:prepare -- <version>` 统一三个 manifest 与 lock 中的版本；
2. root/package/template README、Agent instructions、Skill 和 active docs 与当前 package surface 一致；
3. 版本 tag 指向已合入默认分支的 release commit，CI 运行完整 `npm run check`、最小真实渲染与全新安装；
4. 通过 Trusted Publisher 运行纯 OIDC `npm publish --provenance`；预发布版本进入 `next`；
5. 真实 Agent 宿主在 `next` 上完成一部片后，才发布正式版本到 `latest`。

## 不引入

- 远程 scheduler、数据库或存储；常驻 Agent 或调度器；
- 自动重试、provider fallback、TTS warm-up 或降低 Chromium sandbox；
- 任务 DAG、执行 attempt、内容寻址 artifact、候选晋级或旧作品兼容层；
- 用静态代理指标或主观打分冒充成片验收。
