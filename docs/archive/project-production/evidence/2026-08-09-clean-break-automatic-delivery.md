# 2026-08-09 clean-break 自动交付实现证据

> 本文记录本次实现与验收事实，不作为 runtime compatibility authority。

## Scope 与清理

本次按用户明确授权从 clean 工作树开始，未备份、未迁移地清理：

```text
.producer-runs/
out/
deliveries/
src/projects/
public/projects/
build/
```

随后运行 bootstrap，只重建 zero-project core proof、Catalog 与 Registry。未读取或修改
`public/voice_profile/`、`voxcpm/voxcpm.private.json`、`.git` 或 `node_modules` 内容。

## Current contracts

新增并接入唯一 current path：

- `production-render-plan-v1`
- `production-render-ready-v1`
- `delivery-launch-manifest-v1`
- `render-launch-intent-v1`
- `render-launch-receipt-v1`
- `detached-spawn-acknowledgement-v1`

production watcher 的终态现在是 `render-ready / awaiting-automatic-delivery`。它只冻结
Composition/source/fps/frameCount/layer/mix 与 current upstream fingerprints，不渲染最终 MP4。

## Automatic delivery protocol

`delivery:build` 先确定性准备并检查 non-MP4 package，再原子提升，之后 detached spawn fixed
Remotion argv。launch intent 在 spawn 前 exactly once 落盘；receipt 只在 child 发出 OS `spawn`
后 exclusive write。成功 stdout 为 `delivery-render-started`。

回归测试证明：

- intent 在 injected launcher 被调用前已存在；receipt 当时尚不存在；
- spawn acknowledgement 后才写 receipt；
- child 在 spawn 后立即 exit 1 仍只得到 launch acknowledgement；
- 重复 build 在 current receipt 下返回 no-op；
- spawn error 留下 intent/no receipt，后续 build fail closed 且不再次调用 launcher；
- exact planned MP4 即使 unreadable，delivery check 仍不读取它；
- missing/stale Cover、input drift、unknown files、symlink 与 output conflict 均 fail closed。
- delivery 会调用 current production render-ready check，并反校 Story、SemanticTiming、Run、
  requirements、plan 与 ready identities；相同 fps/frameCount 下的内容漂移也会失败。
- render argv 只 materialize 固定 output 参数槽；storyId 与 placeholder 同名不会改写其他参数。

## Source boundary

- production/delivery CLI 不再分派旧 contracts；非 current inputs strict fail closed。
- SceneSlot 删除缺少 current composition boundary 时的 bypass，只接受 current boundary + frozen
  readability policy。
- final mechanical identity、Project verification profile、Skill 和 active authority docs 删除了
  已废弃的人工作品交接与旧本地封存路径。
- PublishingIntent、independent Cover、ScenePackage、ResourceCatalog、RendererRegistry、
  FinalAssembly、zero-project bootstrap 与 Project deletion matrix 保留。

## Verification record

实现期间已完成 Red → Green 的 focused contract/application/runtime tests，包含 render-ready、
detached spawn、launch ambiguity、current identity、placeholder collision 与 zero-project media
discovery 回归。

- `npm test`：通过，103 个 test files、435 个 assertions；
- `npm run test:all`：通过，103/103；
- `npm run test:media`：zero Project 空集合通过；存在 Project 但无 media tests 仍 fail closed；
- typecheck、lint、docs link check：通过；
- bootstrap / Catalog / Registry：`17` 个 core Catalog entries、`0` 个 Project entries；
- build：通过；
- compositions：通过且仅 `CapabilityGallery`；
- `npm run check`：通过，source profile completed Projects 为 `[]`；
- Critical/Important code review：初审发现 2 个 Important，修复并复核后 `CLEAR / APPROVE`。

- isolated A–F deletion matrix：在 implementation HEAD 提交后通过；Case A 证明 fresh checkout
  bootstrap/check 是 zero Project，B–F 证明 synthetic Project 可添加、删除 public/out/source、
  回到 zero 后再恢复；
- 本段是矩阵通过后的 evidence-only amend，不改变矩阵已验证的 runtime、tests 或 active docs。
