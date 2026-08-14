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
  DEFAULT_INTRO_SCENE_PRESET,
  DEFAULT_OUTRO_SCENE_PRESET,
  GlobalVisualAssignmentSchema,
  ProducerAssetManifestSchema,
  ResourceCatalogSchema,
  SceneAssignmentSchema,
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
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import { loadCatalogAuthorityDescriptors } from "../../scripts/catalog/project-files";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  assertSceneAssignmentIsolation,
  runProductionSceneFreeze,
} from "../../scripts/production/application/scene-freeze";
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
    [...styleDescriptorDeclarations, ...capabilityDescriptorDeclarations].flatMap(
      (descriptor) => [
        descriptor.authority.repositoryPath,
        descriptor.sourceFile,
      ],
    ),
  );
  for (const sourcePath of sourcePaths) {
    await copyRepositoryFile(rootDir, sourcePath);
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
  options: { readonly withDefaultBookends?: boolean } = {},
) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-freeze-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const bookendBeats = options.withDefaultBookends
    ? [
        {
          kind: "silent-scene" as const,
          sceneRole: "intro" as const,
          meaningId: "intro",
          narrativePurpose: "Open with the selected intro preset.",
          preset: DEFAULT_INTRO_SCENE_PRESET,
        },
        ...validStorySpec.beats,
        {
          kind: "silent-scene" as const,
          sceneRole: "outro" as const,
          meaningId: "outro",
          narrativePurpose: "Close with the selected outro preset.",
          preset: DEFAULT_OUTRO_SCENE_PRESET,
        },
      ]
    : validStorySpec.beats;
  const fixture = await createProductionFixture(context, rootDir, {
    additionalRequirements: [sceneRequirement],
    story: options.withDefaultBookends
      ? {
          ...validStorySpec,
          bookends: {
            intro: { mode: "scene", meaningId: "intro" },
            outro: { mode: "scene", meaningId: "outro" },
          },
          beats: bookendBeats,
        }
      : validStorySpec,
  });
  const baseline = await markProductionBaselineReady(fixture);
  await materializeCatalogAuthority(rootDir);
  const catalog = buildResourceCatalog(
    await loadCatalogAuthorityDescriptors(rootDir, fixture.source.story.storyId),
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
    allowedResourceIds: options.withDefaultBookends
      ? [
          "asset.axmorf-intro-chime",
          "asset.axmorf-outro-chime",
          "capability.motion",
        ]
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
    sceneLocalSoundPolicy: "allowed",
    reviewPolicy: "mechanical-only",
    scenes: [
      ...(options.withDefaultBookends
        ? [
            {
              meaningId: "intro",
              visualIntent: DEFAULT_INTRO_SCENE_PRESET.visualIntent,
              compositionIntent: "Center the authored brand reveal.",
              motionIntent: "Resolve the reveal within the preset window.",
              soundIntent: DEFAULT_INTRO_SCENE_PRESET.soundIntent,
              continuityBrief: "Hand the opened frame to narrated content.",
              candidateResourceIds: ["asset.axmorf-intro-chime"],
              allowedSnapshotCards: [],
            },
          ]
        : []),
      {
        meaningId: "opening",
        visualIntent: "Establish the cumulative boundary.",
        compositionIntent: "Use one left-to-right timing axis.",
        motionIntent: "Reveal the boundary from the first sample.",
        soundIntent: "Scene-local sound is optional.",
        continuityBrief: "Hand the timing axis to the conclusion.",
        candidateResourceIds: [],
        allowedSnapshotCards: [],
      },
      {
        meaningId: "conclusion",
        visualIntent: "Resolve the boundary into a deterministic result.",
        compositionIntent: "Retain the same timing axis.",
        motionIntent: "Settle into a stable final state.",
        soundIntent: "Scene-local sound is optional.",
        continuityBrief: "Inherit the opening timing axis unchanged.",
        candidateResourceIds: ["capability.motion"],
        allowedSnapshotCards: [
          { sourceId: "video-shotcraft", cardIds: ["draw-svg-trace"] },
        ],
      },
      ...(options.withDefaultBookends
        ? [
            {
              meaningId: "outro",
              visualIntent: DEFAULT_OUTRO_SCENE_PRESET.visualIntent,
              compositionIntent: "Resolve credits into the follow lockup.",
              motionIntent: "Finish in a stable authored closing frame.",
              soundIntent: DEFAULT_OUTRO_SCENE_PRESET.soundIntent,
              continuityBrief: "Close the complete Story timeline.",
              candidateResourceIds: ["asset.axmorf-outro-chime"],
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
  assert.equal(assignments[0].schemaVersion, 4);
  assert.equal(assignments[0].taskInput.schemaVersion, 4);
  if (
    assignments[0].schemaVersion !== 4 ||
    assignments[0].taskInput.schemaVersion !== 4
  ) {
    assert.fail("Expected v4 Scene assignment and task input.");
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

test("default intro and outro freeze as ordinary preset-bound Scene assignments", async (context) => {
  const fixture = await createFixture(context, { withDefaultBookends: true });
  const result = await freeze(fixture);
  assert.deepEqual(result.meaningIds, [
    "intro",
    "opening",
    "conclusion",
    "outro",
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
  assert.equal(intro.taskInput.storyBeat.kind, "silent-scene");
  assert.equal(outro.taskInput.storyBeat.kind, "silent-scene");
  assert.equal(intro.taskInput.timingBeat.startFrame, fixture.source.render.leadInFrames);
  assert.equal(
    intro.taskInput.timingBeat.endFrame - intro.taskInput.timingBeat.startFrame,
    DEFAULT_INTRO_SCENE_PRESET.durationInFrames,
  );
  assert.deepEqual(intro.taskInput.allowedResourceIds, [
    "asset.axmorf-intro-chime",
  ]);
  assert.deepEqual(outro.taskInput.allowedResourceIds, [
    "asset.axmorf-outro-chime",
  ]);
  assert.equal(
    outro.taskInput.storyBeat.kind === "silent-scene"
      ? outro.taskInput.storyBeat.preset.presetFingerprint
      : null,
    DEFAULT_OUTRO_SCENE_PRESET.presetFingerprint,
  );
  assertSceneAssignmentIsolation(assignments);
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
