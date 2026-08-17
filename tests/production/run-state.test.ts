import assert from "node:assert/strict";
import test from "node:test";

import {
  createProductionRunManifest,
  type ProductionStageEvent,
} from "../../src/contracts/production-run";
import { createProductionStageEvent } from "../../scripts/production/domain/events";
import {
  createInitialProductionRunState,
  projectProductionRunState,
} from "../../scripts/production/domain/projection";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const occurredAt = "2026-08-09T00:00:00.000Z";
const run = createProductionRunManifest({
  runId: "story-example-run-001",
  storyId: "story-example",
  requirementsPath: "src/projects/story-example/production/requirements.json",
  requirementsFingerprint: sha("a"),
  createdAt: occurredAt,
});

test("projects the current lifecycle through render-ready", () => {
  const events: ProductionStageEvent[] = [];
  let state = createInitialProductionRunState(run);
  const append = (raw: Parameters<typeof createProductionStageEvent>[0]) => {
    const event = createProductionStageEvent(raw);
    events.push(event);
    state = projectProductionRunState({ run, events });
  };
  const common = () => ({
    runId: run.runId,
    storyId: run.storyId,
    sequence: state.lastSequence + 1,
    attempt: 1,
    occurredAt,
    previousStateFingerprint: state.stateFingerprint,
    inputFingerprints: [
      { artifactId: "requirements", fingerprint: run.requirementsFingerprint },
    ],
  });
  const succeed = (stageId: "production-start" | "narrative" | "scene-freeze" | "scenes" | "render-ready") =>
    append({
      ...common(),
      type: "stage-succeeded",
      eventId: `${stageId}-succeeded-${state.lastSequence + 1}`,
      stageId,
      commandId: `production-${stageId}`,
      outputArtifacts: [
        {
          artifactId: `${stageId}.output`,
          repositoryPath: `artifacts/${stageId}.json`,
          fingerprint: sha(String((state.lastSequence % 9) + 1)),
        },
      ],
    });
  const start = (stageId: "narrative" | "scene-freeze" | "scenes" | "render-ready") =>
    append({
      ...common(),
      type: "stage-started",
      eventId: `${stageId}-started-${state.lastSequence + 1}`,
      stageId,
      commandId: `production-${stageId}`,
    });

  succeed("production-start");
  start("narrative");
  succeed("narrative");
  start("scene-freeze");
  succeed("scene-freeze");
  start("scenes");
  append({
    ...common(),
    type: "scene-result-accepted",
    eventId: "scene-opening-accepted",
    stageId: "scenes",
    commandId: "production-finalize",
    meaningId: "opening",
    sceneResultFingerprint: sha("b"),
    outputArtifacts: [
      {
        artifactId: "scene-result.opening",
        repositoryPath: ".producer-runs/story-example-run-001/scene-results/opening.json",
        fingerprint: sha("b"),
      },
    ],
  });
  append({
    ...common(),
    type: "global-visual-result-accepted",
    eventId: "global-visual-accepted",
    stageId: "scenes",
    commandId: "production-finalize",
    globalVisualResultFingerprint: sha("c"),
    outputArtifacts: [
      {
        artifactId: "global-visual-result",
        repositoryPath: ".producer-runs/story-example-run-001/global-visual-result.json",
        fingerprint: sha("c"),
      },
    ],
  });
  succeed("scenes");
  assert.equal(state.state, "render-ready-running");
  start("render-ready");
  succeed("render-ready");
  append({
    ...common(),
    type: "render-ready",
    eventId: "render-ready-terminal",
    stageId: "render-ready",
    commandId: "production-render-ready",
    status: "render-ready",
    handoff: "awaiting-automatic-delivery",
    outputArtifacts: [
      {
        artifactId: "production-render-plan",
        repositoryPath: "src/projects/story-example/generated/production-render-plan.generated.json",
        fingerprint: sha("d"),
      },
      {
        artifactId: "production-render-ready",
        repositoryPath: "src/projects/story-example/generated/production-render-ready.generated.json",
        fingerprint: sha("e"),
      },
    ],
  });
  assert.equal(state.state, "render-ready");
  assert.deepEqual(state.acceptedGlobalVisualResult, {
    resultFingerprint: sha("c"),
  });
});

test("rejects duplicate events and stale current inputs", () => {
  const initial = createInitialProductionRunState(run);
  const event = createProductionStageEvent({
    type: "stage-started",
    runId: run.runId,
    storyId: run.storyId,
    sequence: 1,
    eventId: "narrative-started-1",
    stageId: "narrative",
    attempt: 1,
    occurredAt,
    commandId: "production-narrative",
    previousStateFingerprint: initial.stateFingerprint,
    inputFingerprints: [
      { artifactId: "requirements", fingerprint: run.requirementsFingerprint },
    ],
  });
  assert.throws(() => projectProductionRunState({ run, events: [event, event] }));
  assert.throws(() =>
    projectProductionRunState({
      run,
      events: [event],
      currentInputFingerprints: [
        { artifactId: "requirements", fingerprint: sha("f") },
      ],
    }),
  );
});
