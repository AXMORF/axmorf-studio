# Scene implementation

- Derive animation from `useCurrentFrame()` and `useVideoConfig()`.
- Use `interpolate()`, `spring()`, and `Sequence` with explicit frame ranges.
- Keep the root transparent; never add the Composition background or captions.
- Load only Workspace-owned public assets through `staticFile()`.
- Avoid CSS animation/transition properties and nondeterministic values.
- Preserve the task's meaning, timing anchors, safe area, and declared outputs.
- Run the exact task check command until the owning workspace validates, then
  use the exact attempt-bound terminal command.
