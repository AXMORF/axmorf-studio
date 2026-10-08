import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  ProjectRevisionEditableAuthoringSchema,
  SceneTaskInputSchema,
  buildSceneProductionBrief,
  buildSilentScenePreset,
  computeSceneContinuityId,
  computeSceneTaskInputFingerprint,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import { buildAgentTasks } from "../../scripts/project-production/application/build-current-plan";
import { buildCurrentProductionRevision } from "../../scripts/project-production/application/current-revision";
import { loadProjectProductionInputs } from "../../scripts/project-production/application/load-inputs";
import { prepareNarrationInputs } from "../../scripts/project-production/application/prepare-fixed-tasks";
import {
  createProject,
  projectPendingSceneAuthoring,
} from "../../scripts/projects/application/create-project";
import { affectedPriorSourceMeaningIds } from "../../scripts/projects/application/scene-prior-source";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const meaningIds = ["begin", "move", "settle", "hold"];
const subject = "The same ribbon crosses both authored Scene owners.";
const trackedState = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
  reveal: 1,
  value: 0,
};
const authoredInput = {
  ...validProjectCreateInput,
  story: {
    ...validProjectCreateInput.story,
    timingSource: "authored-frames",
    beats: meaningIds.map((meaningId) => ({
      kind: "silent-scene",
      meaningId,
      narrativePurpose: `Express ${meaningId} through the ribbon.`,
      preset: buildSilentScenePreset({
        presetId: meaningId,
        durationInFrames: 60,
        visualIntent: "Retain the ribbon in one shared world.",
        soundIntent: "No narration or sound effects.",
        resourceIds: [],
        implementation: { kind: "scene-owner" },
      }),
    })),
    visualScenes: [
      { meaningIds: meaningIds.slice(0, 2) },
      { meaningIds: meaningIds.slice(2) },
    ],
  },
  scenes: meaningIds.map((meaningId, index) => ({
    ...validProjectCreateInput.scenes[0],
    meaningId,
    visualIntent: "Retain the ribbon in one shared world.",
    soundIntent: "No narration or sound effects.",
    motionIntent: `Express ${meaningId} continuously.`,
    ...(index === 0
      ? { outgoingHandoff: { subject: "An internal Beat promise." } }
      : index === 1
        ? { outgoingHandoff: { subject, trackedState } }
        : {}),
  })),
  publishing: { ...validProjectCreateInput.publishing, chapters: [] },
  production: {
    ...validProjectCreateInput.production,
    additionalRequirements: [
      {
        requirementId: "second-beat-follow",
        scope: "scene",
        targetMeaningIds: ["move"],
        category: "visual",
        statement: "Retain the moving ribbon until it crosses the seam.",
        owner: "scene-agent",
        verification: "contract",
        severity: "error",
      },
    ],
  },
};

const editable = (scenes = authoredInput.scenes) =>
  ProjectRevisionEditableAuthoringSchema.parse({
    brief: authoredInput.brief,
    story: authoredInput.story,
    visualStyle: authoredInput.visualStyle,
    scenes,
    globalVisual: authoredInput.globalVisual,
    publishing: authoredInput.publishing,
  });

test("authored grouped create and source loading freeze one shared owner seam and retain every original member in task context", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const rootDir = fixture.rootDir;
  const repositoryRoot = join(import.meta.dirname, "../..");
  await cp(join(repositoryRoot, "scripts"), join(rootDir, "scripts"), {
    recursive: true,
  });
  for (const directory of ["contracts", "remotion"]) {
    await mkdir(join(rootDir, "src"), { recursive: true });
    await cp(
      join(repositoryRoot, "packages/studio/src", directory),
      join(rootDir, "src", directory),
      { recursive: true },
    );
  }
  for (const path of [
    "package.json",
    "package-lock.json",
    "remotion.config.ts",
  ]) {
    await cp(join(repositoryRoot, path), join(rootDir, path));
  }
  await writeProjectCreateJson(fixture.inputPath, authoredInput);
  await createProject({
    rootDir,
    projectId: authoredInput.storyId,
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
    runtimeResources: fixture.runtimeResources,
  });
  await prepareNarrationInputs({
    rootDir,
    projectId: authoredInput.storyId,
    env: { RSP_PRODUCER_CONFIG: "/missing/no-provider-configuration.json" },
  });
  await projectPendingSceneAuthoring({
    rootDir,
    projectId: authoredInput.storyId,
  });
  const load = () =>
    loadProjectProductionInputs({ rootDir, projectId: authoredInput.storyId });
  const inputs = await load();
  assert.deepEqual(
    inputs.sceneInputs.map(({ meaningId }) => meaningId),
    ["begin", "settle"],
  );
  assert.equal(inputs.sceneInputs[0].taskInput.schemaVersion, 8);
  assert.equal(
    inputs.sceneInputs[0].timingBeat.endFrame -
      inputs.sceneInputs[0].timingBeat.startFrame,
    120,
  );
  const outgoing =
    inputs.sceneInputs[0].taskInput.continuity.handoffs!.outgoing;
  const incoming =
    inputs.sceneInputs[1].taskInput.continuity.handoffs!.incoming;
  assert.equal(outgoing.kind, "continuous");
  assert.deepEqual(outgoing, incoming);
  assert.ok(outgoing.kind === "continuous");
  assert.equal(outgoing.subject, subject);
  assert.deepEqual(outgoing.trackedState, trackedState);
  assert.equal(
    outgoing.continuityId,
    computeSceneContinuityId(authoredInput.storyId, "begin", "settle"),
  );
  assert.notEqual(
    outgoing.continuityId,
    computeSceneContinuityId(authoredInput.storyId, "move", "settle"),
  );
  assert.equal(
    inputs.sceneInputs[1].taskInput.continuity.handoffs!.outgoing.kind,
    "end",
  );
  const forgedTask = {
    ...inputs.sceneInputs[0].taskInput,
    continuity: {
      ...inputs.sceneInputs[0].taskInput.continuity,
      nextMeaningId: "move",
    },
  };
  const forged = SceneTaskInputSchema.safeParse({
    ...forgedTask,
    taskInputFingerprint: computeSceneTaskInputFingerprint(forgedTask),
  });
  assert.equal(forged.success, false);
  assert.ok(
    !forged.success &&
      forged.error.issues.some(
        ({ message }) =>
          message === "Scene handoff identity is cross-bound to its adjacency.",
      ),
  );
  assert.equal(
    inputs.sceneInputs[0].taskInput.sceneRequirements.some(
      ({ requirementId }) => requirementId === "second-beat-follow",
    ),
    true,
  );
  const tasks = buildAgentTasks(
    inputs,
    buildCurrentProductionRevision(inputs).revisionId,
  );
  const owner = tasks.find(({ task }) => task.semanticId === "begin")!;
  const ownerContext = JSON.parse(owner.contextBytes).scene;
  assert.deepEqual(
    ownerContext.taskInput.coveredBeats.map(
      ({ storyBeat }: { storyBeat: { meaningId: string } }) =>
        storyBeat.meaningId,
    ),
    ["begin", "move"],
  );
  assert.deepEqual(
    ownerContext.coveredBriefs.map(
      ({ meaningId }: { meaningId: string }) => meaningId,
    ),
    ["begin", "move"],
  );
  assert.equal(
    ownerContext.coveredBriefs[0].outgoingHandoff.subject,
    "An internal Beat promise.",
  );
  assert.equal(
    ownerContext.coveredBriefs[1].motionIntent,
    authoredInput.scenes[1].motionIntent,
  );
  assert.equal(
    ownerContext.taskInput.continuity.handoffs.outgoing.subject,
    subject,
  );

  const briefPath = join(
    rootDir,
    "src/projects",
    authoredInput.storyId,
    "production/scene-production-brief.json",
  );
  const rawBrief = JSON.parse(await readFile(briefPath, "utf8"));
  delete rawBrief.briefFingerprint;
  const updateBrief = async (changedScenes: typeof authoredInput.scenes) => {
    const next = buildSceneProductionBrief({
      ...rawBrief,
      scenes: changedScenes,
    });
    await writeFile(briefPath, `${serializeCanonicalJson(next)}\n`);
    const changedInputs = await load();
    return buildAgentTasks(
      changedInputs,
      buildCurrentProductionRevision(changedInputs).revisionId,
    );
  };
  const taskRevision = (values: typeof tasks, meaningId: string) =>
    values.find(({ task }) => task.semanticId === meaningId)!.task.taskRevision;
  const changedInternal = authoredInput.scenes.map((scene, index) =>
    index === 0
      ? {
          ...scene,
          outgoingHandoff: { subject: "A revised internal promise." },
        }
      : scene,
  );
  const internalTasks = await updateBrief(changedInternal);
  assert.notEqual(
    taskRevision(internalTasks, "begin"),
    taskRevision(tasks, "begin"),
  );
  assert.equal(
    taskRevision(internalTasks, "settle"),
    taskRevision(tasks, "settle"),
  );
  const changedExternal = authoredInput.scenes.map((scene, index) =>
    index === 1
      ? {
          ...scene,
          outgoingHandoff: {
            subject: "The revised shared ribbon.",
            trackedState,
          },
        }
      : scene,
  );
  const externalTasks = await updateBrief(changedExternal);
  for (const meaningId of ["begin", "settle"]) {
    assert.notEqual(
      taskRevision(externalTasks, meaningId),
      taskRevision(tasks, meaningId),
    );
  }
});

test("authored grouped priorSource invalidation follows the external seam while internal promises stay local to their owner", () => {
  const before = editable();
  const changedInternal = editable(
    authoredInput.scenes.map((scene, index) =>
      index === 0
        ? {
            ...scene,
            outgoingHandoff: { subject: "A revised internal promise." },
          }
        : scene,
    ),
  );
  assert.deepEqual(
    affectedPriorSourceMeaningIds({ before, after: changedInternal }),
    ["begin"],
  );
  const changedExternal = editable(
    authoredInput.scenes.map((scene, index) =>
      index === 1
        ? {
            ...scene,
            outgoingHandoff: {
              subject: "The revised shared ribbon.",
              trackedState,
            },
          }
        : scene,
    ),
  );
  assert.deepEqual(
    affectedPriorSourceMeaningIds({ before, after: changedExternal }),
    ["begin", "settle"],
  );
});
