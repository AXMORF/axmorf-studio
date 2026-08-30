import {
  buildProducerPlan,
  createFingerprint,
  type ProducerPlan,
  type ProductionRevision,
} from "@axmorf/studio/contracts";
import type { TaskDiagnosticSnapshot } from "@axmorf/studio/contracts";
import type { DiagnosticSubject } from "@axmorf/studio/contracts";
import type { ArtifactInspection } from "./invalidation";
import {
  buildTaskDiagnosticSnapshots,
  explainTaskDecisions,
} from "./task-explanation";
import { buildProducerTaskGraph, type ProducerTaskNode } from "./task-graph";

export const createProducerPlan = ({
  revision,
  nodes: rawNodes,
  inspections,
  subjects,
  baselineSnapshots = [],
}: {
  readonly revision: ProductionRevision;
  readonly nodes: readonly ProducerTaskNode[];
  readonly inspections: ReadonlyMap<string, ArtifactInspection>;
  readonly subjects: ReadonlyMap<string, DiagnosticSubject>;
  readonly baselineSnapshots?: readonly TaskDiagnosticSnapshot[];
}): ProducerPlan => {
  const nodes = buildProducerTaskGraph(rawNodes);
  const tasks = explainTaskDecisions({
    storyId: revision.storyId,
    nodes,
    subjects,
    inspections,
    baselineSnapshots,
  });
  return buildProducerPlan({
    storyId: revision.storyId,
    revisionId: revision.revisionId,
    artifactSetFingerprint: createFingerprint({
      namespace: "producer-artifact-set",
      version: 1,
      value: nodes
        // A delivery attests the package built from this set; including the
        // delivery artifact itself creates a DeliveryBuildId self-cycle.
        .filter(({ task }) => task.taskKind !== "delivery-build")
        .flatMap(({ task }) => {
          const inspection = inspections.get(task.taskRevision);
          return inspection?.artifactState === "valid"
            ? [
                {
                  taskRevision: task.taskRevision,
                  artifactFingerprint:
                    inspection.attestation.artifactFingerprint,
                },
              ]
            : [];
        }),
    }),
    tasks,
    summary: {
      reusedTaskCount: tasks.filter(({ action }) => action === "reuse").length,
      dirtyAgentTaskCount: tasks.filter(
        ({ action }) => action === "dispatch-agent",
      ).length,
      dirtyFixedTaskCount: tasks.filter(({ action }) =>
        ["prepare-fixed", "converge"].includes(action),
      ).length,
      blockedTaskCount: tasks.filter(({ action }) => action === "blocked")
        .length,
    },
  });
};

export const createPlanDiagnosticSnapshots = ({
  nodes,
  plan,
  subjects,
}: {
  readonly nodes: readonly ProducerTaskNode[];
  readonly plan: ProducerPlan;
  readonly subjects: ReadonlyMap<string, DiagnosticSubject>;
}) =>
  buildTaskDiagnosticSnapshots({
    nodes,
    subjects,
    decisions: plan.tasks,
  });
