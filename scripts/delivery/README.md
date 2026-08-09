# Delivery CLI

Current automatic local delivery keeps fixed layers:

- `cli.ts`: exact build/check argument dispatch;
- `application/`: current input loading, independent Cover use cases, package/check, detached launch;
- `domain/`: deterministic identity, canonical publishing/manifest/handoff/ledger bytes;
- `adapters/`: protected filesystem, independent Cover media checks, detached Remotion spawn.

```bash
npm run delivery:cover:freeze -- --project <storyId>
npm run delivery:cover:check -- --project <storyId>
npm run production:owner:ready -- --run <runId> --owner cover
npm run delivery:build -- --project <storyId>
npm run delivery:check -- --project <storyId> --delivery <deliveryId>
```

Cover task 只 author 并发布 receipt；detached production watcher 是 Cover fixed check/submit 与
automatic `delivery:build` 的唯一正常调用方。上面的 check/build 是诊断和中央 use case，不属于
root 或 Cover owner 的派发后流程。

`delivery:build` requires current PublishingIntent, ProductionRenderPlan, ProductionRenderReady and
CoverResult. It writes an immutable non-MP4 package and launch intent before detached Remotion spawn;
after the OS emits `spawn`, it writes a receipt and returns `delivery-render-started`.

Intent without receipt is launch-ambiguous and never retried. Receipt does not prove render
completion. Build/check do not monitor, read, hash, probe, or decode the planned MP4. Full semantics:
[automatic local delivery guide](../../docs/guides/LOCAL_DELIVERY.md).
