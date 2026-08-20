import {
  buildProducerPlan,
  createFingerprint,
  type ProducerPlan,
  type ProductionRevision,
  type TaskRevision,
} from "../../../src/contracts";
import { classifyTaskArtifact, type ArtifactInspection } from "./invalidation";
import { buildProducerTaskGraph, type ProducerTaskNode } from "./task-graph";

export const createProducerPlan = ({
  revision,
  nodes: rawNodes,
  inspections,
}: {
  readonly revision: ProductionRevision;
  readonly nodes: readonly ProducerTaskNode[];
  readonly inspections: ReadonlyMap<string, ArtifactInspection>;
}): ProducerPlan => {
  const nodes = buildProducerTaskGraph(rawNodes);
  const statuses = new Map<string, ReturnType<typeof classifyTaskArtifact>>();
  const byRevision = new Map(nodes.map((node) => [node.task.taskRevision, node]));
  const resolveStatus = (
    taskRevision: TaskRevision,
  ): ReturnType<typeof classifyTaskArtifact> => {
    const current = statuses.get(taskRevision);
    if (current !== undefined) return current;
    const node = byRevision.get(taskRevision);
    if (node === undefined) throw new Error("Producer plan lost a task dependency.");
    const blocked = node.dependencyTaskRevisions.some(
      (dependency) => resolveStatus(dependency).status !== "reused",
    );
    const status = blocked
      ? {
          status: "incompatible" as const,
          reasonCode: "dependency-changed" as const,
        }
      : classifyTaskArtifact({
          task: node.task,
          inspection: inspections.get(node.task.taskRevision) ?? {
            attestation: null,
            valid: false,
            reason: "artifact-missing",
          },
        });
    statuses.set(taskRevision, status);
    return status;
  };
  for (const node of nodes) resolveStatus(node.task.taskRevision);
  const tasks = nodes
    .map((node) => {
      const status = statuses.get(node.task.taskRevision);
      if (status === undefined) throw new Error("Producer plan lost task status.");
      const dependencyBlocked = node.dependencyTaskRevisions.some(
        (dependency) => statuses.get(dependency)?.status !== "reused",
      );
      return {
        taskRevision: node.task.taskRevision,
        taskKind: node.task.taskKind,
        semanticId: node.task.semanticId,
        status: dependencyBlocked
          ? ("blocked" as const)
          : status.status,
        reasonCode: dependencyBlocked ? ("dependency-blocked" as const) : status.reasonCode,
        dependencyTaskRevisions: node.dependencyTaskRevisions,
      };
    })
    .sort((left, right) => left.taskRevision.localeCompare(right.taskRevision));
  const agentKinds = new Set(["scene-owner", "global-visual-owner", "cover-owner"]);
  return buildProducerPlan({
    storyId: revision.storyId,
    revisionId: revision.revisionId,
    artifactSetFingerprint: createFingerprint({
      namespace: "producer-artifact-set",
      version: 1,
      value: tasks
        // A delivery attests the package built from this set; including the
        // delivery artifact itself would change the set after first commit and
        // create a DeliveryBuildId self-cycle.
        .filter(
          ({ status, taskKind }) =>
            status === "reused" && taskKind !== "delivery-build",
        )
        .map(({ taskRevision }) => ({
          taskRevision,
          artifactFingerprint: inspections.get(taskRevision)?.attestation?.artifactFingerprint,
        })),
    }),
    tasks,
    summary: {
      reusedTaskCount: tasks.filter(({ status }) => status === "reused").length,
      dirtyAgentTaskCount: tasks.filter(({ status, taskKind }) => status !== "reused" && agentKinds.has(taskKind)).length,
      dirtyFixedTaskCount: tasks.filter(
        ({ status, taskKind }) =>
          status !== "reused" && status !== "blocked" && !agentKinds.has(taskKind),
      ).length,
      blockedTaskCount: tasks.filter(({ status }) => status === "blocked").length,
    },
  });
};
