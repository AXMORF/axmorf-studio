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
      : "Use the public AGENTS.md and task protocol text supplied by the controller; no direct filesystem access.",
    "Before any task content access, run this exact command from the Workspace root:",
    input.bindCommand,
    "Only task-worker-bound grants access. Read all three immutable inputs through its transport and write only declared Agent-owned outputs.",
    "Scene workers read the Workspace-local remotion-best-practices Skill and routed references before authoring. Use exact bound commands and the task protocol for finalization, checks and errors.",
    "Preserve complete results and original process/session/cell handles; wait until exit. Finish only after commit or report the exact command, structured failure and binding status. Root owns doctor, providers and production orchestration.",
  ].join("\n");
}
