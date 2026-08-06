import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import {
  FinalAssemblyPlanInputSchema,
  NarrativeAutoCheckReportSchema,
  RenderSpecSchema,
  ResourceCatalogSchema,
  ResourceDescriptorSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  Sha256DigestSchema,
  createFinalAssemblyPlan,
  createFingerprint,
  createGlobalSoundPlan,
  createGlobalVisualPlan,
  createGlobalVisualProjection,
  computeResourceDescriptorFingerprint,
  type ResourceAssetDescriptor,
} from "../../../src/contracts";
import { resolveGlobalSound } from "../../../src/remotion/runtime/global-sound";
import { buildResourceCatalog } from "../../catalog/domain";
import { validateAssetDescriptorFiles } from "../../catalog/project-files";
import { checksumFile } from "../../project-check/project-files";
import { loadCurrentFinalSceneBranch } from "../../project-check/final-run";
import { writeOrCheckSceneArtifact } from "../../scene-package/project-files";
import { generateGpsGlobalAudio } from "./global-audio";

const STORY_ID = "gps-relativity";
const COMPOSITION_ID = "GpsRelativity";

const OverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    overlayVersion: z.literal("gps-m8-resource-overlay-v1"),
    baseCatalogFingerprint: Sha256DigestSchema,
    descriptors: z.array(ResourceDescriptorSchema).length(2).readonly(),
  })
  .strict();

const readJson = async (rootDir: string, repositoryPath: string) =>
  JSON.parse(await readFile(join(rootDir, repositoryPath), "utf8"));

const createLicenseFingerprint = (descriptor: ResourceAssetDescriptor) =>
  createFingerprint({
    namespace: "resource-license",
    version: 1,
    value: descriptor.license,
  });

export const buildGpsM8FrozenInputs = async (rootDir: string) => {
  const [
    baseCatalog,
    overlay,
    timing,
    render,
    sealedNarration,
    narrativeReport,
  ] = await Promise.all([
    readJson(
      rootDir,
      "src/remotion/catalog/resource-catalog.generated.json",
    ).then(ResourceCatalogSchema.parse),
    readJson(rootDir, "src/projects/gps-relativity/resource-catalog.json").then(
      OverlaySchema.parse,
    ),
    readJson(
      rootDir,
      "src/projects/gps-relativity/generated/semantic-timing.generated.json",
    ).then(SemanticTimingSchema.parse),
    readJson(rootDir, "src/projects/gps-relativity/render.json").then(
      RenderSpecSchema.parse,
    ),
    readJson(
      rootDir,
      "src/projects/gps-relativity/generated/sealed-narration.generated.json",
    ).then(SealedNarrationManifestSchema.parse),
    readJson(
      rootDir,
      "src/projects/gps-relativity/generated/narrative-auto-check.generated.json",
    ).then(NarrativeAutoCheckReportSchema.parse),
  ]);
  if (
    overlay.baseCatalogFingerprint !== baseCatalog.catalogFingerprint ||
    timing.storyId !== STORY_ID ||
    timing.fps !== 30 ||
    timing.durationInFrames !== 1731 ||
    render.compositionId !== COMPOSITION_ID ||
    sealedNarration.storyId !== STORY_ID ||
    narrativeReport.storyId !== STORY_ID ||
    narrativeReport.aggregateStatus !== "pass"
  ) {
    throw new Error("GPS M8 source authority is stale.");
  }
  const baseIds = new Set(
    baseCatalog.entries.map((entry) => entry.descriptor.id),
  );
  if (overlay.descriptors.some((descriptor) => baseIds.has(descriptor.id))) {
    throw new Error("GPS M8 Catalog overlay cannot replace base descriptors.");
  }
  const overlayAssets = overlay.descriptors.map((descriptor) => {
    const asset = ResourceDescriptorSchema.parse(descriptor);
    if (asset.kind !== "asset") {
      throw new Error("GPS M8 Catalog overlay only accepts runtime assets.");
    }
    return asset;
  });
  await validateAssetDescriptorFiles(rootDir, overlayAssets);
  const globalAudioReceipt = await generateGpsGlobalAudio({
    rootDir,
    mode: "check",
  });
  const assemblyCatalog = buildResourceCatalog([
    ...baseCatalog.entries.map((entry) => entry.descriptor),
    ...overlayAssets,
  ]);
  const sceneBranch = await loadCurrentFinalSceneBranch({
    rootDir,
    projectId: STORY_ID,
  });
  const byRole = new Map(
    overlayAssets.map((asset) => [asset.mediaRole, asset]),
  );
  const receiptById = new Map<
    string,
    (typeof globalAudioReceipt.assets)[number]
  >(globalAudioReceipt.assets.map((asset) => [asset.resourceId, asset]));
  const soundAssets = (["cross-scene-ambience", "global-bgm"] as const).map(
    (role) => {
      const descriptor = byRole.get(role);
      if (descriptor === undefined) {
        throw new Error(`GPS M8 Catalog is missing ${role}.`);
      }
      const receipt = receiptById.get(descriptor.id);
      if (
        receipt === undefined ||
        receipt.role !== role ||
        receipt.localPath !== descriptor.localPath ||
        receipt.checksum !== descriptor.checksum ||
        receipt.license.id !== descriptor.license.id ||
        receipt.license.verificationStatus !==
          descriptor.license.verificationStatus ||
        receipt.license.sourceUrl !== descriptor.license.sourceUrl ||
        receipt.license.attributionRequired !==
          descriptor.license.attributionRequired ||
        receipt.license.attributionText !==
          descriptor.license.attributionText ||
        receipt.license.verifiedAt !== descriptor.license.verifiedAt ||
        descriptor.license.sourceEvidenceFingerprint !== receipt.checksum
      ) {
        throw new Error(`GPS M8 ${role} receipt and Catalog identity diverge.`);
      }
      return {
        resourceId: descriptor.id,
        role: role as "cross-scene-ambience" | "global-bgm",
        publicPath: descriptor.localPath,
        checksum: descriptor.checksum,
        descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
        licenseFingerprint: createLicenseFingerprint(descriptor),
        startFrame: 0 as const,
        endFrame: timing.durationInFrames,
      };
    },
  );
  const globalSoundPlan = createGlobalSoundPlan({
    schemaVersion: 1,
    planVersion: "global-sound-plan-v1",
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    fps: timing.fps,
    durationInFrames: timing.durationInFrames,
    semanticTimingFingerprint: timing.fingerprint,
    catalogFingerprint: assemblyCatalog.catalogFingerprint,
    assets: soundAssets,
    duckingPolicy: {
      policyId: "semantic-spoken-min-envelope-v1",
      attackFrames: 9,
      releaseFrames: 15,
      spokenGain: 0.32,
      unspokenGain: 1,
    },
    masteringPolicy: {
      policyId: "deterministic-gain-stage-v1",
      narrationGain: 1,
      sceneBusGain: 0.9,
      ambienceGain: 0.18,
      bgmGain: 0.22,
      integratedLoudnessMinLufs: -24,
      integratedLoudnessMaxLufs: -16,
      truePeakCeilingDbtp: -1,
    },
  });
  const globalVisualPlan = createGlobalVisualPlan({
    schemaVersion: 1,
    planVersion: "global-visual-plan-v1",
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    width: render.width,
    height: render.height,
    fps: render.fps,
    durationInFrames: timing.durationInFrames,
    captionSafeArea: render.captionSafeAreaPx,
    catalogFingerprint: assemblyCatalog.catalogFingerprint,
    frameTreatment: {
      inset: 24,
      borderWidth: 2,
      borderColor: "#9ee7ff",
      borderOpacity: 0.18,
      vignetteOpacity: 0.2,
      grainOpacity: 0.018,
    },
    continuityMotif: {
      color: "#65fbd2",
      strokeWidth: 3,
      opacity: 0.3,
      motionPolicy: "linear-frame-progress-v1",
      windows: [
        { startFrame: 349, endFrame: 373, axis: "x", direction: 1 },
        { startFrame: 684, endFrame: 708, axis: "x", direction: 1 },
        { startFrame: 1006, endFrame: 1030, axis: "x", direction: 1 },
        { startFrame: 1409, endFrame: 1445, axis: "y", direction: 1 },
      ],
    },
  });
  const soundDesignProjectionFingerprint =
    sceneBranch.soundDesignProjectionFingerprint;
  if (soundDesignProjectionFingerprint === null) {
    throw new Error("GPS M7 sound projection identity is missing.");
  }
  const finalSound = resolveGlobalSound({
    rawPlan: globalSoundPlan,
    rawTiming: timing,
    soundDesignProjectionFingerprint,
  });
  const globalVisualSourceChecksum = await checksumFile(
    join(
      rootDir,
      "src/projects/gps-relativity/global-visual/GlobalVisualLayers.tsx",
    ),
  );
  const globalVisualProjection = createGlobalVisualProjection({
    schemaVersion: 1,
    projectionVersion: "global-visual-projection-v1",
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    durationInFrames: timing.durationInFrames,
    globalVisualPlanFingerprint: globalVisualPlan.planFingerprint,
    sourceChecksum: globalVisualSourceChecksum,
  });
  const packageJson = z
    .object({ dependencies: z.record(z.string(), z.string()) })
    .passthrough()
    .parse(await readJson(rootDir, "package.json"));
  const remotionVersion = packageJson.dependencies.remotion;
  if (remotionVersion === undefined) {
    throw new Error("Exact Remotion version is missing.");
  }
  const finalAssemblyInput = FinalAssemblyPlanInputSchema.parse({
    schemaVersion: 1,
    planVersion: "final-assembly-plan-v1",
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    fps: render.fps,
    width: render.width,
    height: render.height,
    durationInFrames: timing.durationInFrames,
    remotionVersion,
    narrativeReportFingerprint: narrativeReport.reportFingerprint,
    sealedNarrationChecksum: sealedNarration.completeAudio.checksum,
    sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
    semanticTimingFingerprint: timing.fingerprint,
    captionCuesFingerprint: createFingerprint({
      namespace: "caption-cues",
      version: 1,
      value: timing.captionCues,
    }),
    resourceCatalogFingerprint: assemblyCatalog.catalogFingerprint,
    sceneCoverageFingerprint: sceneBranch.sceneCoverageFingerprint,
    scenePackageFingerprints: [...sceneBranch.scenePackageFingerprints].sort(),
    rendererRegistryFingerprint: sceneBranch.rendererRegistryFingerprint,
    storyVisualProjectionFingerprint:
      sceneBranch.storyVisualProjectionFingerprint,
    soundDesignProjectionFingerprint:
      sceneBranch.soundDesignProjectionFingerprint,
    globalSoundPlanFingerprint: globalSoundPlan.planFingerprint,
    finalSoundProjectionFingerprint:
      finalSound.projection.projectionFingerprint,
    globalVisualPlanFingerprint: globalVisualPlan.planFingerprint,
    globalVisualProjectionFingerprint:
      globalVisualProjection.projectionFingerprint,
    compositionSourceChecksum: await checksumFile(
      join(rootDir, "src/projects/gps-relativity/Composition.tsx"),
    ),
    zOrderVersion: "scene-global-visual-caption-v1",
    mixOrderVersion: "narration-scene-ambience-bgm-v1",
  });
  return {
    baseCatalog,
    assemblyCatalog,
    globalAudioReceipt,
    globalSoundPlan,
    globalVisualPlan,
    finalSound,
    globalVisualProjection,
    finalAssemblyInput,
    finalAssembly: createFinalAssemblyPlan(finalAssemblyInput),
  } as const;
};

export const freezeGpsM8Inputs = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: "write" | "check";
}) => {
  const frozen = await buildGpsM8FrozenInputs(rootDir);
  const outputs = [
    {
      path: "src/projects/gps-relativity/generated/resource-catalog.generated.json",
      value: frozen.assemblyCatalog,
    },
    {
      path: "src/projects/gps-relativity/global-sound-plan.json",
      value: frozen.globalSoundPlan,
    },
    {
      path: "src/projects/gps-relativity/global-visual-plan.json",
      value: frozen.globalVisualPlan,
    },
    {
      path: "src/projects/gps-relativity/generated/global-visual-projection.generated.json",
      value: frozen.globalVisualProjection,
    },
    {
      path: "src/projects/gps-relativity/final-assembly-plan.json",
      value: frozen.finalAssemblyInput,
    },
  ];
  for (const output of outputs) {
    await writeOrCheckSceneArtifact({
      destination: join(rootDir, output.path),
      value: output.value,
      mode,
    });
  }
  return frozen;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || (mode !== "write" && mode !== "check")) {
    throw new Error("Expected exactly write or check.");
  }
  freezeGpsM8Inputs({ rootDir: process.cwd(), mode }).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "M8 GPS freeze failed."}\n`,
      );
      process.exitCode = 1;
    },
  );
}
