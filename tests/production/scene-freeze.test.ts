import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  SceneAssignmentSchema,
  ProductionRequirementSchema,
  VisualStyleSpecSchema,
  buildSceneProductionBrief,
  buildStoryResourcePool,
  computeVisualStyleFingerprint,
  generateSemanticTiming,
} from "../../src/contracts";
import { capabilityDescriptorDeclarations } from "../../src/remotion/catalog/capability-descriptors";
import { styleDescriptorDeclarations } from "../../src/remotion/catalog/style-descriptors";
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  assertSceneAssignmentIsolation,
  runProductionSceneFreeze,
} from "../../scripts/production/scene-freeze";
import { buildValidSealedNarrationManifest } from "../fixtures/narrative";
import {
  FIXED_PRODUCTION_NOW,
  createProductionFixture,
  markProductionBaselineReady,
  writeProductionJson,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
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

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-freeze-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir, {
    additionalRequirements: [sceneRequirement],
  });
  const baseline = await markProductionBaselineReady(fixture);
  const catalog = buildResourceCatalog([
    styleDescriptorDeclarations.find(
      ({ styleProfileId }) => styleProfileId === "editorial-tech",
    )!,
    capabilityDescriptorDeclarations.find(
      ({ id }) => id === "capability.motion",
    )!,
  ]);
  await writeProductionJson(
    join(fixture.projectDir, "generated/resource-catalog.generated.json"),
    catalog,
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
    allowedResourceIds: ["capability.motion"],
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
    ],
  });
  await writeProductionJson(
    join(fixture.projectDir, "production/scene-production-brief.json"),
    brief,
  );
  return {
    ...fixture,
    ...baseline,
    catalog,
    visualStyle,
    timing,
    pool,
    brief,
  } as const;
};

const freeze = (fixture: Awaited<ReturnType<typeof createFixture>>) =>
  runProductionSceneFreeze({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    verifyNarrativeAutoCheck: async () => fixture.narrativeAutoCheckFingerprint,
  });

test("freezes one assignment per StoryBeat in order and projects Scene requirements", async (context) => {
  const fixture = await createFixture(context);
  const result = await freeze(fixture);
  assert.equal(result.status, "scene-inputs-frozen");
  assert.deepEqual(result.meaningIds, ["opening", "conclusion"]);
  const assignments = await Promise.all(
    result.assignmentPaths.map(async (path) =>
      SceneAssignmentSchema.parse(
        JSON.parse(await readFile(join(fixture.rootDir, path), "utf8")),
      ),
    ),
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

test("current freeze rerun is a byte and mtime stable no-op", async (context) => {
  const fixture = await createFixture(context);
  const first = await freeze(fixture);
  const path = join(fixture.rootDir, first.assignmentPaths[0]);
  const bytes = await readFile(path);
  const mtime = (await stat(path)).mtimeMs;
  const repeated = await freeze(fixture);
  assert.equal(repeated.noOp, true);
  assert.deepEqual(await readFile(path), bytes);
  assert.equal((await stat(path)).mtimeMs, mtime);
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
