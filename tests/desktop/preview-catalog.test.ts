import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildRepositoryPreviewCatalog } from "../../desktop/adapters/repository-preview-catalog";
import {
  DELIVERY_BUILD_POLICY_VERSION,
  ProductionInspectionSchema,
  ProjectRegistrationDescriptorSchema,
  Sha256DigestSchema,
  SemanticTimingSchema,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  createDeliveryBuildId,
  type DeliveryPublish,
  type SemanticTiming,
} from "../../src/contracts";

const digest = (character: string) =>
  Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
const revision = (character: string) =>
  `revision-${character.repeat(64)}` as const;

const createTiming = ({
  storyId,
  fps = 30,
  durationInFrames = 90,
}: {
  readonly storyId: string;
  readonly fps?: number;
  readonly durationInFrames?: number;
}): SemanticTiming =>
  SemanticTimingSchema.parse({
    schemaVersion: 3,
    algorithmId: "pcm-cumulative-ceil-v1",
    storyId,
    fingerprint: digest("a"),
    sampleRate: 48_000,
    fps,
    leadInFrames: 0,
    tailFrames: 0,
    narrationStartFrame: 0,
    durationInFrames,
    segments: [
      {
        kind: "chunk",
        chunkId: "opening-one",
        meaningId: "opening",
        ttsText: "Opening narration",
        sampleRange: { startSampleFrame: 0, endSampleFrame: 48_000 },
        frameRange: { startFrame: 0, endFrame: durationInFrames },
      },
    ],
    captionCues: [
      {
        chunkId: "opening-one",
        meaningId: "opening",
        text: "Opening narration",
        startFrame: 0,
        endFrame: durationInFrames,
      },
    ],
    storyBeats: [
      {
        kind: "narrated-scene",
        meaningId: "opening",
        startFrame: 0,
        endFrame: durationInFrames,
      },
    ],
  });

const createPublish = ({
  storyId,
  revisionId = revision("b"),
}: {
  readonly storyId: string;
  readonly revisionId?: `revision-${string}`;
}): DeliveryPublish => {
  const identity = {
    storyId,
    revisionId,
    artifactSetFingerprint: digest("c"),
    compositionId: `${storyId.replaceAll("-", "_")}_composition`,
    fps: 30,
    frameCount: 90,
    width: 1080,
    height: 1920,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  } as const;
  const publishing = buildDeliveryPublishing({
    storyId,
    title: `Preview ${storyId}`,
    description: "A verified Desktop preview delivery.",
    topics: ["desktop", "preview", "timeline", "video", "scene", "remotion"],
    collection: "Desktop previews",
    outputFileName: "video.mp4",
    coverFileNames: {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
    fps: identity.fps,
    frameCount: identity.frameCount,
    plannedDurationSeconds: 3,
    chapters: [
      {
        meaningId: "opening",
        name: "开场",
        startFrame: 0,
        timecode: "00:00:00",
      },
    ],
  });
  return buildDeliveryPublish({
    ...identity,
    deliveryBuildId: createDeliveryBuildId(identity),
    artifacts: {
      video: {
        repositoryPath: `deliveries/${storyId}/video.mp4`,
        checksum: digest("d"),
        sizeBytes: 1_024,
        media: {
          codec: "h264",
          audioCodec: "aac",
          audioChannels: 2,
          width: identity.width,
          height: identity.height,
          fps: identity.fps,
          frameCount: identity.frameCount,
          decodedToEof: true,
        },
      },
      cover4x3: {
        repositoryPath: `deliveries/${storyId}/cover-4x3.png`,
        checksum: digest("e"),
        sizeBytes: 512,
        media: {
          imageFormat: "png",
          width: 1600,
          height: 1200,
          decodedToEof: true,
        },
      },
      cover3x4: {
        repositoryPath: `deliveries/${storyId}/cover-3x4.png`,
        checksum: digest("f"),
        sizeBytes: 512,
        media: {
          imageFormat: "png",
          width: 1200,
          height: 1600,
          decodedToEof: true,
        },
      },
    },
    publishing,
  });
};

const createProject = (publish: DeliveryPublish) => ({
  descriptor: ProjectRegistrationDescriptorSchema.parse({
    storyId: publish.storyId,
    id: publish.compositionId,
    fps: publish.fps,
    width: publish.width,
    height: publish.height,
    durationInFrames: publish.frameCount,
    defaultProps: { projectId: publish.storyId },
    compositionModulePath: `./${publish.storyId}/Composition`,
  }),
  generatedEntryChecksum: digest("1"),
  projectRegistryEntryFingerprint: digest("2"),
  narrativeBaselineFingerprint: digest("3"),
});

const createInspection = ({
  storyId,
  revisionId = revision("b"),
}: {
  readonly storyId: string;
  readonly revisionId?: `revision-${string}`;
}) =>
  ProductionInspectionSchema.parse({
    schemaVersion: 1,
    contractVersion: "production-inspection-v1",
    storyId,
    sourceState: "production-inputs-ready",
    currentRevisionId: revisionId,
    baseline: { kind: "current-delivery", revisionId },
    estimatedCost: {
      providerRequests: 0,
      providerCacheHits: 1,
      agentTasks: 0,
      deliveryMedia: [],
    },
    tasks: [],
    nextAction: "converge-current",
  });

test("repository Preview Catalog exposes only current verified deliveries in stable order", async () => {
  const publishes = new Map(
    ["story-zeta", "story-alpha"].map((storyId) => [
      storyId,
      createPublish({ storyId }),
    ]),
  );
  const catalog = await buildRepositoryPreviewCatalog({
    repositoryRoot: "/repository",
    dependencies: {
      discoverProjects: async () => [
        "src/projects/story-zeta/Composition.tsx",
        "src/projects/story-alpha/Composition.tsx",
      ],
      loadProject: async ({ compositionPath }) => {
        const storyId = compositionPath.split("/")[2]!;
        return createProject(publishes.get(storyId)!);
      },
      inspectProduction: async ({ projectId }) =>
        createInspection({ storyId: projectId }),
      inspectDelivery: async ({ storyId }) => publishes.get(storyId)!,
      readTiming: async ({ storyId }) => createTiming({ storyId }),
    },
  });

  assert.deepEqual(
    catalog.entries.map(({ storyId }) => storyId),
    ["story-alpha", "story-zeta"],
  );
  assert.deepEqual(catalog.unavailable, []);
  assert.equal(catalog.entries[0]?.timeline.scenes[0]?.label, "开场");
  assert.equal(catalog.entries[0]?.timeline.narration[0]?.startFrame, 0);
  assert.doesNotMatch(
    JSON.stringify(catalog),
    /repositoryPath|absolutePath|\/repository/iu,
  );
});

test("repository Preview Catalog isolates Project failures behind fixed reason codes", async () => {
  const storyIds = [
    "source-broken",
    "delivery-missing",
    "delivery-stale",
    "delivery-invalid",
    "source-race",
    "timing-drift",
    "valid-project",
  ];
  const publishes = new Map(
    storyIds.map((storyId) => [storyId, createPublish({ storyId })]),
  );
  const inspectionReads = new Map<string, number>();
  const catalog = await buildRepositoryPreviewCatalog({
    repositoryRoot: "/private/repository",
    dependencies: {
      discoverProjects: async () =>
        [...storyIds]
          .reverse()
          .map((storyId) => `src/projects/${storyId}/Composition.tsx`),
      loadProject: async ({ compositionPath }) => {
        const storyId = compositionPath.split("/")[2]!;
        if (storyId === "source-broken") {
          throw new Error("/private/repository/source-secret");
        }
        return createProject(publishes.get(storyId)!);
      },
      inspectProduction: async ({ projectId }) => {
        inspectionReads.set(
          projectId,
          (inspectionReads.get(projectId) ?? 0) + 1,
        );
        if (projectId === "delivery-invalid") {
          throw new Error("ffprobe /private/repository/delivery-invalid");
        }
        return createInspection({
          storyId: projectId,
          revisionId:
            projectId === "delivery-stale" ||
            (projectId === "source-race" &&
              (inspectionReads.get(projectId) ?? 0) > 1)
              ? revision("9")
              : revision("b"),
        });
      },
      inspectDelivery: async ({ storyId }) => {
        if (storyId === "delivery-missing") return null;
        if (storyId === "delivery-invalid") {
          throw new Error("invalid media at /private/repository/video.mp4");
        }
        return publishes.get(storyId)!;
      },
      readTiming: async ({ storyId }) =>
        createTiming({ storyId, fps: storyId === "timing-drift" ? 24 : 30 }),
    },
  });

  assert.deepEqual(
    catalog.entries.map(({ storyId }) => storyId),
    ["valid-project"],
  );
  assert.deepEqual(catalog.unavailable, [
    { storyId: "delivery-invalid", code: "delivery-invalid" },
    { storyId: "delivery-missing", code: "delivery-missing" },
    { storyId: "delivery-stale", code: "delivery-stale" },
    { storyId: "source-broken", code: "source-not-ready" },
    { storyId: "source-race", code: "delivery-stale" },
    { storyId: "timing-drift", code: "timing-invalid" },
  ]);
  assert.doesNotMatch(JSON.stringify(catalog), /private|ffprobe|video\.mp4/iu);
});

test("repository Preview Catalog rejects discovered path escape before repository reads", async () => {
  let reads = 0;
  await assert.rejects(
    buildRepositoryPreviewCatalog({
      repositoryRoot: "/repository",
      dependencies: {
        discoverProjects: async () => ["../outside/Composition.tsx"],
        loadProject: async () => {
          reads += 1;
          throw new Error("must-not-read");
        },
      },
    }),
    /fixed convention/u,
  );
  assert.equal(reads, 0);
});

test("repository Preview Catalog never follows a SemanticTiming symlink", async (context) => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "preview-catalog-"));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const generatedRoot = join(
    repositoryRoot,
    "src/projects/symlink-project/generated",
  );
  await mkdir(generatedRoot, { recursive: true });
  const outside = join(repositoryRoot, "outside.json");
  await writeFile(
    outside,
    `${JSON.stringify(createTiming({ storyId: "symlink-project" }))}\n`,
  );
  await symlink(outside, join(generatedRoot, "semantic-timing.generated.json"));
  const publish = createPublish({ storyId: "symlink-project" });

  const catalog = await buildRepositoryPreviewCatalog({
    repositoryRoot,
    dependencies: {
      discoverProjects: async () => [
        "src/projects/symlink-project/Composition.tsx",
      ],
      loadProject: async () => createProject(publish),
      inspectProduction: async () =>
        createInspection({ storyId: "symlink-project" }),
      inspectDelivery: async () => publish,
    },
  });

  assert.deepEqual(catalog.entries, []);
  assert.deepEqual(catalog.unavailable, [
    { storyId: "symlink-project", code: "timing-invalid" },
  ]);
  assert.doesNotMatch(
    JSON.stringify(catalog),
    /outside\.json|\/tmp\/preview-catalog-/iu,
  );
});
