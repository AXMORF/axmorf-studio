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

## 下一步候选

以下方向尚未批准，进入前需要单独的方案与验收标准：

- 把一部连续空间、场景内标签、镜头移动做得好的片子提炼成 Skill 内的短示范片；
- 渲染后的可读性实测（字号、对比度、停留时长）作为审片提示，而不是交付拦截；
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
