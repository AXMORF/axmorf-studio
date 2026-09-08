# Host execution and interruption recovery

These are Root-only preparation and recovery duties; assigned workers stay on the task bind/contract route.

Before preparation, discover the current host's actual long-running command capability. A command's own timeout does not override
an outer tool deadline. Arrange a supported terminal session/process handle that remains alive while the fixed continuation runs.
Use a native background command with completion notification when the foreground wrapper cannot wait long enough. Keep the exact
continuation arguments; never use shell `&`, detached retries or another chat as a task executor. Persist terminal output in the
host's normal process log, outside declared task outputs. Do not alter global host settings to make this work.

## Low-token supervision and task recovery

After all inline tasks commit, or all bounded children are admitted, start the exact continuation once per attempt. Root stays
responsible through verified delivery, using native completion notifications or blocking waits on the original process handle.
A normal wait timeout with a live process only renews that wait; it is not an error. Do not poll children/status, tail transcripts,
repeat log reads or reason about unchanged progress. On an error, read only the relevant new diagnostic evidence. Report the fixed
final result once and ignore late duplicate success notices. A background acknowledgement never proves delivery.

Use the longest supported blocking wait that fits the outer host deadline, typically 30–60 seconds or longer when allowed. Native completion should wake it early. Do not repeatedly request 1-second waits, alternate wait tools to inspect unchanged state, or narrate routine renewals. Queue admission likewise uses a long native wait-any that wakes on completion; it does not need short polling intervals.

Root diagnoses worker errors from the exact task/binding, failing command, structured validator issue and the owner's minimal
relevant excerpt. It may guide the original live executor, which alone reads/writes its declared outputs and reruns exact bound
finalize/check/commit before terminal. Do not access another worker's workspace, take over its commit, edit immutable/fixed outputs,
weaken a validator or repair the running continuation. Stop on repeated identical errors without a concrete new correction.

A production request authorizes at most **one automatic task-recovery cycle per user production request**, including candidates;
retries and candidate changes do not reset this allowance. Only a proven Agent-authored output fault qualifies, not a generic exit
code or recovery-ready response alone. Unknown, fixed-system, provider, host, permission and integrity/identity faults stop with
Root diagnosis and a concise report; program source, installed packages, dependencies and validators are outside auto-repair scope.

For an eligible terminal task failure:

1. Wait for the original continuation to exit and establish that **all previous workers have exited** using native completion,
   or native stop followed by confirmed exit. Failed attempt state alone does not prove quiescence. Unknown worker liveness blocks
   recovery; never overlap old and new writers.
2. Run exact read-only, zero-provider `project:attempt:recover-inspect` and report the cause, proposed correction and artifact reuse.
   Only `attempt-recovery-ready` permits `project:attempt:reissue`, which rechecks same-current-Revision/no active or fixed blocker
   under lock. No current Delivery is required; no provider is called. Preserve exact `--candidate` throughout.
3. Use returned fresh attempt/bindings/continuation, valid artifacts and drafts. Dispatch only dirty tasks to fresh native workers
   with the resolved capacity/transport, or bind serially in inline mode. Pass only the owning task's diagnosis and exact new bind;
   do not reuse old bindings or terminal sessions. Start the new continuation once and resume low-token supervision.
4. If recovery fails, stop and report. Do not reissue again, rerun prepare or regenerate narration to bypass this limit. A later
   explicit user recovery request is separate authorization, still subject to all gates. Old failed attempts remain immutable.

## External interruption

If the host reports interruption, stop that production lifecycle. A later explicit recovery request follows this order:

1. If a terminal failed attempt is already known, run the returned `project:attempt:recover-inspect`, then `reissue` only if ready.
2. If the continuation disappeared without a terminal result, run
   `npm run project:attempt:interrupt-inspect -- --project <storyId> --attempt <attemptId>`.
3. Only `attempt-interruption-ready` permits its exact returned `nextCommand` to record interruption. That command preserves the old
   claim and immutable inputs, appends a failed delivery event and releases only a verified abandoned operation lock.
4. Follow the returned recover-inspect command. Reissue creates a fresh attempt and bindings and reuses validated artifacts.

Always carry exact `--candidate` for a revision candidate. An active PID/process group, pending worker, foreign host, unverifiable
owner or legacy claim is a blocker. Never delete locks, modify attempt JSON, remove a claim, touch an attestation or issue a second
continuation against the interrupted attempt. Legacy state created before process ownership was recorded requires engineering
investigation; a user saying “continue” is not evidence that a process is dead.

A fixed checker/convergence defect stops production. Root diagnoses and reports supporting evidence and required engineering scope;
repair needs a separately requested engineering task. Provider failures stop with their
structured error; do not add automatic retries, switch providers, warm up TTS or lower browser sandbox. Agent-authored output errors
may be corrected by the assigned executor before its terminal event.

`npm run doctor` now actually checks a tiny browser render. Missing Chrome is handled by `npm run browser:prepare`, which performs a
single bounded, serialized installation of the Workspace's pinned browser. It does not change npm dependencies. Do not launch
multiple browser downloads, modify node_modules code or substitute another browser to conceal a failed gate.
Browser preparation honors existing HTTP(S) proxy variables through supported native Node proxy handling; explicit proxy
opt-outs remain effective. If the current Node lacks this capability, prepare the supported Node environment indicated by
the error before starting a fresh installation. Do not expose proxy credentials or change proxy settings silently.
