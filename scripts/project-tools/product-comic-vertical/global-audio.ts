import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
  serializeCanonicalJson,
  type ResourceAssetDescriptor,
} from "../../../src/contracts";
import { rendererRegistryFingerprint } from "../../../src/projects/product-comic-vertical/renderer-registry.generated";
import {
  productComicVerticalSoundDesignProjection,
  productComicVerticalStoryVisualProjection,
} from "../../../src/projects/product-comic-vertical/scene-runtime-data";
import { resolveGlobalSound } from "../../../src/remotion/runtime/global-sound";
import { buildResourceCatalog } from "../../catalog/domain";
import { checksumFile } from "../../project-check/project-files";
import { writeOrCheckSceneArtifact } from "../../scene-package/project-files";

const STORY_ID = "product-comic-vertical";
const COMPOSITION_ID = "ProductComicVertical";
const SAMPLE_RATE = 48_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const FPS = 30;
const DURATION_IN_FRAMES = 5116;
const SAMPLE_FRAME_COUNT = (DURATION_IN_FRAMES * SAMPLE_RATE) / FPS;
const GLOBAL_ASSET_PREFIX = `asset.${STORY_ID}.global.`;

const assetSpecs = [
  {
    resourceId: `${GLOBAL_ASSET_PREFIX}cross-scene-ambience`,
    role: "cross-scene-ambience",
    fileName: "cross-scene-ambience.wav",
    title: "Product comic paper-room ambience",
    description:
      "Project-authored full-length PCM paper-room and ink-table ambience for cross-Scene continuity; it owns no Scene-local cue.",
    synthesisId: "product-comic-paper-room-v1",
  },
  {
    resourceId: `${GLOBAL_ASSET_PREFIX}bgm`,
    role: "global-bgm",
    fileName: "global-bgm.wav",
    title: "Product comic restrained momentum bed",
    description:
      "Project-authored full-length low-density PCM music bed supporting the problem-to-workflow-to-proof progression.",
    synthesisId: "product-comic-restrained-momentum-v1",
  },
] as const;

type AssetSpec = (typeof assetSpecs)[number];
type Mode = "write" | "check";

const ProjectOverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.literal(STORY_ID),
    overlayVersion: z.literal("product-comic-vertical-m9-resource-overlay-v1"),
    baseCatalogFingerprint: Sha256DigestSchema,
    descriptors: z.array(ResourceDescriptorSchema),
  })
  .strict();

const GlobalAudioReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatorVersion: z.literal("product-comic-vertical-m9-global-audio-v1"),
    storyId: z.literal(STORY_ID),
    fps: z.literal(FPS),
    durationInFrames: z.literal(DURATION_IN_FRAMES),
    assets: z
      .array(
        z
          .object({
            resourceId: z.string().startsWith(GLOBAL_ASSET_PREFIX),
            role: z.enum(["cross-scene-ambience", "global-bgm"]),
            localPath: z
              .string()
              .startsWith(`public/projects/${STORY_ID}/global-audio/`),
            synthesisId: z.enum([
              "product-comic-paper-room-v1",
              "product-comic-restrained-momentum-v1",
            ]),
            sampleRate: z.literal(SAMPLE_RATE),
            channels: z.literal(CHANNELS),
            bitsPerSample: z.literal(BITS_PER_SAMPLE),
            sampleFrameCount: z.literal(SAMPLE_FRAME_COUNT),
            checksum: Sha256DigestSchema,
            license: z
              .object({
                id: z.literal("Project-Authored"),
                verificationStatus: z.literal("verified"),
                sourceUrl: z.null(),
                attributionRequired: z.literal(false),
                attributionText: z.null(),
                verifiedAt: z.literal("2026-08-04T00:00:00.000Z"),
              })
              .strict(),
          })
          .strict(),
      )
      .length(2),
    receiptFingerprint: Sha256DigestSchema,
  })
  .strict();

const checksumBytes = (bytes: Buffer) =>
  `sha256:${createHash("sha256")
    .update(bytes.toString("latin1"), "latin1")
    .digest("hex")}`;

const writeWaveHeader = (buffer: Buffer) => {
  const dataBytes = SAMPLE_FRAME_COUNT * CHANNELS * (BITS_PER_SAMPLE / 8);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
  buffer.writeUInt16LE(CHANNELS * 2, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
};

const oscillator = (frequency: number, sampleIndex: number, phase = 0) =>
  Math.sin((2 * Math.PI * frequency * sampleIndex) / SAMPLE_RATE + phase);

const fadeEnvelope = (sampleIndex: number) => {
  const fadeSamples = SAMPLE_RATE * 1.2;
  return Math.max(
    0,
    Math.min(
      1,
      sampleIndex / fadeSamples,
      (SAMPLE_FRAME_COUNT - 1 - sampleIndex) / fadeSamples,
    ),
  );
};

const synthesizeSample = (spec: AssetSpec, sampleIndex: number) => {
  const time = sampleIndex / SAMPLE_RATE;
  if (spec.role === "cross-scene-ambience") {
    const roomBreath = 0.72 + 0.28 * oscillator(0.041, sampleIndex, 0.4);
    const paperGrain =
      oscillator(91, sampleIndex, 0.2) * oscillator(0.31, sampleIndex, 1.2);
    const inkTable =
      0.52 * oscillator(37, sampleIndex) +
      0.31 * oscillator(53, sampleIndex, 0.9) +
      0.17 * paperGrain;
    return fadeEnvelope(sampleIndex) * roomBreath * inkTable * 0.405;
  }
  const barSeconds = 8;
  const barProgress = (time % barSeconds) / barSeconds;
  const pulse = Math.pow(Math.max(0, 1 - barProgress * 3.1), 2.2);
  const phrase = Math.floor(time / barSeconds) % 4;
  const roots = [55, 65.406, 73.416, 82.407] as const;
  const root = roots[phrase] ?? roots[0];
  const chord =
    0.55 * oscillator(root, sampleIndex) +
    0.28 * oscillator(root * 1.5, sampleIndex, 0.35) +
    0.17 * oscillator(root * 2, sampleIndex, 0.8);
  const restrainedLift = 0.58 + 0.42 * oscillator(0.015625, sampleIndex, -1.2);
  return (
    fadeEnvelope(sampleIndex) *
    (0.3 + 0.7 * pulse) *
    restrainedLift *
    chord *
    0.765
  );
};

const renderCanonicalWav = (spec: AssetSpec) => {
  const wav = Buffer.alloc(44 + SAMPLE_FRAME_COUNT * 2);
  writeWaveHeader(wav);
  for (let index = 0; index < SAMPLE_FRAME_COUNT; index += 1) {
    const sample = Math.max(-1, Math.min(1, synthesizeSample(spec, index)));
    wav.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }
  return wav;
};

export const inspectCanonicalWav = (bytes: ArrayLike<number>) => {
  const wav = Buffer.from(Array.from(bytes));
  if (
    wav.length < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE" ||
    wav.toString("ascii", 12, 16) !== "fmt " ||
    wav.readUInt16LE(20) !== 1 ||
    wav.toString("ascii", 36, 40) !== "data" ||
    wav.readUInt32LE(40) !== wav.length - 44
  ) {
    throw new Error("M9 global audio must be canonical PCM WAV.");
  }
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34);
  if (
    channels !== CHANNELS ||
    sampleRate !== SAMPLE_RATE ||
    bitsPerSample !== BITS_PER_SAMPLE
  ) {
    throw new Error("M9 global audio must be 48 kHz mono s16le PCM.");
  }
  return {
    sampleRate,
    channels,
    bitsPerSample,
    sampleFrameCount: (wav.length - 44) / (channels * 2),
  } as const;
};

const assetPath = (spec: AssetSpec) =>
  `public/projects/${STORY_ID}/global-audio/${spec.fileName}`;

const buildDescriptor = (spec: AssetSpec, bytes: Buffer) => {
  const checksum = checksumBytes(bytes);
  const descriptor = ResourceDescriptorSchema.parse({
    schemaVersion: 1,
    id: spec.resourceId,
    kind: "asset",
    status: "approved",
    title: spec.title,
    description: spec.description,
    useCases: [
      spec.role === "global-bgm"
        ? "narration-led global music bed"
        : "cross-scene continuity ambience",
    ],
    tags: ["audio", "m9", "product-comic-vertical", spec.role].sort(),
    authority: {
      kind: "repository-file",
      repositoryPath: `src/projects/${STORY_ID}/resource-catalog.json`,
    },
    allowedUse: "runtime-approved",
    assetKind: "audio",
    mediaRole: spec.role,
    localPath: assetPath(spec),
    checksum,
    license: {
      id: "Project-Authored",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: "2026-08-04T00:00:00.000Z",
      sourceEvidenceFingerprint: checksum,
    },
    media: {
      durationInSeconds: DURATION_IN_FRAMES / FPS,
      codec: "pcm_s16le",
      sampleRate: SAMPLE_RATE,
    },
  });
  if (descriptor.kind !== "asset") {
    throw new Error("M9 global audio descriptor must be an asset.");
  }
  return descriptor;
};

const createLicenseFingerprint = (descriptor: ResourceAssetDescriptor) =>
  createFingerprint({
    namespace: "resource-license",
    version: 1,
    value: descriptor.license,
  });

const writeBytesAtomic = async (destination: string, bytes: Buffer) => {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(bytes.toString("latin1"), "latin1");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

const readJson = async (rootDir: string, repositoryPath: string) =>
  JSON.parse(await readFile(join(rootDir, repositoryPath), "utf8"));

const buildTask8Inputs = async (rootDir: string) => {
  const renderedAssets = assetSpecs.map((spec) => ({
    spec,
    bytes: renderCanonicalWav(spec),
  }));
  const [
    baseCatalog,
    currentOverlay,
    timing,
    render,
    sealed,
    narrative,
    coverage,
    packageJson,
  ] = await Promise.all([
    readJson(
      rootDir,
      "src/remotion/catalog/resource-catalog.generated.json",
    ).then(ResourceCatalogSchema.parse),
    readJson(rootDir, `src/projects/${STORY_ID}/resource-catalog.json`).then(
      ProjectOverlaySchema.parse,
    ),
    readJson(
      rootDir,
      `src/projects/${STORY_ID}/generated/semantic-timing.generated.json`,
    ).then(SemanticTimingSchema.parse),
    readJson(rootDir, `src/projects/${STORY_ID}/render.json`).then(
      RenderSpecSchema.parse,
    ),
    readJson(
      rootDir,
      `src/projects/${STORY_ID}/generated/sealed-narration.generated.json`,
    ).then(SealedNarrationManifestSchema.parse),
    readJson(
      rootDir,
      `src/projects/${STORY_ID}/generated/narrative-auto-check.generated.json`,
    ).then(NarrativeAutoCheckReportSchema.parse),
    readJson(
      rootDir,
      `src/projects/${STORY_ID}/generated/scene-coverage.generated.json`,
    ).then(
      z
        .object({
          coverageFingerprint: Sha256DigestSchema,
          entries: z.array(
            z.object({ packageFingerprint: Sha256DigestSchema }).passthrough(),
          ),
        })
        .passthrough().parse,
    ),
    readJson(rootDir, "package.json").then(
      z.object({ dependencies: z.record(z.string(), z.string()) }).passthrough()
        .parse,
    ),
  ]);
  if (
    currentOverlay.baseCatalogFingerprint !== baseCatalog.catalogFingerprint ||
    timing.storyId !== STORY_ID ||
    timing.fps !== FPS ||
    timing.durationInFrames !== DURATION_IN_FRAMES ||
    render.compositionId !== COMPOSITION_ID ||
    render.width !== 1080 ||
    render.height !== 1920 ||
    sealed.storyId !== STORY_ID ||
    narrative.storyId !== STORY_ID ||
    narrative.aggregateStatus !== "pass"
  ) {
    throw new Error("M9 Task 8 source authority is stale.");
  }
  const descriptors = renderedAssets.map(({ spec, bytes }) =>
    buildDescriptor(spec, bytes),
  );
  const overlay = ProjectOverlaySchema.parse({
    ...currentOverlay,
    descriptors: [
      ...currentOverlay.descriptors.filter(
        (descriptor) => !descriptor.id.startsWith(GLOBAL_ASSET_PREFIX),
      ),
      ...descriptors,
    ].sort((left, right) => left.id.localeCompare(right.id)),
  });
  const assemblyCatalog = buildResourceCatalog([
    ...baseCatalog.entries.map(({ descriptor }) => descriptor),
    ...overlay.descriptors,
  ]);
  const receiptInput = {
    schemaVersion: 1 as const,
    generatorVersion: "product-comic-vertical-m9-global-audio-v1" as const,
    storyId: STORY_ID,
    fps: FPS,
    durationInFrames: DURATION_IN_FRAMES,
    assets: renderedAssets.map(({ spec, bytes }) => ({
      resourceId: spec.resourceId,
      role: spec.role,
      localPath: assetPath(spec),
      synthesisId: spec.synthesisId,
      ...inspectCanonicalWav(bytes),
      checksum: checksumBytes(bytes),
      license: {
        id: "Project-Authored" as const,
        verificationStatus: "verified" as const,
        sourceUrl: null,
        attributionRequired: false as const,
        attributionText: null,
        verifiedAt: "2026-08-04T00:00:00.000Z" as const,
      },
    })),
  };
  const globalAudioReceipt = GlobalAudioReceiptSchema.parse({
    ...receiptInput,
    receiptFingerprint: createFingerprint({
      namespace: "product-comic-vertical-m9-global-audio-receipt",
      version: 1,
      value: receiptInput,
    }),
  });
  const byRole = new Map(
    descriptors.map((descriptor) => [descriptor.mediaRole, descriptor]),
  );
  const soundAssets = (["cross-scene-ambience", "global-bgm"] as const).map(
    (role) => {
      const descriptor = byRole.get(role);
      if (descriptor?.kind !== "asset") {
        throw new Error(`M9 Catalog is missing ${role}.`);
      }
      return {
        resourceId: descriptor.id,
        role,
        publicPath: descriptor.localPath,
        checksum: descriptor.checksum,
        descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
        licenseFingerprint: createLicenseFingerprint(descriptor),
        startFrame: 0 as const,
        endFrame: DURATION_IN_FRAMES,
      };
    },
  );
  const globalSoundPlan = createGlobalSoundPlan({
    schemaVersion: 1,
    planVersion: "global-sound-plan-v1",
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    fps: FPS,
    durationInFrames: DURATION_IN_FRAMES,
    semanticTimingFingerprint: timing.fingerprint,
    catalogFingerprint: assemblyCatalog.catalogFingerprint,
    assets: soundAssets,
    duckingPolicy: {
      policyId: "semantic-spoken-min-envelope-v1",
      attackFrames: 9,
      releaseFrames: 15,
      spokenGain: 0.7,
      unspokenGain: 1,
    },
    masteringPolicy: {
      policyId: "deterministic-gain-stage-v1",
      narrationGain: 1,
      sceneBusGain: 0.82,
      ambienceGain: 0.55,
      bgmGain: 0.9,
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
      inset: 20,
      borderWidth: 3,
      borderColor: "#f3d6a4",
      borderOpacity: 0.22,
      vignetteOpacity: 0.16,
      grainOpacity: 0.025,
    },
    continuityMotif: {
      color: "#f15b45",
      strokeWidth: 4,
      opacity: 0.34,
      motionPolicy: "linear-frame-progress-v1",
      windows: timing.storyBeats.slice(0, -1).map((beat, index) => ({
        startFrame: beat.endFrame - 18,
        endFrame: beat.endFrame + 18,
        axis: index % 3 === 1 ? ("y" as const) : ("x" as const),
        direction: index % 2 === 0 ? (1 as const) : (-1 as const),
      })),
    },
  });
  const finalSound = resolveGlobalSound({
    rawPlan: globalSoundPlan,
    rawTiming: timing,
    soundDesignProjectionFingerprint:
      productComicVerticalSoundDesignProjection.soundDesignProjectionFingerprint,
  });
  const globalVisualProjection = createGlobalVisualProjection({
    schemaVersion: 1,
    projectionVersion: "global-visual-projection-v1",
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    durationInFrames: DURATION_IN_FRAMES,
    globalVisualPlanFingerprint: globalVisualPlan.planFingerprint,
    sourceChecksum: await checksumFile(
      join(
        rootDir,
        `src/projects/${STORY_ID}/global-visual/GlobalVisualLayers.tsx`,
      ),
    ),
  });
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
    narrativeReportFingerprint: narrative.reportFingerprint,
    sealedNarrationChecksum: sealed.completeAudio.checksum,
    sealedNarrationFingerprint: sealed.sealedNarrationFingerprint,
    semanticTimingFingerprint: timing.fingerprint,
    captionCuesFingerprint: createFingerprint({
      namespace: "caption-cues",
      version: 1,
      value: timing.captionCues,
    }),
    resourceCatalogFingerprint: assemblyCatalog.catalogFingerprint,
    sceneCoverageFingerprint: coverage.coverageFingerprint,
    scenePackageFingerprints: coverage.entries
      .map(({ packageFingerprint }) => packageFingerprint)
      .sort(),
    rendererRegistryFingerprint,
    storyVisualProjectionFingerprint:
      productComicVerticalStoryVisualProjection.projectionFingerprint,
    soundDesignProjectionFingerprint:
      productComicVerticalSoundDesignProjection.soundDesignProjectionFingerprint,
    globalSoundPlanFingerprint: globalSoundPlan.planFingerprint,
    finalSoundProjectionFingerprint:
      finalSound.projection.projectionFingerprint,
    globalVisualPlanFingerprint: globalVisualPlan.planFingerprint,
    globalVisualProjectionFingerprint:
      globalVisualProjection.projectionFingerprint,
    compositionSourceChecksum: await checksumFile(
      join(rootDir, `src/projects/${STORY_ID}/Composition.tsx`),
    ),
    zOrderVersion: "scene-global-visual-caption-v1",
    mixOrderVersion: "narration-scene-ambience-bgm-v1",
  });
  return {
    renderedAssets,
    overlay,
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

export const validateProductComicGlobalAudio = async ({
  rootDir,
}: {
  readonly rootDir: string;
}) => {
  const expected = await buildTask8Inputs(rootDir);
  const receipt = GlobalAudioReceiptSchema.parse(
    await readJson(
      rootDir,
      `src/projects/${STORY_ID}/generated/global-audio.generated.json`,
    ),
  );
  if (
    serializeCanonicalJson(receipt) !==
    serializeCanonicalJson(expected.globalAudioReceipt)
  ) {
    throw new Error("M9 global audio receipt is stale.");
  }
  for (const { spec, bytes } of expected.renderedAssets) {
    const current = await readFile(join(rootDir, assetPath(spec)));
    if (
      current.length !== bytes.length ||
      !current.every((value, index) => value === bytes[index])
    ) {
      throw new Error(`M9 global audio bytes are stale: ${spec.role}.`);
    }
    const facts = inspectCanonicalWav(current);
    if (facts.sampleFrameCount !== SAMPLE_FRAME_COUNT) {
      throw new Error(`M9 global audio duration is stale: ${spec.role}.`);
    }
  }
  return receipt;
};

export const generateProductComicGlobalAudio = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: Mode;
}) => {
  const expected = await buildTask8Inputs(rootDir);
  if (mode === "write") {
    for (const { spec, bytes } of expected.renderedAssets) {
      await writeBytesAtomic(join(rootDir, assetPath(spec)), bytes);
    }
  }
  const outputs = [
    {
      path: `src/projects/${STORY_ID}/resource-catalog.json`,
      value: expected.overlay,
    },
    {
      path: `src/projects/${STORY_ID}/generated/resource-catalog.generated.json`,
      value: expected.assemblyCatalog,
    },
    {
      path: `src/projects/${STORY_ID}/generated/global-audio.generated.json`,
      value: expected.globalAudioReceipt,
    },
    {
      path: `src/projects/${STORY_ID}/global-sound-plan.json`,
      value: expected.globalSoundPlan,
    },
    {
      path: `src/projects/${STORY_ID}/global-visual-plan.json`,
      value: expected.globalVisualPlan,
    },
    {
      path: `src/projects/${STORY_ID}/generated/global-visual-projection.generated.json`,
      value: expected.globalVisualProjection,
    },
    {
      path: `src/projects/${STORY_ID}/final-assembly-plan.json`,
      value: expected.finalAssemblyInput,
    },
  ];
  for (const output of outputs) {
    await writeOrCheckSceneArtifact({
      destination: join(rootDir, output.path),
      value: output.value,
      mode,
    });
  }
  await validateProductComicGlobalAudio({ rootDir });
  process.stdout.write(
    `M9 global audio ${mode}: 2 PCM assets, ${SAMPLE_FRAME_COUNT} sample frames each.\n`,
  );
  return expected;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || (mode !== "write" && mode !== "check")) {
    throw new Error("Expected exactly write or check.");
  }
  generateProductComicGlobalAudio({ rootDir: process.cwd(), mode }).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "M9 global audio failed."}\n`,
      );
      process.exitCode = 1;
    },
  );
}
