import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

import {
  buildProductionRequirementsFreeze,
  buildNarrationExecutionSnapshot,
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  NarrationSpecSchema,
  RenderSpecSchema,
  STORY_CHECK_IDS,
  StoryCheckReportSchema,
  StorySpecSchema,
  VideoBriefSchema,
  type ProductionRequirement,
} from "../../src/contracts";
import {
  appendProductionRunEvent,
  readProductionRunStore,
} from "../../scripts/production/adapters/run-store";
import { createProductionStageEvent } from "../../scripts/production/domain/events";
import { runProductionStart } from "../../scripts/production/application/start";
import {
  validNarrationSpec,
  validProjectSource,
  validStorySpec,
} from "../fixtures/narrative";

export const FIXED_PRODUCTION_NOW = new Date("2026-08-04T00:00:00.000Z");
export const FIXED_PRODUCTION_RUN_ID = "story-example-run-001";
export const FIXED_NARRATION_EXECUTION = buildNarrationExecutionSnapshot({
  providerId: "test-provider",
  voiceProfileId: validNarrationSpec.voiceProfileId,
  speechRate: 1,
  providerAttemptFingerprint: `sha256:${"a".repeat(64)}`,
  targetLoudnessLufs: -16,
});

export const checksumText = (bytes: string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

export const writeProductionJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, bytes);
  return checksumText(bytes);
};
export const createProductionFixture = async (
  context: TestContext,
  rootDir: string,
  options: Readonly<{
    additionalRequirements?: readonly ProductionRequirement[];
    story?: unknown;
  }> = {},
) => {
  const projectDir = join(rootDir, "src/projects/story-example");
  const story = StorySpecSchema.parse(options.story ?? validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const storyCheck = StoryCheckReportSchema.parse({
    schemaVersion: 1,
    storyId: story.storyId,
    storyFingerprint: computeStoryFingerprint(story),
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    voiceProfileId: narration.voiceProfileId,
    decision: "proceed",
    checks: STORY_CHECK_IDS.map((checkId) => ({
      checkId,
      status: "pass",
      note: `Checked ${checkId}.`,
    })),
  });
  const source = {
    brief: VideoBriefSchema.parse(validProjectSource.brief),
    story,
    narration,
    render: RenderSpecSchema.parse(validProjectSource.render),
    storyCheck,
  } as const;
  const sourceChecksums = {
    videoBrief: await writeProductionJson(
      join(projectDir, "brief.json"),
      source.brief,
    ),
    storySpec: await writeProductionJson(
      join(projectDir, "story.json"),
      source.story,
    ),
    narrationSpec: await writeProductionJson(
      join(projectDir, "narration.json"),
      source.narration,
    ),
    renderSpec: await writeProductionJson(
      join(projectDir, "render.json"),
      source.render,
    ),
    storyCheck: await writeProductionJson(
      join(projectDir, "reviews/story-check.json"),
      source.storyCheck,
    ),
  };
  const requirements = buildProductionRequirementsFreeze({
    source,
    sourceChecksums,
    enhancementSelection: {
      storyVisual: "required",
      sceneLocalSound: "allowed",
      globalSound: "none",
      globalVisual: "required",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: options.additionalRequirements ?? [],
    readability: { edgeInsetPx: 90 },
  });
  await writeProductionJson(
    join(projectDir, "production/requirements.json"),
    requirements,
  );
  const started = await runProductionStart({
    rootDir,
    projectId: story.storyId,
    clock: () => FIXED_PRODUCTION_NOW,
    createRunId: () => FIXED_PRODUCTION_RUN_ID,
    preflightDependencies: {
      voxcpm: async () => ({
        status: "pass",
        domain: "voxcpm",
        serviceState: "resident-ready",
        profileMode: "controllable-clone",
        narrationExecution: FIXED_NARRATION_EXECUTION,
      }),
      browser: async () => ({ status: "pass", domain: "remotion-browser" }),
    },
  });
  void context;
  return {
    rootDir,
    projectDir,
    source,
    requirements,
    runId: started.runId,
  } as const;
};

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

export const markProductionBaselineReady = async ({
  rootDir,
  runId,
  occurredAt = FIXED_PRODUCTION_NOW.toISOString(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly occurredAt?: string;
}) => {
  let loaded = await readProductionRunStore({ rootDir, runId });
  const started = createProductionStageEvent({
    schemaVersion: loaded.run.schemaVersion,
    type: "stage-started",
    runId: loaded.run.runId,
    storyId: loaded.run.storyId,
    sequence: loaded.state.lastSequence + 1,
    eventId: "narrative-started-test",
    stageId: "narrative",
    attempt: 1,
    occurredAt,
    commandId: "production-narrative",
    previousStateFingerprint: loaded.state.stateFingerprint,
    inputFingerprints: [
      {
        artifactId: "requirements",
        fingerprint: loaded.run.requirementsFingerprint,
      },
    ],
  });
  await appendProductionRunEvent({ rootDir, runId, event: started });
  loaded = await readProductionRunStore({ rootDir, runId });
  const succeeded = createProductionStageEvent({
    schemaVersion: loaded.run.schemaVersion,
    type: "stage-succeeded",
    runId: loaded.run.runId,
    storyId: loaded.run.storyId,
    sequence: loaded.state.lastSequence + 1,
    eventId: "narrative-succeeded-test",
    stageId: "narrative",
    attempt: 1,
    occurredAt,
    commandId: "production-narrative",
    previousStateFingerprint: loaded.state.stateFingerprint,
    inputFingerprints: [
      {
        artifactId: "requirements",
        fingerprint: loaded.run.requirementsFingerprint,
      },
    ],
    outputArtifacts: [
      {
        artifactId: "narrative-auto-check",
        repositoryPath: `src/projects/${loaded.run.storyId}/generated/narrative-auto-check.generated.json`,
        fingerprint: sha("e"),
      },
    ],
  });
  await appendProductionRunEvent({ rootDir, runId, event: succeeded });
  return { narrativeAutoCheckFingerprint: sha("e") } as const;
};

export const markProductionSceneInputsFrozen = async ({
  rootDir,
  runId,
  assignmentFingerprint = sha("f"),
  assignmentFingerprints,
  globalVisualAssignmentFingerprint,
  occurredAt = FIXED_PRODUCTION_NOW.toISOString(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly assignmentFingerprint?: string;
  readonly assignmentFingerprints?: readonly {
    readonly meaningId: string;
    readonly fingerprint: string;
  }[];
  readonly globalVisualAssignmentFingerprint?: string;
  readonly occurredAt?: string;
}) => {
  let loaded = await readProductionRunStore({ rootDir, runId });
  const started = createProductionStageEvent({
    schemaVersion: loaded.run.schemaVersion,
    type: "stage-started",
    runId: loaded.run.runId,
    storyId: loaded.run.storyId,
    sequence: loaded.state.lastSequence + 1,
    eventId: "scene-freeze-started-test",
    stageId: "scene-freeze",
    attempt: 1,
    occurredAt,
    commandId: "production-scene-freeze",
    previousStateFingerprint: loaded.state.stateFingerprint,
    inputFingerprints: [
      {
        artifactId: "requirements",
        fingerprint: loaded.run.requirementsFingerprint,
      },
    ],
  });
  await appendProductionRunEvent({ rootDir, runId, event: started });
  loaded = await readProductionRunStore({ rootDir, runId });
  const succeeded = createProductionStageEvent({
    schemaVersion: loaded.run.schemaVersion,
    type: "stage-succeeded",
    runId: loaded.run.runId,
    storyId: loaded.run.storyId,
    sequence: loaded.state.lastSequence + 1,
    eventId: "scene-freeze-succeeded-test",
    stageId: "scene-freeze",
    attempt: 1,
    occurredAt,
    commandId: "production-scene-freeze",
    previousStateFingerprint: loaded.state.stateFingerprint,
    inputFingerprints: [
      {
        artifactId: "requirements",
        fingerprint: loaded.run.requirementsFingerprint,
      },
    ],
    outputArtifacts: [
      ...(
        assignmentFingerprints ?? [
          { meaningId: "opening", fingerprint: assignmentFingerprint },
        ]
      ).map(({ meaningId, fingerprint }) => ({
        artifactId: `scene-assignment.${meaningId}`,
        repositoryPath: `src/projects/story-example/production/scene-assignments/${meaningId}.generated.json`,
        fingerprint,
      })),
      ...(globalVisualAssignmentFingerprint === undefined
        ? []
        : [
            {
              artifactId: "global-visual-assignment",
              repositoryPath:
                "src/projects/story-example/production/global-visual-assignment.generated.json",
              fingerprint: globalVisualAssignmentFingerprint,
            },
          ]),
    ],
  });
  await appendProductionRunEvent({ rootDir, runId, event: succeeded });
};

export const markProductionRenderReadyRunning = async ({
  rootDir,
  runId,
  sceneResults,
  globalVisualAssignmentFingerprint = sha("a"),
  globalVisualResultFingerprint = sha("b"),
  occurredAt = FIXED_PRODUCTION_NOW.toISOString(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly sceneResults: readonly {
    readonly meaningId: string;
    readonly assignmentFingerprint: string;
    readonly resultFingerprint: string;
  }[];
  readonly globalVisualAssignmentFingerprint?: string;
  readonly globalVisualResultFingerprint?: string;
  readonly occurredAt?: string;
}) => {
  let loaded = await readProductionRunStore({ rootDir, runId });
  await appendProductionRunEvent({
    rootDir,
    runId,
    event: createProductionStageEvent({
      schemaVersion: loaded.run.schemaVersion,
      type: "stage-started",
      runId: loaded.run.runId,
      storyId: loaded.run.storyId,
      sequence: loaded.state.lastSequence + 1,
      eventId: "scenes-started-test",
      stageId: "scenes",
      attempt: 1,
      occurredAt,
      commandId: "production-watch",
      previousStateFingerprint: loaded.state.stateFingerprint,
      inputFingerprints: [
        {
          artifactId: "requirements",
          fingerprint: loaded.run.requirementsFingerprint,
        },
      ],
    }),
  });
  loaded = await readProductionRunStore({ rootDir, runId });
  await appendProductionRunEvent({
    rootDir,
    runId,
    event: createProductionStageEvent({
      schemaVersion: loaded.run.schemaVersion,
      type: "global-visual-result-accepted",
      runId: loaded.run.runId,
      storyId: loaded.run.storyId,
      sequence: loaded.state.lastSequence + 1,
      eventId: "global-visual-result-accepted-test",
      stageId: "scenes",
      attempt: 1,
      occurredAt,
      commandId: "production-watch",
      previousStateFingerprint: loaded.state.stateFingerprint,
      inputFingerprints: [
        {
          artifactId: "global-visual-assignment",
          fingerprint: globalVisualAssignmentFingerprint,
        },
      ],
      globalVisualResultFingerprint,
      outputArtifacts: [
        {
          artifactId: "global-visual-result",
          repositoryPath: `.producer-runs/${runId}/global-visual-result.json`,
          fingerprint: globalVisualResultFingerprint,
        },
      ],
    }),
  });
  for (const scene of sceneResults) {
    loaded = await readProductionRunStore({ rootDir, runId });
    await appendProductionRunEvent({
      rootDir,
      runId,
      event: createProductionStageEvent({
        schemaVersion: loaded.run.schemaVersion,
        type: "scene-result-accepted",
        runId: loaded.run.runId,
        storyId: loaded.run.storyId,
        sequence: loaded.state.lastSequence + 1,
        eventId: `scene-${scene.meaningId}-accepted-test`,
        stageId: "scenes",
        attempt: 1,
        occurredAt,
        commandId: "production-watch",
        previousStateFingerprint: loaded.state.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: `scene-assignment.${scene.meaningId}`,
            fingerprint: scene.assignmentFingerprint,
          },
        ],
        meaningId: scene.meaningId,
        sceneResultFingerprint: scene.resultFingerprint,
        outputArtifacts: [
          {
            artifactId: `scene-result.${scene.meaningId}`,
            repositoryPath: `.producer-runs/${runId}/scene-results/${scene.meaningId}.json`,
            fingerprint: scene.resultFingerprint,
          },
        ],
      }),
    });
  }
  loaded = await readProductionRunStore({ rootDir, runId });
  await appendProductionRunEvent({
    rootDir,
    runId,
    event: createProductionStageEvent({
      schemaVersion: loaded.run.schemaVersion,
      type: "stage-succeeded",
      runId: loaded.run.runId,
      storyId: loaded.run.storyId,
      sequence: loaded.state.lastSequence + 1,
      eventId: "scenes-succeeded-test",
      stageId: "scenes",
      attempt: 1,
      occurredAt,
      commandId: "production-watch",
      previousStateFingerprint: loaded.state.stateFingerprint,
      inputFingerprints: [
        ...sceneResults.map((scene) => ({
          artifactId: `scene-assignment.${scene.meaningId}`,
          fingerprint: scene.assignmentFingerprint,
        })),
        {
          artifactId: "global-visual-assignment",
          fingerprint: globalVisualAssignmentFingerprint,
        },
      ],
      outputArtifacts: [
        ...sceneResults.map((scene) => ({
          artifactId: `scene-result.${scene.meaningId}`,
          repositoryPath: `.producer-runs/${runId}/scene-results/${scene.meaningId}.json`,
          fingerprint: scene.resultFingerprint,
        })),
        {
          artifactId: "global-visual-result",
          repositoryPath: `.producer-runs/${runId}/global-visual-result.json`,
          fingerprint: globalVisualResultFingerprint,
        },
      ],
    }),
  });
};
