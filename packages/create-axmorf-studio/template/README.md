# AXMORF Studio Workspace

This is a private, user-owned video workspace created by `create-axmorf-studio`. Its films, media, private configuration,
renders and deliveries stay in this directory and are ignored by Git by default.

## Ask your Agent for a video

Open this workspace in an Agent that has file access and can run npm commands, and describe the video you want. For example:

```text
请制作一条约60秒的中文竖屏视频，解释【主题】。
先想清楚观众要记住什么和每一段的代表画面，主体要大、画面铺满、镜头随讲解变化；配乐跟着叙事起伏，关键画面踩在重音上。
要有旁白和字幕，做完先看审片联系表修改一轮，最后给我视频和封面。
```

The workspace's `AGENTS.md` and the local `axmorf-film` Skill supply the method. In Claude Code the Skill is also
discoverable as `/axmorf-film`. You do not need to include internal commands
in your request. Give any strict duration limit or orientation in the brief.

The Agent writes each film as ordinary Remotion code in `src/films/<film-id>/`, generates narration and an original score,
reviews rendered frames and revises before delivering. Long films may be split across subagents when your Agent supports
them; that is optional.

## Start here

```bash
npm run doctor
npm run dev
```

`npm run dev` starts the loopback-only Web control center and Remotion Studio. Open Remotion Studio to watch a film while
the Agent works on it.

Creator installation prepares the pinned browser and runs a real tiny render before claiming readiness. If browser preparation
was skipped or the browser was removed, run `npm run browser:prepare`, then `npm run doctor`. If direct download stalls, set
`AXMORF_BROWSER_EXECUTABLE` to the absolute path of an existing compatible Chrome/Chromium executable before `doctor` and
rendering, and keep it set while rendering.

## Useful commands

| Goal                                       | Command                                                     |
| ------------------------------------------ | ----------------------------------------------------------- |
| Check host readiness                       | `npm run doctor`                                            |
| Start a film                               | `npm run film:new -- --film <film-id> --title "<title>"`    |
| Generate narration and its timing          | `npm run film:voice -- --film <film-id>`                    |
| Generate the score and its beat grid       | `npm run film:music -- --film <film-id>`                    |
| Register a generated image or original SVG | `npm run film:asset -- --film <film-id> --file <path> ...`  |
| Render review frames and a contact sheet   | `npm run film:review -- --film <film-id>`                   |
| Check a film before delivery               | `npm run film:check -- --film <film-id>`                    |
| Render and verify the four delivery files  | `npm run film:deliver -- --film <film-id>`                  |
| List films and their deliveries            | `npm run film:list`                                         |
| Open Web and Remotion Studio               | `npm run dev`                                               |
| Upgrade Skill, guides and runtime together | `npm run workspace:upgrade` (add `-- --dry-run` to preview) |

## Completion means four verified files

```text
deliveries/<film-id>/video.mp4
deliveries/<film-id>/cover-4x3.png
deliveries/<film-id>/cover-3x4.png
deliveries/<film-id>/publish.json
```

`film:deliver` renders into a private staging directory, verifies H.264/AAC, size, fps, frame count, PNG covers and full
decoding, and only then replaces the current delivery. The previous delivery moves to `.axmorf/history/<film-id>/`.
A chat response, Agent self-assessment or unverified file is not completion evidence.

## Projects made before 0.2.0

0.3.0 removed the earlier Project production chain. If an upgrade lists `legacyProjectData` (for example `src/projects/`
or `.producer-work/`), nothing uses those directories any more; remove them yourself once you no longer need them.

## What to commit

Commit `package.json`, `package-lock.json`, this README, and any instruction customizations you intentionally want to share.
Keep film source, media, private config, provider credentials, voice profiles, caches, output and deliveries local unless
you deliberately establish a different policy.
