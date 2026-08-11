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
import { createProductionStageEvent } from "../domain/events";
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

type CurrentSceneAssignment = Extract<SceneAssignment, { schemaVersion: 3 }>;
type CurrentAssignments = Readonly<{
  assignments: readonly CurrentSceneAssignment[];
  globalVisualAssignment: GlobalVisualAssignment;
}>;
type WatchScheduler = Readonly<{
  sleep: (milliseconds: number) => Promise<void>;
}>;

const defaultScheduler: WatchScheduler = {
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export class ProductionWatchInterruption extends Error {}

type OwnerIdentity = Readonly<{
  ownerKind: ProductionOwnerKind;
  meaningId: string | null;
  assignmentFingerprint: string;
}>;

type WatchFailure = Readonly<{
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
}): WatchFailure => ({
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

const appendWatchFailure = async ({
  rootDir,
  runId,
  lock,
  watchFailure,
  occurredAt,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly lock: ProductionRunLock;
  readonly watchFailure: WatchFailure;
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
    code: watchFailure.code,
    summary: "Owner receipt processing failed.",
    description: watchFailure.message,
    stageId: "scenes",
    scope: watchFailure.scope,
    meaningId: watchFailure.meaningId,
    retryable: false,
    remediation:
      "Preserve the immutable receipt and result evidence, correct the shared workflow if needed, and start a fresh run.",
    commandId: "production-watch-worker",
    inputFingerprint: watchFailure.inputFingerprint,
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
        commandId: "production-watch-worker",
        previousStateFingerprint: loaded.state.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "owner-receipt-failure-input",
            fingerprint: watchFailure.inputFingerprint,
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
        message: "Watcher-owned result exists without its owner receipt.",
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
        message: "Watcher-owned result is stale against its receipt.",
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
    const ownerResult = await readOwnerResult({ rootDir, runId, ...owner });
    if (ownerResult === null) continue;
    const result = await readExistingSceneResult({
      rootDir,
      runId,
      meaningId: assignment.meaningId,
    });
    if (
      result === null ||
      result.resultFingerprint !== ownerResult.formalResult?.fingerprint
    ) {
      throw failure({
        code: "STALE_SCENE_RESULT",
        message:
          "Formal Scene result is missing or stale against the watcher outcome.",
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
              commandId: "production-watch-worker",
              previousStateFingerprint: loaded.state.stateFingerprint,
              inputFingerprints: [
                {
                  artifactId: `scene-assignment.${assignment.meaningId}`,
                  fingerprint: assignment.assignmentFingerprint,
                },
                {
                  artifactId: `owner-receipt.scene.${assignment.meaningId}`,
                  fingerprint: ownerResult.receiptFingerprint,
                },
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
              commandId: "production-watch-worker",
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
      commandId: "production-watch-worker",
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

export type ProductionWatchDependencies = Readonly<{
  processOwner?: typeof processOwnerReceipt;
  renderReady?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
  deliveryBuild?: (request: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<{
    readonly projectId: string;
    readonly deliveryId: string;
    readonly status: string;
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
}>;

export const runProductionWatch = async ({
  rootDir,
  runId,
  clock = () => new Date(),
  scheduler = defaultScheduler,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly clock?: () => Date;
  readonly scheduler?: WatchScheduler;
  readonly dependencies?: ProductionWatchDependencies;
}) => {
  const acquiredAt = clock();
  if (Number.isNaN(acquiredAt.getTime()))
    throw new Error("Production watcher clock is invalid.");
  let lock: ProductionRunLock | null = await acquireProductionRunLock({
    rootDir,
    runId,
    ownerId: "production-watch-worker",
    acquiredAt: acquiredAt.toISOString(),
  });
  const processOwner = dependencies.processOwner ?? processOwnerReceipt;
  try {
    let loaded = await readProductionRunStore({ rootDir, runId });
    if (loaded.state.state === "failed") {
      throw new Error("Production watcher cannot restart a failed run.");
    }
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
              commandId: "production-watch-worker",
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
    for (;;) {
      loaded = await readProductionRunStore({ rootDir, runId });
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
      const assignments =
        resolved.assignments as readonly CurrentSceneAssignment[];
      const globalVisualAssignment = resolved.globalVisualAssignment;
      const meaningIds = new Set(assignments.map(({ meaningId }) => meaningId));
      if (meaningIds.size !== assignments.length) {
        throw failure({
          code: "STALE_OWNER_ASSIGNMENTS",
          message: "Frozen Scene assignment identities conflict.",
        });
      }
      await assertOnlyExpectedOwnerInboxEntries({ rootDir, runId, meaningIds });

      for (const assignment of assignments) {
        await processOwner({
          rootDir,
          runId,
          storyId: loaded.run.storyId,
          owner: assignmentIdentity(assignment),
          taskInputFingerprint: assignment.taskInput.taskInputFingerprint,
          requirementsFingerprint: assignment.requirementsFingerprint,
        });
      }
      await processOwner({
        rootDir,
        runId,
        storyId: loaded.run.storyId,
        owner: assignmentIdentity(globalVisualAssignment),
        taskInputFingerprint: null,
        requirementsFingerprint: globalVisualAssignment.requirementsFingerprint,
      });
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
        if (accepted.complete) {
          await completeScenesStage({
            rootDir,
            runId,
            lock,
            assignments,
            globalVisualAssignment,
            clock,
          });
          await lock.release();
          lock = null;
          await (dependencies.renderReady ?? runProductionRenderReady)({
            rootDir,
            runId,
          });
          lock = await acquireProductionRunLock({
            rootDir,
            runId,
            ownerId: "production-watch-worker",
            acquiredAt: clock().toISOString(),
          });
          loaded = await readProductionRunStore({ rootDir, runId });
        }
      }
      if (loaded.state.state === "render-ready-running") {
        await lock.release();
        lock = null;
        await (dependencies.renderReady ?? runProductionRenderReady)({
          rootDir,
          runId,
        });
        lock = await acquireProductionRunLock({
          rootDir,
          runId,
          ownerId: "production-watch-worker",
          acquiredAt: clock().toISOString(),
        });
        loaded = await readProductionRunStore({ rootDir, runId });
      }
      if (loaded.state.state === "render-ready") {
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
        const coverOutcome = await processOwner({
          rootDir,
          runId,
          storyId: loaded.run.storyId,
          owner: coverOwner,
          taskInputFingerprint: null,
          requirementsFingerprint: null,
        });
        if (coverOutcome === null) {
          await scheduler.sleep(loaded.run.policy.pollIntervalMs);
          continue;
        }
        if (coverOutcome.receipt.status === "owner-failed") {
          throw new Error(
            "Cover owner failed; render-ready is preserved but automatic delivery is blocked.",
          );
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
      }
      await scheduler.sleep(loaded.run.policy.pollIntervalMs);
    }
  } catch (error) {
    if (error instanceof ProductionWatchInterruption) throw error;
    let watchFailure =
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      "meaningId" in error &&
      "inputFingerprint" in error &&
      "scope" in error
        ? (error as WatchFailure)
        : null;
    if (watchFailure === null && lock !== null) {
      const current = await readProductionRunStore({ rootDir, runId });
      if (
        current.state.state !== "render-ready" &&
        current.state.state !== "failed"
      ) {
        watchFailure = {
          code: "OWNER_WATCH_FAILED",
          message:
            "Detached production watcher failed during fixed receipt processing.",
          meaningId: null,
          inputFingerprint: current.run.requirementsFingerprint,
          scope: "run",
        };
      }
    }
    if (watchFailure !== null && lock !== null) {
      await appendWatchFailure({
        rootDir,
        runId,
        lock,
        watchFailure,
        occurredAt: clock().toISOString(),
      });
    }
    throw error;
  } finally {
    await lock?.release();
  }
};
