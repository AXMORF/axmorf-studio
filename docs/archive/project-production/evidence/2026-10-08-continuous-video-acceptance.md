# Continuous video upgrade acceptance

Date: 2026-10-08. Scope: unpublished source on `axmorf/npm-workspace-open-source`, based on `c3431f6`.
Node 22.22.3, npm 10.9.8, exact Remotion 4.0.489. Both package versions remain 0.1.16.
This supplements the [Oct 7 engineering snapshot](2026-10-07-continuous-video-upgrade.md); that snapshot's original
measurements and incomplete acceptance scope remain historical evidence. No commit, push or npm publication.

## Source and package verification

The final corrected-source `npm run check` exited0: 1270/1270 tests, zero failures/cancellations/skips,
plus typecheck, ESLint, docs, Registry/Catalog/template audio, Web/Remotion builds, compositions and source gate.
The repository has zero user Projects; its source gate returned an empty completed list, separately from the
real isolated production below. Package typechecking and both prepack build/boundary checks also exited0.

The corrected runtime has284 files, content fingerprint
`sha256:62f72cf4209cbdd020d58f630d54fb5691ccb68a4d5985f8b662693e47bc3f1e`;
creator has41 files, fingerprint
`sha256:7b082b3b27d47538cdc0010fe9dd6acbd9c18a54e6a87a1889342ea5203889a5`.
The supported creator installed them into fresh `workspace-reviewed`; all runtime files and eight generated
guides plus AGENTS matched their package bytes. All six doctor checks passed. This is a local packed consumer
acceptance, not public registry installation, publication or independent ordinary-prompt first-use certification.

Local evidence is outside Git at `/Users/ai/AgentWorkspace/acceptance/axmorf-continuous-20261008-Nnt5mE/`.
Pre-correction packages, workspaces, successful deliveries and failed revision receipts are preserved independently;
installation changes use newly packed packages and fresh workspaces, never edits to installed runtime files.

## Timing and reference diagnostics

The shared formal/preview/proof output path renders H.264 plus a complete lossless PCM mix, then performs one pinned
AAC/MP4 encode retaining actual priming/skip metadata. Requested mono/stereo is selected at encoding; H.264 is copied.
There is no fixed millisecond shift. Sequential encoding preserves exact frame timestamps for one- and twelve-frame
fixtures; frame rendering may still run concurrently.

The 640×360/30fps/120-frame authored proof has two Beats, one persistent owner, no provider/sealed narration/captions.
All four pulse/silence × mono/stereo files passed media format and EOF checks. Pulse decoded AAC and PCM activity both
span 1.8014791667–2.1985208333 seconds; measured lag is zero, correlation 0.9999991999967917. First AAC packet PTS is
−2048 with skip metadata 2048 samples; retaining that metadata corrects the former approximately 42.67 ms decoded lag.
Silent variants decode to zero peak. This certifies the measured pinned fixtures, not subjective listening or all codecs.
The subject's raster centers at frames0/59/60/119 are 55.5/317.5/321.5/583.5 px without an internal Beat reset.
Current measurements are `out/authored-frames-proof/evidence.json`; the former lag evidence remains preserved.

`reference-diagnostics-v2` uses at most120 coarse 64×36 grayscale samples at2fps, at most12 refinement windows of8
grayscale samples, and at most24 color previews with512px maximum long edge. Exact file/hash revalidation, input freeze,
bounded deadlines and cache checks passed. A local known-cut 12fps/36-frame fixture produced nominal bracket(23,24],
four accepted image-translation estimates(dx2,dy0,scale1), nine grayscale samples and seven color previews. The installed
CLI's second invocation returned a verified cache hit, with source checksum unchanged. Root viewed the report table and
seven color images; the brightness cut is visible. Tiny translation is a measured fixture result, not a visual camera claim.
These image hypotheses do not identify semantic camera movement, guarantee every cut, or grant reuse rights.
The corrected installed runtime repeated the fixture and strict cache revalidation. Its eleven report/manifest/image
files were byte-identical to the previously viewed report; current receipts are `reviewed-reference-commands.json`
and `reviewed-reference-proof.json` in the isolated acceptance directory.

## Failures discovered by real production

The first authored Workspace exposed a wasted caption region. New authored Projects now freeze readability policyVersion2
with `captionBand: "none"`; 1280×720 receives1100×540 usable SceneViewport. Narrated and previously frozen policyVersion1
retain their original geometry and fingerprints. Current Project/revision creation preserves its actual frozen policy.

A second fresh Workspace completed native `subagents` production, frozen preview, exact-four delivery and seven final
checks, with zero provider calls. Root sampled29 frames and both covers, and the browser decoded all780 frames of the
muted26-second preview without errors. This is technical playback and sampled visual review, not continuous subjective
viewing/listening. The stable credits frame still clipped: fixed landscape padding plus wrapped48px message exceeded the
new540px viewport. Source credits now allocate deterministic viewport/page budgets, using48px message and36px
reference text, bounded titles/domains and explicit ellipses while preserving full original values in Story.
The fixed120-frame credits and8-second outro remain unchanged. Existing immutable copies and old deliveries do not migrate.
Fifteen real pinned renders cover empty/dense/max-length/portrait/legacy cases; all glyph bounds passed. Root viewed
five representative images. The legacy1100×270 max-reference case uses two25-frame pages including8-frame entrances;
unclipped geometry is verified, but this short stable dwell is not certified as sufficient reading time.

The first full check after redesign caught missing explicit font declarations on three text leaf nodes, even though
they inherited36px. That original1270-test run retains its1269-pass/1-failure log. The final source states the actual
font on those nodes; existing fixed-template validators were unchanged. The focused real fixed-template artifact
suite passed34/34, the full1270-test suite passed, and a fresh set of15 renders passed glyph bounds with all PNG hashes
identical to the earlier redesign proof. Final template source checksum is
`sha256:eee8d1713777b21b8855b2c1d7eea49f76656b88a47a5fb7ff746403e62c945c`.

That same Workspace's strict scenes-only revision validated, then candidate creation failed with `ENOENT` for the absent
`.narration-work/action-first-step`. Authored timing intentionally never creates that root, but the revision snapshot/store
and promotion assumed every owned root existed; artificial empty directories in earlier test fixtures hid the error.
All78 current-owned file entries/checksums remained identical after failure. No candidate production was dispatched;
no dummy directory, installed-package patch, attempt retry or manual lock/artifact edit was used.

The corrected revision snapshot/record is contractVersion2: present roots contain exact file entries; authored narration
absence has its own fingerprint and no invented empty directory. Candidate inspection, promotion, idempotence and
rollback preserve actual presence. Required source/public/delivery roots and unsafe/symlink/path-escape chains remain
rejected, and preexisting v1 candidates fail closed. Removing fake narration directories first exposed13 failures in58
focused tests; the completed correction passed60/60. ProductionRevision/Task/Delivery identities do not include candidate
routing or presence diagnostics. Final corrected-package production and scoped revision results are recorded below.

## Corrected packed Workspace production

`workspace-reviewed` received only the strict original authoring input, with no old Project source, media or artifacts.
The original vector map/light-point concept uses authored-frames, four120-frame body Beats sharing owner `lost-routes`,
and default2-second intro/8-second outro. Create froze1280×720/30fps/zh-CN/stereo, with1100×540 SceneViewport.
The body contains no narration or captions; default bookend audio is intentionally present.

Before each production, three fresh native children completed challenge-file roundtrips and were closed/released;
the probe directories were cleaned. The fresh resolver retained builtin requested `subagents`/4 but limited effective
capacity to3 because Root occupies the fourth host slot. No inline fallback or preference change. This certifies actual
native child execution at capacity3; it does not satisfy the unchanged independent first-use/exact-four release gate.

Initial preparation returned attempt `9055a768-c697-4f24-846b-70549f430b83`, three dirty Agent tasks (Scene/GlobalVisual/Cover),
three reused fixed tasks (two templates plus semantic timing), two blocked downstream tasks and zero provider calls.
Three separate fresh native executors bound/finalized/checked/committed; Root did not access their workspaces or write outputs.
Frozen preview `preview-8e746b53bd93a7ef1835dfc81bae7b2c2950d949a5ff6bb1116494470aa6d0de` rendered640×360/30fps,
780 frames, stereo, and all36 current-owned file/absence records remained unchanged.

Root viewed a29-frame contact sheet and both formal covers. The map/subject persists through choice, forward movement
and next-node reveal; the new credits message and empty-reference notice are visibly contained. Browser technical muted
playback reached EOF with780 frame callbacks from0 to25.966667 seconds and no media errors. This is sampled visual
review plus complete technical playback, not continuous subjective viewing or listening.

The exact returned initial continuation was run once and exited0 with `project-production-complete`:

- Revision: `revision-21c4733c1268d8170890076d74d67dee0053f5052d07358491ccce68726c36a0`.
- Delivery: `delivery-47335434ec52141b693c1ac0059508671698f9302e51e9abbc807e513a86016d`.
- Current directory has exactly video, two covers and publish.json; all seven final checks passed.

The strict full `patch.scenes` changes only `reachable-next.compositionIntent`: local360–479-frame headline56→72px,
at least40px map/node clearance, preserving the first three phases and all other behavior. Installed public input schema,
revision validate and candidate create passed; all78 current-owned records remained unchanged and narration stayed absent.
Candidate `revision-candidate-59da20b999e7b136c53f159ed9492bf222e4f09da0d091537fed3d44d4c422f7` has fresh probe/resolver/inspect.
Preparation returned exactly one dirty owning Scene, five reused artifacts (Cover/GlobalVisual/templates/timing),
zero dirty fixed tasks, two downstream blocked tasks and zero provider calls. Its fresh Scene executor uses only bound priorSource.

The revision executor initially received `readability-font-size` for a conditional inline font value that static validation
could not prove. It corrected its own output to two branches with literal56/72px before terminal commit; the validator,
binding and attempt were unchanged. Finalize/check/commit passed. Root's post-promotion source diff confirms that this
header branch is the only Renderer change, with the same position and all map/camera/motion code preserved.

Candidate preview `preview-e6e91170a1451c080a849f86c9eac601c0a7c194be1436f5385c1beb8912244b` kept all78 current-owned
records unchanged. Root viewed four before/after phase samples and the full-resolution delivered frames419/479: final
headline is visibly larger and separate from the map; earlier phase layouts remain consistent. Candidate technical muted
playback also decoded all780 frames with no errors. Lossy decoded prefix hashes match for frames0–387, while388–419
differ; therefore no claim of byte-identical decoded pixels for the entire unchanged prefix is made. Source preservation
and artifact/file reuse are separate from re-encoded video pixels.

The candidate's exact returned continuation ran once and exited0 with `project-revision-complete` and automatic
`project-revision-promoted`:

- Revision: `revision-f74fee2e5e5d1f076a5c172a4481a34ef1cad318731b451056eb36def3d87cb3`.
- Delivery: `delivery-2384e0a680a52b8684fa9069d76350d148e4590ca8e3a1bc3092cc8e49793865`.
- Current video: H.264/AAC/stereo,1280×720/30fps/780 frames, size2247548 bytes,
  checksum `sha256:1bd897ffa2190268224c569130c2fa11820d1b0a2a333046b09566f0dbeb5a08`.
- All seven current-production final checks passed. Repeating exact manual promote returned `project-revision-current`;
  all79 promoted current-owned records were unchanged, including narration absence.
- Story/render/VisualStyle/GlobalVisual/timing/publishing intent, both bookends, Project media and both final covers
  retain their original checksums. All non-header Renderer code and its motion/sound plans are unchanged.
- Complete decoded S16LE audio is identical before/after:4993024 bytes,
  checksum `sha256:1d059306d8a9fd82a7590c49f97822d8cbe9afc3e293b17d9ed492cc45b3de0a`.

Installed `project:scene:review -- --project action-first-step --motion` exited0, producing25 extracted frames, nine
clips (three owners, two owner boundaries, four actions), six semantic Beat review rows and strict revision targets.
Root loaded the actual review page and eighteen displayed full-resolution samples, viewed frames419/479, and completed
muted technical playback of all nine clips without media errors. Motion approval/listening remain `not-assessed`;
source-plan intent does not become an aesthetic or explanatory-quality certificate.
The first clip playback collector hit Ego's15-second `page.evaluate` limit on the16-second body; its original exit1 is
preserved. A corrected collector starts playback synchronously and waits with explicit `waitForFunction`, then verifies
all nine ended results. It reused TaskSpace17 and made no Project, delivery or installed-package changes.

Final documentation validation includes all196 active tracked and nonignored untracked Markdown files:355 local links
passed,80 external links were skipped by this link checker, and264 npm script references across143 operational files
passed. Scoped Prettier and `git diff --check` exited0. Code/runtime changes were frozen before the final1270-test check;
subsequent edits only record verified results and align repository documentation.

Receipts outside Git include `reviewed-initial-orchestration.json`, `reviewed-initial-and-revision-commands.json`,
`reviewed-current-preservation.json`, `reviewed-revision-preservation.json`, `reviewed-preview-prefix-comparison.json`,
`reviewed-scene-motion-playback.json` and `reviewed-final-commands.json`. Original shell/session results and native children
remain in this engineering conversation. Source full checks, corrected packages and isolated delivery are verified;
registry publication, independent ordinary-prompt first use, exact-four concurrency, continuous subjective review,
listening and physical mobile viewing remain outside this completed engineering acceptance.
