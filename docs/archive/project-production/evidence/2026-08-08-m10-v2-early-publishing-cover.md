# M10 v2 Early Publishing and Cover Evidence

> Date: 2026-08-08<br>
> Baseline: `ea1a054`<br>
> Proof Project: `product-comic-vertical`

## Scope and compatibility

This evidence covers future-only v2 delivery. Existing v1 specification/manifest identities, Cover
source, approved media, Project artifacts, and release directories were not migrated, backfilled, or
overwritten. The historical v1 release
`release-69f749e76a826e29e99bf7cbbe7f2fae1dc4f75a74a986d063fc24591e50d21c` still passes the
self-contained read-only `delivery:check` path.

## Red to Green

The first focused test runs failed because PublishingIntent/Cover/v2 delivery APIs did not exist and
the v1 build still rendered Covers during delivery. The implementation then added strict contracts,
the independent Cover lifecycle, v2 pure archive build/check, and compatibility dispatch. Focused
tests cover malformed/stale/missing Story publishing intent, ordered StoryBeat coverage, unique
meaning IDs and topics, Chinese 11-code-point chapter names, floored `HH:MM:SS`, strict Cover source
and dimensions, immutable result drift, production independence, atomic/idempotent delivery, unsafe
paths/symlinks, and v1 read-only verification.

## Contract identities

- PublishingIntent contract: `publishing-intent-v1`
- PublishingIntent fingerprint:
  `sha256:a6e40c494710e452d81cdb01aa2562c3333c0bf9ef03ce31e538ca4ffa4fd976`
- Story fingerprint:
  `sha256:fc0418fe25ee29fbf2690d8a0aa31828fde28a7c3c389a9d94f8917b39429dc9`
- Cover assignment fingerprint:
  `sha256:a3e0f848798f959660506740a89e8ff99e893a483c351f1f55ddecaa12d0a506`
- Cover package fingerprint:
  `sha256:f8c08efeeba0d6fffbd9ea5519571889add886de2a69517fa85ad06dc94a7445`
- Cover source graph fingerprint:
  `sha256:24f19185b6dd211e19f5130969d9ae171ee5770fcab3e458349ec7328e411bae`
- Cover result fingerprint:
  `sha256:b8542f9d455e91df70c41656c830e2c2b5b4bb552aab358d9a9069a24bc9ae09`

PublishingIntent has 7 unique topics and 10 ordered chapters, contains no title, startFrame, or
timecode. CoverAssignment has exactly three creative inputs: current StorySpec, current
VisualStyleSpec, and fixed CoverSpec.

## Independent Cover owner proof

One Cover child owned only `src/projects/product-comic-vertical/delivery/cover/`. It did not read
PublishingIntent, timing, narration/captions, Scene/GlobalVisual output, FinalAssembly, preview,
evidence, approval, historical Cover source, or deliveries. It authored two independent code-only
Compositions and used the fixed check/submit commands. The root Agent separately audited source and
the rendered images, then reran both commands.

| Output | Dimensions | File SHA-256 | Size |
| --- | ---: | --- | ---: |
| `cover-4x3.png` | 1600×1200 | `712de9c1a6c1ef8e328f8682480a3c501c596cfefc127bd868bf9343fb18f57a` | 223002 |
| `cover-3x4.png` | 1200×1600 | `72af369d4ae14f5a37bcaa8474d53c62e96b3d472401cf44baadb2e685edb5da` | 600681 |

Both full-size PNGs decoded to EOF. Thumbnail checks were 320×240 and 240×320. Repeated Cover submit
returned `noOp: true`. Cover is absent from production watcher imports/result joins; its missing or
failed state does not prevent `preview-ready`, while v2 delivery requires it current.

## Real v2 release

- Release ID:
  `release-13d1965fb25769a118e31405dee53758228d3f6916452c579c24273876ebced7`
- Delivery specification fingerprint:
  `sha256:ceb6c3c46340f5ff8ea36979ddc851cb3158ea29605d65fea5cf26b8a1a5b061`
- Manifest fingerprint:
  `sha256:642cc6c703e9cb7b7333620364a2b0e2e38de671170c8f105117cdb0c42fc14a`
- Approved preview SHA-256:
  `c70a25a898abe828e90664b061e2e18840420099bb82bbe33b49357642f05b30`
- Delivered MP4 SHA-256:
  `c70a25a898abe828e90664b061e2e18840420099bb82bbe33b49357642f05b30`
- Publishing JSON SHA-256:
  `ac979de41b009a0d7024bd99fefced5eb7ec950ad781c31fad94289d1e20f272`
- Release manifest SHA-256:
  `1ce9b34313344393c3bf801bc7dc1096132ea601a859c9cc612c5ebeb32d52da`

The MP4 was copied byte-for-byte from the checksum-bound approved preview. The two release Covers
match the immutable Cover result. `publishing.json` projects Story title, PublishingIntent content,
SemanticTiming chapter starts/floored timecodes, FinalAssembly fps/frame count, and measured MP4
duration `170.538667`. Repeated `delivery:build` returned `noOp: true`; `delivery:check` reported
`delivery-release-manifest-v2`, and the checksum ledger passed.

## Validation

- Final focused Cover/source/atomicity regression set: 30/30 pass.
- `npm run check`: 700/700 tests plus typecheck, lint, documentation links, Catalog, Registry, bundle,
  Composition listing, and all-Project source verification pass.
- `npm run test:all`: 780/780 pass; `npm run test:media`: 80/80 pass.
- Standalone `npm run build` and `npm run compositions` pass with all eight current Compositions.
- Project-owned `full`, `source`, `evidence`, `approval`, and final checks pass. The current final report
  remains `sha256:8a52e146c2edeb422a77136707a35c54fa9e5e787b0bcdd35e95b0650b8d41b2`.
- Real Cover freeze/check/submit, v1/v2 delivery checks, repeated v2 build, and the six-file checksum
  ledger pass. The isolated deletion matrix passes cases A–F.
- Story, VisualStyleSpec, SemanticTiming, FinalAssembly, FinalPreviewEvidence, approval, final report,
  and approved preview checksums remain byte-identical to the pre-change audit.
