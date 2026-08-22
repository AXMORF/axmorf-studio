---
name: remotion-story-producer-video
description: Discover and diagnose the local AXMORF Studio Phase A repository adapter.
---

# AXMORF Studio Phase A

This managed Skill is a discovery and doctor surface only.

1. Work from the Workspace root containing `.rsp/workspace.json`.
2. Run `./.rsp/bin/rsp doctor`.
3. Parse the JSON response and report its repository mode, Preview Catalog readiness/count, TCP-listener state,
   and capability booleans exactly.

Phase A uses `adapterMode: "repository"`, `repositoryMode: "build-time-checkout"`,
`runtimePackMode: "host-node-prototype"`, and `desktopTcpListeners: false`. Production, delivery, distribution,
and a complete Runtime Pack are unavailable. Do not call `prepare`, `task`, `commit`, `continue`, or delivery
commands, and do not fall back to source-repository npm scripts.

The launcher and its client are App-managed and checksum-bound. Do not modify managed files, session records,
tokens, or sockets. A missing App session is a normal `rsp-app-unavailable` result, not permission to start a
background engine.
