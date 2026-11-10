# AXMORF Studio Workspace

This is a private, user-owned video workspace created by `create-axmorf-studio`. Its films, media, private configuration,
renders and deliveries stay in this directory and are ignored by Git by default.

## Ask your Agent for a video

Open this workspace in an Agent that has file access and can run npm commands, and describe the video you want. For example:

```text
请制作一条约60秒的中文竖屏视频，解释【主题】。
先想清楚观众要记住什么和每一段的代表画面，主体要大、画面铺满、镜头随讲解变化；配乐跟着叙事起伏，关键画面踩在重音上。
要有旁白和字幕；先定节奏谱与配乐，再按小节分镜、写画面和音效，用带声音的 animatic 看节奏，最后看审片联系表修改一轮，给我视频和封面。
```

The workspace's `AGENTS.md` and the local `axmorf-film` Skill supply the method. In Claude Code the Skill is also
discoverable as `/axmorf-film`. You do not need to include internal commands
in your request. Give any strict duration limit or orientation in the brief.

The Agent writes each film as ordinary Remotion code in `src/films/<film-id>/`, generates narration and an original score,
then follows `references/direction.md` to write `src/films/<film-id>/storyboard.md` one bar at a time: L2 composition changes,
L3 accents, sentence ids and sound cues, plus chapter worlds and camera paths. It uses rhythm hooks, `FilmSceneTrack` and
the motion recipes for visuals, then derives sound effects from those actions and plays them with `FilmSoundEffects`.
It produces a sound-enabled animatic for pacing review before refining rendered frames and delivering. Long films may be split across subagents when your Agent supports
them; that is optional.

New films use `studio-v3`, with the optional `voiceover` static EQ profile for speech. Follow the local director guide for
semantic hit alignment, paper-collage recipes, generated subject cutouts and advisory graphics/rhythm review.
Only sentence timing is measured; mid-sentence keyword frames need human or external confirmation.
Use `narration[].caption` for screen copy, `FilmCaptions variant="paper"` for paper strips, and optional
`highlight="karaoke"` for continuous clause-based highlighting. `film:captions` estimates clauses offline without TTS;
it does not recognize word boundaries. Caption edits do not invalidate existing voice or timing fingerprints.

Sentence caches in `.axmorf/cache/voice/` use provider/model/material content or voiceId/parameters/rate/text, not Workspace
paths or connection settings. Transfer new-key caches with matching audio inputs to reuse unchanged sentences.
Old keys are not automatically converted. To preserve a complete take, copy matching film.json, timing.json and narration.wav,
keep the filmId and relative paths, then run `film:check` without rerunning voice.

## Start here

```bash
npm run doctor
npm run dev
```

`npm run dev` starts the loopback-only Web control center and Remotion Studio. On the production host, do not launch GUI
players (ffplay/VLC/mpv/etc.) or use xdg-open, gio open or browser autoplay to bypass this restriction. Only render,
extract frames and measure audio with software decoding (`ffmpeg -hwaccel none`); watch and listen on a phone or Mac.
If execution is denied, do not elevate permissions or replace players. Record unverified viewing/listening honestly.

Creator installation prepares the pinned browser and runs a real tiny render before claiming readiness. If browser preparation
was skipped or the browser was removed, run `npm run browser:prepare`, then `npm run doctor`. If direct download stalls, set
`AXMORF_BROWSER_EXECUTABLE` to the absolute path of an existing compatible Chrome/Chromium executable before `doctor` and
rendering, and keep it set while rendering.

## Useful commands

| Goal                                       | Command                                                     |
| ------------------------------------------ | ----------------------------------------------------------- |
| Check host readiness                       | `npm run doctor`                                            |
| Start a film                               | `npm run film:new -- --film <film-id> --title "<title>"`    |
| Estimate clause timing for karaoke captions | `npm run film:captions -- --film <film-id>`                |
| Generate narration and its timing          | `npm run film:voice -- --film <film-id>`                    |
| Generate the score and its beat grid       | `npm run film:music -- --film <film-id>`                    |
| Generate original per-film sound effects   | `npm run film:sfx -- --film <film-id>`                      |
| Register a generated image or original SVG | `npm run film:asset -- --film <film-id> --file <path> ...`  |
| Render review frames and a contact sheet   | `npm run film:review -- --film <film-id>`                   |
| Preview pacing with sound                  | `npm run film:review -- --film <film-id> --animatic`        |
| Check a film before delivery               | `npm run film:check -- --film <film-id>`                    |
| Render and verify the four delivery files  | `npm run film:deliver -- --film <film-id>`                  |
| List films and their deliveries            | `npm run film:list`                                         |
| Open Web and Remotion Studio               | `npm run dev`                                               |
| Upgrade Skill, guides and runtime together | `npm run workspace:upgrade` (add `-- --dry-run` to preview) |

`film:review` outputs `motion` / `motionWarnings` alongside its contact sheet and other review hints. The Agent checks
these against `storyboard.md`, revises the film and updates the plan. They are advisory, not delivery gates.
The optional `review/animatic.mp4` is a preview, not a fifth delivery file; the Skill requires watching it before completion.
`film:deliver` reminds you when the animatic is missing or older than the source, without blocking delivery.

## Registry when creating or upgrading

Using npmmirror with `prefer-offline` can make installation fail with `three@undefined` (`ERESOLVE`).
For creation or upgrade, use `npm_config_registry=https://registry.npmjs.org/ npm_config_prefer_online=true`:

```bash
npm_config_registry=https://registry.npmjs.org/ npm_config_prefer_online=true npm run workspace:upgrade
```

Keep exact dependency versions; do not bypass checks with `--force` or `--legacy-peer-deps`.

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
