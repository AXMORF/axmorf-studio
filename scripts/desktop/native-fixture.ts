import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  NARRATION_MASTERING_POLICY,
  NarrationSpecSchema,
  RenderSpecSchema,
  SealedNarrationManifestSchema,
  StorySpecSchema,
  buildDeliveryPublishing,
  buildMasteredNarrationManifest,
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  createFingerprint,
  deriveCoverCompositionBaseId,
  generateSemanticTiming,
  resolveCurrentPublishingIntent,
  serializeCanonicalJson,
} from "../../src/contracts";
import { buildRepositoryPreviewCatalog } from "../../desktop/adapters/repository-preview-catalog";
import { writeProducerConfig } from "../config/producer-config";
import { encodeCanonicalPcmWav, sha256Bytes } from "../narration/domain/pcm-wav";
import { buildDelivery } from "../project-production/application/build-delivery";
import { readCurrentProductionRevision } from "../project-production/application/current-revision";
import { inspectCurrentDelivery } from "../project-production/adapters/current-delivery-inspection";
import { createProject, projectPendingSceneAuthoring } from "../projects/application/create-project";
import { generateProjectRegistry } from "../registry/generate";
import {
  validProjectCreateInput,
  validProjectCreateProducerConfig,
} from "../../tests/fixtures/project-create";

const STORY_ID = "desktop-native-fixture" as const;
const json = (value: unknown) => `${serializeCanonicalJson(value)}\n`;
const write = async (path: string, value: string | Uint8Array) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
};

const tone = ({ seconds, frequency }: { seconds: number; frequency: number }) => {
  const sampleRate = 48_000;
  const samples = Math.round(seconds * sampleRate);
  const pcm = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 1_200, (samples - index) / 1_200);
    const value = Math.round(
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) *
        4_000 *
        Math.max(0, envelope),
    );
    pcm.writeInt16LE(value, index * 2);
  }
  return pcm;
};

const createInput = () => ({
  ...validProjectCreateInput,
  storyId: STORY_ID,
  brief: {
    ...validProjectCreateInput.brief,
    storyId: STORY_ID,
    title: "AXMORF native playback proof",
    targetDurationSeconds: 4,
  },
  story: {
    schemaVersion: 3,
    storyId: STORY_ID,
    title: "AXMORF native playback proof",
    beats: [
      {
        kind: "narrated-scene",
        meaningId: "opening",
        narrativePurpose: "Prove the first native Scene and narration chunk.",
        ttsChunks: [
          { chunkId: "opening-01", ttsText: "Native playback starts." },
        ],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 500 }],
      },
      {
        kind: "narrated-scene",
        meaningId: "closing",
        narrativePurpose: "Prove the second Scene boundary and final caption.",
        ttsChunks: [
          { chunkId: "closing-01", ttsText: "Native playback is current." },
        ],
        explicitPauses: [],
      },
    ],
  },
  scenes: [
    {
      ...validProjectCreateInput.scenes[0],
      meaningId: "opening",
      visualIntent: "Show the first native playback state.",
    },
    {
      ...validProjectCreateInput.scenes[0],
      meaningId: "closing",
      visualIntent: "Show the second native playback state.",
      continuityBrief: "Cut cleanly from the opening proof.",
    },
  ],
  render: {
    ...validProjectCreateInput.render,
    compositionId: "DesktopNativeFixture",
    leadInFrames: 15,
    tailFrames: 15,
  },
  publishing: {
    ...validProjectCreateInput.publishing,
    description: "A real current Delivery created for the Apple Silicon native gate.",
    chapters: [
      { meaningId: "opening", name: "开场" },
      { meaningId: "closing", name: "边界" },
    ],
  },
});

const projectComposition = `import type {FC} from "react";
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame} from "remotion";

const NativeFixture: FC = () => {
  const frame = useCurrentFrame();
  const closing = frame >= 60;
  const scale = interpolate(frame % 60, [0, 18], [0.82, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return <AbsoluteFill style={{backgroundColor: closing ? "#a37d5c" : "#242424", color: "#fffdf9", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif"}}>
    <Audio src={staticFile("projects/${STORY_ID}/narration-mastered/complete.wav")}/>
    <div style={{transform: \`scale(\${scale})\`, textAlign: "center"}}>
      <div style={{fontSize: 34, letterSpacing: 8}}>AXMORF STUDIO</div>
      <div style={{fontSize: 86, fontWeight: 700, marginTop: 24}}>{closing ? "CURRENT" : "NATIVE"}</div>
      <div style={{fontSize: 28, marginTop: 20}}>Scene {closing ? "02" : "01"}</div>
    </div>
  </AbsoluteFill>;
};

export default NativeFixture;
`;

const coverRoot = `import {createElement} from "react";
import {AbsoluteFill, Composition, registerRoot} from "remotion";

const Cover = ({label}: {label: string}) => createElement(AbsoluteFill, {style: {backgroundColor: "#fffdf9", color: "#242424", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif"}},
  createElement("div", {style: {fontSize: 88, fontWeight: 700}}, "AXMORF"),
  createElement("div", {style: {fontSize: 34, color: "#a37d5c", marginTop: 18}}, label),
);

const Root = () => createElement("div", null,
  createElement(Composition, {id: "DesktopNativeFixtureDeliveryCover4x3V2", component: Cover, durationInFrames: 1, fps: 30, width: 1600, height: 1200, defaultProps: {label: "NATIVE 4:3"}}),
  createElement(Composition, {id: "DesktopNativeFixtureDeliveryCover3x4V2", component: Cover, durationInFrames: 1, fps: 30, width: 1200, height: 1600, defaultProps: {label: "NATIVE 3:4"}}),
);

registerRoot(Root);
`;

export type NativeFixtureResult = Readonly<{
  storyId: typeof STORY_ID;
  revisionId: string;
  deliveryBuildId: string;
  deliveryStatus: "project-production-complete" | "project-production-current";
  exactFourFiles: true;
  catalogEntryCount: 1;
  sceneCount: 2;
  narrationSegmentCount: 3;
  captionCount: 2;
}>;

export const createDesktopNativeFixture = async ({
  rootDir = process.cwd(),
}: {
  readonly rootDir?: string;
} = {}): Promise<NativeFixtureResult> => {
  const input = createInput();
  const privateRoot = join(rootDir, "private/native-phase-a-fixture");
  const configPath = join(privateRoot, "producer.config.json");
  const inputPath = join(privateRoot, "project-create.json");
  await writeProducerConfig({
    configPath,
    value: validProjectCreateProducerConfig,
  });
  await write(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  await createProject({
    rootDir,
    projectId: STORY_ID,
    inputPath,
    env: { RSP_PRODUCER_CONFIG: configPath },
  });

  const story = StorySpecSchema.parse(input.story);
  const narration = NarrationSpecSchema.parse(
    JSON.parse(
      await readFile(
        join(rootDir, `src/projects/${STORY_ID}/narration.json`),
        "utf8",
      ),
    ),
  );
  const render = RenderSpecSchema.parse(
    JSON.parse(
      await readFile(
        join(rootDir, `src/projects/${STORY_ID}/render.json`),
        "utf8",
      ),
    ),
  );
  const openingPcm = tone({ seconds: 1, frequency: 440 });
  const pausePcm = Buffer.alloc(24_000 * 2);
  const closingPcm = tone({ seconds: 1, frequency: 660 });
  const completePcm = Buffer.concat([openingPcm, pausePcm, closingPcm]);
  const openingWav = encodeCanonicalPcmWav(openingPcm);
  const closingWav = encodeCanonicalPcmWav(closingPcm);
  const completeWav = encodeCanonicalPcmWav(completePcm);
  const narrationRoot = join(rootDir, `public/projects/${STORY_ID}/narration`);
  const masteredRoot = join(
    rootDir,
    `public/projects/${STORY_ID}/narration-mastered`,
  );
  await Promise.all([
    write(join(narrationRoot, "chunks/opening-01.wav"), openingWav),
    write(join(narrationRoot, "chunks/closing-01.wav"), closingWav),
    write(join(narrationRoot, "complete.wav"), completeWav),
    write(join(masteredRoot, "complete.wav"), completeWav),
  ]);

  const pcm = {
    sampleRate: 48_000,
    channelLayout: "mono",
    sampleFormat: "s16le",
  } as const;
  const sealInput = {
    schemaVersion: 1,
    storyId: STORY_ID,
    narrationSpec: narration,
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: pcm,
    segments: [
      {
        kind: "chunk",
        chunkId: "opening-01",
        meaningId: "opening",
        ttsText: "Native playback starts.",
        localPath: `public/projects/${STORY_ID}/narration/chunks/opening-01.wav`,
        checksum: sha256Bytes(openingWav),
        pcm,
        sampleFrameCount: 48_000,
      },
      {
        kind: "pause",
        afterChunkId: "opening-01",
        meaningId: "opening",
        pauseMs: 500,
        sampleFrameCount: 24_000,
      },
      {
        kind: "chunk",
        chunkId: "closing-01",
        meaningId: "closing",
        ttsText: "Native playback is current.",
        localPath: `public/projects/${STORY_ID}/narration/chunks/closing-01.wav`,
        checksum: sha256Bytes(closingWav),
        pcm,
        sampleFrameCount: 48_000,
      },
    ],
    completeAudio: {
      localPath: `public/projects/${STORY_ID}/narration/complete.wav`,
      checksum: sha256Bytes(completeWav),
      pcm,
      sampleFrameCount: 120_000,
    },
  } as const;
  const sealed = SealedNarrationManifestSchema.parse({
    ...sealInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(sealInput),
  });
  const mastered = buildMasteredNarrationManifest({
    storyId: STORY_ID,
    sealedNarrationFingerprint: sealed.sealedNarrationFingerprint,
    sourceAudio: sealed.completeAudio,
    masteringPolicy: NARRATION_MASTERING_POLICY,
    outputAudio: {
      ...sealed.completeAudio,
      localPath: `public/projects/${STORY_ID}/narration-mastered/complete.wav`,
    },
    measurements: {
      integratedLoudnessLufs: -16,
      truePeakDbtp: -2,
      loudnessRangeLu: 1,
      thresholdLufs: -26,
    },
  });
  const timing = generateSemanticTiming({
    story,
    narration,
    render,
    sealedNarration: sealed,
  });
  const generatedRoot = join(rootDir, `src/projects/${STORY_ID}/generated`);
  await Promise.all([
    write(join(generatedRoot, "sealed-narration.generated.json"), json(sealed)),
    write(
      join(generatedRoot, "mastered-narration.generated.json"),
      json(mastered),
    ),
    write(join(generatedRoot, "semantic-timing.generated.json"), json(timing)),
  ]);
  const projected = await projectPendingSceneAuthoring({
    rootDir,
    projectId: STORY_ID,
  });
  assert.equal(projected.projected, true);

  const projectRoot = join(rootDir, `src/projects/${STORY_ID}`);
  await Promise.all([
    write(join(projectRoot, "Composition.tsx"), projectComposition),
    write(join(projectRoot, "delivery/cover/index.ts"), coverRoot),
  ]);
  await generateProjectRegistry({ rootDir, mode: "write" });
  const revision = await readCurrentProductionRevision({
    rootDir,
    projectId: STORY_ID,
  });
  const publishingIntent = resolveCurrentPublishingIntent({
    story,
    intent: JSON.parse(
      await readFile(join(projectRoot, "publishing-intent.json"), "utf8"),
    ),
  });
  const labels = new Map(
    publishingIntent.chapters.map((chapter) => [
      chapter.meaningId,
      chapter.name,
    ]),
  );
  const prepared = {
    projectId: STORY_ID,
    story,
    render,
    timing,
    visualStyle: JSON.parse(
      await readFile(join(projectRoot, "visual-style.json"), "utf8"),
    ),
    publishing: buildDeliveryPublishing({
      storyId: STORY_ID,
      title: story.title,
      description: publishingIntent.description,
      topics: publishingIntent.topics,
      collection: publishingIntent.collection.name,
      outputFileName: "video.mp4",
      coverFileNames: {
        cover4x3: "cover-4x3.png",
        cover3x4: "cover-3x4.png",
      },
      fps: render.fps,
      frameCount: timing.durationInFrames,
      plannedDurationSeconds: timing.durationInFrames / render.fps,
      chapters: timing.storyBeats.map((beat) => ({
        meaningId: beat.meaningId,
        name: labels.get(beat.meaningId) ?? beat.meaningId,
        startFrame: beat.startFrame,
        timecode: `00:00:${String(Math.floor(beat.startFrame / render.fps)).padStart(2, "0")}`,
      })),
    }),
    frameCount: timing.durationInFrames,
    coverCompositionBaseId: deriveCoverCompositionBaseId(STORY_ID),
  } as const;
  const artifactSetFingerprint = createFingerprint({
    namespace: "desktop-native-fixture-artifacts",
    version: 1,
    value: { revisionId: revision.revisionId },
  });
  const delivery = await buildDelivery({
    rootDir,
    projectId: STORY_ID,
    revisionId: revision.revisionId,
    artifactSetFingerprint,
    dependencies: { prepare: async () => prepared as never },
  });
  const publish = await inspectCurrentDelivery({
    rootDir,
    storyId: STORY_ID,
  });
  assert.ok(publish !== null);
  assert.equal(publish.deliveryBuildId, delivery.deliveryBuildId);
  assert.equal(publish.revisionId, revision.revisionId);
  const catalog = await buildRepositoryPreviewCatalog({
    repositoryRoot: rootDir,
  });
  assert.equal(catalog.entries.length, 1);
  assert.equal(catalog.entries[0]?.storyId, STORY_ID);
  assert.equal(catalog.entries[0]?.timeline.scenes.length, 2);
  assert.equal(catalog.entries[0]?.timeline.narration.length, 3);
  assert.equal(catalog.entries[0]?.timeline.captions.length, 2);
  return {
    storyId: STORY_ID,
    revisionId: revision.revisionId,
    deliveryBuildId: delivery.deliveryBuildId,
    deliveryStatus: delivery.status,
    exactFourFiles: true,
    catalogEntryCount: 1,
    sceneCount: 2,
    narrationSegmentCount: 3,
    captionCount: 2,
  };
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void createDesktopNativeFixture()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Desktop native fixture failed."}\n`,
      );
      process.exitCode = 1;
    });
}
