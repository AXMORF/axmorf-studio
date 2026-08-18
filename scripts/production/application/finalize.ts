import type { ProductionOwnerKind } from "../../../src/contracts";
import {
  buildProductionOwnerResult,
  type GlobalVisualAssignment,
  type ProductionOwnerReceipt,
  type SceneAssignment,
} from "../../../src/contracts";
import { buildDelivery } from "../../delivery/application/build";
import { runDeliveryCoverSubmit } from "../../delivery/application/cover-submit";
import {
  acquireProductionRunLock,
  appendProductionRunEvent,
  readProductionRunStore,
  type ProductionRunLock,
} from "../adapters/run-store";
import {
  assertOnlyExpectedOwnerInboxEntries,
  readOwnerReceipt,
  readOwnerResult,
  writeOwnerResult,
} from "../adapters/owner-inbox";
import { assertOwnerOutputManifestCurrent } from "../adapters/owner-output-manifest";
import {
  checkAgentWriteBoundary,
  writeAgentWriteBoundary,
  type AgentWriteBoundaryChecker,
} from "../adapters/agent-write-boundary";
import { createProductionStageEvent } from "../domain/events";
import {
  computeExpectedOwnerReceiptIdentities,
  sceneAssignmentRequiresOwner,
} from "../domain/expected-owner-identities";
import { createExpectedProductionError } from "../domain/errors";
import { runProductionGlobalVisualSubmit } from "./global-visual-submit";
import { runProductionGlobalVisualFail } from "./global-visual-fail";
import { readExistingGlobalVisualResult } from "./global-visual-check";
import { ownerOutputScope, resolveOwnerAssignment } from "./owner-receipt";
import { runProductionRenderReady } from "./render-ready";
import {
  readExistingSceneResult,
  runProductionSceneSubmit,
} from "./scene-submit";
import { runProductionSceneFail } from "./scene-fail";
import { resolveCurrentSceneAssignments } from "./scene-freeze";

type CurrentSceneAssignment = Extract<SceneAssignment, { schemaVersion: 5 }>;
type CurrentAssignments = Readonly<{
  assignments: readonly CurrentSceneAssignment[];
  globalVisualAssignment: GlobalVisualAssignment;
}>;
type OwnerIdentity = Readonly<{
  ownerKind: ProductionOwnerKind;
  meaningId: string | null;
  assignmentFingerprint: string;
}>;

type FinalizeFailure = Readonly<{
  code: string;
  message: string;
  meaningId: string | null;
  inputFingerprint: string;
  scope: "run" | "scene" | "global-visual";
}>;

const failure = ({
  code,
  message,
  owner,
}: {
  readonly code: string;
  readonly message: string;
  readonly owner?: OwnerIdentity;
}): FinalizeFailure => ({
  code,
  message,
  meaningId: owner?.meaningId ?? null,
  inputFingerprint: owner?.assignmentFingerprint ?? `sha256:${"0".repeat(64)}`,
  scope:
    owner?.ownerKind === "scene"
      ? "scene"
      : owner?.ownerKind === "global-visual"
        ? "global-visual"
        : "run",
});

const assignmentIdentity = (
  assignment: CurrentSceneAssignment | GlobalVisualAssignment,
): OwnerIdentity =>
  "meaningId" in assignment
    ? {
        ownerKind: "scene",
        meaningId: assignment.meaningId,
        assignmentFingerprint: assignment.assignmentFingerprint,
      }
    : {
        ownerKind: "global-visual",
        meaningId: null,
        assignmentFingerprint: assignment.assignmentFingerprint,
      };

const assertReceiptIdentity = ({
  receipt,
  runId,
  storyId,
  owner,
  taskInputFingerprint,
  requirementsFingerprint,
}: {
  readonly receipt: ProductionOwnerReceipt;
  readonly runId: string;
  readonly storyId: string;
  readonly owner: OwnerIdentity;
  readonly taskInputFingerprint: string | null;
  readonly requirementsFingerprint: string | null;
}) => {
  if (
    receipt.runId !== runId ||
    receipt.storyId !== storyId ||
    receipt.ownerKind !== owner.ownerKind ||
    receipt.meaningId !== owner.meaningId ||
    receipt.assignmentFingerprint !== owner.assignmentFingerprint ||
    receipt.taskInputFingerprint !== taskInputFingerprint ||
    receipt.requirementsFingerprint !== requirementsFingerprint
  ) {
    throw failure({
      code: "STALE_OWNER_RECEIPT",
      message: "Owner receipt is stale against its immutable assignment.",
      owner,
    });
  }
  const inputFingerprints = new Map(
    receipt.inputFingerprints.map((item) => [
      item.artifactId,
      item.fingerprint,
    ]),
  );
  if (
    inputFingerprints.get("assignment") !== owner.assignmentFingerprint ||
    (taskInputFingerprint !== null &&
      inputFingerprints.get("task-input") !== taskInputFingerprint) ||
    (requirementsFingerprint !== null &&
      inputFingerprints.get("requirements") !== requirementsFingerprint)
  ) {
    throw failure({
      code: "STALE_OWNER_RECEIPT",
      message:
        "Owner receipt input identities are stale against frozen inputs.",
      owner,
    });
  }
};

const appendFinalizeFailure = async ({
  rootDir,
  runId,
  lock,
  finalizeFailure,
  occurredAt,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly lock: ProductionRunLock;
  readonly finalizeFailure: FinalizeFailure;
  readonly occurredAt: string;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  if (
    loaded.state.state === "failed" ||
    loaded.state.state === "render-ready"
  ) {
    return loaded.state;
  }
  const error = createExpectedProductionError({
    code: finalizeFailure.code,
    summary: "Owner receipt processing failed.",
    description: finalizeFailure.message,
    stageId: "scenes",
    scope: finalizeFailure.scope,
    meaningId: finalizeFailure.meaningId,
    retryable: false,
    remediation:
      "Preserve the immutable receipt and result evidence, correct the shared workflow if needed, and start a fresh run.",
    commandId: "production-finalize",
    inputFingerprint: finalizeFailure.inputFingerprint,
  });
  return (
    await appendProductionRunEvent({
      rootDir,
      runId,
      lock,
      event: createProductionStageEvent({
        schemaVersion: loaded.run.schemaVersion,
        type: "stage-failed",
        runId: loaded.run.runId,
        storyId: loaded.run.storyId,
        sequence: loaded.state.lastSequence + 1,
        eventId: `scenes-failed-${loaded.state.lastSequence + 1}`,
        stageId: "scenes",
        attempt: 1,
        occurredAt,
        commandId: "production-finalize",
        previousStateFingerprint: loaded.state.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "owner-receipt-failure-input",
            fingerprint: finalizeFailure.inputFingerprint,
          },
        ],
        error,
      }),
    })
  ).state;
};

const processOwnerReceipt = async ({
  rootDir,
  runId,
  storyId,
  owner,
  taskInputFingerprint,
  requirementsFingerprint,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly storyId: string;
  readonly owner: OwnerIdentity;
  readonly taskInputFingerprint: string | null;
  readonly requirementsFingerprint: string | null;
}) => {
  const receipt = await readOwnerReceipt({ rootDir, runId, ...owner });
  const existingResult = await readOwnerResult({ rootDir, runId, ...owner });
  if (receipt === null) {
    if (existingResult !== null) {
      throw failure({
        code: "OWNER_RESULT_WITHOUT_RECEIPT",
        message: "Finalize-owned result exists without its owner receipt.",
        owner,
      });
    }
    return null;
  }
  assertReceiptIdentity({
    receipt,
    runId,
    storyId,
    owner,
    taskInputFingerprint,
    requirementsFingerprint,
  });
  const resolvedOwner = await resolveOwnerAssignment({
    rootDir,
    runId,
    ownerKind: owner.ownerKind,
    meaningId: owner.meaningId,
  });
  await assertOwnerOutputManifestCurrent({
    rootDir,
    scope: ownerOutputScope(resolvedOwner),
    expected: receipt.outputManifest,
    allowMissing: receipt.status === "owner-failed",
  });
  if (existingResult !== null) {
    if (
      existingResult.runId !== runId ||
      existingResult.storyId !== storyId ||
      existingResult.ownerKind !== owner.ownerKind ||
      existingResult.meaningId !== owner.meaningId ||
      existingResult.assignmentFingerprint !== owner.assignmentFingerprint ||
      existingResult.receiptFingerprint !== receipt.receiptFingerprint
    ) {
      throw failure({
        code: "STALE_OWNER_RESULT",
        message: "Finalize-owned result is stale against its receipt.",
        owner,
      });
    }
    return { receipt, result: existingResult } as const;
  }

  let formalResult: { repositoryPath: string; fingerprint: string } | null =
    null;
  if (receipt.status === "owner-failed") {
    if (owner.ownerKind === "scene") {
      await runProductionSceneFail({
        rootDir,
        runId,
        meaningId: owner.meaningId!,
        code: receipt.error.code,
        description: receipt.error.description,
      });
      const result = await readExistingSceneResult({
        rootDir,
        runId,
        meaningId: owner.meaningId!,
      });
      if (result === null)
        throw new Error("Scene failure result was not written.");
      formalResult = {
        repositoryPath: `.producer-runs/${runId}/scene-results/${owner.meaningId}.json`,
        fingerprint: result.resultFingerprint,
      };
    } else if (owner.ownerKind === "global-visual") {
      await runProductionGlobalVisualFail({
        rootDir,
        runId,
        code: receipt.error.code,
        description: receipt.error.description,
      });
      const result = await readExistingGlobalVisualResult({ rootDir, runId });
      if (result === null)
        throw new Error("GlobalVisual failure result was not written.");
      formalResult = {
        repositoryPath: `.producer-runs/${runId}/global-visual-result.json`,
        fingerprint: result.resultFingerprint,
      };
    }
  } else if (owner.ownerKind === "scene") {
    const submitted = await runProductionSceneSubmit({
      rootDir,
      runId,
      meaningId: owner.meaningId!,
    });
    formalResult = {
      repositoryPath: `.producer-runs/${runId}/scene-results/${owner.meaningId}.json`,
      fingerprint: submitted.result.resultFingerprint,
    };
  } else if (owner.ownerKind === "global-visual") {
    const submitted = await runProductionGlobalVisualSubmit({ rootDir, runId });
    formalResult = {
      repositoryPath: `.producer-runs/${runId}/global-visual-result.json`,
      fingerprint: submitted.result.resultFingerprint,
    };
  } else {
    const submitted = await runDeliveryCoverSubmit({
      rootDir,
      projectId: storyId,
    });
    formalResult = {
      repositoryPath: submitted.resultPath,
      fingerprint: submitted.resultFingerprint,
    };
  }
  const result = buildProductionOwnerResult({
    runId,
    storyId,
    ownerKind: owner.ownerKind,
    meaningId: owner.meaningId,
    assignmentFingerprint: owner.assignmentFingerprint,
    receiptFingerprint: receipt.receiptFingerprint,
    status:
      receipt.status === "owner-ready" ? "accepted-ready" : "accepted-failed",
    formalResult,
    occurredAt: receipt.occurredAt,
  });
  await writeOwnerResult({ rootDir, result });
  return { receipt, result } as const;
};

const acceptFormalResults = async ({
  rootDir,
  runId,
  lock,
  assignments,
  globalVisualAssignment,
  clock,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly lock: ProductionRunLock;
  readonly assignments: readonly CurrentSceneAssignment[];
  readonly globalVisualAssignment: GlobalVisualAssignment;
  readonly clock: () => Date;
}) => {
  let loaded = await readProductionRunStore({ rootDir, runId });
  const accepted = new Map(
    loaded.state.acceptedSceneResults.map((item) => [
      item.meaningId,
      item.resultFingerprint,
    ]),
  );
  for (const assignment of assignments) {
    const owner = assignmentIdentity(assignment);
    const ownerResult = sceneAssignmentRequiresOwner(assignment)
      ? await readOwnerResult({ rootDir, runId, ...owner })
      : null;
    if (sceneAssignmentRequiresOwner(assignment) && ownerResult === null)
      continue;
    const result = await readExistingSceneResult({
      rootDir,
      runId,
      meaningId: assignment.meaningId,
    });
    if (
      result === null ||
      result.runId !== runId ||
      result.storyId !== loaded.run.storyId ||
      result.meaningId !== assignment.meaningId ||
      result.assignmentFingerprint !== assignment.assignmentFingerprint ||
      result.taskInputFingerprint !==
        assignment.taskInput.taskInputFingerprint ||
      result.requirementsFingerprint !== assignment.requirementsFingerprint ||
      result.sceneBriefFingerprint !== assignment.sceneBriefFingerprint ||
      result.resourcePoolFingerprint !== assignment.resourcePoolFingerprint ||
      result.readabilityPolicyFingerprint !==
        assignment.readabilityPolicy.policyFingerprint ||
      result.sceneCompositionBoundaryVersion !==
        assignment.sceneCompositionBoundaryVersion ||
      (ownerResult !== null &&
        result.resultFingerprint !== ownerResult.formalResult?.fingerprint)
    ) {
      throw failure({
        code: "STALE_SCENE_RESULT",
        message:
          "Formal Scene result is missing or stale against the finalize outcome.",
        owner,
      });
    }
    if (result.status === "failure") {
      throw failure({
        code: result.error.code,
        message: result.error.description,
        owner,
      });
    }
    const prior = accepted.get(assignment.meaningId);
    if (prior !== undefined && prior !== result.resultFingerprint) {
      throw failure({
        code: "STALE_SCENE_RESULT",
        message: "Accepted Scene result changed.",
        owner,
      });
    }
    if (prior === undefined) {
      loaded = {
        ...loaded,
        state: (
          await appendProductionRunEvent({
            rootDir,
            runId,
            lock,
            event: createProductionStageEvent({
              schemaVersion: loaded.run.schemaVersion,
              type: "scene-result-accepted",
              runId,
              storyId: loaded.run.storyId,
              sequence: loaded.state.lastSequence + 1,
              eventId: `scene-${assignment.meaningId}-accepted-${loaded.state.lastSequence + 1}`,
              stageId: "scenes",
              attempt: 1,
              occurredAt: clock().toISOString(),
              commandId: "production-finalize",
              previousStateFingerprint: loaded.state.stateFingerprint,
              inputFingerprints: [
                {
                  artifactId: `scene-assignment.${assignment.meaningId}`,
                  fingerprint: assignment.assignmentFingerprint,
                },
                ...(ownerResult === null
                  ? [
                      {
                        artifactId: `template-scene-result.${assignment.meaningId}`,
                        fingerprint: result.resultFingerprint,
                      },
                    ]
                  : [
                      {
                        artifactId: `owner-receipt.scene.${assignment.meaningId}`,
                        fingerprint: ownerResult.receiptFingerprint,
                      },
                    ]),
              ],
              meaningId: assignment.meaningId,
              sceneResultFingerprint: result.resultFingerprint,
              outputArtifacts: [
                {
                  artifactId: `scene-result.${assignment.meaningId}`,
                  repositoryPath: `.producer-runs/${runId}/scene-results/${assignment.meaningId}.json`,
                  fingerprint: result.resultFingerprint,
                },
              ],
            }),
          })
        ).state,
      };
      accepted.set(assignment.meaningId, result.resultFingerprint);
    }
  }

  const globalOwner = assignmentIdentity(globalVisualAssignment);
  const globalOwnerResult = await readOwnerResult({
    rootDir,
    runId,
    ...globalOwner,
  });
  let acceptedGlobal = loaded.state.acceptedGlobalVisualResult;
  if (globalOwnerResult !== null) {
    const result = await readExistingGlobalVisualResult({ rootDir, runId });
    if (
      result === null ||
      result.resultFingerprint !== globalOwnerResult.formalResult?.fingerprint
    ) {
      throw failure({
        code: "STALE_GLOBAL_VISUAL_RESULT",
        message: "Formal GlobalVisual result is missing or stale.",
        owner: globalOwner,
      });
    }
    if (result.status === "failure") {
      throw failure({
        code: result.error.code,
        message: result.error.description,
        owner: globalOwner,
      });
    }
    if (
      acceptedGlobal !== null &&
      acceptedGlobal.resultFingerprint !== result.resultFingerprint
    ) {
      throw failure({
        code: "STALE_GLOBAL_VISUAL_RESULT",
        message: "Accepted GlobalVisual result changed.",
        owner: globalOwner,
      });
    }
    if (acceptedGlobal === null) {
      loaded = {
        ...loaded,
        state: (
          await appendProductionRunEvent({
            rootDir,
            runId,
            lock,
            event: createProductionStageEvent({
              schemaVersion: loaded.run.schemaVersion,
              type: "global-visual-result-accepted",
              runId,
              storyId: loaded.run.storyId,
              sequence: loaded.state.lastSequence + 1,
              eventId: `global-visual-result-accepted-${loaded.state.lastSequence + 1}`,
              stageId: "scenes",
              attempt: 1,
              occurredAt: clock().toISOString(),
              commandId: "production-finalize",
              previousStateFingerprint: loaded.state.stateFingerprint,
              inputFingerprints: [
                {
                  artifactId: "global-visual-assignment",
                  fingerprint: globalVisualAssignment.assignmentFingerprint,
                },
                {
                  artifactId: "owner-receipt.global-visual",
                  fingerprint: globalOwnerResult.receiptFingerprint,
                },
              ],
              globalVisualResultFingerprint: result.resultFingerprint,
              outputArtifacts: [
                {
                  artifactId: "global-visual-result",
                  repositoryPath: `.producer-runs/${runId}/global-visual-result.json`,
                  fingerprint: result.resultFingerprint,
                },
              ],
            }),
          })
        ).state,
      };
      acceptedGlobal = { resultFingerprint: result.resultFingerprint };
    }
  }
  return {
    loaded,
    complete: accepted.size === assignments.length && acceptedGlobal !== null,
  } as const;
};

const completeScenesStage = async ({
  rootDir,
  runId,
  lock,
  assignments,
  globalVisualAssignment,
  clock,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly lock: ProductionRunLock;
  readonly assignments: readonly CurrentSceneAssignment[];
  readonly globalVisualAssignment: GlobalVisualAssignment;
  readonly clock: () => Date;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  if (
    loaded.state.state === "render-ready-running" ||
    loaded.state.state === "render-ready"
  )
    return;
  await appendProductionRunEvent({
    rootDir,
    runId,
    lock,
    event: createProductionStageEvent({
      schemaVersion: loaded.run.schemaVersion,
      type: "stage-succeeded",
      runId,
      storyId: loaded.run.storyId,
      sequence: loaded.state.lastSequence + 1,
      eventId: `scenes-succeeded-${loaded.state.lastSequence + 1}`,
      stageId: "scenes",
      attempt: 1,
      occurredAt: clock().toISOString(),
      commandId: "production-finalize",
      previousStateFingerprint: loaded.state.stateFingerprint,
      inputFingerprints: [
        ...assignments.map((assignment) => ({
          artifactId: `scene-assignment.${assignment.meaningId}`,
          fingerprint: assignment.assignmentFingerprint,
        })),
        {
          artifactId: "global-visual-assignment",
          fingerprint: globalVisualAssignment.assignmentFingerprint,
        },
      ],
      outputArtifacts: [
        ...loaded.state.acceptedSceneResults.map((result) => ({
          artifactId: `scene-result.${result.meaningId}`,
          repositoryPath: `.producer-runs/${runId}/scene-results/${result.meaningId}.json`,
          fingerprint: result.resultFingerprint,
        })),
        {
          artifactId: "global-visual-result",
          repositoryPath: `.producer-runs/${runId}/global-visual-result.json`,
          fingerprint:
            loaded.state.acceptedGlobalVisualResult!.resultFingerprint,
        },
      ],
    }),
  });
};

export type ProductionFinalizeDependencies = Readonly<{
  processOwner?: typeof processOwnerReceipt;
  readReceipt?: (
    request: Readonly<
      { rootDir: string; runId: string } & OwnerIdentity
    >,
  ) => Promise<ProductionOwnerReceipt | null>;
  renderReady?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly lock?: ProductionRunLock;
    readonly commandId?: string;
    readonly clock?: () => Date;
  }) => Promise<unknown>;
  deliveryBuild?: (request: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<{
    readonly projectId: string;
    readonly deliveryId: string;
    readonly status: "delivery-render-started";
    readonly noOp: boolean;
  }>;
  resolveAssignments?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<CurrentAssignments>;
  resolveCoverOwner?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly storyId: string;
  }) => Promise<OwnerIdentity>;
  checkAgentBoundary?: AgentWriteBoundaryChecker;
  writeAgentBoundary?: (
    request: Parameters<typeof writeAgentWriteBoundary>[0],
  ) => Promise<unknown>;
}>;

export const runProductionFinalize = async ({
  rootDir,
  runId,
  clock = () => new Date(),
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly clock?: () => Date;
  readonly dependencies?: ProductionFinalizeDependencies;
}) => {
  const acquiredAt = clock();
  if (Number.isNaN(acquiredAt.getTime()))
    throw new Error("Production finalize clock is invalid.");
  const lock = await acquireProductionRunLock({
    rootDir,
    runId,
    ownerId: "production-finalize",
    acquiredAt: acquiredAt.toISOString(),
  });
  const processOwner = dependencies.processOwner ?? processOwnerReceipt;
  const readReceipt = dependencies.readReceipt ?? readOwnerReceipt;
  let mutationsStarted = false;
  try {
    let loaded = await readProductionRunStore({ rootDir, runId });
    if (loaded.state.state === "failed") {
      return {
        runId,
        storyId: loaded.run.storyId,
        status: "production-failed" as const,
        error: loaded.state.failure,
      };
    }
    const boundaryPhase =
      loaded.state.state === "render-ready"
        ? ("cover-authoring-after-render-ready" as const)
        : ("owner-authoring" as const);
    const boundary = await (
      dependencies.checkAgentBoundary ?? checkAgentWriteBoundary
    )({
      rootDir,
      runId,
      phase: boundaryPhase,
    });
    if (boundary.status !== "current") {
      return {
        runId,
        storyId: loaded.run.storyId,
        status: "agent-write-boundary-violated" as const,
        phase: boundaryPhase,
      };
    }
    const resolved = dependencies.resolveAssignments
      ? await dependencies.resolveAssignments({ rootDir, runId })
      : await resolveCurrentSceneAssignments({ rootDir, runId }).then(
          (value) => {
            if (value.globalVisualAssignment === null) {
              throw new Error("GlobalVisual assignment is missing.");
            }
            return {
              assignments:
                value.assignments as readonly CurrentSceneAssignment[],
              globalVisualAssignment: value.globalVisualAssignment,
            };
          },
        );
    if (resolved.assignments.length === 0) {
      throw failure({
        code: "STALE_OWNER_ASSIGNMENTS",
        message: "Frozen owner assignments are missing.",
      });
    }
    const assignments = resolved.assignments;
    const globalVisualAssignment = resolved.globalVisualAssignment;
    const allMeaningIds = new Set(
      assignments.map(({ meaningId }) => meaningId),
    );
    if (allMeaningIds.size !== assignments.length) {
      throw failure({
        code: "STALE_OWNER_ASSIGNMENTS",
        message: "Frozen Scene assignment identities conflict.",
      });
    }
    const coverOwner = dependencies.resolveCoverOwner
      ? await dependencies.resolveCoverOwner({
          rootDir,
          runId,
          storyId: loaded.run.storyId,
        })
      : await resolveOwnerAssignment({
          rootDir,
          runId,
          ownerKind: "cover",
          meaningId: null,
        }).then((cover) => {
          if (cover.ownerKind !== "cover") {
            throw new Error("Cover assignment resolution failed.");
          }
          return {
            ownerKind: "cover" as const,
            meaningId: null,
            assignmentFingerprint: cover.assignment.assignmentFingerprint,
          };
        });
    const expected = computeExpectedOwnerReceiptIdentities({
      sceneAssignments: assignments,
      globalVisualAssignment,
      coverAssignment: coverOwner,
    });
    await assertOnlyExpectedOwnerInboxEntries({
      rootDir,
      runId,
      expectedOwnerIdentities: [
        ...expected.renderReadyRequired,
        ...expected.deliveryOnly,
      ],
      sceneResultMeaningIds: allMeaningIds,
    });
    const missingOwnerAssignments = [];
    for (const owner of expected.renderReadyRequired) {
      if ((await readReceipt({ rootDir, runId, ...owner })) === null) {
        missingOwnerAssignments.push(owner);
      }
    }
    if (missingOwnerAssignments.length > 0) {
      return {
        runId,
        storyId: loaded.run.storyId,
        status: "owner-receipts-incomplete" as const,
        missingOwnerAssignments,
      };
    }

    mutationsStarted = true;
    if (loaded.state.state === "scene-inputs-frozen") {
      loaded = {
        ...loaded,
        state: (
          await appendProductionRunEvent({
            rootDir,
            runId,
            lock,
            event: createProductionStageEvent({
              schemaVersion: loaded.run.schemaVersion,
              type: "stage-started",
              runId,
              storyId: loaded.run.storyId,
              sequence: loaded.state.lastSequence + 1,
              eventId: `scenes-started-${loaded.state.lastSequence + 1}`,
              stageId: "scenes",
              attempt: 1,
              occurredAt: acquiredAt.toISOString(),
              commandId: "production-finalize",
              previousStateFingerprint: loaded.state.stateFingerprint,
              inputFingerprints: [
                {
                  artifactId: "requirements",
                  fingerprint: loaded.run.requirementsFingerprint,
                },
              ],
            }),
          })
        ).state,
      };
    }
    for (const owner of expected.renderReadyRequired) {
      await processOwner({
        rootDir,
        runId,
        storyId: loaded.run.storyId,
        owner: {
          ownerKind: owner.ownerKind,
          meaningId: owner.meaningId,
          assignmentFingerprint: owner.assignmentFingerprint,
        },
        taskInputFingerprint: owner.taskInputFingerprint,
        requirementsFingerprint: owner.requirementsFingerprint,
      });
    }
    loaded = await readProductionRunStore({ rootDir, runId });
    if (
      loaded.state.state === "waiting-for-owner-results" ||
      loaded.state.state === "scene-inputs-frozen"
    ) {
      const accepted = await acceptFormalResults({
        rootDir,
        runId,
        lock,
        assignments,
        globalVisualAssignment,
        clock,
      });
      if (!accepted.complete) {
        throw failure({
          code: "OWNER_RESULTS_INCOMPLETE",
          message: "Required owner results did not converge.",
        });
      }
      await completeScenesStage({
        rootDir,
        runId,
        lock,
        assignments,
        globalVisualAssignment,
        clock,
      });
      loaded = await readProductionRunStore({ rootDir, runId });
    }
    if (loaded.state.state === "render-ready-running") {
      await (dependencies.renderReady ?? runProductionRenderReady)({
        rootDir,
        runId,
        lock,
        commandId: "production-finalize",
        clock,
      });
      loaded = await readProductionRunStore({ rootDir, runId });
      if (loaded.state.state === "render-ready") {
        await (dependencies.writeAgentBoundary ?? writeAgentWriteBoundary)({
          rootDir,
          runId,
          storyId: loaded.run.storyId,
          phase: "cover-authoring-after-render-ready",
          allowedWriteScopes: [
            {
              kind: "directory",
              repositoryPath: `src/projects/${loaded.run.storyId}/delivery/cover`,
            },
          ],
        });
      }
    }
    if (loaded.state.state !== "render-ready") {
      throw failure({
        code: "FINALIZE_STATE_INVALID",
        message: "Production finalize did not reach render-ready.",
      });
    }
    const coverOutcome = await processOwner({
      rootDir,
      runId,
      storyId: loaded.run.storyId,
      owner: {
        ownerKind: expected.deliveryOnly[0].ownerKind,
        meaningId: expected.deliveryOnly[0].meaningId,
        assignmentFingerprint:
          expected.deliveryOnly[0].assignmentFingerprint,
      },
      taskInputFingerprint: null,
      requirementsFingerprint: null,
    });
    if (coverOutcome === null) {
      return {
        runId,
        storyId: loaded.run.storyId,
        status: "render-ready-delivery-blocked" as const,
        reason: "cover-receipt-missing" as const,
      };
    }
    if (coverOutcome.receipt.status === "owner-failed") {
      return {
        runId,
        storyId: loaded.run.storyId,
        status: "render-ready-delivery-blocked" as const,
        reason: "cover-owner-failed" as const,
      };
    }
    const delivered = await (dependencies.deliveryBuild ?? buildDelivery)({
      rootDir,
      projectId: loaded.run.storyId,
    });
    return {
      runId,
      storyId: loaded.run.storyId,
      ...delivered,
    } as const;
  } catch (error) {
    let finalizeFailure =
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      "meaningId" in error &&
      "inputFingerprint" in error &&
      "scope" in error
        ? (error as FinalizeFailure)
        : null;
    if (mutationsStarted) {
      const current = await readProductionRunStore({ rootDir, runId });
      if (current.state.state === "failed") {
        return {
          runId,
          storyId: current.run.storyId,
          status: "production-failed" as const,
          error: current.state.failure,
        };
      }
      if (current.state.state !== "render-ready") {
        finalizeFailure ??= {
          code: "OWNER_FINALIZE_FAILED",
          message:
            "Foreground production finalize failed during fixed receipt processing.",
          meaningId: null,
          inputFingerprint: current.run.requirementsFingerprint,
          scope: "run",
        };
        await appendFinalizeFailure({
          rootDir,
          runId,
          lock,
          finalizeFailure,
          occurredAt: clock().toISOString(),
        });
        const failed = await readProductionRunStore({ rootDir, runId });
        return {
          runId,
          storyId: failed.run.storyId,
          status: "production-failed" as const,
          error: failed.state.failure,
        };
      }
    }
    throw error;
  } finally {
    await lock.release();
  }
};
