import type { ProductionOwnerKind } from "../../../src/contracts";

export type ExpectedOwnerReceiptIdentity = Readonly<{
  ownerKind: ProductionOwnerKind;
  meaningId: string | null;
  assignmentFingerprint: string;
  taskInputFingerprint: string | null;
  requirementsFingerprint: string | null;
}>;

type SceneAssignmentIdentity = Readonly<{
  meaningId: string;
  assignmentFingerprint: string;
  requirementsFingerprint: string;
  taskInput: Readonly<{
    taskInputFingerprint: string;
    storyBeat:
      | Readonly<{ kind: "narrated-scene" }>
      | Readonly<{
          kind: "silent-scene";
          preset: Readonly<{
            implementation: Readonly<{
              kind: "scene-owner" | "template-copy";
            }>;
          }>;
        }>;
  }>;
}>;

type WholeFilmAssignmentIdentity = Readonly<{
  assignmentFingerprint: string;
  requirementsFingerprint: string;
}>;

type CoverAssignmentIdentity = Readonly<{
  assignmentFingerprint: string;
}>;

export const sceneAssignmentRequiresOwner = (
  assignment: SceneAssignmentIdentity,
) =>
  assignment.taskInput.storyBeat.kind === "narrated-scene" ||
  assignment.taskInput.storyBeat.preset.implementation.kind === "scene-owner";

export const computeExpectedOwnerReceiptIdentities = ({
  sceneAssignments,
  globalVisualAssignment,
  coverAssignment,
}: {
  readonly sceneAssignments: readonly SceneAssignmentIdentity[];
  readonly globalVisualAssignment: WholeFilmAssignmentIdentity;
  readonly coverAssignment: CoverAssignmentIdentity;
}) => {
  const renderReadyRequired: ExpectedOwnerReceiptIdentity[] = sceneAssignments
    .filter(sceneAssignmentRequiresOwner)
    .map((assignment) => ({
      ownerKind: "scene" as const,
      meaningId: assignment.meaningId,
      assignmentFingerprint: assignment.assignmentFingerprint,
      taskInputFingerprint: assignment.taskInput.taskInputFingerprint,
      requirementsFingerprint: assignment.requirementsFingerprint,
    }))
    .sort((left, right) => left.meaningId.localeCompare(right.meaningId));
  renderReadyRequired.push({
    ownerKind: "global-visual",
    meaningId: null,
    assignmentFingerprint: globalVisualAssignment.assignmentFingerprint,
    taskInputFingerprint: null,
    requirementsFingerprint: globalVisualAssignment.requirementsFingerprint,
  });
  return {
    renderReadyRequired,
    deliveryOnly: [
      {
        ownerKind: "cover" as const,
        meaningId: null,
        assignmentFingerprint: coverAssignment.assignmentFingerprint,
        taskInputFingerprint: null,
        requirementsFingerprint: null,
      },
    ],
  } as const;
};
