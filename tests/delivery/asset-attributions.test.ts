import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  ScenePackageSchema,
  SelectedResourceRefSchema,
  buildAssetAttributions,
  buildGlobalVisualPackage,
  buildProductionRenderPlan,
  computeResourceDescriptorFingerprint,
  computeScenePackageFingerprint,
  computeSceneSoundFingerprint,
  computeSceneVisualFingerprint,
  serializeCanonicalJson,
} from "../../src/contracts";
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import { loadDeliveryAssetAttributions } from "../../scripts/delivery/application/asset-attributions";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const asset = ({
  id,
  attributionRequired,
  attributionText,
}: {
  readonly id: string;
  readonly attributionRequired: boolean;
  readonly attributionText: string | null;
}) => ({
  schemaVersion: 1,
  id,
  kind: "asset" as const,
  status: "approved" as const,
  title: id,
  description: "Fixture external image",
  useCases: ["scene visual"],
  tags: ["external", "fixture"],
  authority: {
    kind: "repository-file" as const,
    repositoryPath: "src/projects/story-example/assets.manifest.json",
  },
  allowedUse: "runtime-approved" as const,
  assetKind: "image" as const,
  mediaRole: "scene-visual" as const,
  localPath: `public/projects/story-example/assets/${id}.png`,
  checksum: sha("a"),
  license: {
    id: "Pexels License",
    verificationStatus: "verified" as const,
    sourceUrl: "https://www.pexels.com/license/",
    attributionRequired,
    attributionText,
    verifiedAt: "2026-08-12T00:00:00.000Z",
    sourceEvidenceFingerprint: sha("b"),
  },
  externalSource: {
    provider: "pexels",
    providerAssetId: "2014422",
    sourcePageUrl: "https://www.pexels.com/photo/granite-2014422/",
    creator: {
      name: "Fixture Photographer",
      profileUrl: "https://www.pexels.com/@fixture-photographer",
    },
    provenanceFingerprint: sha("b"),
  },
  media: {
    mimeType: "image/png",
    width: 1,
    height: 1,
    sizeBytes: 68,
  },
});

const selected = (
  descriptor: ReturnType<typeof asset>,
  catalogFingerprint: string,
) =>
  SelectedResourceRefSchema.parse({
    schemaVersion: 1,
    resourceId: descriptor.id,
    kind: "asset",
    role: "scene-visual",
    descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
    catalogFingerprint,
  });

test("delivery attribution includes only used resources and deduplicates repeated selection", () => {
  const used = asset({
    id: "asset.pexels.2014422.scene-visual.story",
    attributionRequired: true,
    attributionText: "Photo by Fixture Photographer on Pexels",
  });
  const unused = asset({
    id: "asset.pexels.999.scene-visual.story",
    attributionRequired: true,
    attributionText: "Photo by Unused Creator on Pexels",
  });
  const catalog = buildResourceCatalog([used, unused]);
  const usedRef = selected(used, catalog.catalogFingerprint);
  const projection = buildAssetAttributions({
    storyId: "story-example",
    resourceCatalog: catalog,
    renderPlanFingerprint: sha("c"),
    selectedResources: [usedRef, usedRef],
  });

  assert.equal(projection.entries.length, 1);
  assert.deepEqual(projection.entries[0]?.resourceIds, [used.id]);
  assert.equal(
    projection.entries[0]?.attributionText,
    used.license.attributionText,
  );
  assert.doesNotMatch(JSON.stringify(projection), /Unused Creator/u);
});

test("empty attribution projection is stable and attribution drift changes its fingerprint", () => {
  const noAttribution = asset({
    id: "asset.project-authored.scene-visual.story",
    attributionRequired: false,
    attributionText: null,
  });
  const emptyCatalog = buildResourceCatalog([noAttribution]);
  const input = {
    storyId: "story-example",
    resourceCatalog: emptyCatalog,
    renderPlanFingerprint: sha("c"),
    selectedResources: [
      selected(noAttribution, emptyCatalog.catalogFingerprint),
    ],
  } as const;
  assert.deepEqual(buildAssetAttributions(input).entries, []);
  assert.deepEqual(
    buildAssetAttributions(input),
    buildAssetAttributions(input),
  );

  const first = asset({
    id: "asset.pexels.2014422.scene-visual.story",
    attributionRequired: true,
    attributionText: "Photo by Fixture Photographer on Pexels",
  });
  const second = {
    ...first,
    license: {
      ...first.license,
      attributionText: "Photo by Changed Photographer on Pexels",
    },
  };
  const firstCatalog = buildResourceCatalog([first]);
  const secondCatalog = buildResourceCatalog([second]);
  const firstProjection = buildAssetAttributions({
    storyId: "story-example",
    resourceCatalog: firstCatalog,
    renderPlanFingerprint: sha("c"),
    selectedResources: [selected(first, firstCatalog.catalogFingerprint)],
  });
  const secondProjection = buildAssetAttributions({
    storyId: "story-example",
    resourceCatalog: secondCatalog,
    renderPlanFingerprint: sha("c"),
    selectedResources: [selected(second, secondCatalog.catalogFingerprint)],
  });
  assert.notEqual(
    firstProjection.attributionsFingerprint,
    secondProjection.attributionsFingerprint,
  );
});

test("delivery loader reads only render-plan-bound Scene and GlobalVisual packages", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-delivery-attributions-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const used = asset({
    id: "asset.proof-shape",
    attributionRequired: true,
    attributionText: "Photo by Fixture Photographer on Pexels",
  });
  const unused = asset({
    id: "asset.unused",
    attributionRequired: true,
    attributionText: "Photo by Unused Creator on Pexels",
  });
  const backgroundMusic = {
    ...used,
    id: "asset.story-example.background-music",
    title: "Background music",
    description: "Fixture attributed background music",
    useCases: ["background music"],
    tags: ["background-music", "fixture"],
    assetKind: "audio" as const,
    mediaRole: "background-music" as const,
    localPath: "public/projects/story-example/sound/background-music.mp3",
    media: {
      mimeType: "audio/mpeg",
      durationInSeconds: 30,
      sizeBytes: 100,
    },
  };
  const catalog = buildResourceCatalog([backgroundMusic, used, unused]);
  const selectedResource = selected(used, catalog.catalogFingerprint);
  const selectedBackgroundMusic = SelectedResourceRefSchema.parse({
    schemaVersion: 1,
    resourceId: backgroundMusic.id,
    kind: "asset",
    role: "background-music",
    descriptorFingerprint:
      computeResourceDescriptorFingerprint(backgroundMusic),
    catalogFingerprint: catalog.catalogFingerprint,
  });
  const basePackage = buildScenePackage(createScenePackageInput());
  const patchedBase = {
    ...basePackage,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    selectedResources: [selectedResource],
  };
  const patchedFingerprints = {
    ...patchedBase,
    sceneVisualFingerprint: computeSceneVisualFingerprint(patchedBase),
    sceneSoundFingerprint: computeSceneSoundFingerprint(patchedBase),
  };
  const scenePackage = ScenePackageSchema.parse({
    ...patchedFingerprints,
    packageFingerprint: computeScenePackageFingerprint(patchedFingerprints),
  });
  const globalVisualPackage = buildGlobalVisualPackage({
    storyId: scenePackage.storyId,
    compositionId: "StoryExample",
    assignmentFingerprint: sha("1"),
    requirementsFingerprint: sha("2"),
    semanticTimingFingerprint: sha("3"),
    visualStyleFingerprint: sha("4"),
    readabilityPolicyFingerprint: sha("5"),
    globalVisualPlanFingerprint: sha("6"),
    rendererId: "project-global-visual",
    rendererSourceGraphFingerprint: sha("7"),
    selectedResources: [],
  });
  const renderPlan = buildProductionRenderPlan({
    runId: "story-example-run-001",
    storyId: scenePackage.storyId,
    requirementsFingerprint: sha("1"),
    storyFingerprint: sha("2"),
    sealedNarrationFingerprint: sha("3"),
    masteredNarrationFingerprint: sha("4"),
    semanticTimingFingerprint: sha("5"),
    captionCuesFingerprint: sha("6"),
    sceneCoverageFingerprint: sha("7"),
    scenePackages: [
      {
        meaningId: scenePackage.meaningId,
        packageFingerprint: scenePackage.packageFingerprint,
      },
    ],
    rendererRegistryFingerprint: sha("8"),
    storyVisualProjectionFingerprint: sha("9"),
    soundProjectionFingerprint: sha("a"),
    soundResources: [selectedBackgroundMusic],
    globalVisual: {
      assignmentFingerprint: sha("b"),
      packageFingerprint: globalVisualPackage.packageFingerprint,
      resultFingerprint: sha("c"),
      planFingerprint: sha("d"),
      projectionFingerprint: sha("e"),
      rendererSourceGraphFingerprint: sha("f"),
    },
    compositionId: "StoryExample",
    compositionSourceChecksum: sha("0"),
    width: 1080,
    height: 1920,
    fps: 30,
    timelinePolicyVersion: "scene-package-timeline-v1",
    sourceReferencesFingerprint: sha("0"),
    semanticTimingFrameCount: 120,
    frameCount: 120,
    layerOrder: ["global-visual", "story-visual", "narrative-core"],
    mixOrder: ["narration", "sound-contributions"],
    remotionVersion: "4.0.489",
  });
  const files = new Map<string, unknown>([
    [
      `src/projects/${scenePackage.storyId}/generated/resource-catalog.generated.json`,
      catalog,
    ],
    [
      `src/projects/${scenePackage.storyId}/scenes/${scenePackage.meaningId}/generated/scene-package.generated.json`,
      scenePackage,
    ],
    [
      `src/projects/${scenePackage.storyId}/global-visual/generated/global-visual-package.generated.json`,
      globalVisualPackage,
    ],
  ]);
  for (const [relativePath, value] of files) {
    const path = join(rootDir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${serializeCanonicalJson(value)}\n`);
  }

  const projection = await loadDeliveryAssetAttributions({
    rootDir,
    projectId: scenePackage.storyId,
    renderPlan,
  });
  assert.equal(projection.entries.length, 1);
  assert.deepEqual(projection.entries[0]?.resourceIds, [
    used.id,
    backgroundMusic.id,
  ]);
  assert.doesNotMatch(JSON.stringify(projection), /Unused Creator/u);

  await assert.rejects(() =>
    loadDeliveryAssetAttributions({
      rootDir,
      projectId: scenePackage.storyId,
      renderPlan: {
        ...renderPlan,
        scenePackages: [
          { meaningId: scenePackage.meaningId, packageFingerprint: sha("0") },
        ],
      },
    }),
  );
});
