# Delivery CLI

M10 的批准后本地交付能力，保持固定分层：

- `cli.ts`：只解析 exact build/check 参数；
- `application/`：加载 current Project authority，编排 build/check 与原子封存；
- `domain/`：canonical publishing、handoff 和 checksum ledger 规则；
- `adapters/`：固定本地文件系统、FFprobe/FFmpeg 与 Project-owned Remotion Still。

唯一命令：

```bash
npm run delivery:build -- --project <storyId>
npm run delivery:check -- --project <storyId> --release <releaseId>
```

本模块不修改 `production:*`、不创建批准、不重新编码已批准视频、不访问网络，也不接受任意
输出目录。完整操作说明见 [M10 本地交付指南](../../docs/guides/LOCAL_DELIVERY.md)。
