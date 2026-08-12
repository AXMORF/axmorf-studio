import {
  ProductionRenderPlanSchema,
  ProductionRenderReadySchema,
  PublishingIntentSchema,
  SemanticTimingSchema,
  StoryIdSchema,
  StorySpecSchema,
  computeStoryFingerprint,
  resolveCurrentPublishingIntent,
  type ProductionRenderPlan,
  type ProductionRenderReady,
  type SemanticTiming,
  type StorySpec,
} from "../../../src/contracts";
import { checkProductionRenderReady } from "../../production/application/render-ready";
import { readDeliveryJson } from "../adapters/filesystem";
import { loadCurrentDeliveryCoverResult } from "./cover-inputs";
import { loadDeliveryAssetAttributions } from "./asset-attributions";
import type { DeliveryApplicationDependencies } from "./types";

const generatedPath = (projectId: string, fileName: string) =>
  `src/projects/${projectId}/generated/${fileName}`;

export const assertCurrentDeliveryInputBindings = ({
  projectId,
  story,
  semanticTiming,
  renderPlan,
  renderReady,
  current,
}: {
  readonly projectId: string;
  readonly story: StorySpec;
  readonly semanticTiming: SemanticTiming;
  readonly renderPlan: ProductionRenderPlan;
  readonly renderReady: ProductionRenderReady;
  readonly current: Readonly<{
    runId: string;
    renderPlanFingerprint: string;
    renderReadyFingerprint: string;
  }>;
}) => {
  if (
    story.storyId !== projectId ||
    semanticTiming.storyId !== projectId ||
    renderPlan.storyId !== projectId ||
    renderReady.storyId !== projectId ||
    renderReady.runId !== renderPlan.runId ||
    renderReady.requirementsFingerprint !==
      renderPlan.requirementsFingerprint ||
    renderReady.renderPlanFingerprint !== renderPlan.renderPlanFingerprint ||
    renderPlan.storyFingerprint !== computeStoryFingerprint(story) ||
    renderPlan.semanticTimingFingerprint !== semanticTiming.fingerprint ||
    semanticTiming.fps !== renderPlan.fps ||
    semanticTiming.durationInFrames !== renderPlan.frameCount ||
    current.runId !== renderPlan.runId ||
    current.renderPlanFingerprint !== renderPlan.renderPlanFingerprint ||
    current.renderReadyFingerprint !== renderReady.renderReadyFingerprint
  ) {
    throw new Error("Automatic delivery inputs are stale or cross-bound.");
  }
};

export const loadCurrentDeliveryInputs = async ({
  rootDir,
  projectId: rawProjectId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly dependencies?: DeliveryApplicationDependencies;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const [story, semanticTiming, rawIntent, renderPlan, renderReady, cover] =
    await Promise.all([
      readDeliveryJson({
        rootDir,
        relativePath: `src/projects/${projectId}/story.json`,
      }).then(StorySpecSchema.parse),
      readDeliveryJson({
        rootDir,
        relativePath: generatedPath(
          projectId,
          "semantic-timing.generated.json",
        ),
      }).then(SemanticTimingSchema.parse),
      readDeliveryJson({
        rootDir,
        relativePath: `src/projects/${projectId}/publishing-intent.json`,
      }).then(PublishingIntentSchema.parse),
      readDeliveryJson({
        rootDir,
        relativePath: generatedPath(
          projectId,
          "production-render-plan.generated.json",
        ),
      }).then(ProductionRenderPlanSchema.parse),
      readDeliveryJson({
        rootDir,
        relativePath: generatedPath(
          projectId,
          "production-render-ready.generated.json",
        ),
      }).then(ProductionRenderReadySchema.parse),
      loadCurrentDeliveryCoverResult({
        rootDir,
        projectId,
        ...(dependencies.runProcess === undefined
          ? {}
          : { runProcess: dependencies.runProcess }),
      }),
    ]);
  const intent = resolveCurrentPublishingIntent({ story, intent: rawIntent });
  const assetAttributions = await loadDeliveryAssetAttributions({
    rootDir,
    projectId,
    renderPlan,
  });
  const current = await (
    dependencies.checkRenderReady ?? checkProductionRenderReady
  )({ rootDir, runId: renderPlan.runId });
  assertCurrentDeliveryInputBindings({
    projectId,
    story,
    semanticTiming,
    renderPlan,
    renderReady,
    current,
  });
  if (cover.result.storyId !== projectId) {
    throw new Error("Automatic delivery inputs are stale or cross-bound.");
  }
  return {
    story,
    semanticTiming,
    intent,
    renderPlan,
    renderReady,
    cover,
    assetAttributions,
  } as const;
};
