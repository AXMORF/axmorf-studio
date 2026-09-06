# Workspace reliability incident and containment

## Observed incident

A published `@axmorf/studio@0.1.3` Workspace passed doctor, then an Agent produced and committed four Scene tasks, a
GlobalVisual task and a Cover task. Fixed continuation materialized the composition and created empty delivery staging.
The host terminal wrapper returned its 420-second timeout despite a larger command timeout; no exact four-file delivery
was verified. An abandoned continuation claim and operation lock remained without a terminal failed event, so existing
recover-inspect correctly rejected reissue. Separate settings preflight processes simultaneously wrote the same incomplete
Chrome archive. This is evidence of incomplete browser preparation and overlapping downloads, not proof of a network root cause.

A later cold packed-creator test on the current Mac reproduced a slow direct download while configured HTTP(S) proxy
access succeeded immediately. The pinned Remotion downloader uses Node `https.get`; this host had not enabled native
Node proxy handling. This establishes a separate cold-install issue; it does not establish the exact original session
network failure. Browser preparation now honors the already-configured proxy through supported native Node flags.

## Containment

The incident Project, private configuration and outputs were not modified for the code fix. No old attempt was retried, no
attestation/claim was edited, and no browser sandbox or validator threshold was lowered. Fresh npm acceptance uses new
Projects in a newly scaffolded Workspace after preserving the old directory.

## Corrections and regression boundaries

- Creator explicitly prepares one pinned browser; doctor actually renders a tiny PNG and read-only probes cannot download.
- Bounded media execution cleans up owned process groups and records scoped diagnostic output. Remaining attempt deadline
  constrains sequential media commands. Read-only inspection creates no process metadata.
- Explicit interruption inspection verifies dead same-host owner and owned child groups, all task terminals and exact lock
  ownership. Interruption appends a failed delivery event; old claim and inputs remain immutable. Fresh reissue reuses artifacts.
- Legacy, pending, foreign, live and unverifiable ownership remain blockers. A recovery guard interrupted inside its own
  transaction is not automatically discarded.
- Authoring context/example/schema avoid guessing inputs; readability diagnostics identify source location and CSS precedence.
- Creator and package-boundary regressions join the normal repository gate. A stale scaffold assertion was corrected to
  require the already-shipped Scene template audio projection rather than the obsolete one-argument Remotion root.

The pre-proxy cold candidate test terminated at its 300,000 ms deadline with 9.5 MB downloaded, retained its bounded
failure output, and removed both target and staging. After the native proxy correction, a new cold packed Workspace
completed download, browser-render verification and doctor without package-internal edits. The full repository gate
passed 749 tests before the final proxy and explicit-Workspace-root regressions; final counts and public npm acceptance
are recorded in the release receipt after completion.

The final review also found video/cover verification resolving Remotion through the launch directory. Explicit Workspace
runtime roots now reach those media commands, including isolated candidate delivery checks. A real subprocess regression
launches from another directory and verifies the resulting diagnostic ownership group has exited.
