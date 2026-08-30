# create-axmorf-studio

Create a standalone, agent-ready AXMORF Studio video workspace:

```bash
npm create axmorf-studio@latest my-video
cd my-video
npm run dev
```

The initializer creates a private user workspace, writes exact npm dependencies,
installs them, generates a lockfile, and runs the package-provided `bootstrap`
and `doctor` checks before atomically publishing the target directory.

It also includes host-neutral `AGENTS.md` instructions and the `axmorf-video`
Skill. Any Agent that can read and write files and run npm commands can use those
contracts; no Codex-specific runtime is required.

## Options

```text
--yes                         accept non-interactive defaults
--no-install                  generate files without installing dependencies
--runtime-package <version>   use an exact @axmorf/studio version or local tarball
```

`--no-install` produces a generated but not ready workspace. The default flow is
the supported out-of-the-box path.

## License

The initializer source and included AXMORF Studio template files are licensed
under Apache-2.0. A generated workspace is private and `UNLICENSED` by default so
the creator does not choose a license for the user's videos or project source.
Users may replace that field with a license appropriate for their own work.

Third-party packages installed into generated workspaces retain their own
licenses. See `THIRD_PARTY_NOTICES.md`.
