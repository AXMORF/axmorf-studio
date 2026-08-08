# Delivery CLI

Current automatic local delivery keeps fixed layers:

- `cli.ts`: exact build/check argument dispatch;
- `application/`: current input loading, independent Cover use cases, package/check, detached launch;
- `domain/`: deterministic identity, canonical publishing/manifest/handoff/ledger bytes;
- `adapters/`: protected filesystem, independent Cover media checks, detached Remotion spawn.

```bash
npm run delivery:cover:freeze -- --project <storyId>
npm run delivery:cover:check -- --project <storyId>
npm run delivery:cover:submit -- --project <storyId>
npm run delivery:build -- --project <storyId>
npm run delivery:check -- --project <storyId> --delivery <deliveryId>
```

`delivery:build` requires current PublishingIntent, ProductionRenderPlan, ProductionRenderReady and
CoverResult. It writes an immutable non-MP4 package and launch intent before detached Remotion spawn;
after the OS emits `spawn`, it writes a receipt and returns `delivery-render-started`.

Intent without receipt is launch-ambiguous and never retried. Receipt does not prove render
completion. Build/check do not monitor, read, hash, probe, or decode the planned MP4. Full semantics:
[automatic local delivery guide](../../docs/guides/LOCAL_DELIVERY.md).
