import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  PublishingIntentSchema,
  ProjectSoundPlanSchema,
  RenderSpecSchema,
  ResourceCatalogSchema,
  SemanticTimingSchema,
  StoryIdSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildDeliveryPublishing,
  createFingerprint,
  deriveCoverCompositionBaseId,
  formatDeliveryTimecode,
  getStoryCompositionDurationInFrames,
  resolveCurrentPublishingIntent,
  toStoryCompositionFrame,
} from "../../../src/contracts";
import { collectDeliveryCoverSourceGraph } from "../adapters/cover-source";
import { checkMasteredNarrationArtifacts } from "../../narration/mastering";
import { createExecutableProcessRunner } from "../../narration/adapters/ffmpeg-normalizer";
import { collectGlobalVisualSourceGraph } from "./global-visual-validator";
import { compileTargetProjectComposition } from "./project-composition-compiler";
import { ensureProjectAuthoringBuildScaffold } from "./project-scaffold";
import { generateProjectRegistry } from "../../registry/generate";
import type { ProjectStorageLocations } from "../../projects/project-locations";
import { generateRendererRegistry } from "../../renderer-registry/generate";
import {
  generateSceneCoverageFromProjectFiles,
  generateScenePackageFromProjectFiles,
} from "../../scene-package/generate";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "./production-locations";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

export const prepareProjectAuthoringBuild = async ({
  locations,
  storage,
  runtime,
  projectId: rawProjectId,
  mode = "write",
}: {
  readonly locations: ProductionLocations;
  readonly storage: ProjectStorageLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly projectId: string;
  readonly mode?: "write" | "check";
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const projectRoot = join(locations.projectSourceRoot, projectId);
  const [
    story,
    render,
    timing,
    visualStyle,
    projectSound,
    resourceCatalog,
    rawPublishingIntent,
  ] = await Promise.all([
    readJson(join(projectRoot, "story.json")).then(StorySpecSchema.parse),
    readJson(join(projectRoot, "render.json")).then(RenderSpecSchema.parse),
    readJson(
      join(projectRoot, "generated/semantic-timing.generated.json"),
    ).then(SemanticTimingSchema.parse),
    readJson(join(projectRoot, "visual-style.json")).then(
      VisualStyleSpecSchema.parse,
    ),
    readJson(join(projectRoot, "sound.json")).then(
      ProjectSoundPlanSchema.parse,
    ),
    readJson(
      join(projectRoot, "generated/resource-catalog.generated.json"),
    ).then(ResourceCatalogSchema.parse),
    readJson(join(projectRoot, "publishing-intent.json")).then(
      PublishingIntentSchema.parse,
    ),
  ]);
  if (
    story.storyId !== projectId ||
    timing.storyId !== projectId ||
    visualStyle.storyId !== projectId ||
    timing.fps !== render.fps
  ) {
    throw new Error("Project authoring inputs are stale or cross-bound.");
  }
  const publishingIntent = resolveCurrentPublishingIntent({
    story,
    intent: rawPublishingIntent,
  });
  const meaningIds = story.beats.map(({ meaningId }) => meaningId);
  for (const meaningId of meaningIds) {
    await generateScenePackageFromProjectFiles({
      locations,
      projectId,
      meaningId,
      mode,
    });
  }
  const coverage = await generateSceneCoverageFromProjectFiles({
    locations,
    projectId,
    mode,
  });
  const rendererRegistry = await generateRendererRegistry({
    locations,
    projectId,
    mode,
  });
  if (rendererRegistry === null) {
    throw new Error("Project build requires current Scene renderer source.");
  }
  const runtimeInputFingerprint = createFingerprint({
    namespace: "project-production-scene-runtime-inputs",
    version: 1,
    value: {
      storyId: projectId,
      render,
      semanticTimingFingerprint: timing.fingerprint,
      visualStyle,
      projectSound,
      resourceCatalogFingerprint: resourceCatalog.catalogFingerprint,
      coverageFingerprint: coverage.coverageFingerprint,
      rendererRegistryFingerprint: rendererRegistry.registryFingerprint,
    },
  });
  await ensureProjectAuthoringBuildScaffold({
    locations,
    storyId: projectId,
    meaningIds,
    runtimeInputFingerprint,
    mode,
  });
  await Promise.all([
    collectGlobalVisualSourceGraph({
      locations,
      storyId: projectId,
    }),
    collectDeliveryCoverSourceGraph({
      locations,
      storyId: projectId,
      compositionId: deriveCoverCompositionBaseId(projectId),
    }),
    checkMasteredNarrationArtifacts({
      locations,
      storyId: projectId,
      runProcess: createExecutableProcessRunner(runtime.ffmpegExecutable),
    }),
  ]);
  await generateProjectRegistry({ storage, mode });
  await compileTargetProjectComposition({
    locations,
    storyId: projectId,
  });

  const frameCount = getStoryCompositionDurationInFrames(
    timing.durationInFrames,
  );
  const publishing = buildDeliveryPublishing({
    storyId: projectId,
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
    frameCount,
    plannedDurationSeconds: frameCount / render.fps,
    chapters: publishingIntent.chapters.map((chapter) => {
      const beat = timing.storyBeats.find(
        ({ meaningId }) => meaningId === chapter.meaningId,
      );
      if (beat === undefined || beat.kind !== "narrated-scene") {
        throw new Error(
          "Publishing chapters are stale against SemanticTiming.",
        );
      }
      const startFrame = toStoryCompositionFrame(beat.startFrame);
      return {
        meaningId: chapter.meaningId,
        name: chapter.name,
        startFrame,
        timecode: formatDeliveryTimecode(startFrame, render.fps),
      };
    }),
  });
  return {
    projectId,
    story,
    render,
    timing,
    visualStyle,
    publishing,
    frameCount,
    coverCompositionBaseId: deriveCoverCompositionBaseId(projectId),
  } as const;
};
