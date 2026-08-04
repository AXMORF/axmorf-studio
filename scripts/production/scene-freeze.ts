import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ResourceCatalogSchema,
  RenderSpecSchema,
  SceneAssignmentSchema,
  SceneProductionBriefSchema,
  SemanticTimingSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildSceneAssignment,
  buildSceneTaskInput,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  computeVisualStyleFingerprint,
  validateSceneProductionBrief,
  validateStoryResourcePool,
  type SceneAssignment,
} from "../../src/contracts";
import { runProjectCheckCli } from "../project-check/cli";
import { writeOrCheckSceneArtifact } from "../scene-package/project-files";
import {
  acquireProductionRunLock,
  appendProductionRunEvent,
  readProductionRunStore,
} from "./adapters/run-store";
import { createProductionStageEvent } from "./domain/events";
import { createUnexpectedProductionError } from "./domain/errors";
import { loadCurrentProductionInputs } from "./start";

const readRegularJson = async (path: string, label: string) => {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular repository file.`);
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
};

const loadCurrentCatalog = async (rootDir: string, storyId: string) => {
  const projectCatalog = join(
    rootDir,
    "src/projects",
    storyId,
    "generated/resource-catalog.generated.json",
  );
  try {
    return ResourceCatalogSchema.parse(
      await readRegularJson(projectCatalog, "Project ResourceCatalog"),
    );
  } catch (error) {
    if (
      (error as Error).message !==
      "Project ResourceCatalog is missing or unreadable."
    ) {
      throw error;
    }
    return ResourceCatalogSchema.parse(
      await readRegularJson(
        join(rootDir, "src/remotion/catalog/resource-catalog.generated.json"),
        "Shared ResourceCatalog",
      ),
    );
  }
};

const relevantSceneRequirements = (
  requirements: Awaited<
    ReturnType<typeof loadCurrentProductionInputs>
  >["requirements"],
  meaningId: string,
) =>
  requirements.additionalRequirements.filter(
    (requirement) =>
      requirement.scope === "all-scenes" ||
      (requirement.scope === "scene" &&
        requirement.targetMeaningIds.some((target) => target === meaningId)),
  );

export const assertSceneAssignmentIsolation = (
  rawAssignments: readonly SceneAssignment[],
) => {
  const assignments = rawAssignments.map((assignment) =>
    SceneAssignmentSchema.parse(assignment),
  );
  const meaningIds = assignments.map(({ meaningId }) => meaningId);
  if (new Set(meaningIds).size !== meaningIds.length) {
    throw new Error("Scene assignments must have unique meaning IDs.");
  }
  const roots = assignments.flatMap(({ taskInput }) => [
    taskInput.allowedDirectories.sceneRoot,
    taskInput.allowedDirectories.publicAssetRoot,
  ]);
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (
        roots[left] === roots[right] ||
        roots[left].startsWith(`${roots[right]}/`) ||
        roots[right].startsWith(`${roots[left]}/`)
      ) {
        throw new Error("Scene assignment output paths overlap.");
      }
    }
  }
  return assignments;
};

const resolveSceneFreezeInputs = async ({
  rootDir,
  runId,
  verifyNarrativeAutoCheck,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly verifyNarrativeAutoCheck: (input: {
    readonly rootDir: string;
    readonly storyId: string;
  }) => Promise<string>;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  const current = await loadCurrentProductionInputs({
    rootDir,
    projectId: loaded.run.storyId,
  });
  if (
    current.requirements.requirementsFingerprint !==
    loaded.run.requirementsFingerprint
  ) {
    throw new Error("Production run requirements are stale.");
  }
  const projectDir = join(rootDir, "src/projects", loaded.run.storyId);
  const [story, timing, catalog, visualStyle, rawPool, rawBrief] =
    await Promise.all([
      readRegularJson(join(projectDir, "story.json"), "StorySpec").then(
        StorySpecSchema.parse,
      ),
      readRegularJson(
        join(projectDir, "generated/semantic-timing.generated.json"),
        "SemanticTiming",
      ).then(SemanticTimingSchema.parse),
      loadCurrentCatalog(rootDir, loaded.run.storyId),
      readRegularJson(
        join(projectDir, "visual-style.json"),
        "VisualStyleSpec",
      ).then(VisualStyleSpecSchema.parse),
      readRegularJson(
        join(projectDir, "production/story-resource-pool.json"),
        "StoryResourcePool",
      ),
      readRegularJson(
        join(projectDir, "production/scene-production-brief.json"),
        "SceneProductionBrief",
      ),
    ]);
  if (
    story.storyId !== loaded.run.storyId ||
    timing.storyId !== loaded.run.storyId ||
    story.beats.length !== timing.storyBeats.length ||
    story.beats.some(
      ({ meaningId }, index) =>
        timing.storyBeats[index]?.meaningId !== meaningId,
    )
  ) {
    throw new Error("Story and SemanticTiming identities are stale.");
  }
  const styleEntry = catalog.entries.find(
    ({ descriptor }) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  if (
    styleEntry === undefined ||
    visualStyle.storyId !== loaded.run.storyId ||
    visualStyle.resourceCatalogFingerprint !== catalog.catalogFingerprint
  ) {
    throw new Error("VisualStyleSpec is stale against the current Catalog.");
  }
  const visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  const pool = validateStoryResourcePool({
    pool: StoryResourcePoolSchema.parse(rawPool),
    catalog,
    requirementsFingerprint: current.requirements.requirementsFingerprint,
  });
  if (pool.storyId !== loaded.run.storyId) {
    throw new Error("Story resource pool story identity is stale.");
  }
  const brief = validateSceneProductionBrief({
    brief: SceneProductionBriefSchema.parse(rawBrief),
    story,
    requirements: current.requirements,
    semanticTimingFingerprint: timing.fingerprint,
    visualStyleFingerprint,
    pool,
  });
  const autoCheckFingerprint = await verifyNarrativeAutoCheck({
    rootDir,
    storyId: loaded.run.storyId,
  });
  const boundAutoCheck = loaded.state.outputArtifacts.find(
    ({ artifactId }) => artifactId === "narrative-auto-check",
  );
  if (boundAutoCheck?.fingerprint !== autoCheckFingerprint) {
    throw new Error("Narrative AutoCheck identity is stale.");
  }
  return {
    loaded,
    current,
    story,
    render: RenderSpecSchema.parse(current.source.render),
    timing,
    catalog,
    visualStyleFingerprint,
    pool,
    brief,
    autoCheckFingerprint,
  } as const;
};

const buildAssignments = ({
  inputs,
  deadlineAt,
}: {
  readonly inputs: Awaited<ReturnType<typeof resolveSceneFreezeInputs>>;
  readonly deadlineAt: string;
}) => {
  const {
    loaded,
    current,
    story,
    render,
    timing,
    catalog,
    visualStyleFingerprint,
    pool,
    brief,
  } = inputs;
  const storyFingerprint = computeStoryFingerprint(story);
  const renderFingerprint = computeRenderSpecFingerprint(render);
  const assignments = story.beats.map((storyBeat, index) => {
    const timingBeat = timing.storyBeats[index];
    const sceneBrief = brief.scenes[index];
    if (
      timingBeat?.meaningId !== storyBeat.meaningId ||
      sceneBrief?.meaningId !== storyBeat.meaningId
    ) {
      throw new Error("Scene assignment Beat order is stale.");
    }
    const previousBeat = story.beats[index - 1] ?? null;
    const nextBeat = story.beats[index + 1] ?? null;
    const allowedSnapshots = sceneBrief.allowedSnapshotCards.map(
      (selection) => {
        const snapshot = pool.allowedSnapshots.find(
          ({ sourceId }) => sourceId === selection.sourceId,
        );
        if (snapshot === undefined) {
          throw new Error(
            "Scene snapshot selection is outside the Story pool.",
          );
        }
        return {
          sourceId: snapshot.sourceId,
          snapshotFingerprint: snapshot.snapshotFingerprint,
          allowedCardIds: selection.cardIds,
        };
      },
    );
    const taskInput = buildSceneTaskInput({
      storyId: story.storyId,
      meaningId: storyBeat.meaningId,
      storyBeat,
      timingBeat,
      storyFingerprint,
      semanticTimingFingerprint: timing.fingerprint,
      renderFingerprint,
      visualStyleFingerprint,
      resourceCatalogFingerprint: catalog.catalogFingerprint,
      allowedSnapshots,
      allowedResourceIds: sceneBrief.candidateResourceIds,
      continuity: {
        previousMeaningId: previousBeat?.meaningId ?? null,
        previousSummary: previousBeat?.narrativePurpose ?? null,
        nextMeaningId: nextBeat?.meaningId ?? null,
        nextSummary: nextBeat?.narrativePurpose ?? null,
        continuityBrief: sceneBrief.continuityBrief,
      },
      allowedDirectories: {
        sceneRoot: `src/projects/${story.storyId}/scenes/${storyBeat.meaningId}`,
        publicAssetRoot: `public/projects/${story.storyId}/scenes/${storyBeat.meaningId}`,
      },
    });
    return buildSceneAssignment({
      runId: loaded.run.runId,
      storyId: story.storyId,
      meaningId: storyBeat.meaningId,
      requirementsFingerprint: current.requirements.requirementsFingerprint,
      sceneBriefFingerprint: brief.briefFingerprint,
      resourcePoolFingerprint: pool.poolFingerprint,
      taskInput,
      sceneBrief,
      additionalRequirements: relevantSceneRequirements(
        current.requirements,
        storyBeat.meaningId,
      ),
      deadlineAt,
    });
  });
  return assertSceneAssignmentIsolation(assignments);
};

const assignmentPath = (storyId: string, meaningId: string) =>
  `src/projects/${storyId}/production/scene-assignments/${meaningId}.generated.json`;

const defaultVerifyNarrativeAutoCheck = async ({
  rootDir,
  storyId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}) => {
  const report = await runProjectCheckCli(
    ["--project", storyId, "--level", "narrative"],
    { rootDir, stdout: () => undefined },
  );
  return report.reportFingerprint;
};

export const resolveCurrentSceneAssignments = async ({
  rootDir,
  runId,
  verifyNarrativeAutoCheck = defaultVerifyNarrativeAutoCheck,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly verifyNarrativeAutoCheck?: (input: {
    readonly rootDir: string;
    readonly storyId: string;
  }) => Promise<string>;
}) => {
  const inputs = await resolveSceneFreezeInputs({
    rootDir,
    runId,
    verifyNarrativeAutoCheck,
  });
  const firstPath = assignmentPath(
    inputs.story.storyId,
    inputs.story.beats[0].meaningId,
  );
  const first = SceneAssignmentSchema.parse(
    await readRegularJson(join(rootDir, firstPath), "SceneAssignment"),
  );
  const assignments = buildAssignments({
    inputs,
    deadlineAt: first.deadlineAt,
  });
  for (const assignment of assignments) {
    await writeOrCheckSceneArtifact({
      destination: join(
        rootDir,
        assignmentPath(assignment.storyId, assignment.meaningId),
      ),
      value: assignment,
      mode: "check",
    });
  }
  return { inputs, assignments } as const;
};

export const runProductionSceneFreeze = async ({
  rootDir,
  runId,
  clock = () => new Date(),
  verifyNarrativeAutoCheck = defaultVerifyNarrativeAutoCheck,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly clock?: () => Date;
  readonly verifyNarrativeAutoCheck?: (input: {
    readonly rootDir: string;
    readonly storyId: string;
  }) => Promise<string>;
}) => {
  const initial = await readProductionRunStore({ rootDir, runId });
  if (
    initial.state.state !== "baseline-ready" &&
    initial.state.state !== "scene-inputs-frozen"
  ) {
    throw new Error("Scene freeze requires a baseline-ready run.");
  }
  if (initial.state.state === "scene-inputs-frozen") {
    const inputs = await resolveSceneFreezeInputs({
      rootDir,
      runId,
      verifyNarrativeAutoCheck,
    });
    const firstPath = assignmentPath(
      inputs.story.storyId,
      inputs.story.beats[0].meaningId,
    );
    const first = SceneAssignmentSchema.parse(
      await readRegularJson(join(rootDir, firstPath), "SceneAssignment"),
    );
    const assignments = buildAssignments({
      inputs,
      deadlineAt: first.deadlineAt,
    });
    for (const assignment of assignments) {
      await writeOrCheckSceneArtifact({
        destination: join(
          rootDir,
          assignmentPath(assignment.storyId, assignment.meaningId),
        ),
        value: assignment,
        mode: "check",
      });
    }
    return {
      runId,
      status: "scene-inputs-frozen",
      noOp: true,
      meaningIds: assignments.map(({ meaningId }) => meaningId),
      assignmentPaths: assignments.map(({ storyId, meaningId }) =>
        assignmentPath(storyId, meaningId),
      ),
    } as const;
  }
  const now = clock();
  if (Number.isNaN(now.getTime()))
    throw new Error("Production clock is invalid.");
  const lock = await acquireProductionRunLock({
    rootDir,
    runId,
    ownerId: "production-scene-freeze",
    acquiredAt: now.toISOString(),
  });
  let currentState = initial.state;
  try {
    const started = createProductionStageEvent({
      type: "stage-started",
      runId: initial.run.runId,
      storyId: initial.run.storyId,
      sequence: currentState.lastSequence + 1,
      eventId: `scene-freeze-started-${currentState.lastSequence + 1}`,
      stageId: "scene-freeze",
      attempt: 1,
      occurredAt: now.toISOString(),
      commandId: "production-scene-freeze",
      previousStateFingerprint: currentState.stateFingerprint,
      inputFingerprints: [
        {
          artifactId: "requirements",
          fingerprint: initial.run.requirementsFingerprint,
        },
      ],
    });
    currentState = (
      await appendProductionRunEvent({ rootDir, runId, event: started, lock })
    ).state;
    try {
      const inputs = await resolveSceneFreezeInputs({
        rootDir,
        runId,
        verifyNarrativeAutoCheck,
      });
      const deadlineAt = new Date(
        now.getTime() + initial.run.policy.sceneTimeoutMs,
      ).toISOString();
      const assignments = buildAssignments({ inputs, deadlineAt });
      for (const assignment of assignments) {
        const destination = join(
          rootDir,
          assignmentPath(assignment.storyId, assignment.meaningId),
        );
        await writeOrCheckSceneArtifact({
          destination,
          value: assignment,
          mode: "write",
        });
        await writeOrCheckSceneArtifact({
          destination,
          value: assignment,
          mode: "check",
        });
      }
      const succeeded = createProductionStageEvent({
        type: "stage-succeeded",
        runId: initial.run.runId,
        storyId: initial.run.storyId,
        sequence: currentState.lastSequence + 1,
        eventId: `scene-freeze-succeeded-${currentState.lastSequence + 1}`,
        stageId: "scene-freeze",
        attempt: 1,
        occurredAt: now.toISOString(),
        commandId: "production-scene-freeze",
        previousStateFingerprint: currentState.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "requirements",
            fingerprint: inputs.current.requirements.requirementsFingerprint,
          },
          {
            artifactId: "story",
            fingerprint: computeStoryFingerprint(inputs.story),
          },
          {
            artifactId: "semantic-timing",
            fingerprint: inputs.timing.fingerprint,
          },
          {
            artifactId: "visual-style",
            fingerprint: inputs.visualStyleFingerprint,
          },
          {
            artifactId: "resource-catalog",
            fingerprint: inputs.catalog.catalogFingerprint,
          },
          {
            artifactId: "story-resource-pool",
            fingerprint: inputs.pool.poolFingerprint,
          },
          {
            artifactId: "scene-production-brief",
            fingerprint: inputs.brief.briefFingerprint,
          },
          {
            artifactId: "narrative-auto-check",
            fingerprint: inputs.autoCheckFingerprint,
          },
        ],
        outputArtifacts: assignments.map((assignment) => ({
          artifactId: `scene-assignment.${assignment.meaningId}`,
          repositoryPath: assignmentPath(
            assignment.storyId,
            assignment.meaningId,
          ),
          fingerprint: assignment.assignmentFingerprint,
        })),
      });
      const appended = await appendProductionRunEvent({
        rootDir,
        runId,
        event: succeeded,
        lock,
      });
      return {
        runId,
        status: appended.state.state,
        noOp: false,
        meaningIds: assignments.map(({ meaningId }) => meaningId),
        assignmentPaths: assignments.map(({ storyId, meaningId }) =>
          assignmentPath(storyId, meaningId),
        ),
      } as const;
    } catch (error) {
      const failure = createUnexpectedProductionError({
        error,
        summary: "Scene input freeze failed.",
        stageId: "scene-freeze",
        scope: "run",
        meaningId: null,
        commandId: "production-scene-freeze",
        inputFingerprint: initial.run.requirementsFingerprint,
      });
      await appendProductionRunEvent({
        rootDir,
        runId,
        lock,
        event: createProductionStageEvent({
          type: "stage-failed",
          runId: initial.run.runId,
          storyId: initial.run.storyId,
          sequence: currentState.lastSequence + 1,
          eventId: `scene-freeze-failed-${currentState.lastSequence + 1}`,
          stageId: "scene-freeze",
          attempt: 1,
          occurredAt: now.toISOString(),
          commandId: "production-scene-freeze",
          previousStateFingerprint: currentState.stateFingerprint,
          inputFingerprints: [
            {
              artifactId: "requirements",
              fingerprint: initial.run.requirementsFingerprint,
            },
          ],
          error: failure,
        }),
      });
      throw error;
    }
  } finally {
    await lock.release();
  }
};
