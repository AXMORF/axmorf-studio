---
name: remotion-best-practices
description: Route Scene implementation to the relevant Remotion references.
---

# Remotion best practices

Use deterministic `useCurrentFrame()` and composition `fps` for every
render-critical animation. Do not use CSS animations, CSS transitions,
wall-clock time, random runtime values, network calls, or filesystem scans in
render code.

Keep Scene roots transparent and size them from the provided viewport width and
height. The Composition owns full-frame background, narration, captions, and
safe-area placement. Use `staticFile()` for Workspace-owned public media.

Read [Scene implementation](references/scene-implementation.md) before editing a
Scene. The task contract and fixed validator take precedence over this guidance.
