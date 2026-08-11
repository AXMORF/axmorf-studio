import {
  RENDER_LAUNCH_POLICY_VERSION,
  buildDeliveryLaunchManifest,
  buildDeliveryPublishing,
  buildRenderLaunchIntent,
  createDeliveryId,
  formatDeliveryTimecode,
} from "../../../src/contracts";
import { checksumDeliveryBytes } from "../adapters/filesystem";
import type { loadCurrentDeliveryInputs } from "../application/inputs";
import {
  buildChecksumLedger,
  buildDeliveryHandoff,
  serializeDeliveryJson,
} from "./package";

type DeliveryInputs = Awaited<ReturnType<typeof loadCurrentDeliveryInputs>>;

const bytesOf = (value: string) => new TextEncoder().encode(value);

export const buildDeliveryPackageModel = (inputs: DeliveryInputs) => {
  const { story, semanticTiming, intent, renderPlan, renderReady, cover } =
    inputs;
  const publishing = buildDeliveryPublishing({
    storyId: story.storyId,
    title: story.title,
    description: intent.description,
    topics: intent.topics,
    collection: intent.collection.name,
    outputFileName: `${story.storyId}.mp4`,
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
      return {
        meaningId: chapter.meaningId,
        name: chapter.name,
        startFrame: timing.startFrame,
        timecode: formatDeliveryTimecode(timing.startFrame, renderPlan.fps),
      };
    }),
  });
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
    coverResultFingerprint: cover.result.resultFingerprint,
    renderReadyFingerprint: renderReady.renderReadyFingerprint,
    renderPlanFingerprint: renderPlan.renderPlanFingerprint,
    compositionId: renderPlan.compositionId,
    renderArgs,
    renderLaunchPolicyVersion: RENDER_LAUNCH_POLICY_VERSION,
  } as const;
  const deliveryId = createDeliveryId(identity);
  const publishingBytes = serializeDeliveryJson(publishing);
  const publishingEncoded = bytesOf(publishingBytes);
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
        checksum: checksumDeliveryBytes(publishingEncoded),
        sizeBytes: publishingEncoded.byteLength,
      },
    },
  });
  const intentRecord = buildRenderLaunchIntent(identity);
  const manifestBytes = serializeDeliveryJson(manifest);
  const intentBytes = serializeDeliveryJson(intentRecord);
  const handoffBytes = buildDeliveryHandoff({ manifest, publishing });
  const ledgerBytes = buildChecksumLedger([
    { fileName: "cover-4x3.png", checksum: cover4x3.checksum },
    { fileName: "cover-3x4.png", checksum: cover3x4.checksum },
    {
      fileName: "publishing.json",
      checksum: checksumDeliveryBytes(publishingEncoded),
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
      manifest: manifestBytes,
      handoff: handoffBytes,
      intent: intentBytes,
      ledger: ledgerBytes,
    },
  } as const;
};
