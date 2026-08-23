import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  RenderSpecSchema,
  SemanticTimingSchema,
  SourceCurrentAttestationSchema,
  StoryIdSchema,
  StorySpecSchema,
  type DeliveryPublish,
  type SemanticTiming,
  type SourceCurrentAttestation,
} from "../../src/contracts";
import { inspectCurrentDelivery } from "../../scripts/project-production/adapters/current-delivery-inspection";
import { readRegularJson } from "../../scripts/project-production/adapters/project-input-snapshot";
import { inspectSourceCurrent } from "../../scripts/project-production/adapters/source-current-store";
import type { ProductionLocations } from "../../scripts/project-production/domain/production-locations";
import {
  DESKTOP_PREVIEW_CATALOG_VERSION,
  DesktopProjectStatusSchema,
  PreviewCatalogSchema,
  type DesktopProjectStatus,
  type PreviewCatalog,
  type PreviewCatalogEntry,
} from "../contracts/preview";

const previewTimelineFromTiming = ({
  timing,
  labels,
}: {
  readonly timing: SemanticTiming;
  readonly labels: ReadonlyMap<string, string>;
}): PreviewCatalogEntry["timeline"] => ({
  durationInFrames: timing.durationInFrames,
  leadInFrames: timing.leadInFrames,
  tailFrames: timing.tailFrames,
  narrationStartFrame: timing.narrationStartFrame,
  scenes: timing.storyBeats.map((beat) => ({
    kind: beat.kind,
    meaningId: beat.meaningId,
    label: labels.get(beat.meaningId) ?? beat.meaningId,
    startFrame: beat.startFrame,
    endFrame: beat.endFrame,
  })),
  narration: timing.segments.map((segment) =>
    segment.kind === "chunk"
      ? {
          kind: segment.kind,
          chunkId: segment.chunkId,
          meaningId: segment.meaningId,
          text: segment.ttsText,
          startFrame: segment.frameRange.startFrame,
          endFrame: segment.frameRange.endFrame,
        }
      : {
          kind: segment.kind,
          afterChunkId: segment.afterChunkId,
          meaningId: segment.meaningId,
          pauseMs: segment.pauseMs,
          startFrame: segment.frameRange.startFrame,
          endFrame: segment.frameRange.endFrame,
        },
  ),
  captions: timing.captionCues.map((caption) => ({
    chunkId: caption.chunkId,
    meaningId: caption.meaningId,
    text: caption.text,
    startFrame: caption.startFrame,
    endFrame: caption.endFrame,
  })),
});

type WorkspaceCatalogDependencies = Readonly<{
  discoverProjects: (input: {
    readonly locations: ProductionLocations;
  }) => Promise<readonly string[]>;
  readStory: (input: {
    readonly locations: ProductionLocations;
    readonly storyId: string;
  }) => Promise<Readonly<{ storyId: string; title: string }>>;
  readRender: (input: {
    readonly locations: ProductionLocations;
    readonly storyId: string;
  }) => Promise<ReturnType<typeof RenderSpecSchema.parse>>;
  readTiming: (input: {
    readonly locations: ProductionLocations;
    readonly storyId: string;
  }) => Promise<SemanticTiming>;
  readSourceCurrent: (input: {
    readonly locations: ProductionLocations;
    readonly storyId: string;
  }) => Promise<SourceCurrentAttestation | null>;
  verifySourceCurrent: (input: {
    readonly locations: ProductionLocations;
    readonly expected: SourceCurrentAttestation;
  }) => Promise<SourceCurrentAttestation | null>;
  inspectDelivery: (input: {
    readonly locations: ProductionLocations;
    readonly storyId: string;
  }) => Promise<DeliveryPublish | null>;
}>;

const readProjectJson = async ({
  locations,
  storyId,
  relativePath,
  label,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly relativePath: string;
  readonly label: string;
}) =>
  (
    await readRegularJson(
      join(locations.projectSourceRoot, storyId, relativePath),
      label,
    )
  ).raw;

const defaultDependencies: WorkspaceCatalogDependencies = {
  discoverProjects: async ({ locations }) => {
    const entries = await readdir(locations.projectSourceRoot, {
      withFileTypes: true,
    });
    const projects: string[] = [];
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (entry.isSymbolicLink()) {
        throw new Error("Workspace Projects cannot contain symbolic links.");
      }
      if (!entry.isDirectory()) continue;
      projects.push(StoryIdSchema.parse(entry.name));
    }
    return projects;
  },
  readStory: async ({ locations, storyId }) => {
    const story = StorySpecSchema.parse(
      await readProjectJson({
        locations,
        storyId,
        relativePath: "story.json",
        label: "Workspace StorySpec",
      }),
    );
    return { storyId: story.storyId, title: story.title };
  },
  readRender: async ({ locations, storyId }) =>
    RenderSpecSchema.parse(
      await readProjectJson({
        locations,
        storyId,
        relativePath: "render.json",
        label: "Workspace RenderSpec",
      }),
    ),
  readTiming: async ({ locations, storyId }) =>
    SemanticTimingSchema.parse(
      await readProjectJson({
        locations,
        storyId,
        relativePath: "generated/semantic-timing.generated.json",
        label: "Workspace SemanticTiming",
      }),
    ),
  readSourceCurrent: async ({ locations, storyId }) => {
    const path = join(locations.sourceCurrentRoot, `${storyId}.json`);
    try {
      return SourceCurrentAttestationSchema.parse(
        (await readRegularJson(path, "Workspace SourceCurrent")).raw,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  verifySourceCurrent: inspectSourceCurrent,
  inspectDelivery: ({ locations, storyId }) =>
    inspectCurrentDelivery({
      locations,
      storyId: StoryIdSchema.parse(storyId),
    }),
};

const currentProject = ({
  storyId,
  title,
  delivery,
  invalidation = [],
}: {
  readonly storyId: string;
  readonly title: string;
  readonly delivery: DesktopProjectStatus["delivery"];
  readonly invalidation?: DesktopProjectStatus["invalidation"];
}) =>
  DesktopProjectStatusSchema.parse({
    storyId,
    title,
    source: "current",
    delivery,
    invalidation,
  });

const unavailable = ({
  storyId,
  title,
  source,
  delivery,
  code,
  cause,
}: {
  readonly storyId: string;
  readonly title: string;
  readonly source: DesktopProjectStatus["source"];
  readonly delivery: DesktopProjectStatus["delivery"];
  readonly code: PreviewCatalog["unavailable"][number]["code"];
  readonly cause: string;
}) => ({
  project: DesktopProjectStatusSchema.parse({
    storyId,
    title,
    source,
    delivery,
    invalidation: [{ code, cause }],
  }),
  unavailable: { storyId: StoryIdSchema.parse(storyId), code },
});

const inspectProject = async ({
  locations,
  storyId,
  rendererRuntimeFingerprint,
  dependencies,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly rendererRuntimeFingerprint: string;
  readonly dependencies: WorkspaceCatalogDependencies;
}): Promise<
  | Readonly<{
      project: DesktopProjectStatus;
      entry: PreviewCatalogEntry;
    }>
  | ReturnType<typeof unavailable>
> => {
  let title = storyId;
  try {
    const story = await dependencies.readStory({ locations, storyId });
    if (story.storyId !== storyId) throw new Error("story-id-drift");
    title = story.title;
  } catch {
    return unavailable({
      storyId,
      title,
      source: "stale",
      delivery: "stale",
      code: "source-not-ready",
      cause: "Project source is not valid for the current Workspace contract.",
    });
  }

  let source: SourceCurrentAttestation | null;
  try {
    source = await dependencies.readSourceCurrent({ locations, storyId });
  } catch {
    return unavailable({
      storyId,
      title,
      source: "stale",
      delivery: "stale",
      code: "source-not-ready",
      cause: "Source-current attestation is invalid.",
    });
  }
  if (source === null) {
    return unavailable({
      storyId,
      title,
      source: "missing",
      delivery: "missing",
      code: "source-not-ready",
      cause: "Production has not reached source-current.",
    });
  }
  try {
    if (
      source.storyId !== storyId ||
      (await dependencies.verifySourceCurrent({
        locations,
        expected: source,
      })) === null
    ) {
      throw new Error("source-current-stale");
    }
  } catch {
    return unavailable({
      storyId,
      title,
      source: "stale",
      delivery: "stale",
      code: "source-not-ready",
      cause: "Materialized source no longer matches source-current.",
    });
  }

  let publish: DeliveryPublish | null;
  try {
    publish = await dependencies.inspectDelivery({ locations, storyId });
  } catch {
    return unavailable({
      storyId,
      title,
      source: "current",
      delivery: "invalid",
      code: "delivery-invalid",
      cause: "The four-file Delivery failed strict validation.",
    });
  }
  if (publish === null) {
    return unavailable({
      storyId,
      title,
      source: "current",
      delivery: "missing",
      code: "delivery-missing",
      cause: "Source is current, but no Delivery has been built.",
    });
  }
  if (
    publish.sourceCurrentId !== source.sourceCurrentId ||
    publish.revisionId !== source.revisionId ||
    publish.rendererRuntimeFingerprint !== rendererRuntimeFingerprint
  ) {
    return unavailable({
      storyId,
      title,
      source: "current",
      delivery: "stale",
      code: "delivery-stale",
      cause: "Delivery does not match current source or embedded runtime.",
    });
  }

  let render: ReturnType<typeof RenderSpecSchema.parse>;
  let timing: SemanticTiming;
  try {
    [render, timing] = await Promise.all([
      dependencies.readRender({ locations, storyId }),
      dependencies.readTiming({ locations, storyId }),
    ]);
    if (
      timing.storyId !== storyId ||
      timing.fps !== publish.fps ||
      timing.durationInFrames !== publish.frameCount ||
      render.compositionId !== publish.compositionId ||
      render.fps !== publish.fps ||
      render.width !== publish.width ||
      render.height !== publish.height ||
      (await dependencies.verifySourceCurrent({
        locations,
        expected: source,
      })) === null
    ) {
      throw new Error("timing-drift");
    }
  } catch {
    return unavailable({
      storyId,
      title,
      source: "stale",
      delivery: "stale",
      code: "timing-invalid",
      cause: "Current timing or render metadata drifted.",
    });
  }

  const labels = new Map(
    publish.publishing.chapters.map(({ meaningId, name }) => [meaningId, name]),
  );
  return {
    project: currentProject({ storyId, title, delivery: "current" }),
    entry: {
      storyId: StoryIdSchema.parse(storyId),
      revisionId: publish.revisionId,
      deliveryBuildId: publish.deliveryBuildId,
      compositionId: publish.compositionId,
      title: publish.publishing.title,
      width: publish.width,
      height: publish.height,
      fps: publish.fps,
      frameCount: publish.frameCount,
      video: {
        checksum: publish.artifacts.video.checksum,
        sizeBytes: publish.artifacts.video.sizeBytes,
      },
      timeline: previewTimelineFromTiming({ timing, labels }),
    },
  };
};

export const buildWorkspacePreviewCatalog = async ({
  locations,
  rendererRuntimeFingerprint,
  dependencies: overrides = {},
}: {
  readonly locations: ProductionLocations;
  readonly rendererRuntimeFingerprint: string;
  readonly dependencies?: Partial<WorkspaceCatalogDependencies>;
}) => {
  const dependencies = { ...defaultDependencies, ...overrides };
  const storyIds = await dependencies.discoverProjects({ locations });
  const results = [];
  for (const storyId of storyIds) {
    results.push(
      await inspectProject({
        locations,
        storyId: StoryIdSchema.parse(storyId),
        rendererRuntimeFingerprint,
        dependencies,
      }),
    );
  }
  const catalog = PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PREVIEW_CATALOG_VERSION,
    entries: results
      .filter(
        (result): result is Extract<typeof result, { entry: unknown }> =>
          "entry" in result,
      )
      .map(({ entry }) => entry)
      .sort((left, right) => left.storyId.localeCompare(right.storyId)),
    unavailable: results
      .filter(
        (result): result is Extract<typeof result, { unavailable: unknown }> =>
          "unavailable" in result,
      )
      .map((result) => result.unavailable)
      .sort((left, right) => left.storyId.localeCompare(right.storyId)),
  });
  const projects = results
    .map(({ project }) => project)
    .sort((left, right) => left.storyId.localeCompare(right.storyId));
  return { catalog, projects } as const;
};
