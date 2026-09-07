# First-use release gate

A stable npm release requires actual Codex and Hermes runs against the candidate
creator and runtime tarballs. These runs use fresh workspaces and fresh host
profiles, with one ordinary business prompt per host. They do not inherit the
repository, earlier sessions, memory, global project skills, or engineering hints.
Only the npm-generated workspace guides provide project instructions. Do not
send follow-up repair instructions or change package internals during the run.
A failed run stays recorded as failed; a later engineering fix requires new
candidates and a new first-use run.

From 0.1.9 onward, both hosts must exercise the package's default native
`subagents` path with configured maximum concurrency four. The business prompt
does not name this execution strategy. Select a normal video brief that produces
more than four dirty creative tasks, so the run exercises releasing a child slot
and admitting another task. An inline run or merely saving subagent settings is
not evidence for this gate. Explicit inline behavior retains automated regression
coverage; the historical 0.1.8 inline receipts remain readable.

This gate supplements the automated install/contract tests. It does not claim
multi-model, multi-OS, interactive approval, revision, or recovery certification.
Record those separately when exercised. A maintainer reviews the prompt and
isolation setup: a transcript hash is evidence binding, not proof that a host or
maintainer is trustworthy.

The acceptance controller must preserve required host capabilities. In particular, verify `/bin/ps` can run through the
actual macOS host command surface before production; a passing browser check alone may not exercise the cleanup fallback.
Do not add `sandbox-exec` as a supposedly file-only isolation wrapper: it can prevent `/bin/ps` from starting even under
`(allow default)`. This restriction belongs to the test setup and is separate from the Chromium sandbox.
Fresh profiles and workspace context without OS file isolation must be labeled as such; review initial host context and
all native tool traces for source/history access. If hard filesystem separation is required, use a separately provisioned
account or machine without the development checkout. Do not weaken product cleanup or relabel a diagnostic rerun as acceptance.

## Prepare candidates and capture the empty workspace

After the final package build and focused/full checks, pack both packages with
`npm pack --ignore-scripts`. The gate itself invokes npm exec with the exact
creator tarball and its documented `--runtime-package /absolute/runtime.tgz`
option, using a fresh npm cache. This changes only package resolution before
publication. Do not inject that option or release/testing instructions into the
Agent prompt. The requested workspace must not exist; existing workspaces cannot
be signed after the fact.

Before creating a workspace and starting each Agent, save a configuration outside the workspace:

```json
{
  "host": "codex",
  "workspace": "/absolute/fresh-codex-workspace",
  "runtimeTarball": "/absolute/axmorf-studio-0.1.9.tgz",
  "creatorTarball": "/absolute/create-axmorf-studio-0.1.9.tgz",
  "promptFile": "/absolute/codex-prompt.txt"
}
```

Run from the development repository:

```sh
node --import tsx scripts/release/first-use.ts create config.json snapshot.json
```

Creation saves npm output in `snapshot.json.install.log`, then immediately takes
an internal snapshot. There is no standalone snapshot command for pre-created
workspaces. The snapshot rejects Projects, deliveries, tasks, artifacts,
narration caches, revision candidates, Project media, and rendered output. It
checks installed runtime bytes and generated guides against the actual packed
candidates, and binds the exact creator invocation, both tarball checksums, and
installation log. It retains sorted file hashes and the exact business prompt.
It allows only the creator's normal generated registry and doctor process receipts.
Use a distinct snapshot and workspace for Hermes (`"host": "hermes"`).

## Run the actual Agents, then verify locally

The harness records `host`, `workspace`, `startedAt`, `endedAt`, `exitCode`, the
exact `prompt`, and `harnessInterventions` in a run JSON. Capture the start time
only after the snapshot, and retain original logs. Successful first-use runs
must have exit code zero and an empty intervention list. Never store credentials
in an evidence folder or commit raw host profiles.

For Codex, retain the fresh root and every native child's
`CODEX_HOME/sessions/**/rollout-*.jsonl`. For Hermes,
export the root and every native child's SQLite messages in order, preserving
all fields including `role`, `content`, `tool_calls`, `tool_call_id`, `timestamp`,
`display_kind`, and `display_metadata`. Also export each native session row containing
`id`, `model`, `cwd`, `started_at`, `ended_at`, `message_count`, and `tool_call_count`.
For children, preserve `parent_session_id` and `source` as well. Export the root's
raw `async_delegations` rows with `event_json` and `result_json` when asynchronous
completion messages were delivered. Include capability-probe children even though
they do not bind a production task. Do not prefilter failed or incomplete children.
Preserve all user and tool records. The verifier binds this metadata to the selected
run and checks message and actual function-call counts.

After the Agent exits, create a local run-evidence configuration (Hermes additionally requires `sessionFile` pointing to its exported native session JSON):

```json
{
  "storyId": "the-created-story",
  "model": "the-actual-model",
  "sessionId": "the-actual-host-session-id",
  "transcriptFile": "/absolute/native-transcript.jsonl",
  "runFile": "/absolute/run.json",
  "nativeChildren": [{ "transcriptFile": "/absolute/child-rollout.jsonl" }]
}
```

List all child transcripts in `nativeChildren`. Hermes entries additionally
require their native `sessionFile`. For Hermes asynchronous completions, add
`delegationFile` pointing to the exported delegation-row array and
`hermesRuntimeRoot` pointing to the actual installed Hermes runtime. The local
recorder uses that runtime's native notification formatter to reproduce each
completion exactly, binds its checksum, and checks the delegation's parent and
dispatch response. A user message with a similar prefix or appended repair advice
does not qualify for the native-message exemption. These local paths never enter
the published receipt.

```sh
node --import tsx scripts/release/first-use.ts record snapshot.json run-evidence.json host-receipt.json
```

The recorder checks the original prompt against the native transcript and rejects
follow-ups, forked root Codex sessions, mismatched Hermes session metadata, missing real
function calls, or modified package and guide files. It derives execution mode
and capacity from the root's public resolver output, the dirty task set from
prepare, native parentage and lifetimes from host records, and task ownership from
each child's actual bind and commit tool results. Every dirty task requires one
child commit; the Root cannot commit those tasks. The receipt records native child
hashes, peak concurrency, capability-probe count, and later admissions after a
production child completes. Missing children, unknown parentage, a pool exceeding
resolved capacity, or no admission beyond the initial pool fail closed.
Native Codex children may inherit their fresh parent's context: the recorder binds
`source.subagent.thread_spawn.parent_thread_id` and `agent_path` to that parent's
native `spawn_agent` response, rather than confusing this with a reused root session.
It executes the workspace's public final check, independently checks
exactly four delivery files and their checksums, probes the video, and decodes the
video and both covers to EOF. It generates the receipt from these checks; supplying
a `passed` flag cannot replace them. Output files use exclusive creation so an
existing result cannot be silently overwritten.

## Publish once both hosts pass

Combine the two generated JSON objects from the repository root:

```sh
node --input-type=module - <<'JS'
import {readFile, writeFile} from 'node:fs/promises';
const files = ['codex-receipt.json', 'hermes-receipt.json'];
const hosts = await Promise.all(files.map(async file => JSON.parse(await readFile(file, 'utf8'))));
const {version} = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(`docs/evidence/v${version}-first-use.json`,
  JSON.stringify({schemaVersion: 1, hosts}, null, 2) + '\n', {flag: 'wx'});
JS
```

Use the actual receipt paths in `files`. Review and commit the combined receipt
with the release. Retain referenced raw evidence privately; only the compact
receipt, business prompts, and hashes belong in Git.

```sh
node --import tsx scripts/release/first-use.ts verify runtime.tgz creator.tgz docs/evidence/v0.1.9-first-use.json
```

The publish workflow requires the receipt in the exact release tag and verifies
it against the newly built tarballs **before either package is published**.
Missing hosts, failed checks, changed versions, or any changed published file fail
closed. Tar container timestamps, compression, and ownership are not content
identity. Every package file, its path, executable bit, and content remain covered.
Source-map JSON whitespace/key order and path separators normalize; source lists,
mappings, embedded source content, and all executable bytes remain covered.
Absolute source-map build paths are rejected instead of ignored. This lets the
same package content be verified on macOS and Linux without accepting code drift.
The exact registry tarball integrity remains independently checked at publication.

After publication, repeat ordinary `npm create ...@latest` installation and the
same two-host business-prompt test against the public registry. Keep post-release
evidence separate from the candidate receipt. Do not mark the release as fully
verified until these published-package runs finish.
