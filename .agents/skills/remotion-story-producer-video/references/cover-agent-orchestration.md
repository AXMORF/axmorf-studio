# Independent Cover Agent orchestration

This reference owns the Cover side of future-only v2 production authoring. Cover runs concurrently
with the N Scene owners and the whole-film GlobalVisual owner, but it is not part of the production
watcher's N+1 join and never changes a `production:*` command or state.

## Keep one exclusive owner

After current StorySpec, PublishingIntent, and VisualStyleSpec exist, the root Agent runs:

```bash
npm run delivery:cover:freeze -- --project <storyId>
```

Create exactly one Cover child Agent for both ratios. Give it only the generated CoverAssignment and
its fixed `src/projects/<storyId>/delivery/cover/` ownership. The assignment embeds exactly current
StorySpec, current VisualStyleSpec, and fixed CoverSpec. Do not give or let it read PublishingIntent,
SemanticTiming, narration, captions, ScenePackage, Scene/GlobalVisual output, FinalAssembly, preview,
evidence, approval, historical Cover source, or existing deliveries.

The owner writes only:

- `Cover4x3.tsx` for the independent 1600×1200 composition;
- `Cover3x4.tsx` for the independent 1200×1600 composition;
- the fixed `Root.tsx` and `index.ts` entry files;
- immutable output only through the fixed submit command.

Both compositions use code-only graphics. They cannot use images, video, audio, network resources,
remote fonts, Scene/GlobalVisual output, shared composition source, or mechanical cropping. The owner
preserves all other changes and does not stage, commit, create nested Agents, or write repo state.

## Check and seal independently

The Cover owner runs:

```bash
npm run delivery:cover:check -- --project <storyId>
npm run delivery:cover:submit -- --project <storyId>
```

Check renders both real full-size one-frame PNGs into temporary storage, verifies exact dimensions and
full decode, and performs 320×240 plus 240×320 thumbnail decode checks. Submit repeats validation and
atomically seals the PNGs, package, and result under the assignment-fingerprint result directory.

After `cover-ready`, the root Agent audits changed paths and images, reruns both fixed commands, and
records the package/source/result/PNG fingerprints. A Cover failure does not block the production
watcher from reaching `preview-ready`; it only blocks later future-only `delivery:build`. Repository
files never record or monitor Agent, task, thread, progress, conversation, logs, or heartbeat state.
