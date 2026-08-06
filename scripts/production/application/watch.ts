import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  ScenePackageSchema,
  SceneProductionResultSchema,
  createFingerprint,
  type GlobalVisualAssignment,
  type GlobalVisualProductionResult,
  type SceneAssignment,
  type SceneProductionResult,
} from "../../../src/contracts";
import { collectRendererSourceGraph } from "../../renderer-registry/domain";
import {
  acquireProductionRunLock,
  appendProductionRunEvent,
  getProductionRunPaths,
  readProductionRunStore,
  type ProductionRunLock,
} from "../adapters/run-store";
import { createProductionStageEvent } from "../domain/events";
import { createExpectedProductionError } from "../domain/errors";
import { runProductionPostScene } from "./post-scene";
import { readExistingGlobalVisualResult } from "./global-visual-check";
import { validateGlobalVisualFromProjectFiles } from "./global-visual-validator";
import { resolveCurrentSceneAssignments } from "./scene-freeze";
import { validateSceneReadability } from "./readability-validator";

type CurrentAssignments = Readonly<{
  assignments: readonly SceneAssignment[];
  globalVisualAssignment?: GlobalVisualAssignment | null;
}>;

type SuccessResult = Extract<SceneProductionResult, { status: "success" }>;
type GlobalVisualSuccessResult = Extract<
  GlobalVisualProductionResult,
  { status: "success" }
>;

type WatchScheduler = Readonly<{
  sleep: (milliseconds: number) => Promise<void>;
}>;

export type ProductionWatchResult = Readonly<{
  runId: string;
  status: string;
  noOp: boolean;
  acceptedMeaningIds?: readonly string[];
  [key: string]: unknown;
}>;

type WatchFailureCode =
  | "SCENE_RESULT_MALFORMED"
  | "STALE_SCENE_RESULT"
  | "UNKNOWN_SCENE_RESULT"
  | "SCENE_TIMEOUT"
  | "STALE_SCENE_INPUTS"
  | "SCENE_WATCH_FAILED"
  | "GLOBAL_VISUAL_RESULT_MALFORMED"
  | "STALE_GLOBAL_VISUAL_RESULT"
  | "GLOBAL_VISUAL_RESULT_TIMEOUT";

class WatchFailure extends Error {
  readonly code: WatchFailureCode;
  readonly meaningId: string | null;
  readonly inputFingerprint: string;
  readonly scope: "run" | "scene" | "global-visual";

  constructor({
    code,
    message,
    meaningId,
    inputFingerprint,
    scope,
  }: {
    readonly code: WatchFailureCode;
    readonly message: string;
    readonly meaningId: string | null;
    readonly inputFingerprint: string;
    readonly scope?: "run" | "scene" | "global-visual";
  }) {
    super(message);
    this.code = code;
    this.meaningId = meaningId;
    this.inputFingerprint = inputFingerprint;
    this.scope = scope ?? (meaningId === null ? "run" : "scene");
  }
}

const defaultScheduler: WatchScheduler = {
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

const defaultResolveAssignments = async ({
  rootDir,
  runId,
}: {
  readonly rootDir: string;
  readonly runId: string;
}): Promise<CurrentAssignments> =>
  resolveCurrentSceneAssignments({ rootDir, runId });

const defaultVerifySuccess = async ({
  rootDir,
  assignment,
  result,
}: {
  readonly rootDir: string;
  readonly assignment: SceneAssignment;
  readonly result: SuccessResult;
}) => {
  const scenePackage = ScenePackageSchema.parse(
    JSON.parse(
      await readFile(join(rootDir, result.scenePackage.repositoryPath), "utf8"),
    ),
  );
  const readabilityIdentityStale =
    assignment.schemaVersion !== 1 &&
    (scenePackage.schemaVersion !== assignment.schemaVersion ||
      result.schemaVersion !== assignment.schemaVersion ||
      !("readabilityPolicyFingerprint" in scenePackage) ||
      !("readabilityPolicyFingerprint" in result) ||
      scenePackage.readabilityPolicyFingerprint !==
        assignment.readabilityPolicy.policyFingerprint ||
      result.readabilityPolicyFingerprint !==
        assignment.readabilityPolicy.policyFingerprint);
  const sharedBoundaryIdentityStale =
    assignment.schemaVersion === 3 &&
    (scenePackage.schemaVersion !== 3 ||
      result.schemaVersion !== 3 ||
      scenePackage.sceneCompositionBoundaryVersion !==
        assignment.sceneCompositionBoundaryVersion ||
      result.sceneCompositionBoundaryVersion !==
        assignment.sceneCompositionBoundaryVersion);
  if (
    scenePackage.storyId !== assignment.storyId ||
    scenePackage.meaningId !== assignment.meaningId ||
    scenePackage.taskInputFingerprint !==
      assignment.taskInput.taskInputFingerprint ||
    scenePackage.packageFingerprint !==
      result.scenePackage.packageFingerprint ||
    scenePackage.fidelityReceiptFingerprint !==
      result.fidelityReceiptFingerprint ||
    readabilityIdentityStale ||
    sharedBoundaryIdentityStale ||
    createFingerprint({
      namespace: "production-scene-selected-resources",
      version: 1,
      value: scenePackage.selectedResources,
    }) !== result.selectedResourcesFingerprint
  ) {
    throw new Error("Scene result is stale against its current ScenePackage.");
  }
  const graph = await collectRendererSourceGraph({
    rootDir,
    projectId: assignment.storyId,
    rendererPath: `src/projects/${assignment.storyId}/scenes/${assignment.meaningId}/Renderer.tsx`,
  });
  if (
    graph.sourceGraphFingerprint !== result.rendererSourceGraphFingerprint ||
    graph.sourceGraphFingerprint !==
      scenePackage.rendererBinding.rendererSourceFingerprint
  ) {
    throw new Error("Scene result renderer source graph is stale.");
  }
  if (assignment.schemaVersion !== 1) {
    await validateSceneReadability({ rootDir, assignment, graph });
  }
  const mechanicalCheckFingerprint = createFingerprint({
    namespace: "production-scene-mechanical-check",
    version: 1,
    value: {
      assignmentFingerprint: assignment.assignmentFingerprint,
      packageFingerprint: scenePackage.packageFingerprint,
      rendererSourceGraphFingerprint: graph.sourceGraphFingerprint,
      ...(assignment.schemaVersion !== 1
        ? {
            readabilityPolicyFingerprint:
              assignment.readabilityPolicy.policyFingerprint,
          }
        : {}),
      ...(assignment.schemaVersion === 3
        ? {
            sceneCompositionBoundaryVersion:
              assignment.sceneCompositionBoundaryVersion,
          }
        : {}),
    },
  });
  if (mechanicalCheckFingerprint !== result.mechanicalCheckFingerprint) {
    throw new Error("Scene mechanical check fingerprint is stale.");
  }
};

const defaultVerifyGlobalVisualSuccess = async ({
  rootDir,
  assignment,
  result,
}: {
  readonly rootDir: string;
  readonly assignment: GlobalVisualAssignment;
  readonly result: GlobalVisualSuccessResult;
}) => {
  const validated = await validateGlobalVisualFromProjectFiles({
    rootDir,
    assignment,
  });
  if (
    validated.globalVisualPackage.packageFingerprint !==
      result.globalVisualPackage.packageFingerprint ||
    validated.globalVisualPackage.globalVisualPlanFingerprint !==
      result.globalVisualPlanFingerprint ||
    validated.globalVisualPackage.rendererSourceGraphFingerprint !==
      result.rendererSourceGraphFingerprint ||
    validated.globalVisualPackage.selectedResourcesFingerprint !==
      result.selectedResourcesFingerprint ||
    validated.mechanicalCheckFingerprint !== result.mechanicalCheckFingerprint
  ) {
    throw new Error(
      "GlobalVisual result is stale against current project files.",
    );
  }
};

const globalVisualResultPath = (runId: string) =>
  `.producer-runs/${runId}/global-visual-result.json`;

const readGlobalVisualResult = async ({
  rootDir,
  runId,
  assignmentFingerprint,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly assignmentFingerprint: string;
}) => {
  try {
    return await readExistingGlobalVisualResult({ rootDir, runId });
  } catch {
    throw new WatchFailure({
      code: "GLOBAL_VISUAL_RESULT_MALFORMED",
      message: "GlobalVisual result contract is malformed.",
      meaningId: null,
      scope: "global-visual",
      inputFingerprint: assignmentFingerprint,
    });
  }
};

const assertGlobalVisualResultMatchesAssignment = ({
  result,
  assignment,
}: {
  readonly result: GlobalVisualProductionResult;
  readonly assignment: GlobalVisualAssignment;
}) => {
  if (
    result.runId !== assignment.runId ||
    result.storyId !== assignment.storyId ||
    result.assignmentFingerprint !== assignment.assignmentFingerprint ||
    result.requirementsFingerprint !== assignment.requirementsFingerprint
  ) {
    throw new WatchFailure({
      code: "STALE_GLOBAL_VISUAL_RESULT",
      message: "GlobalVisual result is stale against its frozen assignment.",
      meaningId: null,
      scope: "global-visual",
      inputFingerprint: result.resultFingerprint,
    });
  }
};

const resultPath = (runId: string, meaningId: string) =>
  `.producer-runs/${runId}/scene-results/${meaningId}.json`;

const readSceneResult = async ({
  rootDir,
  runId,
  meaningId,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly meaningId: string;
}): Promise<SceneProductionResult | null> => {
  const path = join(rootDir, resultPath(runId, meaningId));
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Scene result must be a regular file.");
    }
    return SceneProductionResultSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new WatchFailure({
      code: "SCENE_RESULT_MALFORMED",
      message: `Scene result ${meaningId} is malformed.`,
      meaningId,
      inputFingerprint: createFingerprint({
        namespace: "malformed-scene-result-path",
        version: 1,
        value: resultPath(runId, meaningId),
      }),
    });
  }
};

const assertOnlyExpectedResultFiles = async ({
  rootDir,
  runId,
  meaningIds,
  requirementsFingerprint,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly meaningIds: ReadonlySet<string>;
  readonly requirementsFingerprint: string;
}) => {
  const directory = getProductionRunPaths({ rootDir, runId }).sceneResults;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/u.exec(entry.name);
    if (!entry.isFile() || match === null || !meaningIds.has(match[1] ?? "")) {
      throw new WatchFailure({
        code: "UNKNOWN_SCENE_RESULT",
        message: "Scene result directory contains an unknown entry.",
        meaningId: null,
        inputFingerprint: requirementsFingerprint,
      });
    }
  }
};

const assertResultMatchesAssignment = ({
  result,
  assignment,
}: {
  readonly result: SceneProductionResult;
  readonly assignment: SceneAssignment;
}) => {
  const readabilityIdentityStale =
    assignment.schemaVersion !== 1 &&
    (result.schemaVersion !== assignment.schemaVersion ||
      !("readabilityPolicyFingerprint" in result) ||
      result.readabilityPolicyFingerprint !==
        assignment.readabilityPolicy.policyFingerprint);
  const sharedBoundaryIdentityStale =
    assignment.schemaVersion === 3 &&
    (result.schemaVersion !== 3 ||
      result.sceneCompositionBoundaryVersion !==
        assignment.sceneCompositionBoundaryVersion);
  if (
    result.runId !== assignment.runId ||
    result.storyId !== assignment.storyId ||
    result.meaningId !== assignment.meaningId ||
    result.assignmentFingerprint !== assignment.assignmentFingerprint ||
    result.taskInputFingerprint !== assignment.taskInput.taskInputFingerprint ||
    result.requirementsFingerprint !== assignment.requirementsFingerprint ||
    result.sceneBriefFingerprint !== assignment.sceneBriefFingerprint ||
    result.resourcePoolFingerprint !== assignment.resourcePoolFingerprint ||
    readabilityIdentityStale ||
    sharedBoundaryIdentityStale
  ) {
    throw new WatchFailure({
      code: "STALE_SCENE_RESULT",
      message: `Scene result ${assignment.meaningId} is stale.`,
      meaningId: assignment.meaningId,
      inputFingerprint: result.resultFingerprint,
    });
  }
};

const appendWatchFailure = async ({
  rootDir,
  runId,
  lock,
  failure,
  occurredAt,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly lock: ProductionRunLock;
  readonly failure:
    | WatchFailure
    | Readonly<{
        code: string;
        message: string;
        meaningId: string | null;
        inputFingerprint: string;
        scope?: "run" | "scene" | "global-visual";
      }>;
  readonly occurredAt: string;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  if (loaded.state.state === "failed") return loaded.state;
  const scope =
    "scope" in failure && failure.scope !== undefined
      ? failure.scope
      : failure.meaningId === null
        ? "run"
        : "scene";
  const error = createExpectedProductionError({
    code: failure.code,
    summary:
      scope === "global-visual"
        ? "Global visual result monitoring failed."
        : "Scene monitoring failed.",
    description: failure.message,
    stageId: "scenes",
    scope,
    meaningId: failure.meaningId,
    retryable: false,
    remediation:
      scope === "global-visual"
        ? "Inspect the frozen GlobalVisual assignment and result contract, then start a new production run after correction."
        : "Inspect the frozen Scene assignment and result contract, then start a new production run after correction.",
    commandId: "production-watch",
    inputFingerprint: failure.inputFingerprint,
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
        commandId: "production-watch",
        previousStateFingerprint: loaded.state.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "scene-watch-failure-input",
            fingerprint: failure.inputFingerprint,
          },
        ],
        error,
      }),
    })
  ).state;
};

export const runProductionWatch = async ({
  rootDir,
  runId,
  clock = () => new Date(),
  scheduler = defaultScheduler,
  resolveAssignments = defaultResolveAssignments,
  verifySuccess = defaultVerifySuccess,
  verifyGlobalVisualSuccess = defaultVerifyGlobalVisualSuccess,
  postScene = runProductionPostScene,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly clock?: () => Date;
  readonly scheduler?: WatchScheduler;
  readonly resolveAssignments?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<CurrentAssignments>;
  readonly verifySuccess?: (request: {
    readonly rootDir: string;
    readonly assignment: SceneAssignment;
    readonly result: SuccessResult;
  }) => Promise<void>;
  readonly verifyGlobalVisualSuccess?: (request: {
    readonly rootDir: string;
    readonly assignment: GlobalVisualAssignment;
    readonly result: GlobalVisualSuccessResult;
  }) => Promise<void>;
  readonly postScene?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
}): Promise<ProductionWatchResult> => {
  const acquiredAt = clock();
  if (Number.isNaN(acquiredAt.getTime())) {
    throw new Error("Production watcher clock is invalid.");
  }
  const lock = await acquireProductionRunLock({
    rootDir,
    runId,
    ownerId: "production-watch",
    acquiredAt: acquiredAt.toISOString(),
  });
  let shouldRunPostScene = false;
  let outcome:
    | Readonly<{
        runId: string;
        status: "post-scene-running" | "preview-ready";
        noOp: boolean;
        acceptedMeaningIds: readonly string[];
      }>
    | undefined;
  try {
    let loaded = await readProductionRunStore({ rootDir, runId });
    if (
      loaded.state.state === "post-scene-running" ||
      loaded.state.state === "preview-ready"
    ) {
      outcome = {
        runId,
        status: loaded.state.state,
        noOp: true,
        acceptedMeaningIds: loaded.state.acceptedSceneResults.map(
          ({ meaningId }) => meaningId,
        ),
      };
      shouldRunPostScene = loaded.state.state === "preview-ready";
    } else {
      if (
        loaded.state.state !== "scene-inputs-frozen" &&
        loaded.state.state !== "scenes-running"
      ) {
        throw new Error("Production watcher requires frozen Scene inputs.");
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
                runId: loaded.run.runId,
                storyId: loaded.run.storyId,
                sequence: loaded.state.lastSequence + 1,
                eventId: `scenes-started-${loaded.state.lastSequence + 1}`,
                stageId: "scenes",
                attempt: 1,
                occurredAt: acquiredAt.toISOString(),
                commandId: "production-watch",
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
        let assignments: readonly SceneAssignment[];
        let globalVisualAssignment: GlobalVisualAssignment | null = null;
        try {
          const resolved = await resolveAssignments({ rootDir, runId });
          assignments = resolved.assignments;
          globalVisualAssignment = resolved.globalVisualAssignment ?? null;
          if (
            loaded.run.schemaVersion === 2 &&
            globalVisualAssignment === null
          ) {
            throw new Error("GlobalVisualAssignment is missing.");
          }
        } catch {
          throw new WatchFailure({
            code: "STALE_SCENE_INPUTS",
            message: "Frozen shared Scene inputs drifted while waiting.",
            meaningId: null,
            inputFingerprint: loaded.run.requirementsFingerprint,
          });
        }
        if (assignments.length === 0) {
          throw new WatchFailure({
            code: "STALE_SCENE_INPUTS",
            message: "Frozen Scene assignments are empty.",
            meaningId: null,
            inputFingerprint: loaded.run.requirementsFingerprint,
          });
        }
        const expectedMeaningIds = new Set(
          assignments.map(({ meaningId }) => meaningId),
        );
        if (expectedMeaningIds.size !== assignments.length) {
          throw new WatchFailure({
            code: "STALE_SCENE_INPUTS",
            message: "Frozen Scene assignments contain duplicate identities.",
            meaningId: null,
            inputFingerprint: loaded.run.requirementsFingerprint,
          });
        }
        await assertOnlyExpectedResultFiles({
          rootDir,
          runId,
          meaningIds: expectedMeaningIds,
          requirementsFingerprint: loaded.run.requirementsFingerprint,
        });

        loaded = await readProductionRunStore({ rootDir, runId });
        const accepted = new Map(
          loaded.state.acceptedSceneResults.map((result) => [
            result.meaningId,
            result.resultFingerprint,
          ]),
        );
        let acceptedGlobalVisualResult =
          loaded.state.schemaVersion === 2
            ? loaded.state.acceptedGlobalVisualResult
            : null;
        if (globalVisualAssignment !== null) {
          const globalVisualResult = await readGlobalVisualResult({
            rootDir,
            runId,
            assignmentFingerprint: globalVisualAssignment.assignmentFingerprint,
          });
          if (globalVisualResult !== null) {
            assertGlobalVisualResultMatchesAssignment({
              result: globalVisualResult,
              assignment: globalVisualAssignment,
            });
            if (
              acceptedGlobalVisualResult !== null &&
              acceptedGlobalVisualResult.resultFingerprint !==
                globalVisualResult.resultFingerprint
            ) {
              throw new WatchFailure({
                code: "STALE_GLOBAL_VISUAL_RESULT",
                message: "Accepted GlobalVisual result changed.",
                meaningId: null,
                scope: "global-visual",
                inputFingerprint: globalVisualResult.resultFingerprint,
              });
            }
            if (globalVisualResult.status === "failure") {
              throw {
                code: globalVisualResult.error.code,
                message: globalVisualResult.error.description,
                meaningId: null,
                scope: "global-visual" as const,
                inputFingerprint: globalVisualResult.resultFingerprint,
              };
            }
            try {
              await verifyGlobalVisualSuccess({
                rootDir,
                assignment: globalVisualAssignment,
                result: globalVisualResult,
              });
            } catch {
              throw new WatchFailure({
                code: "STALE_GLOBAL_VISUAL_RESULT",
                message:
                  "GlobalVisual result failed current package, source, or resource validation.",
                meaningId: null,
                scope: "global-visual",
                inputFingerprint: globalVisualResult.resultFingerprint,
              });
            }
            if (acceptedGlobalVisualResult === null) {
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
                      runId: loaded.run.runId,
                      storyId: loaded.run.storyId,
                      sequence: loaded.state.lastSequence + 1,
                      eventId: `global-visual-result-accepted-${loaded.state.lastSequence + 1}`,
                      stageId: "scenes",
                      attempt: 1,
                      occurredAt: clock().toISOString(),
                      commandId: "production-watch",
                      previousStateFingerprint: loaded.state.stateFingerprint,
                      inputFingerprints: [
                        {
                          artifactId: "global-visual-assignment",
                          fingerprint:
                            globalVisualAssignment.assignmentFingerprint,
                        },
                      ],
                      globalVisualResultFingerprint:
                        globalVisualResult.resultFingerprint,
                      outputArtifacts: [
                        {
                          artifactId: "global-visual-result",
                          repositoryPath: globalVisualResultPath(runId),
                          fingerprint: globalVisualResult.resultFingerprint,
                        },
                      ],
                    }),
                  })
                ).state,
              };
              acceptedGlobalVisualResult = {
                resultFingerprint: globalVisualResult.resultFingerprint,
              };
            }
          }
        }
        for (const assignment of assignments) {
          const result: SceneProductionResult | null = await readSceneResult({
            rootDir,
            runId,
            meaningId: assignment.meaningId,
          });
          if (result === null) continue;
          assertResultMatchesAssignment({ result, assignment });
          const alreadyAccepted = accepted.get(assignment.meaningId);
          if (
            alreadyAccepted !== undefined &&
            alreadyAccepted !== result.resultFingerprint
          ) {
            throw new WatchFailure({
              code: "STALE_SCENE_RESULT",
              message: `Accepted Scene result ${assignment.meaningId} changed.`,
              meaningId: assignment.meaningId,
              inputFingerprint: result.resultFingerprint,
            });
          }
          if (result.status === "failure") {
            throw {
              code: result.error.code,
              message: result.error.description,
              meaningId: assignment.meaningId,
              inputFingerprint: result.resultFingerprint,
            };
          }
          try {
            await verifySuccess({ rootDir, assignment, result });
          } catch {
            throw new WatchFailure({
              code: "STALE_SCENE_RESULT",
              message: `Scene result ${assignment.meaningId} failed current validation.`,
              meaningId: assignment.meaningId,
              inputFingerprint: result.resultFingerprint,
            });
          }
          if (alreadyAccepted === undefined) {
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
                    runId: loaded.run.runId,
                    storyId: loaded.run.storyId,
                    sequence: loaded.state.lastSequence + 1,
                    eventId: `scene-${assignment.meaningId}-accepted-${loaded.state.lastSequence + 1}`,
                    stageId: "scenes",
                    attempt: 1,
                    occurredAt: clock().toISOString(),
                    commandId: "production-watch",
                    previousStateFingerprint: loaded.state.stateFingerprint,
                    inputFingerprints: [
                      {
                        artifactId: `scene-assignment.${assignment.meaningId}`,
                        fingerprint: assignment.assignmentFingerprint,
                      },
                    ],
                    meaningId: assignment.meaningId,
                    sceneResultFingerprint: result.resultFingerprint,
                    outputArtifacts: [
                      {
                        artifactId: `scene-result.${assignment.meaningId}`,
                        repositoryPath: resultPath(runId, assignment.meaningId),
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

        if (
          accepted.size === assignments.length &&
          (loaded.run.schemaVersion === 1 ||
            acceptedGlobalVisualResult !== null)
        ) {
          const completedAt = clock();
          loaded = {
            ...loaded,
            state: (
              await appendProductionRunEvent({
                rootDir,
                runId,
                lock,
                event: createProductionStageEvent({
                  schemaVersion: loaded.run.schemaVersion,
                  type: "stage-succeeded",
                  runId: loaded.run.runId,
                  storyId: loaded.run.storyId,
                  sequence: loaded.state.lastSequence + 1,
                  eventId: `scenes-succeeded-${loaded.state.lastSequence + 1}`,
                  stageId: "scenes",
                  attempt: 1,
                  occurredAt: completedAt.toISOString(),
                  commandId: "production-watch",
                  previousStateFingerprint: loaded.state.stateFingerprint,
                  inputFingerprints: [
                    ...assignments.map((assignment) => ({
                      artifactId: `scene-assignment.${assignment.meaningId}`,
                      fingerprint: assignment.assignmentFingerprint,
                    })),
                    ...(globalVisualAssignment === null
                      ? []
                      : [
                          {
                            artifactId: "global-visual-assignment",
                            fingerprint:
                              globalVisualAssignment.assignmentFingerprint,
                          },
                        ]),
                  ],
                  outputArtifacts: [
                    ...assignments.map((assignment) => ({
                      artifactId: `scene-result.${assignment.meaningId}`,
                      repositoryPath: resultPath(runId, assignment.meaningId),
                      fingerprint: accepted.get(assignment.meaningId),
                    })),
                    ...(acceptedGlobalVisualResult === null
                      ? []
                      : [
                          {
                            artifactId: "global-visual-result",
                            repositoryPath: globalVisualResultPath(runId),
                            fingerprint:
                              acceptedGlobalVisualResult.resultFingerprint,
                          },
                        ]),
                  ],
                }),
              })
            ).state,
          };
          shouldRunPostScene = true;
          outcome = {
            runId,
            status: "post-scene-running",
            noOp: false,
            acceptedMeaningIds: assignments.map(({ meaningId }) => meaningId),
          };
          break;
        }

        const now = clock();
        for (const assignment of assignments) {
          if (
            !accepted.has(assignment.meaningId) &&
            now.getTime() >= Date.parse(assignment.deadlineAt)
          ) {
            throw new WatchFailure({
              code: "SCENE_TIMEOUT",
              message: `Scene ${assignment.meaningId} did not produce a result before its frozen deadline.`,
              meaningId: assignment.meaningId,
              inputFingerprint: assignment.assignmentFingerprint,
            });
          }
        }
        if (
          globalVisualAssignment !== null &&
          acceptedGlobalVisualResult === null &&
          now.getTime() >= Date.parse(globalVisualAssignment.deadlineAt)
        ) {
          throw new WatchFailure({
            code: "GLOBAL_VISUAL_RESULT_TIMEOUT",
            message:
              "The frozen GlobalVisual result contract was not submitted before its deadline.",
            meaningId: null,
            scope: "global-visual",
            inputFingerprint: globalVisualAssignment.assignmentFingerprint,
          });
        }
        await scheduler.sleep(loaded.run.policy.pollIntervalMs);
      }
    }
  } catch (error) {
    const failure =
      error instanceof WatchFailure ||
      (error !== null &&
        typeof error === "object" &&
        "code" in error &&
        "message" in error &&
        "meaningId" in error &&
        "inputFingerprint" in error)
        ? (error as WatchFailure)
        : new WatchFailure({
            code: "SCENE_WATCH_FAILED",
            message: "Production watcher failed unexpectedly.",
            meaningId: null,
            inputFingerprint: (await readProductionRunStore({ rootDir, runId }))
              .run.requirementsFingerprint,
          });
    await appendWatchFailure({
      rootDir,
      runId,
      lock,
      failure,
      occurredAt: clock().toISOString(),
    });
    throw error;
  } finally {
    await lock.release();
  }
  if (outcome === undefined) {
    throw new Error("Production watcher completed without an outcome.");
  }
  if (shouldRunPostScene) {
    const postSceneResult = await postScene({ rootDir, runId });
    if (
      postSceneResult !== null &&
      typeof postSceneResult === "object" &&
      "runId" in postSceneResult &&
      typeof postSceneResult.runId === "string" &&
      "status" in postSceneResult &&
      typeof postSceneResult.status === "string" &&
      "noOp" in postSceneResult &&
      typeof postSceneResult.noOp === "boolean"
    ) {
      return postSceneResult as ProductionWatchResult;
    }
    return outcome;
  }
  return outcome;
};
