import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  SCENE_PRIOR_SOURCE_PATH,
  MeaningIdSchema,
  ProjectRevisionEditableAuthoringSchema,
  ScenePriorSourceSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV7,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  computeUtf8Checksum,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import { collectRendererSourceGraph } from "../../scripts/renderer-registry/domain";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import {
  affectedPriorSourceMeaningIds,
  freezeRevisionScenePriorSources,
  readScenePriorSourceIndex,
  snapshotScenePriorSource,
} from "../../scripts/projects/application/scene-prior-source";
import { createScenePackageInput } from "../fixtures/scene/package-input";
import { validProjectCreateInput } from "../fixtures/project-create";

const storyId = "synthetic-proof";
const authoring = () =>
  ProjectRevisionEditableAuthoringSchema.parse({
    brief: { ...validProjectCreateInput.brief, storyId },
    story: {
      ...validProjectCreateInput.story,
      storyId,
      beats: ["meaning-one", "meaning-two"].map((meaningId) => ({
        ...validProjectCreateInput.story.beats[0],
        meaningId,
        ttsChunks: [
          { chunkId: `${meaningId}-01`, ttsText: "Explain the owning Scene." },
        ],
      })),
    },
    visualStyle: validProjectCreateInput.visualStyle,
    scenes: ["meaning-one", "meaning-two"].map((meaningId) => ({
      ...validProjectCreateInput.scenes[0],
      meaningId,
    })),
    globalVisual: validProjectCreateInput.globalVisual,
    publishing: {
      ...validProjectCreateInput.publishing,
      chapters: ["meaning-one", "meaning-two"].map((meaningId, index) => ({
        meaningId,
        name: index === 0 ? "场景一" : "场景二",
      })),
    },
  });

const writeScene = async (
  rootDir: string,
  meaningId: string,
  marker: string,
) => {
  const fixture = createScenePackageInput();
  const sceneRoot = `src/projects/${storyId}/scenes/${meaningId}`;
  const task = buildSceneTaskInputV7({
    ...fixture.task,
    meaningId,
    storyBeat: { ...fixture.task.storyBeat, meaningId },
    timingBeat: { ...fixture.task.timingBeat, meaningId },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot: `public/projects/${storyId}/scenes/${meaningId}`,
    },
  });
  const identity = {
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId,
  };
  const visual = buildSceneVisualPlan({ ...fixture.visual, ...identity });
  const shots = buildShotPlanSet({ ...fixture.shots, ...identity });
  const anchors = buildSceneSyncAnchors({ ...fixture.anchors, ...identity });
  const sound = buildSceneSoundPlan({ ...fixture.sound, ...identity });
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: task.taskInputFingerprint,
    selections: [],
  });
  const fidelityReceipt = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: "empty",
  });
  const sources = {
    "Renderer.tsx":
      'import type {SceneRendererProps} from "@axmorf/studio/remotion";\nimport type {Label} from "./types";\nimport {label} from "./label";\nconst Renderer = ({viewportWidth, viewportHeight}: SceneRendererProps) => {const value: Label = label; return <div style={{width: viewportWidth, height: viewportHeight}} data-label={value} />;};\nexport default Renderer;\n',
    "label.ts": `export const label = ${JSON.stringify(marker)};\n`,
    "types.d.ts": "export type Label = string;\n",
    LICENSE: "Apache-2.0\nRetain attribution.\n",
    "localization-manifest.generated.json": '{"lineage":"owning-scene"}\n',
  };
  for (const [path, bytes] of Object.entries(sources)) {
    const target = join(rootDir, sceneRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const graph = await collectRendererSourceGraph({
    rootDir,
    projectId: storyId,
    rendererPath: `${sceneRoot}/Renderer.tsx`,
  });
  const scenePackage = buildScenePackage({
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResources: fixture.selectedResources,
    rendererBinding: {
      rendererId: `${storyId}-${meaningId}`,
      rendererSourceFingerprint: graph.sourceGraphFingerprint,
    },
    current: {
      ...fixture.current,
      timingBeat: task.timingBeat,
      rendererSourceFingerprint: graph.sourceGraphFingerprint,
    },
  });
  const declarations = {
    "task-input.generated.json": task,
    "generated/scene-package.generated.json": scenePackage,
    "visual-plan.json": visual,
    "shot-plan.json": shots,
    "sync-anchors.json": anchors,
    "sound-plan.json": sound,
    "shot-recipe-selection.json": selection,
    "generated/reference-fidelity.generated.json": fidelityReceipt,
    "selected-resources.json": {
      schemaVersion: 1,
      selectedResources: fixture.selectedResources,
    },
  };
  for (const [path, value] of Object.entries(declarations)) {
    const target = join(rootDir, sceneRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${serializeCanonicalJson(value)}\n`);
  }
  return { task, graph, scenePackage, sources };
};

const rootFixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-prior-scene-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, `src/projects/${storyId}/production`), {
    recursive: true,
  });
  await writeScene(rootDir, "meaning-one", "base-one");
  await writeScene(rootDir, "meaning-two", "base-two");
  return rootDir;
};

test("only the changed local brief and real continuous seam receive new prior Scene inputs", () => {
  const before = authoring();
  const after = ProjectRevisionEditableAuthoringSchema.parse({
    ...before,
    scenes: before.scenes.map((scene, index) =>
      index === 0
        ? { ...scene, compositionIntent: "Move the existing label down." }
        : scene,
    ),
  });
  assert.deepEqual(affectedPriorSourceMeaningIds({ before, after }), [
    "meaning-one",
  ]);
  const seam = ProjectRevisionEditableAuthoringSchema.parse({
    ...before,
    scenes: before.scenes.map((scene, index) =>
      index === 0
        ? { ...scene, outgoingHandoff: { subject: "Shared subject" } }
        : scene,
    ),
  });
  assert.deepEqual(affectedPriorSourceMeaningIds({ before, after: seam }), [
    "meaning-one",
    "meaning-two",
  ]);
  const publishing = ProjectRevisionEditableAuthoringSchema.parse({
    ...before,
    publishing: {
      ...before.publishing,
      description: "New publishing description.",
    },
  });
  assert.deepEqual(
    affectedPriorSourceMeaningIds({ before, after: publishing }),
    [],
  );
});

test("freezing verifies runtime closure while retaining all local source, declarations, license and lineage", async (context) => {
  const rootDir = await rootFixture(context);
  const brief = authoring().scenes[0];
  const snapshot = await snapshotScenePriorSource({
    rootDir,
    storyId,
    meaningId: brief.meaningId,
    brief,
  });
  assert.ok(snapshot);
  assert.deepEqual(
    snapshot.files
      .filter(({ role }) => role === "source")
      .map(({ path }) => path),
    ["label.ts", "Renderer.tsx", "types.d.ts"],
  );
  assert.ok(
    snapshot.files.some(
      ({ path, role }) => path === "LICENSE" && role === "license",
    ),
  );
  assert.ok(
    snapshot.files.some(
      ({ path, role }) =>
        path === "localization-manifest.generated.json" && role === "lineage",
    ),
  );
  assert.ok(snapshot.files.some(({ path }) => path === "shot-plan.json"));
  const graph = await collectRendererSourceGraph({
    rootDir,
    projectId: storyId,
    rendererPath: `src/projects/${storyId}/scenes/meaning-one/Renderer.tsx`,
  });
  assert.equal(
    graph.files.some(({ sourcePath }) => sourcePath.endsWith("types.d.ts")),
    false,
  );
  assert.equal(
    snapshot.rendererSourceFingerprint,
    graph.sourceGraphFingerprint,
  );
  assert.equal(
    snapshot.files.every(
      (file) =>
        file.checksum === computeUtf8Checksum(file.content) &&
        file.sizeBytes === Buffer.byteLength(file.content),
    ),
    true,
  );
  assert.equal(JSON.stringify(snapshot).includes(rootDir), false);
  const planPath = join(
    rootDir,
    `src/projects/${storyId}/scenes/meaning-one/visual-plan.json`,
  );
  const planBytes = await readFile(planPath, "utf8");
  const changedPlan = buildSceneVisualPlan({
    ...JSON.parse(planBytes),
    primaryComposition: "A valid but unmaterialized plan change.",
  });
  await writeFile(planPath, `${serializeCanonicalJson(changedPlan)}\n`);
  await assert.rejects(
    snapshotScenePriorSource({
      rootDir,
      storyId,
      meaningId: brief.meaningId,
      brief,
    }),
    /package declarations are stale/u,
  );
  await writeFile(planPath, planBytes);
  await writeFile(
    join(rootDir, `src/projects/${storyId}/scenes/meaning-one/label.ts`),
    'export const label = "drift";\n',
  );
  await assert.rejects(
    snapshotScenePriorSource({
      rootDir,
      storyId,
      meaningId: brief.meaningId,
      brief,
    }),
    /renderer source graph is stale/u,
  );
});

test("promotion preserves frozen inputs and a later B revision retains A while freezing the new current B", async (context) => {
  const rootDir = await rootFixture(context);
  const before = authoring();
  const afterA = ProjectRevisionEditableAuthoringSchema.parse({
    ...before,
    scenes: before.scenes.map((scene, index) =>
      index === 0
        ? { ...scene, compositionIntent: "Move only A's label." }
        : scene,
    ),
  });
  const indexA = await freezeRevisionScenePriorSources({
    rootDir,
    runtimeRootDir: rootDir,
    before,
    after: afterA,
  });
  assert.ok(indexA);
  assert.deepEqual(
    indexA.scenes.map(({ meaningId }) => meaningId),
    ["meaning-one"],
  );
  const path = `src/projects/${storyId}/${SCENE_PRIOR_SOURCE_PATH}`;
  await writeFile(join(rootDir, path), `${serializeCanonicalJson(indexA)}\n`);
  // Production may change materialized Scene outputs, never this frozen authoring input.
  await writeScene(rootDir, "meaning-one", "produced-A");
  const promotedRoot = await mkdtemp(join(tmpdir(), "axmorf-prior-promoted-"));
  context.after(() => rm(promotedRoot, { recursive: true, force: true }));
  await cp(join(rootDir, "src"), join(promotedRoot, "src"), {
    recursive: true,
  });
  assert.deepEqual(
    await readScenePriorSourceIndex({ rootDir: promotedRoot, storyId }),
    indexA,
  );
  const noChange = await freezeRevisionScenePriorSources({
    rootDir: promotedRoot,
    runtimeRootDir: promotedRoot,
    before: afterA,
    after: afterA,
  });
  assert.deepEqual(noChange, indexA);
  const afterB = ProjectRevisionEditableAuthoringSchema.parse({
    ...afterA,
    scenes: afterA.scenes.map((scene, index) =>
      index === 1
        ? { ...scene, compositionIntent: "Move only B's label." }
        : scene,
    ),
  });
  const indexB = await freezeRevisionScenePriorSources({
    rootDir: promotedRoot,
    runtimeRootDir: promotedRoot,
    before: afterA,
    after: afterB,
  });
  assert.ok(indexB);
  assert.deepEqual(indexB.scenes[0], indexA.scenes[0]);
  assert.equal(
    indexB.scenes[1].files.find(({ path }) => path === "label.ts")?.content,
    'export const label = "base-two";\n',
  );
});

test("prior input reads reject file/parent symlinks, path escape, duplicate paths and checksum drift", async (context) => {
  const rootDir = await rootFixture(context);
  const brief = authoring().scenes[0];
  const snapshot = await snapshotScenePriorSource({
    rootDir,
    storyId,
    meaningId: brief.meaningId,
    brief,
  });
  assert.ok(snapshot);
  const first = snapshot.files[0];
  for (const files of [
    [
      { ...first, content: `${first.content}drift` },
      ...snapshot.files.slice(1),
    ],
    [{ ...first, path: "../other/Renderer.tsx" }, ...snapshot.files.slice(1)],
    [first, ...snapshot.files],
  ]) {
    assert.equal(
      ScenePriorSourceSchema.safeParse({ ...snapshot, files }).success,
      false,
    );
  }
  const scenePath = join(rootDir, `src/projects/${storyId}/scenes/meaning-one`);
  await rm(join(scenePath, "types.d.ts"));
  await symlink(
    join(rootDir, `src/projects/${storyId}/scenes/meaning-two/types.d.ts`),
    join(scenePath, "types.d.ts"),
  );
  await assert.rejects(
    snapshotScenePriorSource({
      rootDir,
      storyId,
      meaningId: brief.meaningId,
      brief,
    }),
    /unsafe entry/u,
  );
  await rm(join(scenePath, "types.d.ts"));
  await writeFile(
    join(scenePath, "types.d.ts"),
    "export type Label = string;\n",
  );
  await writeFile(
    join(scenePath, "Renderer.tsx"),
    'import Renderer from "../meaning-two/Renderer";\nexport default Renderer;\n',
  );
  await assert.rejects(
    snapshotScenePriorSource({
      rootDir,
      storyId,
      meaningId: brief.meaningId,
      brief,
    }),
    /escapes its meaning-local source/u,
  );
  const inputPath = join(
    rootDir,
    `src/projects/${storyId}/${SCENE_PRIOR_SOURCE_PATH}`,
  );
  await writeFile(
    inputPath,
    `${serializeCanonicalJson({ schemaVersion: 1, contractVersion: "scene-prior-source-index-v1", storyId, scenes: [snapshot] })}\n`,
  );
  const saved = await readFile(inputPath);
  await rm(inputPath);
  const outside = join(rootDir, "outside-index.json");
  await writeFile(outside, saved);
  await symlink(outside, inputPath);
  await assert.rejects(
    readScenePriorSourceIndex({ rootDir, storyId }),
    /regular non-symbolic/u,
  );
  const production = join(rootDir, `src/projects/${storyId}/production`);
  await rename(production, `${production}-saved`);
  await symlink(`${production}-saved`, production);
  await assert.rejects(
    readScenePriorSourceIndex({ rootDir, storyId }),
    /directory chain is unsafe/u,
  );
});

test("an unauthored new Scene has no prior source to claim", async (context) => {
  const rootDir = await rootFixture(context);
  const brief = {
    ...authoring().scenes[0],
    meaningId: MeaningIdSchema.parse("new-scene"),
  };
  assert.equal(
    await snapshotScenePriorSource({
      rootDir,
      storyId,
      meaningId: brief.meaningId,
      brief,
    }),
    null,
  );
  await rm(
    join(rootDir, `src/projects/${storyId}/scenes/meaning-one/Renderer.tsx`),
  );
  const currentBrief = authoring().scenes[0];
  await assert.rejects(
    snapshotScenePriorSource({
      rootDir,
      storyId,
      meaningId: currentBrief.meaningId,
      brief: currentBrief,
    }),
    { code: "ENOENT" },
  );
});
