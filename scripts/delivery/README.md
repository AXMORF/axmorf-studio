# Delivery CLI

M10 的批准后本地交付能力，保持固定分层：

- `cli.ts`：只解析 exact build/check 参数；
- `application/`：加载 current Project authority，编排 Cover freeze/check/submit、build/check 与原子封存；
- `domain/`：Cover source guard、canonical publishing、handoff 和 checksum ledger 规则；
- `adapters/`：固定本地文件系统、FFprobe/FFmpeg 与独立 Remotion Cover Still。

精确命令：

```bash
npm run delivery:cover:freeze -- --project <storyId>
npm run delivery:cover:check -- --project <storyId>
npm run delivery:cover:submit -- --project <storyId>
npm run delivery:build -- --project <storyId>
npm run delivery:check -- --project <storyId> --release <releaseId>
```

future-only v2 的 Cover 在用户批准前独立封存；build 不再渲染视频或封面，只复制 exact approved
preview 与 immutable Cover PNG。v1 artifacts/releases 仍可只读复验。本模块不修改
`production:*`、不创建批准、不访问网络，也不接受任意输出目录。完整操作说明见
[M10 本地交付指南](../../docs/guides/LOCAL_DELIVERY.md)。
