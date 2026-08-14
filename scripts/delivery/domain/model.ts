import {
  RENDER_LAUNCH_POLICY_VERSION,
  buildDeliveryLaunchManifest,
  buildDeliveryPublishing,
  buildRenderLaunchIntent,
  createDeliveryId,
  formatDeliveryTimecode,
  toStoryCompositionFrame,
  type DeliveryCoverResult,
  AssetAttributionsSchema,
  type AssetAttributions,
  type ProductionRenderPlan,
  type ProductionRenderReady,
  type PublishingIntent,
  type SemanticTiming,
  type StorySpec,
  type VideoBrief,
} from "../../../src/contracts";
import { checksumDeliveryBytes } from "./checksum";
import {
  buildChecksumLedger,
  buildDeliveryHandoff,
  serializeDeliveryJson,
} from "./package";

export type DeliveryPackageInputs = Readonly<{
  brief: VideoBrief;
  story: StorySpec;
  semanticTiming: SemanticTiming;
  intent: PublishingIntent;
  renderPlan: ProductionRenderPlan;
  renderReady: ProductionRenderReady;
  cover: Readonly<{ result: DeliveryCoverResult }>;
  assetAttributions: AssetAttributions;
}>;

const bytesOf = (value: string) => new TextEncoder().encode(value);

export const buildDeliveryPackageModel = (inputs: DeliveryPackageInputs) => {
  const { story, semanticTiming, intent, renderPlan, renderReady, cover } =
    inputs;
  const assetAttributions = AssetAttributionsSchema.parse(
    inputs.assetAttributions,
  );
  const publishing = buildDeliveryPublishing({
    storyId: story.storyId,
    title: story.title,
    description: intent.description,
    topics: intent.topics,
    collection: intent.collection.name,
    outputFileName: `${story.storyId}.mp4`,
    coverFileNames: {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
    fps: renderPlan.fps,
    frameCount: renderPlan.frameCount,
    plannedDurationSeconds: renderPlan.frameCount / renderPlan.fps,
    chapters: intent.chapters.map((chapter, index) => {
      const timing = semanticTiming.storyBeats[index];
      if (timing?.meaningId !== chapter.meaningId) {
        throw new Error(
          "Publishing chapters are stale against SemanticTiming.",
        );
      }
      const startFrame = toStoryCompositionFrame(timing.startFrame);
      return {
        meaningId: chapter.meaningId,
        name: chapter.name,
        startFrame,
        timecode: formatDeliveryTimecode(startFrame, renderPlan.fps),
      };
    }),
  });
  const publishingBytes = serializeDeliveryJson(publishing);
  const publishingEncoded = bytesOf(publishingBytes);
  const publishingChecksum = checksumDeliveryBytes(publishingEncoded);
  const assetAttributionsBytes = serializeDeliveryJson(assetAttributions);
  const assetAttributionsEncoded = bytesOf(assetAttributionsBytes);
  const assetAttributionsChecksum = checksumDeliveryBytes(
    assetAttributionsEncoded,
  );
  const renderArgs = [
    "render",
    "src/index.ts",
    renderPlan.compositionId,
    `deliveries/${story.storyId}/${story.storyId}.mp4`,
    "--codec=h264",
    "--audio-codec=aac",
    "--pixel-format=yuv420p",
  ] as const;
  const identity = {
    storyId: story.storyId,
    publishingIntentFingerprint: intent.intentFingerprint,
    publishingChecksum,
    assetAttributionsFingerprint: assetAttributions.attributionsFingerprint,
    assetAttributionsChecksum,
    coverResultFingerprint: cover.result.resultFingerprint,
    renderReadyFingerprint: renderReady.renderReadyFingerprint,
    renderPlanFingerprint: renderPlan.renderPlanFingerprint,
    compositionId: renderPlan.compositionId,
    renderArgs,
    renderLaunchPolicyVersion: RENDER_LAUNCH_POLICY_VERSION,
  } as const;
  const deliveryId = createDeliveryId(identity);
  const [cover4x3, cover3x4] = cover.result.covers;
  const manifest = buildDeliveryLaunchManifest({
    ...identity,
    deliveryId,
    plannedDurationSeconds: publishing.plannedDurationSeconds,
    fps: publishing.fps,
    frameCount: publishing.frameCount,
    files: {
      cover4x3: {
        fileName: "cover-4x3.png",
        checksum: cover4x3.checksum,
        sizeBytes: cover4x3.sizeBytes,
      },
      cover3x4: {
        fileName: "cover-3x4.png",
        checksum: cover3x4.checksum,
        sizeBytes: cover3x4.sizeBytes,
      },
      publishing: {
        fileName: "publishing.json",
        checksum: publishingChecksum,
        sizeBytes: publishingEncoded.byteLength,
      },
      assetAttributions: {
        fileName: "asset-attributions.json",
        checksum: assetAttributionsChecksum,
        sizeBytes: assetAttributionsEncoded.byteLength,
      },
    },
  });
  const intentRecord = buildRenderLaunchIntent(identity);
  const manifestBytes = serializeDeliveryJson(manifest);
  const intentBytes = serializeDeliveryJson(intentRecord);
  const handoffBytes = buildDeliveryHandoff({
    manifest,
    publishing,
    assetAttributions,
  });
  const ledgerBytes = buildChecksumLedger([
    { fileName: "cover-4x3.png", checksum: cover4x3.checksum },
    { fileName: "cover-3x4.png", checksum: cover3x4.checksum },
    {
      fileName: "asset-attributions.json",
      checksum: assetAttributionsChecksum,
    },
    {
      fileName: "publishing.json",
      checksum: publishingChecksum,
    },
    {
      fileName: "delivery-launch-manifest.json",
      checksum: checksumDeliveryBytes(bytesOf(manifestBytes)),
    },
    {
      fileName: "HANDOFF.md",
      checksum: checksumDeliveryBytes(bytesOf(handoffBytes)),
    },
    {
      fileName: "render-launch-intent.json",
      checksum: checksumDeliveryBytes(bytesOf(intentBytes)),
    },
  ]);
  return {
    deliveryId,
    identity,
    publishing,
    manifest,
    intent: intentRecord,
    bytes: {
      publishing: publishingBytes,
      assetAttributions: assetAttributionsBytes,
      manifest: manifestBytes,
      handoff: handoffBytes,
      intent: intentBytes,
      ledger: ledgerBytes,
    },
  } as const;
};
