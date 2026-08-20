import {
  DiagnosticInputIdSchema,
  TaskDecisionExplanationListSchema,
  type DiagnosticInputId,
  type DiagnosticSubject,
  type TaskDecisionExplanation,
} from "../../../src/contracts/production-inspection";
import {
  TaskDiagnosticSnapshotListSchema,
  type TaskDiagnosticSnapshot,
} from "../../../src/contracts/execution-attempt";
import { serializeCanonicalJson } from "../../../src/contracts/fingerprint";
import type {
  ProducerTaskKind,
  TaskRevision,
} from "../../../src/contracts/producer-task";
import { TtsChunkIdSchema } from "../../../src/contracts/primitives";
import type { ArtifactInspection } from "./invalidation";
import { missingArtifactInspection } from "./invalidation";
import { buildProducerTaskGraph, type ProducerTaskNode } from "./task-graph";

const AGENT_TASK_KINDS = new Set<ProducerTaskKind>([
  "scene-owner",
  "global-visual-owner",
  "cover-owner",
]);
const CONVERGE_TASK_KINDS = new Set<ProducerTaskKind>([
  "composition-convergence",
  "delivery-build",
]);

const diagnosticInputAliases: Readonly<Record<string, DiagnosticInputId>> = {
  assembly: "generation-input",
  beat: "beat",
  brief: "brief",
  chunk: "tts-chunk",
  "cover-spec": "cover-spec",
  "generation-input": "generation-input",
  "mastering-policy": "mastering-policy",
  narration: "narration",
  "provider-attempt": "provider-attempt",
  publishing: "publishing",
  readability: "readability",
  render: "render",
  requirements: "requirements",
  resources: "resources",
  runtime: "runtime",
  sound: "sound",
  story: "story",
  style: "visual-style",
  "template-instance": "template-instance",
  timing: "timing",
  tts: "tts-chunk",
  "tts-chunk": "tts-chunk",
  "tts-text": "tts-chunk",
  "visual-style": "visual-style",
};

export const toDiagnosticInputId = (rawId: string): DiagnosticInputId | null => {
  if (rawId.startsWith("read:")) return null;
  const mapped = diagnosticInputAliases[rawId];
  if (mapped === undefined) {
    throw new Error(`Task input ID is not diagnostic-safe: ${rawId}`);
  }
  return DiagnosticInputIdSchema.parse(mapped);
};

export const deriveDiagnosticSubject = (
  node: ProducerTaskNode,
): DiagnosticSubject => {
  if (node.task.taskKind === "narration-chunk") {
    // Callers building real narration tasks must override this with chunkId.
    // The content identity remains a safe stable fallback for legacy unit fixtures.
    return { kind: "tts-chunk", id: TtsChunkIdSchema.parse(node.task.taskRevision) };
  }
  if (
    node.task.taskKind === "scene-owner" ||
    node.task.taskKind === "scene-template"
  ) {
    if (node.task.semanticId === null) {
      throw new Error("Scene diagnostic subject lost meaningId.");
    }
    return { kind: "meaning", id: node.task.semanticId };
  }
  return { kind: "project", id: node.task.storyId };
};

const resolveSubject = ({
  node,
  subjects,
}: {
  readonly node: ProducerTaskNode;
  readonly subjects?: ReadonlyMap<string, DiagnosticSubject>;
}) => subjects?.get(node.task.taskRevision) ?? deriveDiagnosticSubject(node);

const subjectKey = ({
  taskKind,
  subject,
}: {
  readonly taskKind: ProducerTaskKind;
  readonly subject: DiagnosticSubject;
}) => `${taskKind}:${subject.kind}:${subject.id}`;

const defaultDecision = ({
  node,
  subject,
}: {
  readonly node: ProducerTaskNode;
  readonly subject: DiagnosticSubject;
}): TaskDecisionExplanation => ({
  taskKind: node.task.taskKind,
  subject,
  taskRevision: node.task.taskRevision,
  baselineTaskRevision: null,
  action: "reuse",
  artifactState: "valid",
  directChanges: [],
  dependencyChanges: [],
  blockedBy: [],
  explanationAvailability: "baseline-unavailable",
});

export const buildTaskDiagnosticSnapshots = ({
  nodes: rawNodes,
  subjects,
  decisions,
}: {
  readonly nodes: readonly ProducerTaskNode[];
  readonly subjects?: ReadonlyMap<string, DiagnosticSubject>;
  readonly decisions: readonly TaskDecisionExplanation[];
}): readonly TaskDiagnosticSnapshot[] => {
  const nodes = buildProducerTaskGraph(rawNodes);
  const byRevision = new Map(nodes.map((node) => [node.task.taskRevision, node]));
  const decisionByRevision = new Map(
    decisions.map((decision) => [decision.taskRevision, decision]),
  );
  const snapshots = nodes.map((node) => {
    const subject = resolveSubject({ node, subjects });
    const inputFingerprints = node.task.inputFingerprints
      .map(({ id, fingerprint }) => {
        const diagnosticId = toDiagnosticInputId(id);
        return diagnosticId === null ? null : { id: diagnosticId, fingerprint };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (new Set(inputFingerprints.map(({ id }) => id)).size !== inputFingerprints.length) {
      throw new Error("Task inputs collapse to a duplicate diagnostic input ID.");
    }
    const dependencies = node.dependencyTaskRevisions
      .map((taskRevision) => {
        const dependency = byRevision.get(taskRevision);
        if (dependency === undefined) {
          throw new Error("Task diagnostic snapshot lost a DAG dependency.");
        }
        return {
          taskKind: dependency.task.taskKind,
          subject: resolveSubject({ node: dependency, subjects }),
          taskRevision: dependency.task.taskRevision,
        };
      })
      .sort((left, right) => subjectKey(left).localeCompare(subjectKey(right)));
    return {
      taskKind: node.task.taskKind,
      subject,
      taskRevision: node.task.taskRevision,
      inputFingerprints,
      validatorPolicyVersion: node.task.validatorPolicyVersion,
      declaredReadSet: [...node.task.declaredReadSet],
      declaredOutputSet: [...node.task.declaredOutputSet],
      dependencies,
      decision:
        decisionByRevision.get(node.task.taskRevision) ??
        defaultDecision({ node, subject }),
    };
  });
  return TaskDiagnosticSnapshotListSchema.parse(
    snapshots.sort((left, right) =>
      left.taskRevision.localeCompare(right.taskRevision),
    ),
  );
};

const directChanges = ({
  current,
  baseline,
}: {
  readonly current: TaskDiagnosticSnapshot;
  readonly baseline: TaskDiagnosticSnapshot;
}): TaskDecisionExplanation["directChanges"] => {
  const changes: Array<TaskDecisionExplanation["directChanges"][number]> = [];
  const before = new Map(
    baseline.inputFingerprints.map(({ id, fingerprint }) => [id, fingerprint]),
  );
  const after = new Map(
    current.inputFingerprints.map(({ id, fingerprint }) => [id, fingerprint]),
  );
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(id) !== after.get(id)) {
      changes.push({ kind: "input", id });
    }
  }
  if (current.validatorPolicyVersion !== baseline.validatorPolicyVersion) {
    changes.push({ kind: "validator", id: "validator-policy" });
  }
  if (
    serializeCanonicalJson(current.declaredReadSet) !==
    serializeCanonicalJson(baseline.declaredReadSet)
  ) {
    changes.push({ kind: "declared-io", id: "declared-read-set" });
  }
  if (
    serializeCanonicalJson(current.declaredOutputSet) !==
    serializeCanonicalJson(baseline.declaredOutputSet)
  ) {
    changes.push({ kind: "declared-io", id: "declared-output-set" });
  }
  return changes.sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
  );
};

const dependencyChanges = ({
  current,
  baseline,
}: {
  readonly current: TaskDiagnosticSnapshot;
  readonly baseline: TaskDiagnosticSnapshot;
}): TaskDecisionExplanation["dependencyChanges"] => {
  const before = new Map(
    baseline.dependencies.map((dependency) => [subjectKey(dependency), dependency]),
  );
  const after = new Map(
    current.dependencies.map((dependency) => [subjectKey(dependency), dependency]),
  );
  const changes: Array<TaskDecisionExplanation["dependencyChanges"][number]> = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const prior = before.get(key);
    const next = after.get(key);
    if (prior?.taskRevision !== next?.taskRevision) {
      const source = next ?? prior;
      if (source === undefined) continue;
      changes.push({
        taskKind: source.taskKind,
        subjectId: source.subject.id,
        taskRevision: next?.taskRevision ?? null,
      });
    }
  }
  return changes.sort((left, right) =>
    `${left.taskKind}:${left.subjectId}:${left.taskRevision ?? ""}`.localeCompare(
      `${right.taskKind}:${right.subjectId}:${right.taskRevision ?? ""}`,
    ),
  );
};

const ownAction = ({
  taskKind,
  inspection,
}: {
  readonly taskKind: ProducerTaskKind;
  readonly inspection: ArtifactInspection;
}): TaskDecisionExplanation["action"] => {
  if (inspection.artifactState === "valid") return "reuse";
  if (AGENT_TASK_KINDS.has(taskKind)) return "dispatch-agent";
  if (CONVERGE_TASK_KINDS.has(taskKind)) return "converge";
  return "prepare-fixed";
};

export const explainTaskDecisions = ({
  storyId,
  nodes: rawNodes,
  subjects,
  inspections,
  baselineSnapshots = [],
}: {
  readonly storyId: string;
  readonly nodes: readonly ProducerTaskNode[];
  readonly subjects?: ReadonlyMap<string, DiagnosticSubject>;
  readonly inspections: ReadonlyMap<string, ArtifactInspection>;
  readonly baselineSnapshots?: readonly TaskDiagnosticSnapshot[];
}): readonly TaskDecisionExplanation[] => {
  const nodes = buildProducerTaskGraph(rawNodes);
  if (nodes.some(({ task }) => task.storyId !== storyId)) {
    throw new Error("Task explanation graph is cross-story.");
  }
  const currentSnapshots = buildTaskDiagnosticSnapshots({
    nodes,
    subjects,
    decisions: [],
  });
  const currentByRevision = new Map(
    currentSnapshots.map((snapshot) => [snapshot.taskRevision, snapshot]),
  );
  const baselineBySubject = new Map(
    TaskDiagnosticSnapshotListSchema.parse(baselineSnapshots).map((snapshot) => [
      subjectKey(snapshot),
      snapshot,
    ]),
  );
  const nodesByRevision = new Map(
    nodes.map((node) => [node.task.taskRevision, node]),
  );
  const resolved = new Map<TaskRevision, TaskDecisionExplanation>();
  const resolve = (taskRevision: TaskRevision): TaskDecisionExplanation => {
    const existing = resolved.get(taskRevision);
    if (existing !== undefined) return existing;
    const node = nodesByRevision.get(taskRevision);
    const snapshot = currentByRevision.get(taskRevision);
    if (node === undefined || snapshot === undefined) {
      throw new Error("Task explanation lost a current DAG node.");
    }
    const dependencies = node.dependencyTaskRevisions.map(resolve);
    const blockedBy = dependencies
      .filter(({ action }) => action !== "reuse")
      .map((decision) => ({
        taskKind: decision.taskKind,
        subjectId: decision.subject.id,
        taskRevision: decision.taskRevision,
      }))
      .sort((left, right) =>
        `${left.taskKind}:${left.subjectId}:${left.taskRevision ?? ""}`.localeCompare(
          `${right.taskKind}:${right.subjectId}:${right.taskRevision ?? ""}`,
        ),
      );
    const baseline = baselineBySubject.get(subjectKey(snapshot));
    const inspection =
      inspections.get(taskRevision) ?? missingArtifactInspection();
    const decision: TaskDecisionExplanation = {
      taskKind: node.task.taskKind,
      subject: snapshot.subject,
      taskRevision,
      baselineTaskRevision: baseline?.taskRevision ?? null,
      action:
        blockedBy.length > 0
          ? "blocked"
          : ownAction({ taskKind: node.task.taskKind, inspection }),
      artifactState: inspection.artifactState,
      directChanges:
        baseline === undefined
          ? []
          : directChanges({ current: snapshot, baseline }),
      dependencyChanges:
        baseline === undefined
          ? []
          : dependencyChanges({ current: snapshot, baseline }),
      blockedBy,
      explanationAvailability:
        baseline === undefined ? "baseline-unavailable" : "complete",
    };
    resolved.set(taskRevision, decision);
    return decision;
  };
  for (const node of nodes) resolve(node.task.taskRevision);
  return TaskDecisionExplanationListSchema.parse(
    [...resolved.values()].sort((left, right) =>
      (left.taskRevision as string).localeCompare(right.taskRevision as string),
    ),
  );
};
