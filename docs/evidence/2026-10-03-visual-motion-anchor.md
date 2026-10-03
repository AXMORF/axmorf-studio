# Visual ScenePackage motion anchor incident

The genuine no-narration `portfolio-visual-quality` sample completed all four
Agent tasks and their bound checks in the isolated candidate Workspace. Both
Scene previews decoded to EOF. Fixed convergence then exited with
`Motion sync anchor is outside the sealed narration cue windows.` No four-file
delivery was produced. The failed attempt remains immutable.

- Story: `portfolio-visual-quality`
- Revision: `revision-bcdccaa87532daa037ed10e69b30b37f24fd5eae398bcd5dfac919eeafa8054d`
- Attempt: `9b3002a1-818f-4f09-b556-bda66e78136b`
- Fixed diagnostic: `project-production-convergence-failed`
- Original continuation exit: 1
- Provider requests: 0
- Committed Agent tasks: 4; failed Agent tasks: 0

The file-backed ScenePackage generator supplies an empty caption-cue array for
a visual Scene. `validateSceneArtifactBundle` previously forwarded that array
as a narration constraint. The worker check and motion-review path already
distinguished narrated beats from authored visual events. The shared package
builder now makes the same distinction. The motion validator still checks
shot ownership, declared anchors, action bounds and readable holds; narrated
Scenes still require anchors inside their sealed cue windows.

The deterministic regression exercises `buildScenePackage` with re-fingerprinted
fixture inputs. Before the fix, the visual case fails with the production error
while the two rejection/preservation cases pass (2/3). After the fix, all three
pass: visual event with absent captions, rejection of a visual event inside its
reading hold, and preserved narrated cue-window validation. The test does not
copy failed task source or bless an existing artifact.

This is an engineering repair outside the failed production attempt. Validation
and a freshly packed runtime/new Workspace are required before new production;
installed packages, old attempts and existing deliveries are not edited. Task
and delivery identities are not manually transferred. Rendered temporal review
remains necessary and is not implied by passing these checks.
