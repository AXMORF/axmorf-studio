import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  SemanticTimingSchema,
  ProductionRevisionIdSchema,
  StoryIdSchema,
  type SemanticTiming,
} from "../../src/contracts";
import { readCurrentProductionRevision } from "../../scripts/project-production/application/current-revision";
import { inspectCurrentDelivery } from "../../scripts/project-production/adapters/current-delivery-inspection";
import {
  discoverProjectEntries,
  loadProjectRegistrationEntry,
} from "../../scripts/registry/project-files";
import {
  DESKTOP_PREVIEW_CATALOG_VERSION,
  PreviewCatalogSchema,
  type PreviewCatalog,
  type PreviewCatalogEntry,
} from "../contracts/preview";

const COMPOSITION_PATH_PATTERN =
  /^src\/projects\/([a-z0-9]+(?:-[a-z0-9]+)*)\/Composition\.tsx$/u;

type CatalogDependencies = Readonly<{
  discoverProjects: typeof discoverProjectEntries;
  loadProject: typeof loadProjectRegistrationEntry;
  readRevision: (input: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<Readonly<{ storyId: string; revisionId: string }>>;
  inspectDelivery: typeof inspectCurrentDelivery;
  readTiming: (input: {
    readonly repositoryRoot: string;
    readonly storyId: string;
  }) => Promise<SemanticTiming>;
}>;

const isContained = (parent: string, candidate: string) => {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
};

const readSafeSemanticTiming = async ({
  repositoryRoot,
  storyId: rawStoryId,
}: {
  readonly repositoryRoot: string;
  readonly storyId: string;
}): Promise<SemanticTiming> => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const repositoryRealPath = await realpath(repositoryRoot);
  const path = join(
    repositoryRoot,
    "src/projects",
    storyId,
    "generated/semantic-timing.generated.json",
  );
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error("Preview SemanticTiming must be a regular file.");
  }
  const parentRealPath = await realpath(dirname(path));
  const fileRealPath = await realpath(path);
  if (
    !isContained(repositoryRealPath, parentRealPath) ||
    !isContained(repositoryRealPath, fileRealPath)
  ) {
    throw new Error("Preview SemanticTiming escaped the repository.");
  }
  const contents = await readFile(path, "utf8");
  const after = await lstat(path);
  if (
    !after.isFile() ||
    after.isSymbolicLink() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    (await realpath(path)) !== fileRealPath
  ) {
    throw new Error("Preview SemanticTiming changed during inspection.");
  }
  return SemanticTimingSchema.parse(JSON.parse(contents));
};

const defaultDependencies: CatalogDependencies = {
  discoverProjects: discoverProjectEntries,
  loadProject: loadProjectRegistrationEntry,
  readRevision: async ({ rootDir, projectId }) => {
    const revision = await readCurrentProductionRevision({
      rootDir,
      projectId,
    });
    return { storyId: revision.storyId, revisionId: revision.revisionId };
  },
  inspectDelivery: inspectCurrentDelivery,
  readTiming: readSafeSemanticTiming,
};

const storyIdFromDiscoveredPath = (compositionPath: string) => {
  const match = COMPOSITION_PATH_PATTERN.exec(compositionPath);
  if (match === null) {
    throw new Error(
      "Discovered Project path does not use the fixed convention.",
    );
  }
  return StoryIdSchema.parse(match[1]);
};

const timelineFromTiming = ({
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

type UnavailableCode = PreviewCatalog["unavailable"][number]["code"];

const inspectDiscoveredProject = async ({
  repositoryRoot,
  compositionPath,
  dependencies,
}: {
  readonly repositoryRoot: string;
  readonly compositionPath: string;
  readonly dependencies: CatalogDependencies;
}): Promise<
  | { readonly kind: "playable"; readonly entry: PreviewCatalogEntry }
  | {
      readonly kind: "unavailable";
      readonly storyId: PreviewCatalog["unavailable"][number]["storyId"];
      readonly code: UnavailableCode;
    }
> => {
  const storyId = storyIdFromDiscoveredPath(compositionPath);
  let project;
  try {
    project = await dependencies.loadProject({
      rootDir: repositoryRoot,
      compositionPath,
    });
  } catch {
    return { kind: "unavailable", storyId, code: "source-not-ready" };
  }
  if (project.descriptor.storyId !== storyId) {
    return { kind: "unavailable", storyId, code: "source-not-ready" };
  }

  let revisionBeforeTiming;
  try {
    revisionBeforeTiming = await dependencies.readRevision({
      rootDir: repositoryRoot,
      projectId: storyId,
    });
  } catch {
    return { kind: "unavailable", storyId, code: "source-not-ready" };
  }
  const beforeRevisionId = ProductionRevisionIdSchema.safeParse(
    revisionBeforeTiming.revisionId,
  );
  if (revisionBeforeTiming.storyId !== storyId || !beforeRevisionId.success) {
    return { kind: "unavailable", storyId, code: "source-not-ready" };
  }

  let publish;
  try {
    publish = await dependencies.inspectDelivery({
      rootDir: repositoryRoot,
      storyId,
    });
  } catch {
    return { kind: "unavailable", storyId, code: "delivery-invalid" };
  }
  if (publish === null) {
    return { kind: "unavailable", storyId, code: "delivery-missing" };
  }
  if (publish.revisionId !== beforeRevisionId.data) {
    return { kind: "unavailable", storyId, code: "delivery-stale" };
  }

  const descriptor = project.descriptor;
  if (
    publish.storyId !== descriptor.storyId ||
    publish.compositionId !== descriptor.id ||
    publish.fps !== descriptor.fps ||
    publish.width !== descriptor.width ||
    publish.height !== descriptor.height ||
    publish.frameCount !== descriptor.durationInFrames
  ) {
    return { kind: "unavailable", storyId, code: "delivery-invalid" };
  }

  let timing;
  try {
    timing = await dependencies.readTiming({ repositoryRoot, storyId });
  } catch {
    return { kind: "unavailable", storyId, code: "timing-invalid" };
  }
  if (
    timing.storyId !== storyId ||
    timing.fps !== publish.fps ||
    timing.durationInFrames !== publish.frameCount
  ) {
    return { kind: "unavailable", storyId, code: "timing-invalid" };
  }

  let revisionAfterTiming;
  try {
    revisionAfterTiming = await dependencies.readRevision({
      rootDir: repositoryRoot,
      projectId: storyId,
    });
  } catch {
    return { kind: "unavailable", storyId, code: "source-not-ready" };
  }
  const afterRevisionId = ProductionRevisionIdSchema.safeParse(
    revisionAfterTiming.revisionId,
  );
  if (
    revisionAfterTiming.storyId !== revisionBeforeTiming.storyId ||
    !afterRevisionId.success
  ) {
    return { kind: "unavailable", storyId, code: "source-not-ready" };
  }
  if (
    afterRevisionId.data !== beforeRevisionId.data ||
    afterRevisionId.data !== publish.revisionId
  ) {
    return { kind: "unavailable", storyId, code: "delivery-stale" };
  }

  const labels = new Map(
    publish.publishing.chapters.map(({ meaningId, name }) => [meaningId, name]),
  );
  try {
    return {
      kind: "playable",
      entry: {
        storyId,
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
        timeline: timelineFromTiming({ timing, labels }),
      },
    };
  } catch {
    return { kind: "unavailable", storyId, code: "timing-invalid" };
  }
};

export const buildRepositoryPreviewCatalog = async ({
  repositoryRoot,
  dependencies: overrides = {},
}: {
  readonly repositoryRoot: string;
  readonly dependencies?: Partial<CatalogDependencies>;
}): Promise<PreviewCatalog> => {
  const dependencies = { ...defaultDependencies, ...overrides };
  const compositionPaths = [
    ...(await dependencies.discoverProjects(repositoryRoot)),
  ].sort((left, right) => left.localeCompare(right));
  const results = [];
  for (const compositionPath of compositionPaths) {
    results.push(
      await inspectDiscoveredProject({
        repositoryRoot,
        compositionPath,
        dependencies,
      }),
    );
  }
  return PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PREVIEW_CATALOG_VERSION,
    entries: results
      .filter((result) => result.kind === "playable")
      .map(({ entry }) => entry)
      .sort((left, right) => left.storyId.localeCompare(right.storyId)),
    unavailable: results
      .filter((result) => result.kind === "unavailable")
      .map(({ storyId, code }) => ({ storyId, code }))
      .sort((left, right) => left.storyId.localeCompare(right.storyId)),
  });
};
