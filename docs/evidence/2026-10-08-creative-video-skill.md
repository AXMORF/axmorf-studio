# Creative video Skill improvement

Date: 2026-10-08. Scope: repository-local axmorf-video Skill, creator-generated guides and their API guidance.
This is an unpublished update; it does not modify global Agent skills or certify a new package release.

## Experience retained from the completed film

The locally packed acceptance Workspace completed the original film “一座城市，如何醒来”: 1080×1920, 30fps,
1740 frames / 58 seconds, stereo H.264/AAC. Its seven authored-frame content Beats share one Scene owner for 48 seconds;
the inherited intro/outro add ten seconds. There were no provider calls, narration or captions.
This was original frame-driven SVG/isometric illustration, not photorealistic 3D or generated footage.

The film's causal progression connects a clock pulse, waking windows, a train, a blocked crossing, ordered releases,
district flow and the final city-wide result. Macro/detail reveals, following motion, foreground occlusion, depth and
camera pullback express those changes. World geometry and object identity survive semantic boundaries; reading text
stays in a stable layer. Visual actions, sync anchors and approved sound effects share semantic events. Whoosh starts
account for the source swell center; the body uses effects and pauses rather than a background music track.

The preserved lesson is to design the complete causal film before assigning visual ownership, choose motivated motion
and contrast it with readable results, then inspect the real media. The city subject, palette, BPM, number of Beats,
cue count and camera path are not defaults for later films. No historical Scene source or layout is added to the Skill.

DeliveryBuildId: `delivery-8f49535defe19206bc36016128c06e6a01629fa2514232f100afc66ac7692d73`.
The current video checksum was reread and recomputed during this Skill task:
`sha256:1588bdcb3c9fb3985dddc8f1262cabd38e79316beb5a3b89fa7743664e6457ab` (25751643 bytes).
The recorded final check passed all seven checks; publish.json reports the exact four delivered files and media EOF validation.
The workspace location and earlier package provenance are in [continuous-video acceptance](2026-10-08-continuous-video-acceptance.md).

The film's review record contains 35 storyboard positions, 30 boundary positions and two enlarged frames. Muted technical
preview playback decoded all1740 frames without media errors. Five decoded sound-event comparisons measured intended
alignment; complete preview/final decoded PCM was identical. These are sampled visual and technical audio observations,
not uninterrupted subjective viewing, listening or aesthetic certification. Raw records remain outside Git in
`city-review/review-observations.json` and `city-review/final-audio-alignment.json` under that acceptance directory.

## Decisions implemented in the Skill

[Film direction](../../.agents/skills/axmorf-video/references/film-direction.md) is a focused reference shared byte-for-byte
with the creator template. Root reads it for new films, substantial creative revisions and review. The repository and
generated Remotion Skill route isolated Scene executors to its implementation section after binding. Local corrections
continue to preserve bound priorSource and change only the requested delta.

Guidance covers per-Beat cause/action/consequence, continuous world ownership, motivated cameras and transitions,
separate reading text, rhythm with real pauses, event-based sound and media review with explicit observation scope.
It also distinguishes the admissible Story resource pool from exact silent-preset consumption: sorted/unique preset IDs
must match the brief and actual use. Input-generation errors stop dependent create instead of using a missing/stale file.
Total-duration budgets include boundaries and lead/tail; bookend audio is checked independently of body BGM.

An independent read-only forward trial used two unrelated briefs: a narrated order/inventory workflow and a quiet,
minimal breathing animation. It produced causal success/failure branches for the first and a fixed camera with real
holds for the second. No Project, provider or video was created by that trial. It exposed ambiguous field placement and
duration/audio inheritance guidance, now clarified in the reference and entrypoint. It also found existing motion API
advice that unconditionally required sealed narration anchors. The public Catalog guide now distinguishes narrated and
authored-frame anchors, and tracked v1 geometry from intent-first v2. Runtime behavior and validators are unchanged.

Policy is `axmorf-video-policy-v27` with schemaVersion20. Existing context ceilings are unchanged; repeated entrypoint
text was shortened after the first context-budget test failed. Creative planning and Scene authoring have separately
checked reading bundles, without loading every owner workflow into those stages. Tests verify shared guide bytes,
reachable Scene routes and actual creator copying, rather than asserting every sentence of creative guidance.

## Known diagnostic limitation

The completed film's `project:scene:review --motion` failed with “Current SemanticTiming is stale against the delivery.”
Current `scripts/scene-review/plan.ts` compares publishing chapters only with narrated Beats. All seven authored-frame
chapter meaningIds/startFrames, storyId, fps and frame count match the delivery. The planner excludes those valid Beats.
This is a diagnosed review-entrypoint defect; it is not a failed four-file delivery and is not fixed by this Skill task.
The original incident is preserved in `city-review/scene-review-incident.json`. The guides require reporting the failure
and actual manual review scope, never deleting valid chapters, rewriting artifacts or claiming the failed tool passed.

## Verification of this update

The focused bundle passed53/53, zero failures/skips/cancellations: production Skill, Agent compatibility, documentation
structure/preflight, creator scaffold copying, capability guides, Catalog generation and Catalog contracts. After the
last motion example was narrowed to tracked v1, both affected guide/export/example tests were repeated and passed2/2.
All nine capability examples typechecked against the actual public APIs in the focused run.

Repository `tsc --noEmit` and scoped ESLint exited0. Both production Skills passed skill-creator quick_validate in an
isolated temporary Python environment with PyYAML6.0.3. Scoped Prettier passed. Creator check:package and npm pack dry-run
passed; the42-file dry-run includes the new template film-direction reference. Actual scaffold generation in a temporary
Workspace verifies its bytes match both repository and template guides.

Documentation checking includes all199 active tracked/nonignored untracked Markdown files:370 local links and264 npm
script references across145 operational files passed;80 external links were skipped by this checker. The ordinary
tracked-only CLI check also passed. The broadened check uses the same generated Workspace script names as that CLI;
its first invocation omitted that context and falsely flagged Workspace-only commands, then passed with the correct
caller input, without changing the checker or documentation to hide an unknown command.

The operational reading bundle is17926 characters within the unchanged18000-character ceiling. Separate planning and
new-Scene bundles fit the same word/character limits. Incremental checksum/diff review against the pre-task worktree
snapshot covers only13 existing owned files and three additions; unrelated preexisting changes remain intact.
No new film was produced for this Skill update, and the full npm run check/host render suite was not repeated for these
instruction, example and documentation changes. The previous1270-test full run is retained as prior upgrade evidence,
not presented as verification of this later Skill update. No Git commit, push or npm publication.
