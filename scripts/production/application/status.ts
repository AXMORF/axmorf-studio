import { loadCurrentDeliveryCoverAssignment } from "../../delivery/application/cover-inputs";
import { readOwnerReceipt } from "../adapters/owner-inbox";
import { readProductionRunStore } from "../adapters/run-store";
import {
  computeExpectedOwnerReceiptIdentities,
  type ExpectedOwnerReceiptIdentity,
} from "../domain/expected-owner-identities";
import { resolveCurrentSceneAssignments } from "./scene-freeze";

const isCurrentReceipt = (
  receipt: Awaited<ReturnType<typeof readOwnerReceipt>>,
  expected: ExpectedOwnerReceiptIdentity,
) =>
  receipt !== null &&
  receipt.ownerKind === expected.ownerKind &&
  receipt.meaningId === expected.meaningId &&
  receipt.assignmentFingerprint === expected.assignmentFingerprint &&
  receipt.taskInputFingerprint === expected.taskInputFingerprint &&
  receipt.requirementsFingerprint === expected.requirementsFingerprint;

type ProductionStatusDependencies = Readonly<{
  readRun: typeof readProductionRunStore;
  resolveAssignments: typeof resolveCurrentSceneAssignments;
  resolveCover: typeof loadCurrentDeliveryCoverAssignment;
  readReceipt: typeof readOwnerReceipt;
}>;

export const runProductionStatus = async ({
  rootDir,
  runId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly dependencies?: Partial<ProductionStatusDependencies>;
}) => {
  const readRun = dependencies.readRun ?? readProductionRunStore;
  const resolveAssignments =
    dependencies.resolveAssignments ?? resolveCurrentSceneAssignments;
  const resolveCover =
    dependencies.resolveCover ?? loadCurrentDeliveryCoverAssignment;
  const readReceipt = dependencies.readReceipt ?? readOwnerReceipt;
  const loaded = await readRun({ rootDir, runId });
  const missingRenderReadyOwnerAssignments: ExpectedOwnerReceiptIdentity[] = [];
  const missingDeliveryOwnerAssignments: ExpectedOwnerReceiptIdentity[] = [];
  if (
    new Set([
      "scene-inputs-frozen",
      "waiting-for-owner-results",
      "render-ready-running",
      "render-ready",
    ]).has(loaded.state.state)
  ) {
    const [resolved, cover] = await Promise.all([
      resolveAssignments({ rootDir, runId }),
      resolveCover({
        rootDir,
        projectId: loaded.run.storyId,
      }),
    ]);
    if (resolved.globalVisualAssignment === null) {
      throw new Error("GlobalVisual assignment is missing.");
    }
    const expected = computeExpectedOwnerReceiptIdentities({
      sceneAssignments: resolved.assignments,
      globalVisualAssignment: resolved.globalVisualAssignment,
      coverAssignment: cover.assignment,
    });
    for (const identity of expected.renderReadyRequired) {
      const receipt = await readReceipt({ rootDir, runId, ...identity });
      if (!isCurrentReceipt(receipt, identity)) {
        missingRenderReadyOwnerAssignments.push(identity);
      }
    }
    for (const identity of expected.deliveryOnly) {
      const receipt = await readReceipt({ rootDir, runId, ...identity });
      if (!isCurrentReceipt(receipt, identity)) {
        missingDeliveryOwnerAssignments.push(identity);
      }
    }
  }
  return {
    runId: loaded.run.runId,
    status: loaded.state.state,
    statePath: `.producer-runs/${loaded.run.runId}/state.generated.json`,
    requirementsFingerprint: loaded.run.requirementsFingerprint,
    lastSequence: loaded.state.lastSequence,
    missingOwnerAssignments: [
      ...missingRenderReadyOwnerAssignments,
      ...missingDeliveryOwnerAssignments,
    ],
    missingRenderReadyOwnerAssignments,
    missingDeliveryOwnerAssignments,
  } as const;
};
