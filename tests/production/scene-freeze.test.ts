import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  GlobalVisualAssignmentSchema,
  ProducerAssetManifestSchema,
  ResourceCatalogSchema,
  SceneAssignmentSchema,
  SceneProductionResultSchema,
  ProductionRequirementSchema,
  VisualStyleSpecSchema,
  buildSceneProductionBrief,
  buildGlobalVisualBrief,
  buildStoryResourcePool,
  computeVisualStyleFingerprint,
  generateSemanticTiming,
} from "../../src/contracts";
import { capabilityDescriptorDeclarations } from "../../src/remotion/catalog/capability-descriptors";
import { styleDescriptorDeclarations } from "../../src/remotion/catalog/style-descriptors";
import { SCENE_TEMPLATE_DEFINITIONS } from "../../src/remotion/capabilities/scene-templates/registry";
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import { loadCatalogAuthorityDescriptors } from "../../scripts/catalog/project-files";
import { generateScenePackageFromProjectFiles } from "../../scripts/scene-package/generate";
import { materializeConfiguredSceneTemplates } from "../../scripts/projects/application/instantiate-scene-templates";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  assertSceneAssignmentIsolation,
  runProductionSceneFreeze,
} from "../../scripts/production/application/scene-freeze";
import { readExistingSceneResult } from "../../scripts/production/application/scene-submit";
import {
  buildValidSealedNarrationManifest,
  validStorySpec,
} from "../fixtures/narrative";
import {
  FIXED_PRODUCTION_NOW,
  createProductionFixture,
  markProductionBaselineReady,
  writeProductionJson,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const repositoryRoot = join(import.meta.dirname, "../..");

const copyRepositoryFile = async (rootDir: string, relativePath: string) => {
  const destination = join(rootDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(repositoryRoot, relativePath), destination);
};

const copyOptionalRepositoryFile = async (
  rootDir: string,
  relativePath: string,
) => {
  try {
    await copyRepositoryFile(rootDir, relativePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

const materializeCatalogAuthority = async (rootDir: string) => {
  const manifestPath = "src/remotion/catalog/assets.manifest.json";
  await copyRepositoryFile(rootDir, manifestPath);
  const manifest = ProducerAssetManifestSchema.parse(
    JSON.parse(await readFile(join(rootDir, manifestPath), "utf8")),
  );
  for (const asset of manifest.assets) {
    await copyRepositoryFile(rootDir, asset.localPath);
  }
  const sourcePaths = new Set(
    [
      ...styleDescriptorDeclarations,
      ...capabilityDescriptorDeclarations,
    ].flatMap((descriptor) => [
      descriptor.authority.repositoryPath,
      descriptor.sourceFile,
    ]),
  );
  for (const sourcePath of sourcePaths) {
    await copyRepositoryFile(rootDir, sourcePath);
  }
  for (const sourcePath of [
    "src/remotion/capabilities/scene-templates/axmorf/AxmorfBrand.tsx",
    "src/remotion/capabilities/scene-templates/axmorf/AxmorfIntroScene.tsx",
    "src/remotion/capabilities/scene-templates/axmorf/AxmorfOutroScene.tsx",
    "src/remotion/capabilities/scene-templates/axmorf/BrandFollowScene.tsx",
    "src/remotion/capabilities/scene-templates/axmorf/SourceCreditsScene.tsx",
    "src/remotion/capabilities/scene-templates/axmorf/content.ts",
    "src/remotion/capabilities/scene-templates/axmorf/NOTICE.md",
  ]) {
    await copyRepositoryFile(rootDir, sourcePath);
  }
  for (const sourcePath of new Set(
    SCENE_TEMPLATE_DEFINITIONS.flatMap((definition) =>
      definition.assets.map((asset) => asset.sourcePath),
    ),
  )) {
    await copyRepositoryFile(rootDir, sourcePath);
  }
  for (const sourcePath of [
    "private/reference-assets/scene-template-sound-overrides.json",
    "private/reference-assets/assets.manifest.json",
    "private/reference-assets/MIXKIT_AUDIO_LICENSE.md",
  ]) {
    await copyOptionalRepositoryFile(rootDir, sourcePath);
  }
  try {
    const localManifest = JSON.parse(
      await readFile(
        join(repositoryRoot, "private/reference-assets/assets.manifest.json"),
        "utf8",
      ),
    ) as { readonly assets: readonly { readonly localPath: string }[] };
    for (const { localPath } of localManifest.assets) {
      await copyOptionalRepositoryFile(rootDir, localPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};
const sceneRequirement = ProductionRequirementSchema.parse({
  requirementId: "opening-visual-proof",
  scope: "scene",
  targetMeaningIds: ["opening"],
  category: "visual",
  statement: "Opening Scene must show the timing boundary.",
  owner: "scene-agent",
  verification: "contract",
  severity: "error",
});

const createFixture = async (
  context: TestContext,
  options: {
    readonly sound?: "allowed" | "none";
    readonly withConfiguredTemplates?: boolean;
  } = {},
) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-freeze-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await materializeCatalogAuthority(rootDir);
  const configured = options.withConfiguredTemplates
    ? await writeProductionJson(
        join(rootDir, "src/projects/story-example/story.json"),
        validStorySpec,
      ).then(() =>
        materializeConfiguredSceneTemplates({
          rootDir,
          projectId: "story-example",
          story: validStorySpec,
          sceneDefaults: {
            introSceneTemplateId: "axmorf-brand-reveal-v1",
            outroSceneTemplateId: "axmorf-source-follow-v1",
          },
        }),
      )
    : null;
  const story = configured?.story ?? validStorySpec;
  const configuredIntro = story.beats[0];
  const configuredOutro = story.beats.at(-1);
  const configuredResourceIds = story.beats.flatMap((beat) =>
    beat.kind === "silent-scene" ? beat.preset.resourceIds : [],
  );
  const fixture = await createProductionFixture(context, rootDir, {
    additionalRequirements: [sceneRequirement],
    sound: options.sound,
    story,
  });
  const baseline = await markProductionBaselineReady(fixture);
  const catalog = buildResourceCatalog(
    await loadCatalogAuthorityDescriptors(
      rootDir,
      fixture.source.story.storyId,
    ),
  );
  const styleEntry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === "style.editorial-tech",
  )!;
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId: "story-example",
    styleProfileId: "editorial-tech",
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    artDirection: {
      medium: "Project-local vector diagrams.",
      palette: "Navy, cyan, amber, and white.",
      lighting: "Flat technical glow.",
      texture: "Clean matte fields.",
      compositionGrammar: "One focal system per Scene.",
      motionLanguage: "Frame-driven causal motion.",
      typography: "Compact technical labels.",
    },
    continuityRules: ["Preserve the same timing axis across both Scenes."],
    forbiddenTreatments: ["No CSS animation or remote assets."],
  });
  const visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  await writeProductionJson(
    join(fixture.projectDir, "visual-style.json"),
    visualStyle,
  );
  const timing = generateSemanticTiming({
    story: fixture.source.story,
    narration: fixture.source.narration,
    render: fixture.source.render,
    sealedNarration: buildValidSealedNarrationManifest(),
  });
  await writeProductionJson(
    join(fixture.projectDir, "generated/semantic-timing.generated.json"),
    timing,
  );
  const pool = buildStoryResourcePool({
    storyId: "story-example",
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    allowedResourceIds: options.withConfiguredTemplates
      ? [...configuredResourceIds, "capability.motion"].sort((left, right) =>
          left.localeCompare(right),
        )
      : ["capability.motion"],
    allowedSnapshots: [
      {
        sourceId: "video-shotcraft",
        snapshotFingerprint: sha("c"),
        allowedCardIds: ["draw-svg-trace"],
      },
    ],
    selfAuthoredVisualsAllowed: true,
  });
  await writeProductionJson(
    join(fixture.projectDir, "production/story-resource-pool.json"),
    pool,
  );
  const brief = buildSceneProductionBrief({
    storyId: "story-example",
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    semanticTimingFingerprint: timing.fingerprint,
    visualStyleFingerprint,
    resourcePoolFingerprint: pool.poolFingerprint,
    soundPolicy: fixture.requirements.enhancementSelection.sound,
    reviewPolicy: "mechanical-only",
    scenes: [
      ...(options.withConfiguredTemplates
        ? [
            {
              meaningId: "configured-intro-scene",
              visualIntent:
                configuredIntro?.kind === "silent-scene"
                  ? configuredIntro.preset.visualIntent
                  : "missing configured Scene",
              compositionIntent: "Center the authored brand reveal.",
              motionIntent: "Resolve the reveal within the preset window.",
              soundIntent:
                configuredIntro?.kind === "silent-scene"
                  ? configuredIntro.preset.soundIntent
                  : "missing configured Scene",
              continuityBrief: "Hand the opened frame to narrated content.",
              candidateResourceIds:
                configuredIntro?.kind === "silent-scene"
                  ? configuredIntro.preset.resourceIds
                  : [],
              allowedSnapshotCards: [],
            },
          ]
        : []),
      {
        meaningId: "opening",
        visualIntent: "Establish the cumulative boundary.",
        compositionIntent: "Use one left-to-right timing axis.",
        motionIntent: "Reveal the boundary from the first sample.",
        soundIntent: "A sound-effect contribution is optional.",
        continuityBrief: "Hand the timing axis to the conclusion.",
        candidateResourceIds: [],
        allowedSnapshotCards: [],
      },
      {
        meaningId: "conclusion",
        visualIntent: "Resolve the boundary into a deterministic result.",
        compositionIntent: "Retain the same timing axis.",
        motionIntent: "Settle into a stable final state.",
        soundIntent: "A sound-effect contribution is optional.",
        continuityBrief: "Inherit the opening timing axis unchanged.",
        candidateResourceIds: ["capability.motion"],
        allowedSnapshotCards: [
          { sourceId: "video-shotcraft", cardIds: ["draw-svg-trace"] },
        ],
      },
      ...(options.withConfiguredTemplates
        ? [
            {
              meaningId: "configured-outro-scene",
              visualIntent:
                configuredOutro?.kind === "silent-scene"
                  ? configuredOutro.preset.visualIntent
                  : "missing configured Scene",
              compositionIntent: "Resolve credits into the follow lockup.",
              motionIntent: "Finish in a stable authored closing frame.",
              soundIntent:
                configuredOutro?.kind === "silent-scene"
                  ? configuredOutro.preset.soundIntent
                  : "missing configured Scene",
              continuityBrief: "Close the complete Story timeline.",
              candidateResourceIds:
                configuredOutro?.kind === "silent-scene"
                  ? configuredOutro.preset.resourceIds
                  : [],
              allowedSnapshotCards: [],
            },
          ]
        : []),
    ],
  });
  await writeProductionJson(
    join(fixture.projectDir, "production/scene-production-brief.json"),
    brief,
  );
  const globalVisualBrief = buildGlobalVisualBrief({
    storyId: "story-example",
    responsibility:
      "project-global-background-texture-decoration-continuity-v1",
    visualIntent: [
      {
        intentId: "unified-frame",
        description: "Carry one restrained frame treatment through the story.",
        appliesTo: "full-composition",
      },
    ],
    constraints: {
      captionOwner: "caption-layer",
      sceneSemanticOwner: "scene-package",
      visibleText: "forbidden",
      motion: "remotion-frame-api-only",
      runtimeExternalAccess: "forbidden",
      genericDsl: "forbidden",
    },
  });
  await writeProductionJson(
    join(fixture.projectDir, "production/global-visual-brief.json"),
    globalVisualBrief,
  );
  return {
    ...fixture,
    ...baseline,
    catalog,
    visualStyle,
    timing,
    pool,
    brief,
    globalVisualBrief,
  } as const;
};

const freeze = (fixture: Awaited<ReturnType<typeof createFixture>>) =>
  runProductionSceneFreeze({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    verifyNarrativeAutoCheck: async () => fixture.narrativeAutoCheckFingerprint,
    submitTemplateScene: async () => undefined as never,
  });

test("freezes a Project ResourceCatalog for code-led work without imported assets", async (context) => {
  const fixture = await createFixture(context);
  const catalogPath = join(
    fixture.projectDir,
    "generated/resource-catalog.generated.json",
  );
  await assert.rejects(() => readFile(catalogPath), { code: "ENOENT" });

  await freeze(fixture);

  const frozen = ResourceCatalogSchema.parse(
    JSON.parse(await readFile(catalogPath, "utf8")),
  );
  assert.deepEqual(frozen, fixture.catalog);
});

test("freezes one assignment per StoryBeat in order and projects Scene requirements", async (context) => {
  const fixture = await createFixture(context);
  const result = await freeze(fixture);
  assert.equal(result.status, "scene-inputs-frozen");
  assert.deepEqual(result.meaningIds, ["opening", "conclusion"]);
  assert.ok(result.globalVisualAssignmentPath !== null);
  const globalAssignment = GlobalVisualAssignmentSchema.parse(
    JSON.parse(
      await readFile(
        join(fixture.rootDir, result.globalVisualAssignmentPath),
        "utf8",
      ),
    ),
  );
  assert.equal(globalAssignment.storyId, "story-example");
  assert.equal(
    globalAssignment.globalVisualBriefFingerprint,
    fixture.globalVisualBrief.briefFingerprint,
  );
  assert.deepEqual(
    globalAssignment.timeline.storyBeatWindows.map(
      ({ meaningId }) => meaningId,
    ),
    ["opening", "conclusion"],
  );
  const assignments = await Promise.all(
    result.assignmentPaths.map(async (path) =>
      SceneAssignmentSchema.parse(
        JSON.parse(await readFile(join(fixture.rootDir, path), "utf8")),
      ),
    ),
  );
  assert.equal(assignments[0].schemaVersion, 5);
  assert.equal(assignments[0].taskInput.schemaVersion, 5);
  if (
    assignments[0].schemaVersion !== 5 ||
    assignments[0].taskInput.schemaVersion !== 5
  ) {
    assert.fail("Expected v5 Scene assignment and task input.");
  }
  assert.equal(
    assignments[0].sceneCompositionBoundaryVersion,
    "scene-composition-boundary-v1",
  );
  assert.deepEqual(
    assignments[0].readabilityPolicy,
    fixture.requirements.readabilityPolicy,
  );
  assert.deepEqual(
    assignments[0].taskInput.readabilityPolicy,
    fixture.requirements.readabilityPolicy,
  );
  assert.equal(
    assignments[0].readabilityPolicy.captionPolicy.maxDisplayUnitsPerChunk,
    36,
  );
  assert.equal(
    assignments[0].readabilityPolicy.typographyPolicy.minFontSizePx,
    36,
  );
  assert.deepEqual(assignments[0].taskInput.allowedResourceIds, []);
  assert.deepEqual(
    assignments[0].additionalRequirements.map(
      ({ requirementId }) => requirementId,
    ),
    ["opening-visual-proof"],
  );
  assert.deepEqual(assignments[1].additionalRequirements, []);
  assertSceneAssignmentIsolation(assignments);
  const state = await readProductionRunStore({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
  });
  assert.equal(state.state.state, "scene-inputs-frozen");
});

test("configured template copies freeze and submit without Scene owners", async (context) => {
  const fixture = await createFixture(context, {
    withConfiguredTemplates: true,
  });
  const result = await freeze(fixture);
  assert.deepEqual(result.meaningIds, [
    "configured-intro-scene",
    "opening",
    "conclusion",
    "configured-outro-scene",
  ]);
  const assignments = await Promise.all(
    result.assignmentPaths.map(async (path) =>
      SceneAssignmentSchema.parse(
        JSON.parse(await readFile(join(fixture.rootDir, path), "utf8")),
      ),
    ),
  );
  const intro = assignments[0];
  const outro = assignments[3];
  const firstBeat = fixture.source.story.beats[0];
  const lastBeat = fixture.source.story.beats.at(-1);
  assert.equal(intro.taskInput.storyBeat.kind, "silent-scene");
  assert.equal(outro.taskInput.storyBeat.kind, "silent-scene");
  assert.equal(
    intro.taskInput.timingBeat.startFrame,
    fixture.source.render.leadInFrames,
  );
  assert.equal(
    intro.taskInput.timingBeat.endFrame - intro.taskInput.timingBeat.startFrame,
    60,
  );
  assert.deepEqual(
    intro.taskInput.allowedResourceIds,
    firstBeat?.kind === "silent-scene" ? firstBeat.preset.resourceIds : [],
  );
  assert.deepEqual(
    outro.taskInput.allowedResourceIds,
    lastBeat?.kind === "silent-scene" ? lastBeat.preset.resourceIds : [],
  );
  assert.equal(
    outro.taskInput.storyBeat.kind === "silent-scene"
      ? outro.taskInput.storyBeat.preset.presetFingerprint
      : null,
    lastBeat?.kind === "silent-scene"
      ? lastBeat.preset.presetFingerprint
      : null,
  );
  assertSceneAssignmentIsolation(assignments);
  assert.deepEqual(result.templateMeaningIds, [
    "configured-intro-scene",
    "configured-outro-scene",
  ]);
  assert.deepEqual(result.ownerMeaningIds, ["opening", "conclusion"]);

  const introRoot = join(fixture.projectDir, "scenes/configured-intro-scene");
  const outroRoot = join(fixture.projectDir, "scenes/configured-outro-scene");
  const introRenderer = await readFile(join(introRoot, "Renderer.tsx"), "utf8");
  const outroRenderer = await readFile(join(outroRoot, "Renderer.tsx"), "utf8");
  assert.match(introRenderer, /AxmorfIntroScene/u);
  assert.match(outroRenderer, /AxmorfOutroScene/u);

  const introSound = JSON.parse(
    await readFile(join(introRoot, "sound-plan.json"), "utf8"),
  );
  const outroSound = JSON.parse(
    await readFile(join(outroRoot, "sound-plan.json"), "utf8"),
  );
  if (
    firstBeat?.kind === "silent-scene" &&
    firstBeat.preset.resourceIds.length > 0
  ) {
    assert.equal(introSound.contributions[0].contributionId, "reveal-impact");
    assert.equal(
      introSound.contributions[0].timing.eventId,
      "intro-sound-start",
    );
    assert.equal(introSound.contributions[0].timing.offsetFrames, 0);
    assert.equal(introSound.contributions[0].durationInFrames, 60);
    assert.equal(introSound.contributions[0].resource.role, "sound-effect");
  } else {
    assert.deepEqual(introSound.contributions, []);
  }
  if (
    lastBeat?.kind === "silent-scene" &&
    lastBeat.preset.resourceIds.length > 0
  ) {
    assert.equal(outroSound.contributions[0].contributionId, "closing-music");
    assert.equal(
      outroSound.contributions[0].resource.resourceId,
      lastBeat.preset.resourceIds[0],
    );
    assert.equal(outroSound.contributions[0].resource.role, "background-music");
  } else {
    assert.deepEqual(outroSound.contributions, []);
  }

  const introPackage = await generateScenePackageFromProjectFiles({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    meaningId: "configured-intro-scene",
    mode: "write",
  });
  const outroPackage = await generateScenePackageFromProjectFiles({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    meaningId: "configured-outro-scene",
    mode: "write",
  });
  assert.equal(introPackage.schemaVersion, 5);
  assert.equal(outroPackage.schemaVersion, 5);
  assert.equal(
    introPackage.scenePresetFingerprint,
    firstBeat?.kind === "silent-scene"
      ? firstBeat.preset.presetFingerprint
      : null,
  );
  assert.equal(
    outroPackage.scenePresetFingerprint,
    lastBeat?.kind === "silent-scene"
      ? lastBeat.preset.presetFingerprint
      : null,
  );
  assert.deepEqual(
    introPackage.selectedResources.map(({ resourceId }) => resourceId),
    firstBeat?.kind === "silent-scene" ? firstBeat.preset.resourceIds : [],
  );
  assert.deepEqual(
    outroPackage.selectedResources.map(({ resourceId }) => resourceId),
    lastBeat?.kind === "silent-scene" ? lastBeat.preset.resourceIds : [],
  );
});

test("configured template copies submit deterministically without generic Scene review", async (context) => {
  const fixture = await createFixture(context, {
    withConfiguredTemplates: true,
  });
  const result = await runProductionSceneFreeze({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    verifyNarrativeAutoCheck: async () =>
      fixture.narrativeAutoCheckFingerprint,
  });

  assert.deepEqual(result.templateMeaningIds, [
    "configured-intro-scene",
    "configured-outro-scene",
  ]);
  for (const meaningId of result.templateMeaningIds) {
    const productionResult = SceneProductionResultSchema.parse(
      await readExistingSceneResult({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        meaningId,
      }),
    );
    assert.equal(productionResult.status, "success");
    assert.match(
      productionResult.mechanicalCheckFingerprint,
      /^sha256:[0-9a-f]{64}$/u,
    );
  }
  assert.deepEqual(result.ownerMeaningIds, ["opening", "conclusion"]);
});

test("disabled defaults leave no copied Scene source or sound plan", async (context) => {
  const fixture = await createFixture(context);
  const result = await freeze(fixture);
  assert.deepEqual(result.templateMeaningIds, []);
  await assert.rejects(
    () => readFile(join(fixture.projectDir, "scenes/intro/Renderer.tsx")),
    {
      code: "ENOENT",
    },
  );
  await assert.rejects(
    () => readFile(join(fixture.projectDir, "scenes/outro/sound-plan.json")),
    {
      code: "ENOENT",
    },
  );
});

test("template-copied Scenes reject unused external snapshot cards", async (context) => {
  const fixture = await createFixture(context, {
    withConfiguredTemplates: true,
  });
  await writeProductionJson(
    join(fixture.projectDir, "production/scene-production-brief.json"),
    buildSceneProductionBrief({
      ...fixture.brief,
      scenes: fixture.brief.scenes.map((scene) =>
        scene.meaningId === "configured-intro-scene"
          ? {
              ...scene,
              allowedSnapshotCards: [
                {
                  sourceId: "video-shotcraft",
                  cardIds: ["draw-svg-trace"],
                },
              ],
            }
          : scene,
      ),
    }),
  );
  await assert.rejects(
    () => freeze(fixture),
    /Silent Scene configured-intro-scene must not carry snapshot cards\./u,
  );
});

test("template-copied Scene sound obeys the unified frozen sound policy", async (context) => {
  const fixture = await createFixture(context, {
    withConfiguredTemplates: true,
    sound: "none",
  });
  const hasConfiguredSound = fixture.source.story.beats.some(
    (beat) =>
      beat.kind === "silent-scene" && beat.preset.resourceIds.length > 0,
  );
  if (hasConfiguredSound) {
    await assert.rejects(
      () => freeze(fixture),
      /Template-copied silent Scene configured-intro-scene requires sound\./u,
    );
  } else {
    assert.equal((await freeze(fixture)).status, "scene-inputs-frozen");
  }
});

test("current freeze rerun is a byte and mtime stable no-op", async (context) => {
  const fixture = await createFixture(context);
  const first = await freeze(fixture);
  const catalogPath = join(
    fixture.projectDir,
    "generated/resource-catalog.generated.json",
  );
  const catalogBytes = await readFile(catalogPath);
  const catalogMtime = (await stat(catalogPath)).mtimeMs;
  const path = join(fixture.rootDir, first.assignmentPaths[0]);
  const bytes = await readFile(path);
  const mtime = (await stat(path)).mtimeMs;
  assert.ok(first.globalVisualAssignmentPath !== null);
  const globalPath = join(fixture.rootDir, first.globalVisualAssignmentPath);
  const globalBytes = await readFile(globalPath);
  const globalMtime = (await stat(globalPath)).mtimeMs;
  const repeated = await freeze(fixture);
  assert.equal(repeated.noOp, true);
  assert.deepEqual(await readFile(catalogPath), catalogBytes);
  assert.equal((await stat(catalogPath)).mtimeMs, catalogMtime);
  assert.deepEqual(await readFile(path), bytes);
  assert.equal((await stat(path)).mtimeMs, mtime);
  assert.deepEqual(await readFile(globalPath), globalBytes);
  assert.equal((await stat(globalPath)).mtimeMs, globalMtime);
});

test("current freeze rejects Project ResourceCatalog drift", async (context) => {
  const fixture = await createFixture(context);
  await freeze(fixture);
  const catalogPath = join(
    fixture.projectDir,
    "generated/resource-catalog.generated.json",
  );
  await writeFile(catalogPath, `${await readFile(catalogPath, "utf8")} `);

  await assert.rejects(
    () => freeze(fixture),
    /Project ResourceCatalog drift: generated bytes are stale\./u,
  );
});

test("current freeze rejects copied Scene Renderer source drift", async (context) => {
  const fixture = await createFixture(context, {
    withConfiguredTemplates: true,
  });
  await freeze(fixture);
  const sourcePath = join(
    fixture.rootDir,
    "src/projects/story-example/scenes/configured-intro-scene/AxmorfIntroScene.tsx",
  );
  await writeFile(sourcePath, `${await readFile(sourcePath, "utf8")}\n`);
  await assert.rejects(() => freeze(fixture), /Copied Scene file is stale:/u);
});

test("missing GlobalVisualBrief fails before writing any assignment", async (context) => {
  const fixture = await createFixture(context);
  await writeProductionJson(
    join(fixture.projectDir, "production/global-visual-brief.json"),
    { malformed: true },
  );
  await assert.rejects(() => freeze(fixture));
  await assert.rejects(
    () =>
      readFile(
        join(
          fixture.projectDir,
          "production/scene-assignments/opening.generated.json",
        ),
      ),
    { code: "ENOENT" },
  );
  await assert.rejects(
    () =>
      readFile(
        join(
          fixture.projectDir,
          "production/global-visual-assignment.generated.json",
        ),
      ),
    { code: "ENOENT" },
  );
});

test("fails closed on requirements, timing, style, pool, or Scene brief drift", async (context) => {
  for (const target of [
    "requirements",
    "timing",
    "style",
    "pool",
    "brief",
  ] as const) {
    await context.test(target, async (child) => {
      const fixture = await createFixture(child);
      if (target === "requirements") {
        await writeProductionJson(join(fixture.projectDir, "render.json"), {
          ...fixture.source.render,
          width: fixture.source.render.width + 2,
        });
      } else if (target === "timing") {
        await writeProductionJson(
          join(fixture.projectDir, "generated/semantic-timing.generated.json"),
          { ...fixture.timing, fingerprint: sha("f") },
        );
      } else if (target === "style") {
        await writeProductionJson(
          join(fixture.projectDir, "visual-style.json"),
          {
            ...fixture.visualStyle,
            resourceCatalogFingerprint: sha("f"),
          },
        );
      } else if (target === "pool") {
        await writeProductionJson(
          join(fixture.projectDir, "production/story-resource-pool.json"),
          buildStoryResourcePool({
            ...fixture.pool,
            allowedResourceIds: ["capability.unknown"],
          }),
        );
      } else {
        await writeProductionJson(
          join(fixture.projectDir, "production/scene-production-brief.json"),
          buildSceneProductionBrief({
            ...fixture.brief,
            scenes: [fixture.brief.scenes[0]],
          }),
        );
      }
      await assert.rejects(() => freeze(fixture));
      const state = await readProductionRunStore({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
      });
      assert.equal(state.state.state, "failed");
    });
  }
});

test("rejects candidate resources or snapshot cards outside the Story pool", async (context) => {
  for (const target of ["resource", "card"] as const) {
    await context.test(target, async (child) => {
      const fixture = await createFixture(child);
      const scene = fixture.brief.scenes[0];
      const changed = {
        ...scene,
        ...(target === "resource"
          ? { candidateResourceIds: ["capability.unknown"] }
          : {
              allowedSnapshotCards: [
                { sourceId: "video-shotcraft", cardIds: ["unknown-card"] },
              ],
            }),
      };
      await writeProductionJson(
        join(fixture.projectDir, "production/scene-production-brief.json"),
        buildSceneProductionBrief({
          ...fixture.brief,
          scenes: [changed, fixture.brief.scenes[1]],
        }),
      );
      await assert.rejects(() => freeze(fixture));
    });
  }
});
