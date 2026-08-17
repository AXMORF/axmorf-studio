# Project build

`npm run project:build -- --project <storyId>` is the default delivery path for an existing Project.

- `cli.ts` owns exact command parsing only.
- `application/prepare.ts` mechanically refreshes current ScenePackage/coverage/registry/Composition and
  compiles the target import graph without reading a ProductionRun.
- `adapters/source-snapshot.ts` binds Project source, Project-owned media and shared render runtime while
  excluding assignment/receipt/render-plan/result process records.
- `application/build.ts` resumes buildId-owned staging, synchronously renders video and Covers, writes
  `publish.json` last, verifies the exact four-file set, and promotes staged current delivery.
- `adapters/media.ts` requires H.264/AAC metadata, configured channels/dimensions/fps/frame count and full
  FFmpeg EOF decode; Covers retain fixed PNG dimensions and EOF decode.

The command never creates or replays owner assignments, invokes audited finalize, regenerates narration, or reads
old Run/delivery contracts. Failed builds keep the previous current delivery and may reuse already verified
artifacts from `deliveries/.staging/project-build/<storyId>/<buildId>/`.
