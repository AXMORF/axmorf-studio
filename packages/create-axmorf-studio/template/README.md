# AXMORF Studio Workspace

This is a private, user-owned video workspace created by `create-axmorf-studio`. Its Projects, media, private configuration, production
artifacts, renders, revision candidates, and Deliveries stay in this directory and are ignored by Git by default.

## Ask your Agent for a video

Open this workspace in an Agent that supports native subagents, file access, and npm commands, and describe the video you want. For example:

```text
请制作一条约75–90秒的中文竖屏视频，解释【主题】。
先选能说明这个概念的视觉机制，再安排对象怎样随讲解改变、观众怎样看懂因果和结果。景别、技术和素材由主题决定；保持克制的色彩、清晰的焦点、留白和足够的阅读时间。
要有旁白、字幕和动态图形，最后给我视频和封面。
```

The workspace's `AGENTS.md` and local Skill supply the production instructions. You do not need to include internal commands
in your request. Give any strict duration limit or required opening/closing choices in the brief. Git initialization is optional.

Video production defaults to subagents with a maximum of four concurrent workers, limited by the host's verified capacity.
The Agent verifies native child access using the local Skill before production. A host with no native child capability stops with
a blocker; you can explicitly choose inline in the Web execution settings or in your request. Saved settings override the default;
this request's explicit choices take precedence. Host transport evidence is verified each production and is never saved.

## Start here

```bash
npm run doctor
npm run dev
```

`npm run dev` starts the loopback-only Web control center and Remotion Studio. The Web interface owns configuration, diagnostics,
production progress, and verified current Delivery views; Remotion Studio owns live Composition preview. Neither is the creative or
completion authority.

For an explicitly requested video without narration, the create context provides a `visualFirst` example with authored
Scene durations. Convey the meaning through visible state changes and short copy. Narrated and visual content currently
use separate Projects; removing audio from an existing narrated Project does not switch its mode.
The local Skill routes optional shared SVG subjects and bound Scene previews. These support creation and targeted revision;
mechanical validation does not establish visual quality, and a complete video still needs continuous review and listening.

`npm run bootstrap` maintains package-owned shared media under `public/assets/axmorf-shared/` and registers it in the Resource
Catalog. New Projects inherit the configured opening/closing templates unless the create input explicitly overrides them; the
template audio actually used is copied into that Project, so an existing Project never depends on a later package update.
New Project global music loops continuously across content, preserving template music and all effects. Legacy scopes remain
unchanged; a strict sound revision may narrow composition playback to content-window without replacing media or narration.

Creator installation prepares the pinned browser and runs a real tiny render before claiming readiness. If browser preparation was
explicitly skipped or the browser was removed, run `npm run browser:prepare`, then `npm run doctor`. Preparation has a bounded
timeout and a single download lock; diagnostics never silently download another browser.
If direct download stalls, set `AXMORF_BROWSER_EXECUTABLE` to the absolute path of an existing compatible Chrome/Chromium
executable before creation, `doctor`, and production. The real browser render check still applies; keep the variable set while rendering.

## Useful commands

| Goal                                           | Command                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Get a complete new Project input example       | `npm run project:create:context -- --project <story-id>`                                   |
| Query available styles                         | `npm run catalog:query -- --kind style-profile`                                            |
| Prepare the pinned browser                     | `npm run browser:prepare`                                                                  |
| Inspect an interrupted continuation            | `npm run project:attempt:interrupt-inspect -- --project <story-id> --attempt <attempt-id>` |
| Check host readiness                           | `npm run doctor`                                                                           |
| Open Web and preview together                  | `npm run dev`                                                                              |
| Open only the Web control center               | `npm run web`                                                                              |
| Open only Remotion Studio                      | `npm run preview`                                                                          |
| Inspect a production without provider calls    | `npm run project:produce:inspect -- --project <story-id>`                                  |
| Review opening, middle, and final Scene frames | `npm run project:scene:review -- --project <story-id>`                                     |
| Render a frozen draft from valid artifacts     | `npm run project:preview -- --project <story-id> [--candidate <candidate-id>]`             |
| Review local reference cuts, motion and frames | `npm run reference:analyze -- --input public/<reference.mp4> [--threshold 0.3]`            |
| Review complete Scenes and boundary motion     | `npm run project:scene:review -- --project <story-id> --motion`                            |
| Verify the current delivered Project           | `npm run project:check -- --project <story-id> --level final`                              |

For Project creation, revisions, production, recovery, and deletion, use the order in `AGENTS.md` and the Workspace-local
`axmorf-video` Skill. Prefer commands returned by structured CLI output over manually reconstructed internal parameters.

For a new video, explicit orientation, dimensions, frame rate and locale requests take precedence over saved defaults.
Unspecified fields inherit settings; a one-video override does not change your saved defaults.

Plan the complete film in `story.filmPlan`, then group continuous content with `story.visualScenes`. Beat semantics, timing
and chapters stay independent; one group has one renderer and uninterrupted sceneFrame. Explicit `authored-frames` uses
silent scene-owner preset durations without TTS or captions. Frozen draft previews require verified fixed/owner artifacts,
preserve layout/fps/timing/audio and reduce output pixels. They do not modify current source or Delivery or certify creative
quality. For a review before final rendering, finish the workers and preview before starting the original continuation once.
Authored-frame chapters may be empty or fully cover the content Beats in order. Both narrated and silent scene-owner
boundaries can carry a frozen continuity handoff; fixed templates remain separate.
Reference analysis refines bounded candidate intervals, estimates image translation/scale and saves timestamped color frames
with a local review page. Camera/semantic interpretations and viewing/listening observations remain explicit Agent review,
separate from integrity checks. Formal and draft exports mix PCM losslessly and encode AAC once into MP4.

## Completion means four verified files

```text
deliveries/<storyId>/video.mp4
deliveries/<storyId>/cover-4x3.png
deliveries/<storyId>/cover-3x4.png
deliveries/<storyId>/publish.json
```

Only `project-production-complete` or `project-production-current` after mechanical validation means the current Delivery is complete.
A chat response, Agent self-assessment, running process, or unverified file is not completion evidence.
After production, a separate read-only `project:check --level final` verifies the current Revision, artifacts and four-file
Delivery. It returns structured failure reasons and never writes legacy baseline proof reports.

## What to commit

Commit `package.json`, `package-lock.json`, this README, and any instruction customizations you intentionally want to share. Keep
Project source, media, private config, provider credentials, voice profiles, production work, artifacts, attempts, output, Deliveries,
and revision candidates local unless you deliberately establish a different policy.
User-local music is separate from package-owned shared media. Select approved original loop audio rather than a processed
preview. Keep music, Library identifiers and maintenance reports private. Retiring a preview never silently migrates existing
Project media or sealed audio; inspect dependencies first and preserve recoverability when removal is authorized.

新 Project 的 `visualStyle.theme` 可选 dark、light 或 background/primaryText/secondaryText/accent 四角色不透明六位 hex；默认 dark。系统在创建/修订前验证配色，Composition 的实际底色与正文、固定首尾共用主题。旧 Project 的 immutable 首尾不自动迁移。
