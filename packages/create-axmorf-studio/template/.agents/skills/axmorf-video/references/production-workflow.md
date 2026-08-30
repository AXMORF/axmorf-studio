# Production workflow

1. Preserve unrelated Workspace changes and inspect existing Project source.
2. Create or revise strict authoring input without calling providers.
3. Resolve execution according to the current host's real capabilities. Inline
   execution is always valid; use isolated child execution only when the host
   genuinely supplies it and the user/config selects it.
4. Run `npm run project:produce:inspect -- --project <storyId>` and report its
   structured readiness, cost, reuse, and invalidation result.
5. Run `npm run project:produce:prepare -- --project <storyId>` only after the
   inspection is understood and cost is authorized.
6. Execute each dirty Scene, GlobalVisual, or Cover task within its declared
   workspace. Do not author fixed template tasks.
7. Check and terminate every task through the exact commands returned by the
   controller.
8. Start the exact continuation command as the Root Agent's final production
   action. Do not supervise it through polling or a second continuation.

Timing comes from sealed PCM samples. Scenes do not own captions or narration.
Runtime code does not call Agents, providers, Git, or the network. Delivery is
exactly `video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and `publish.json`, and is
current only after fixed media and checksum validation.
