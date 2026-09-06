# Host execution and interruption recovery

Before preparation, discover the current host's actual long-running command capability. A command's own timeout does not override
an outer tool deadline. Arrange a supported terminal session/process handle that remains alive while the fixed continuation runs.
Use a native background command with completion notification when the foreground wrapper cannot wait long enough. Keep the exact
continuation arguments; never use shell `&`, detached retries or another chat as a task executor. Persist terminal output in the
host's normal process log, outside declared task outputs. Do not alter global host settings to make this work.

After all inline tasks commit, or all bounded children are admitted, start the exact continuation once. Suspend production reasoning.
The host may wait on that same process handle to deliver its terminal output; do not run new production/status commands, poll child
chats or repair a running continuation. A background-start acknowledgement is not delivery. Media processes have bounded deadlines
and clean up their groups on normal interruption; continuation also passes its remaining attempt deadline to media commands.

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

A fixed checker/convergence defect stops production and needs a separate engineering correction. Provider failures stop with their
structured error; do not add automatic retries, switch providers, warm up TTS or lower browser sandbox. Agent-authored output errors
may be corrected by the assigned executor before its terminal event.

`npm run doctor` now actually checks a tiny browser render. Missing Chrome is handled by `npm run browser:prepare`, which performs a
single bounded, serialized installation of the Workspace's pinned browser. It does not change npm dependencies. Do not launch
multiple browser downloads, modify node_modules code or substitute another browser to conceal a failed gate.
Browser preparation honors existing HTTP(S) proxy variables through supported native Node proxy handling; explicit proxy
opt-outs remain effective. If the current Node lacks this capability, prepare the supported Node environment indicated by
the error before starting a fresh installation. Do not expose proxy credentials or change proxy settings silently.
