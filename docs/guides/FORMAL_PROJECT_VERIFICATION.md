# 正式作品验证

> 文档类型：维护指南
>
> 最后复核：2026-08-06

## 边界

`scripts/project-validation/formal-projects.json` 是正式作品验证的静态白名单，只声明项目 ID
和有序语义步骤。JSON 不包含模块路径、shell 命令或可执行表达式；步骤到实现的绑定只存在于
`scripts/project-validation/adapters.ts` 的静态 adapter 中。

验证器不扫描 `src/projects/`，不会因为新增目录自动执行代码。新正式作品必须同时增加 profile、
静态 adapter 与测试，缺少任一绑定都 fail closed。

## 命令

```bash
# 所有正式作品的完整验证；会间接启动 Remotion Chromium
npm run project:verify -- --all

# 一个作品的完整验证
npm run project:verify -- --project <story-id> --scope full

# 只复验已声明的 evidence 或 approval adapter
npm run project:evidence:check -- --project <story-id>
npm run project:approval:check -- --project <story-id>
```

`npm run check:host` 依次执行 Composition listing 和所有正式作品 profile。profile 保持既有
作品的 narrative、Scene、最终装配、evidence、approval 与 final 聚合顺序，但不暴露 M6–M9
里程碑命名的公共脚本入口。

## 维护规则

- 通用生产入口只放在 `scripts/production/`；
- 作品专属构建期工具放在 `scripts/project-tools/<story-id>/`；
- synthetic proof 放在 `scripts/proofs/<proof-id>/`；
- 历史 schemaVersion、artifact 文件名和已封存 fingerprint 继续按兼容层读取，不回填；
- profile 的 `check` 路径只读，不生成音频、不重签批准、不改写正式 evidence。
