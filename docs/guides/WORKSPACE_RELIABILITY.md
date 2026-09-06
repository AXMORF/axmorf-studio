# Workspace reliability

Creator prepares the Workspace-local pinned browser under an exclusive bounded preparation lock before doctor. Doctor
and production preparation require a real tiny PNG render; read-only browser diagnostics never initiate downloads.
When HTTP(S) proxy variables are configured, browser preparation enables the supported Node.js native proxy mode for
its download child, preserving explicit `NODE_USE_ENV_PROXY=0` or `NODE_OPTIONS=--no-use-env-proxy`. A Node runtime without this capability reports the
required host upgrade before download. The launcher never prints proxy values or puts them in authoring. See
[Node.js native proxy support](https://nodejs.org/api/cli.html#--use-env-proxy).
`project:create:context` supplies a complete validated input example and current public choices without exposing TTS
connections. `project:create -- --schema` describes shape; semantic validation remains authoritative.

Media commands have bounded process deadlines, process-group cleanup and continuation-scoped durable diagnostic logs.
The remaining one-hour attempt deadline bounds all media commands during convergence. Video/cover verification resolves
its runtime and subprocess cwd from the explicit Workspace root, including candidate delivery inspection and promotion. Logs and process ownership are
diagnostic-only and do not affect Revision/Task/artifact/delivery identity; read-only inspection does not create them.
Cleanup failures retain the child exit status and captured output and settle the controlling Promise instead of throwing
from an event callback. An EPERM result is accepted only when a read-only liveness check proves the owned group exited;
after child close on macOS, one bounded process snapshot may prove the group is absent or contains only zombies.
Live or unknown groups remain failures. This does not retry production or relax the Chromium sandbox.

The public Workspace `npm run project:check -- --project <storyId> --level final` is a read-only check of the current
ProductionRevision, verified artifacts and exact four-file Delivery. It reports structured failure reasons for missing,
stale, changed or corrupt state. It does not require or write legacy narrative-baseline proof artifacts. The repository's
explicit development proof scripts retain their separate baseline checks.

For an interrupted continuation with no terminal event, explicit `project:attempt:interrupt-inspect` proves same-host
owner/process-group death, all task terminals and exact lock ownership before `project:attempt:interrupt` appends a
failed delivery event and archives the abandoned lock. The old claim remains one-shot. Recover-inspect/reissue then
creates a fresh attempt and reuses validated artifacts. Active, pending, foreign or legacy ownership fails closed.
Hosts must keep the exact continuation process alive across tool yields and wait only on its original handle for the
fixed result. A background acknowledgement is not delivery; no additional production/status commands or retries follow launch.


## First-use authoring and duration feedback

The public create context provides a complete nonempty `additionalRequirements` example separately from the default empty array.
Schema failures return structured JSON paths, issue codes and a valid object example for this field; strict validation is unchanged.
The generated README uses a business-only video prompt. Workflow instructions belong in the bundled AGENTS/Skill and public CLI.

`durationBudget` is a diagnostic projection in create context, inspect, prepare and fixed completion. It separates the requested total
from silent boundary Scenes and render lead/tail, leaving a narration-and-pause budget. Context values describe its example and
must be recalculated for the actual brief. Before sealing, measured duration is unknown; after verified sealing, actual total and
signed deviation follow semantic timing. There is no implicit tolerance, speech truncation, automatic retry or content identity change.
A requested authoring change still uses an isolated revision. See the bundled authoring reference for the Agent's planning steps.

Creator writes stage start/waiting/complete/failure and elapsed time to stderr while preserving npm output and final JSON stdout.
Progress indicates a running stage, not estimated percent completion. npm log locations remain available if staging is removed.

Release evidence follows the [first-use release gate](FIRST_USE_RELEASE_GATE.md): fresh candidates, business-only prompts,
original transcripts, unchanged installed files and verified deliveries before publication; public npm runs follow publication.
