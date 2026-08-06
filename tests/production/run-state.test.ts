import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PRODUCTION_RUN_POLICY,
  ProductionRunPolicySchema,
  createProductionRunManifest,
  type ProductionFingerprintRef,
} from "../../src/contracts/production-run";
import { createProductionStageEvent } from "../../scripts/production/domain/events";
import {
  createInitialProductionRunState,
  projectProductionRunState,
} from "../../scripts/production/domain/projection";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const occurredAt = "2026-08-04T00:00:00.000Z";

test("production Run policy has one validated fingerprinted default", () => {
  assert.deepEqual(DEFAULT_PRODUCTION_RUN_POLICY, {
    pollIntervalMs: 1_000,
    sceneTimeoutMs: 30 * 60 * 1_000,
  });
  assert.deepEqual(
    ProductionRunPolicySchema.parse(DEFAULT_PRODUCTION_RUN_POLICY),
    DEFAULT_PRODUCTION_RUN_POLICY,
  );
  assert.throws(() =>
    ProductionRunPolicySchema.parse({
      pollIntervalMs: 2_000,
      sceneTimeoutMs: 1_000,
    }),
  );
});

const run = createProductionRunManifest({
  runId: "story-example-run-001",
  storyId: "story-example",
  requirementsPath: "src/projects/story-example/production/requirements.json",
  requirementsFingerprint: sha("a"),
  policy: { pollIntervalMs: 25, sceneTimeoutMs: 2_000 },
  createdAt: occurredAt,
});

const requirementsInput = [
  { artifactId: "requirements", fingerprint: run.requirementsFingerprint },
] as const satisfies readonly ProductionFingerprintRef[];

const stageEvent = ({
  type,
  stageId,
  sequence,
  previousStateFingerprint,
  suffix,
}: {
  readonly type: "stage-started" | "stage-succeeded";
  readonly stageId:
    | "production-start"
    | "narrative"
    | "scene-freeze"
    | "scenes"
    | "post-scene";
  readonly sequence: number;
  readonly previousStateFingerprint: string;
  readonly suffix: string;
}) =>
  createProductionStageEvent(
    type === "stage-started"
      ? {
          type,
          runId: run.runId,
          storyId: run.storyId,
          sequence,
          eventId: `${stageId}-started-${suffix}`,
          stageId,
          attempt: 1,
          occurredAt,
          commandId: `${stageId}-command`,
          previousStateFingerprint,
          inputFingerprints: requirementsInput,
        }
      : {
          type,
          runId: run.runId,
          storyId: run.storyId,
          sequence,
          eventId: `${stageId}-succeeded-${suffix}`,
          stageId,
          attempt: 1,
          occurredAt,
          commandId: `${stageId}-command`,
          previousStateFingerprint,
          inputFingerprints: requirementsInput,
          outputArtifacts: [
            {
              artifactId: `${stageId}-output-${suffix}`,
              repositoryPath: `out/story-example/${stageId}-${suffix}.json`,
              fingerprint: sha(suffix),
            },
          ],
        },
  );

test("projects the legal production lifecycle from append-only events", () => {
  const events = [];
  let state = createInitialProductionRunState(run);
  assert.equal(state.state, "initialized");

  const start = stageEvent({
    type: "stage-succeeded",
    stageId: "production-start",
    sequence: 1,
    previousStateFingerprint: state.stateFingerprint,
    suffix: "1",
  });
  events.push(start);
  state = projectProductionRunState({ run, events });
  assert.equal(state.state, "initialized");

  const narrativeStarted = stageEvent({
    type: "stage-started",
    stageId: "narrative",
    sequence: 2,
    previousStateFingerprint: state.stateFingerprint,
    suffix: "2",
  });
  events.push(narrativeStarted);
  state = projectProductionRunState({ run, events });
  assert.equal(state.state, "narrative-running");

  events.push(
    stageEvent({
      type: "stage-succeeded",
      stageId: "narrative",
      sequence: 3,
      previousStateFingerprint: state.stateFingerprint,
      suffix: "3",
    }),
  );
  state = projectProductionRunState({ run, events });
  assert.equal(state.state, "baseline-ready");

  events.push(
    stageEvent({
      type: "stage-succeeded",
      stageId: "scene-freeze",
      sequence: 4,
      previousStateFingerprint: state.stateFingerprint,
      suffix: "4",
    }),
  );
  state = projectProductionRunState({ run, events });
  assert.equal(state.state, "scene-inputs-frozen");

  events.push(
    stageEvent({
      type: "stage-started",
      stageId: "scenes",
      sequence: 5,
      previousStateFingerprint: state.stateFingerprint,
      suffix: "5",
    }),
  );
  state = projectProductionRunState({ run, events });
  assert.equal(state.state, "scenes-running");

  events.push(
    createProductionStageEvent({
      type: "scene-result-accepted",
      runId: run.runId,
      storyId: run.storyId,
      sequence: 6,
      eventId: "opening-result-accepted",
      stageId: "scenes",
      attempt: 1,
      occurredAt,
      commandId: "production-watch",
      previousStateFingerprint: state.stateFingerprint,
      inputFingerprints: requirementsInput,
      meaningId: "opening",
      sceneResultFingerprint: sha("6"),
      outputArtifacts: [
        {
          artifactId: "scene-result-opening",
          repositoryPath:
            ".producer-runs/story-example-run-001/scene-results/opening.json",
          fingerprint: sha("6"),
        },
      ],
    }),
  );
  state = projectProductionRunState({ run, events });
  assert.equal(state.state, "scenes-running");
  assert.deepEqual(state.acceptedSceneResults, [
    { meaningId: "opening", resultFingerprint: sha("6") },
  ]);

  events.push(
    stageEvent({
      type: "stage-succeeded",
      stageId: "scenes",
      sequence: 7,
      previousStateFingerprint: state.stateFingerprint,
      suffix: "7",
    }),
  );
  state = projectProductionRunState({ run, events });
  assert.equal(state.state, "post-scene-running");

  events.push(
    stageEvent({
      type: "stage-succeeded",
      stageId: "post-scene",
      sequence: 8,
      previousStateFingerprint: state.stateFingerprint,
      suffix: "8",
    }),
  );
  state = projectProductionRunState({ run, events });

  events.push(
    createProductionStageEvent({
      type: "preview-ready",
      runId: run.runId,
      storyId: run.storyId,
      sequence: 9,
      eventId: "preview-ready-9",
      stageId: "preview",
      attempt: 1,
      occurredAt,
      commandId: "production-watch",
      previousStateFingerprint: state.stateFingerprint,
      inputFingerprints: requirementsInput,
      outputArtifacts: [
        {
          artifactId: "production-preview-evidence",
          repositoryPath:
            "src/projects/story-example/generated/production-preview-evidence.generated.json",
          fingerprint: sha("9"),
        },
      ],
      status: "preview-ready",
      handoff: "awaiting explicit user preview decision",
    }),
  );
  state = projectProductionRunState({ run, events });
  assert.equal(state.state, "preview-ready");
  assert.equal(state.lastSequence, 9);
  assert.equal(state.failure, null);
});

test("rejects illegal transitions, out-of-order events, and stale previous state", () => {
  const initial = createInitialProductionRunState(run);
  const illegal = createProductionStageEvent({
    type: "preview-ready",
    runId: run.runId,
    storyId: run.storyId,
    sequence: 1,
    eventId: "illegal-preview-ready",
    stageId: "preview",
    attempt: 1,
    occurredAt,
    commandId: "production-watch",
    previousStateFingerprint: initial.stateFingerprint,
    inputFingerprints: requirementsInput,
    outputArtifacts: [
      {
        artifactId: "preview",
        repositoryPath: "out/story-example/preview.mp4",
        fingerprint: sha("1"),
      },
    ],
    status: "preview-ready",
    handoff: "awaiting explicit user preview decision",
  });
  assert.throws(() => projectProductionRunState({ run, events: [illegal] }));

  const first = stageEvent({
    type: "stage-started",
    stageId: "narrative",
    sequence: 1,
    previousStateFingerprint: initial.stateFingerprint,
    suffix: "1",
  });
  const afterFirst = projectProductionRunState({ run, events: [first] });
  const gap = stageEvent({
    type: "stage-succeeded",
    stageId: "narrative",
    sequence: 3,
    previousStateFingerprint: afterFirst.stateFingerprint,
    suffix: "3",
  });
  assert.throws(
    () => projectProductionRunState({ run, events: [first, gap] }),
    /sequence/i,
  );

  const stale = stageEvent({
    type: "stage-succeeded",
    stageId: "narrative",
    sequence: 2,
    previousStateFingerprint: initial.stateFingerprint,
    suffix: "2",
  });
  assert.throws(
    () => projectProductionRunState({ run, events: [first, stale] }),
    /previous state/i,
  );
});

test("fails closed when a current input fingerprint drifts", () => {
  const initial = createInitialProductionRunState(run);
  const event = stageEvent({
    type: "stage-started",
    stageId: "narrative",
    sequence: 1,
    previousStateFingerprint: initial.stateFingerprint,
    suffix: "1",
  });
  assert.throws(
    () =>
      projectProductionRunState({
        run,
        events: [event],
        currentInputFingerprints: [
          { artifactId: "requirements", fingerprint: sha("f") },
        ],
      }),
    /current input fingerprint/i,
  );
});

test("a failed event is the only way an active run becomes failed", () => {
  const initial = createInitialProductionRunState(run);
  const started = stageEvent({
    type: "stage-started",
    stageId: "narrative",
    sequence: 1,
    previousStateFingerprint: initial.stateFingerprint,
    suffix: "1",
  });
  const running = projectProductionRunState({ run, events: [started] });
  const failed = createProductionStageEvent({
    type: "stage-failed",
    runId: run.runId,
    storyId: run.storyId,
    sequence: 2,
    eventId: "narrative-failed-2",
    stageId: "narrative",
    attempt: 1,
    occurredAt,
    commandId: "production-narrative",
    previousStateFingerprint: running.stateFingerprint,
    inputFingerprints: requirementsInput,
    error: {
      schemaVersion: 1,
      kind: "expected",
      code: "NARRATION_FAILED",
      stageId: "narrative",
      scope: "narrative",
      meaningId: null,
      summary: "Narration generation failed.",
      description: "The fake provider returned an expected failure.",
      retryable: true,
      remediation: "Resume the same generation input.",
      commandId: "production-narrative",
      inputFingerprint: run.requirementsFingerprint,
      redactionApplied: false,
    },
  });
  const state = projectProductionRunState({ run, events: [started, failed] });
  assert.equal(state.state, "failed");
  assert.equal(state.failure?.code, "NARRATION_FAILED");
});
