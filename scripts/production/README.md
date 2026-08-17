# Production tooling structure

生产工具遵循单向依赖：`cli → application → domain`，外部 I/O 通过 `adapters` 注入。

- `cli.ts`：只负责精确命令语法、输入解析、输出和安全错误边界。
- `application/`：生产用例与工作流编排；可以依赖 `domain` 和 `adapters`。
- `domain/`：状态转换、事件、投影与错误语义；不得依赖文件系统、进程或网络。
- `adapters/`：文件存储、Remotion/VoxCPM 进程和外部服务端口。

跨 Project 配置、production 与 delivery 的纯技术原子文件、port 与受限宿主媒体进程 adapter 位于
`scripts/shared/`；domain 不得依赖 application/adapters，业务模块不得反向拥有共享技术能力，
delivery 不得反向 import production adapter。这些方向由
`tests/architecture/script-layering.test.ts` 执行检查。

For ordinary rebuilds, production is not entered: `project:build` consumes current authoring source and
synchronously produces the verified four-file delivery. When missing content or explicit audit requirements
need owner orchestration, the public handoff is `production:watch:start`: it writes watcher launch intent, waits only for
OS spawn acknowledgement, writes the launch receipt, and returns. Independent owners publish
assignment-bound receipts through `production:owner:ready` or `production:owner:failed`; only the
detached worker calls internal submit/fail use cases, writes events/results, converges the Project,
and invokes delivery. Missing receipts have no timeout or retry.

新增能力先判断它属于“业务规则、用例编排还是外部 I/O”，不要把新文件继续堆到
`scripts/production/` 根目录。测试位于 `tests/production/`，按公开用例而不是内部文件数量组织。
