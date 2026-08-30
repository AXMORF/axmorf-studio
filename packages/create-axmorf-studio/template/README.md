# AXMORF Studio Workspace

This directory is a private, user-owned video workspace created by
`create-axmorf-studio`.

## Agent start

```bash
npm run doctor
```

Give this directory to any file-and-shell-capable Agent. Ask it to read
`AGENTS.md`, run `npm run doctor`, and then follow the Workspace-local
`axmorf-video` Skill for the user's video request. If doctor fails, the Agent may
prepare the declared host prerequisites and rerun it, but must not patch package
internals, `node_modules`, exact dependencies, or validators.

Run `npm run dev` when configuration or live preview is useful. The local Web
interface owns configuration and status views; Remotion Studio owns live
preview; neither is a creative authority.

Project source, media, production work, artifacts, attempts, output, delivery,
and the real `private/producer.config.json` are intentionally local and ignored.
Commit `package.json`, `package-lock.json`, this README, and any instruction
customizations you want to share.
