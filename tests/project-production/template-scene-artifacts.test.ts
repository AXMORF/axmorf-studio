import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildAuthoringRequirements,
  buildProducerTaskSpec,
  buildProjectSoundPlan,
  buildSceneTaskInputV7,
  buildSceneTemplateInstance,
  buildSilentScenePreset,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  createFingerprint,
  RenderSpecSchema,
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
  serializeCanonicalJson,
  StorySpecSchema,
} from "../../src/contracts";
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import { inspectArtifact } from "../../scripts/project-production/adapters/artifact-store";
import { readTemplateSceneFilesForInspection } from "../../scripts/project-production/adapters/production-inspection";
import { ensureTemplateSceneArtifact } from "../../scripts/project-production/application/template-scene-artifacts";
import { readTemplateSceneFiles } from "../../scripts/project-production/application/prepare-fixed-tasks";
import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import {
  validNarrationSpec,
  validRenderSpec,
  validVideoBrief,
} from "../fixtures/narrative";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const digest = (value: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
const canonical = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

test("template readers exclude live-only Scene projections after materialization", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-template-live-view-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const storyId = "template-live-view";
  const meaningId = "intro";
  const sourceRoot = join(
    rootDir,
    "src/projects",
    storyId,
    "scenes",
    meaningId,
  );
  const publicRoot = join(
    rootDir,
    "public/projects",
    storyId,
    "scenes",
    meaningId,
  );
  await mkdir(join(sourceRoot, "generated"), { recursive: true });
  await mkdir(publicRoot, { recursive: true });
  await Promise.all([
    writeFile(
      join(sourceRoot, "Renderer.tsx"),
      "export default () => <div />;\n",
    ),
    writeFile(join(sourceRoot, "scene-template-instance.json"), "{}\n"),
    writeFile(join(sourceRoot, "selected-resources.json"), "{}\n"),
    writeFile(
      join(sourceRoot, "generated/scene-package.generated.json"),
      "{}\n",
    ),
    writeFile(join(sourceRoot, "task-input.generated.json"), "{}\n"),
    writeFile(join(publicRoot, "effect.wav"), "sound"),
  ]);
  const expected = [
    "public/effect.wav",
    "src/Renderer.tsx",
    "src/scene-template-instance.json",
    "src/selected-resources.json",
  ];
  assert.deepEqual(
    Object.keys(
      await readTemplateSceneFiles({
        locations,
        projectId: storyId,
        meaningId,
      }),
    ),
    expected,
  );
  assert.deepEqual(
    Object.keys(
      await readTemplateSceneFilesForInspection({
        locations,
        projectId: storyId,
        meaningId,
      }),
    ),
    expected,
  );
});

test("template reader maps Workspace-owned source and media roots", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-template-workspace-view-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(rootDir, "workspace"),
    applicationSupportRoot: join(rootDir, "application-support"),
    runtimeResources: join(import.meta.dirname, "../.."),
    cacheRoot: join(rootDir, "cache"),
  });
  const storyId = "template-workspace-view";
  const meaningId = "intro";
  const sourceRoot = join(
    locations.projectSourceRoot,
    storyId,
    "scenes",
    meaningId,
  );
  const mediaRoot = join(
    locations.projectMediaRoot,
    storyId,
    "scenes",
    meaningId,
  );
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(mediaRoot, { recursive: true });
  await writeFile(join(sourceRoot, "Renderer.tsx"), "renderer\n");
  await writeFile(join(mediaRoot, "effect.wav"), "sound");

  assert.deepEqual(
    Object.keys(
      await readTemplateSceneFiles({
        locations,
        projectId: storyId,
        meaningId,
      }),
    ),
    ["public/effect.wav", "src/Renderer.tsx"],
  );
});

test("fixed template preparation derives and commits the complete canonical Scene bundle", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-template-fixed-artifact-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const runtimeResources = join(rootDir, "runtime-pack");
  await mkdir(
    join(runtimeResources, "source/src/remotion/runtime/story-visual"),
    { recursive: true },
  );
  await mkdir(join(runtimeResources, "node_modules/react"), {
    recursive: true,
  });
  await cp(
    join(import.meta.dirname, "../../node_modules/typescript/lib"),
    join(runtimeResources, "node_modules/typescript/lib"),
    { recursive: true },
  );
  await writeFile(
    join(runtimeResources, "source/tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "Preserve",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
    })}\n`,
  );
  await writeFile(
    join(runtimeResources, "source/src/remotion/runtime/story-visual/types.ts"),
    "export type SceneRendererComponent = () => unknown;\n",
  );
  await writeFile(
    join(runtimeResources, "node_modules/react/jsx-runtime.d.ts"),
    `export const Fragment: unique symbol;
export const jsx: (...args: unknown[]) => unknown;
export const jsxs: (...args: unknown[]) => unknown;
declare global {
  namespace JSX {
    type Element = unknown;
    interface IntrinsicElements { div: Record<string, unknown>; }
  }
}
`,
  );
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(rootDir, "workspace"),
    applicationSupportRoot: join(rootDir, "application-support"),
    runtimeResources,
    cacheRoot: join(rootDir, "cache"),
  });

  const storyId = "template-fixed-proof";
  const meaningId = "configured-intro-scene";
  const durationInFrames = 30;
  const renderer = `
const Renderer = () => <div />;
export default Renderer;
`;
  const rendererRepositoryPath = `src/projects/${storyId}/scenes/${meaningId}/Renderer.tsx`;
  const instance = buildSceneTemplateInstance({
    schemaVersion: 1,
    storyId,
    meaningId,
    templateId: "proof-intro-template",
    templateFingerprint: sha("1"),
    rendererSourceGraphFingerprint: createFingerprint({
      namespace: "renderer-source-graph",
      version: 1,
      value: {
        rendererPath: rendererRepositoryPath,
        files: [
          { sourcePath: rendererRepositoryPath, checksum: digest(renderer) },
        ],
      },
    }),
    durationInFrames,
    visualIntent: "Reveal the configured proof Scene.",
    soundIntent: "Remain silent.",
    resourceIds: [],
    soundCues: [],
    copiedSourceFiles: [
      { repositoryPath: rendererRepositoryPath, checksum: digest(renderer) },
    ],
    copiedAssetFiles: [],
    visual: {
      semanticObjective: "Identify the configured proof Scene.",
      subject: "One fixed proof card.",
      primaryAction: "The proof card resolves.",
      causalLink: "The resolved card hands off to narrated content.",
      primaryComposition: "One centered proof card.",
      styleRealization: ["Restrained monochrome proof treatment."],
      continuity: "Finish on a stable transparent frame.",
      fallbackIntent: "Fail closed instead of changing the copied Scene.",
      orderedShotIds: ["proof-shot"],
      visualResourceIds: [],
    },
    anchors: [],
    shots: [
      {
        shotId: "proof-shot",
        order: 0,
        primaryRange: { startFrame: 0, endFrame: durationInFrames },
        purpose: "Reveal the configured proof card.",
        action: "Resolve the card without external resources.",
        syncAnchorIds: [],
        visualResourceIds: [],
      },
    ],
  });
  const preset = buildSilentScenePreset({
    presetId: instance.templateId,
    durationInFrames,
    visualIntent: instance.visualIntent,
    soundIntent: instance.soundIntent,
    resourceIds: instance.resourceIds,
    implementation: {
      kind: "template-copy",
      templateId: instance.templateId,
      templateFingerprint: instance.templateFingerprint,
      instanceFingerprint: instance.instanceFingerprint,
      rendererSourceFingerprint: instance.rendererSourceGraphFingerprint,
      soundCues: instance.soundCues,
    },
  });
  const story = StorySpecSchema.parse({
    schemaVersion: 3 as const,
    storyId,
    title: "Template fixed artifact proof",
    beats: [
      {
        kind: "silent-scene" as const,
        meaningId,
        narrativePurpose: "Open with the configured proof Scene.",
        preset,
      },
      {
        kind: "narrated-scene" as const,
        meaningId: "content",
        narrativePurpose: "Keep StorySpec valid for the proof.",
        ttsChunks: [{ chunkId: "content-01", ttsText: "验证固定模板。" }],
        explicitPauses: [],
      },
    ],
  });
  const render = RenderSpecSchema.parse({
    ...validRenderSpec,
    compositionId: "TemplateFixedProof",
  });
  const projectSound = buildProjectSoundPlan({ storyId, contributions: [] });
  const requirements = buildAuthoringRequirements({
    source: {
      brief: { ...validVideoBrief, storyId, title: story.title },
      story,
      narration: validNarrationSpec,
      render,
      projectSound,
    },
    sourceChecksums: {
      videoBrief: sha("2"),
      storySpec: sha("3"),
      narrationSpec: sha("4"),
      renderSpec: sha("5"),
      projectSound: sha("6"),
    },
    enhancementSelection: {
      storyVisual: "required",
      sound: "allowed",
      globalVisual: "required",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: [],
    readability: { edgeInsetPx: 90 },
  });
  const catalog = buildResourceCatalog([]);
  const taskInput = buildSceneTaskInputV7({
    storyId,
    meaningId,
    storyBeat: story.beats[0],
    sourceReferences: [],
    timingBeat: {
      kind: "silent-scene",
      meaningId,
      presetFingerprint: preset.presetFingerprint,
      presetDurationInFrames: durationInFrames,
      startFrame: 0,
      endFrame: durationInFrames,
    },
    storyFingerprint: computeStoryFingerprint(story),
    renderFingerprint: computeRenderSpecFingerprint(render),
    visualStyleFingerprint: sha("7"),
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    allowedSnapshots: [],
    allowedResourceIds: [],
    continuity: {
      previousMeaningId: null,
      previousSummary: null,
      nextMeaningId: "content",
      nextSummary: story.beats[1].narrativePurpose,
      continuityBrief: "Hand the configured opening into narrated content.",
    },
    allowedDirectories: {
      sceneRoot: `src/projects/${storyId}/scenes/${meaningId}`,
      publicAssetRoot: `public/projects/${storyId}/scenes/${meaningId}`,
    },
    sceneRequirements: [],
    sceneViewport: resolveSceneViewport(
      resolveSceneReadabilityPolicy({
        width: render.width,
        height: render.height,
      }),
    ),
    sceneCompositionBoundaryVersion: "scene-composition-boundary-v2",
  });
  const contextBytes = canonical({
    requirements,
    resourcePool: {
      allowedResourceIds: [],
      resourceCatalogFingerprint: catalog.catalogFingerprint,
    },
    scene: {
      beat: story.beats[0],
      timingBeat: taskInput.timingBeat,
      brief: {
        meaningId,
        visualIntent: instance.visualIntent,
        compositionIntent: "Use the copied centered proof card.",
        motionIntent: "Use only fixed template motion.",
        soundIntent: instance.soundIntent,
        continuityBrief: "Hand into narrated content.",
        candidateResourceIds: [],
        allowedSnapshotCards: [],
      },
      taskInput,
    },
  });
  const task = buildProducerTaskSpec({
    taskKind: "scene-template",
    storyId,
    semanticId: meaningId,
    revisionId: `revision-${"8".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "read:inputs/context.json", fingerprint: digest(contextBytes) },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-template-validator-v2",
  });

  for (const [relativePath, bytes] of [
    [`scenes/${meaningId}/Renderer.tsx`, renderer],
    [`scenes/${meaningId}/scene-template-instance.json`, canonical(instance)],
  ] as const) {
    const destination = join(
      locations.projectSourceRoot,
      storyId,
      relativePath,
    );
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  await mkdir(join(locations.projectMediaRoot, storyId, "scenes", meaningId), {
    recursive: true,
  });

  const prepared = await ensureTemplateSceneArtifact({
    locations,
    task,
    contextBytes,
    taskInput,
    catalog,
  });
  assert.deepEqual(prepared.task.declaredOutputSet, [
    "src/Renderer.tsx",
    "src/generated/reference-fidelity.generated.json",
    "src/scene-template-instance.json",
    "src/selected-resources.json",
    "src/shot-plan.json",
    "src/shot-recipe-selection.json",
    "src/sound-plan.json",
    "src/sync-anchors.json",
    "src/visual-plan.json",
  ]);
  assert.deepEqual(
    prepared.attestation.outputManifest.map(({ logicalPath }) => logicalPath),
    prepared.task.declaredOutputSet,
  );
  assert.equal(
    (await inspectArtifact({ locations, task: prepared.task }))?.taskRevision,
    prepared.task.taskRevision,
  );
});
