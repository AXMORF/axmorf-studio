import type { TaskWorkerTransport } from "@axmorf/studio/contracts";

/** Handoff text is diagnostic routing, never task or artifact identity. */
export function buildTaskWorkerPrompt(input: {
  readonly repositoryRootDir: string;
  readonly taskKind: string;
  readonly bindCommand: string;
  readonly transport: TaskWorkerTransport;
}) {
  return [
    `Role: assigned ${input.taskKind} worker. Own only this assignment in this native child/session.`,
    `Workspace root: ${input.repositoryRootDir}`,
    input.transport === "shared-workspace"
      ? "Read this Workspace's AGENTS.md and follow its assigned-worker Skill route."
      : "Use the public AGENTS.md and task protocol text supplied by the controller in your native context; no direct filesystem access.",
    "Run the following exact command from the Workspace root before any task content access; do not rewrite identities:",
    input.bindCommand,
    "Only task-worker-bound grants task access. Read all three immutable inputs through its returned transport, then write only declared Agent-owned outputs.",
    "Scene workers must read the Workspace-local remotion-best-practices Skill and relevant routed references before authoring.",
    "Use the exact returned describe/finalize/check/commit commands. Correct only your own agent-output issues before terminal; never edit validators or immutable inputs.",
    "Finalize computes derived identities and fingerprints; do not calculate them manually. If it reports agent-output issues, correct the reported file/field and rerun finalize before check. A finalizer command failing does not by itself prove a fixed-system fault.",
    "Preserve complete shell tool results including process/session/cell handles. Empty output with a handle is still running: wait on that original handle until exit; do not restart the command or finish this child early.",
    "On failure return the exact command, structured error and whether binding succeeded. Do not retry a malformed assignment or reconstruct a long task hash.",
    "Global doctor/preflight, providers, create/inspect/prepare, execution resolution, continuation and recovery belong to Root. Do not run them or accept a different task in this child.",
    "Finish only after your commit receipt or a reported unrecoverable failure; chat alone is not a task-terminal receipt.",
  ].join("\n");
}
