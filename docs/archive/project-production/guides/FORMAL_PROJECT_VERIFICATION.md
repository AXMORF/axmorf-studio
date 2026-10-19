# 正式作品验证

> 文档类型：维护指南
>
> 最后复核：2026-08-10

## 边界

每个正式作品在 `src/projects/<story-id>/verification.profile.json` 声明自己的有序语义步骤。
JSON 不包含模块路径、shell 命令或可执行表达式；通用 adapter 只把固定 step ID 绑定到当前
Project 内的约定工具位置。删除 Project 后，其 profile、工具与验证测试一起消失，中央配置不
保留该 storyId。

`src/projects/` 与 `public/` 均是 ignored 本地生产叶节点。fresh clone 默认没有正式作品，
`--all` 返回空 completed 集合；恢复或新建本地 Project 后，bootstrap 才把它加入 Registry 和
Catalog，验证器也只发现当前本地 profile。

验证器只在显式命令或 `--all` 时发现当前一级 Project profile；拒绝 symlink、未知 step、路径和
命令字段。新正式作品必须提供 profile、Project-owned 工具与测试，缺少任一绑定都 fail closed。

## 命令

```bash
# 默认核心门禁使用的当前 Project source 验证
npm run project:verify -- --all --scope source

# 一个作品的完整验证（包含 profile 声明的 source 与 media evidence）
npm run project:verify -- --project <story-id> --scope full

# 只复验已声明的 media evidence adapter
npm run project:evidence:check -- --project <story-id>
```

`npm run check:host` 依次执行 Composition listing 和当前 Project 的 source scope，不读取
`out/` 中的 MP4/PNG/contact sheet。`test:media`、evidence 与 full scope 都是显式复验入口；
媒体缺失或 checksum 漂移时继续 fail closed。current profile 没有 approval scope 或
`project:approval:check` 命令。

## 维护规则

- 通用生产入口只放在 `scripts/project-production/`，并保持 domain/application/adapters/CLI 分层；
- 作品专属构建期/验证工具放在 `src/projects/<story-id>/tools/`；
- synthetic proof 放在 `scripts/proofs/<proof-id>/`；
- profile 与 adapter 只读取 current Project 合同；不解释、迁移或回填旧 Project artifact；
- profile 的 `check` 路径只读，不生成音频、不重签批准、不改写正式 evidence。
- 不把具体 storyId 加回 core、package scripts 或 active 中央 manifest；新增 Project 后由 bootstrap
  重算 Registry/Catalog。删除一个、多个或全部作品时必须使用
  `npm run project:delete -- ... --confirm-delete`，让 profile、工具、媒体、narration work、workspaces、
  artifacts、attempts、revision candidates、legacy history、out 与 deliveries 一起消失并重建聚合投影。
- 不提交 `src/projects/`、`public/` 或当前 Project 集的聚合 Registry/Catalog。
