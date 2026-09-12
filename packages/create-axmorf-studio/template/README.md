# AXMORF Studio Workspace

This is a private, user-owned video workspace created by `create-axmorf-studio`. Its Projects, media, private configuration, production
artifacts, renders, revision candidates, and Deliveries stay in this directory and are ignored by Git by default.

## Ask your Agent for a video

Open this workspace in an Agent that supports native subagents, file access, and npm commands, and describe the video you want. For example:

```text
请制作一条约30秒的中文竖屏视频，介绍如何从一个小步骤开始行动。
要有旁白、字幕和动态图形，文案和画面你来设计，最后给我视频和封面。
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

`npm run bootstrap` maintains package-owned shared media under `public/assets/axmorf-shared/` and registers it in the Resource
Catalog. New Projects inherit the configured opening/closing templates unless the create input explicitly overrides them; the
template audio actually used is copied into that Project, so an existing Project never depends on a later package update.

Creator installation prepares the pinned browser and runs a real tiny render before claiming readiness. If browser preparation was
explicitly skipped or the browser was removed, run `npm run browser:prepare`, then `npm run doctor`. Preparation has a bounded
timeout and a single download lock; diagnostics never silently download another browser.

## Useful commands

| Goal                                        | Command                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Get a complete new Project input example    | `npm run project:create:context -- --project <story-id>`                                   |
| Query available styles                      | `npm run catalog:query -- --kind style-profile`                                            |
| Prepare the pinned browser                  | `npm run browser:prepare`                                                                  |
| Inspect an interrupted continuation         | `npm run project:attempt:interrupt-inspect -- --project <story-id> --attempt <attempt-id>` |
| Check host readiness                        | `npm run doctor`                                                                           |
| Open Web and preview together               | `npm run dev`                                                                              |
| Open only the Web control center            | `npm run web`                                                                              |
| Open only Remotion Studio                   | `npm run preview`                                                                          |
| Inspect a production without provider calls | `npm run project:produce:inspect -- --project <story-id>`                                  |
| Verify the current delivered Project        | `npm run project:check -- --project <story-id> --level final`                              |

For Project creation, revisions, production, recovery, and deletion, use the order in `AGENTS.md` and the Workspace-local
`axmorf-video` Skill. Prefer commands returned by structured CLI output over manually reconstructed internal parameters.

For a new video, explicit orientation, dimensions, frame rate and locale requests take precedence over saved defaults.
Unspecified fields inherit settings; a one-video override does not change your saved defaults.

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

新 Project 的 `visualStyle.theme` 可选 dark、light 或 background/primaryText/secondaryText/accent 四角色不透明六位 hex；默认 dark。系统在创建/修订前验证配色，Composition 的实际底色与正文、固定首尾共用主题。旧 Project 的 immutable 首尾不自动迁移。
