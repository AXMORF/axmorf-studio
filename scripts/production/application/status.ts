import { loadCurrentDeliveryCoverAssignment } from "../../delivery/application/cover-inputs";
import { readOwnerReceipt } from "../adapters/owner-inbox";
import { readProductionRunStore } from "../adapters/run-store";
import { resolveCurrentSceneAssignments } from "./scene-freeze";

export const runProductionStatus = async ({
  rootDir,
  runId,
}: {
  readonly rootDir: string;
  readonly runId: string;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  const missingOwnerAssignments: Array<{
    ownerKind: "scene" | "global-visual" | "cover";
    meaningId: string | null;
    assignmentFingerprint: string;
  }> = [];
  if (
    new Set([
      "scene-inputs-frozen",
      "waiting-for-owner-results",
      "render-ready-running",
      "render-ready",
    ]).has(loaded.state.state)
  ) {
    const [resolved, cover] = await Promise.all([
      resolveCurrentSceneAssignments({ rootDir, runId }),
      loadCurrentDeliveryCoverAssignment({
        rootDir,
        projectId: loaded.run.storyId,
      }),
    ]);
    const identities = [
      ...resolved.assignments.map((assignment) => ({
        ownerKind: "scene" as const,
        meaningId: assignment.meaningId,
        assignmentFingerprint: assignment.assignmentFingerprint,
      })),
      ...(resolved.globalVisualAssignment === null
        ? []
        : [
            {
              ownerKind: "global-visual" as const,
              meaningId: null,
              assignmentFingerprint:
                resolved.globalVisualAssignment.assignmentFingerprint,
            },
          ]),
      {
        ownerKind: "cover" as const,
        meaningId: null,
        assignmentFingerprint: cover.assignment.assignmentFingerprint,
      },
    ];
    for (const identity of identities) {
      if ((await readOwnerReceipt({ rootDir, runId, ...identity })) === null) {
        missingOwnerAssignments.push(identity);
      }
    }
  }
  return {
    runId: loaded.run.runId,
    status: loaded.state.state,
    statePath: `.producer-runs/${loaded.run.runId}/state.generated.json`,
    requirementsFingerprint: loaded.run.requirementsFingerprint,
    lastSequence: loaded.state.lastSequence,
    missingOwnerAssignments,
  } as const;
};
