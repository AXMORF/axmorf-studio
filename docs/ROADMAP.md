# Roadmap

> 文档类型：阶段门槛 authority
>
> 当前完成事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 当前基线

已发布的 0.1.23 使用 Project production 主链：ProductionRevision、content-addressed Task DAG、
attempt-bound task execution、fixed continuation 与 exact four-file delivery，详见
[ARCHITECTURE.md](ARCHITECTURE.md) 与 [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)。

2026-10-14 维护者确认：Agent 直接编写 Remotion 工程并看图迭代的成片质量明显更好，旧主链的协议、计划文件和
静态检查占用了 Agent 的大部分注意力。产品目标已改为 direct 方式，见 [FINAL_PRODUCT_GOAL.md](FINAL_PRODUCT_GOAL.md)。
旧作品不迁移。

## 里程碑

完整设计、命令与检查规则见 [Direct Film 生产方案](promotions/2026-10-14-direct-film-production.md)。

### 0.2.0：direct 成为默认

- `film.json` 合同、`@axmorf/studio/film` hook 与组件、`film:*` 命令、`axmorf-film` Skill 与新 Workspace 模板；
- `workspace:upgrade` 把新 Skill 加入已有 Workspace；Remotion Root 同时注册 films 与旧 Projects；
- 旧 `project:*` 主链冻结，只修阻塞性缺陷，不再新增功能；
- 进入条件：一部片从 `film:new` 到四文件交付不调用任何 task、attempt 或 revision 命令；在维护者已升级的
  Workspace 上用 direct 重做 HTTPS 握手片并记录用时、检查器打回次数与成片。

### 0.3.0：删除旧主链

- 删除 Project production 主链、revision candidate、originality、scene-template fixed task、相关 contracts、
  CLI、Web 视图、测试与文档；
- Workspace 不再注册 `src/projects/`；升级时列出残留旧 Project，不自动删除用户文件；
- 进入条件：`npm run check` 通过；全新 Workspace 与从 0.2.x 升级的 Workspace 都能完成一部片。

## 发布门槛

发布流程见 [两道门的发布流程](guides/FIRST_USE_RELEASE_GATE.md)：

1. `npm run release:prepare -- <version>` 统一三个 manifest 与 lock 中的版本；
2. root/package/template README、Agent instructions、Skill 和 active docs 与当前 package surface 一致；
3. 版本 tag 指向已合入默认分支的 release commit，CI 运行完整 `npm run check`、最小真实渲染与全新安装；
4. 通过 Trusted Publisher 运行纯 OIDC `npm publish --provenance`；预发布版本进入 `next`；
5. 真实 Agent 宿主在 `next` 上完成一部视频后，才发布正式版本到 `latest`。

## 不引入

- 远程 scheduler、数据库或存储；常驻 Agent 或调度器；
- 自动重试、provider fallback、TTS warm-up 或降低 Chromium sandbox；
- 为旧作品保留的兼容层或迁移工具；
- 用静态代理指标或主观打分冒充成片验收。
