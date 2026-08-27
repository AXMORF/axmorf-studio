import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  AuthoringRequirementsSchema,
  GlobalVisualBriefSchema,
  NarrationSpecSchema,
  ProjectAssetManifestSchema,
  ProjectRevisionCandidateRecordSchema,
  ProjectRevisionInputSchema,
  ProjectSoundPlanSchema,
  PublishingIntentSchema,
  RenderSpecSchema,
  ResourceCatalogSchema,
  SceneProductionBriefItemSchema,
  PendingSceneAuthoringSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  VideoBriefSchema,
  VisualStyleSpecSchema,
  buildAuthoringRequirements,
  buildGlobalVisualBrief,
  buildPendingSceneAuthoring,
  buildPublishingIntent,
  buildStoryResourcePool,
  computeProjectRevisionCandidateId,
  computeVisualStyleFingerprint,
  serializeCanonicalJson,
  type ProducerConfig,
  type ProjectRevisionInput,
  type SceneOriginalityBaseline,
} from "../../../src/contracts";
import { generateWorkspaceProjectResourceCatalog } from "../../catalog/generate";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import {
  createProjectRevisionCandidateLocations,
  projectRevisionCandidateRecordPath,
  projectRevisionCandidateRoot,
} from "../../project-production/application/project-revision-locations";
import type { ProductionLocations } from "../../project-production/application/production-locations";
import { projectPendingSceneAuthoring } from "./project-pending-authoring";
import { snapshotWorkspaceSceneOriginalityBaseline } from "./scene-originality-baseline";

const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;
const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const metadata = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertContained = (root: string, candidate: string, label: string) => {
  const scope = relative(resolve(root), resolve(candidate));
  if (scope === "" || scope === ".." || scope.startsWith(`..${sep}`)) {
    throw new Error(`${label} escapes its fixed root.`);
  }
};

const readRegularJson = async (path: string, label: string) => {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a regular non-symbolic file.`);
  }
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error(`${label} changed while being read.`);
  }
  return JSON.parse(bytes.toString("utf8")) as unknown;
};

const copyRegularTree = async (source: string, target: string) => {
  const state = await lstat(source);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error("Project revision source tree must be a real directory.");
  }
  await mkdir(target, { recursive: false });
  for (const entry of (await readdir(source, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("Project revision source tree contains a symbolic link.");
    }
    if (entry.isDirectory()) {
      await copyRegularTree(from, to);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error("Project revision source tree contains a special file.");
    }
    await copyFile(from, to);
  }
};

const replaceJson = async (root: string, path: string, value: unknown) => {
  const destination = join(root, ...path.split("/"));
  assertContained(root, destination, "Project revision output");
  const state = await metadata(destination);
  if (state !== null && (state.isSymbolicLink() || !state.isFile())) {
    throw new Error("Project revision output target is unsafe.");
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, jsonBytes(value), { flag: "w" });
};

const removeFileIfPresent = async (root: string, path: string) => {
  const target = join(root, ...path.split("/"));
  assertContained(root, target, "Project revision removal");
  const state = await metadata(target);
  if (state === null) return;
  if (state.isSymbolicLink() || !state.isFile()) {
    throw new Error("Project revision stale file target is unsafe.");
  }
  await rm(target);
};

const narratedBeats = (
  story: ReturnType<typeof StorySpecSchema.parse>,
) => story.beats.filter((beat) => beat.kind === "narrated-scene");

const narratedSceneBriefs = (
  story: ReturnType<typeof StorySpecSchema.parse>,
  scenes: readonly ReturnType<typeof SceneProductionBriefItemSchema.parse>[],
) => {
  const narratedIds = new Set(narratedBeats(story).map(({ meaningId }) => meaningId));
  return scenes.filter(({ meaningId }) => narratedIds.has(meaningId));
};

const assertSameMeaningOrder = (
  expected: readonly string[],
  actual: readonly string[],
  label: string,
) => {
  if (
    expected.length !== actual.length ||
    expected.some((meaningId, index) => meaningId !== actual[index])
  ) {
    throw new Error(
      `${label} must preserve the existing narrated Scene identities and order.`,
    );
  }
};

const editableVisualStyle = (
  style: ReturnType<typeof VisualStyleSpecSchema.parse>,
) => ({
  styleProfileId: style.styleProfileId,
  artDirection: style.artDirection,
  continuityRules: style.continuityRules,
  forbiddenTreatments: style.forbiddenTreatments,
});

const editablePublishing = (
  publishing: ReturnType<typeof PublishingIntentSchema.parse>,
) => ({
  description: publishing.description,
  topics: publishing.topics,
  chapters: publishing.chapters,
  collectionId: publishing.collection.id,
});

const readEditableProject = async ({
  locations,
  projectId,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
}) => {
  const root = join(locations.projectSourceRoot, projectId);
  const [brief, story, style, pending, globalVisual, publishing] =
    await Promise.all([
      readRegularJson(join(root, "brief.json"), "Revision VideoBrief").then(
        VideoBriefSchema.parse,
      ),
      readRegularJson(join(root, "story.json"), "Revision StorySpec").then(
        StorySpecSchema.parse,
      ),
      readRegularJson(
        join(root, "visual-style.json"),
        "Revision VisualStyleSpec",
      ).then(VisualStyleSpecSchema.parse),
      readRegularJson(
        join(root, "production/pending-scene-production-brief.json"),
        "Revision pending Scene brief",
      ).then(PendingSceneAuthoringSchema.parse),
      readRegularJson(
        join(root, "production/global-visual-brief.json"),
        "Revision GlobalVisualBrief",
      ).then(GlobalVisualBriefSchema.parse),
      readRegularJson(
        join(root, "publishing-intent.json"),
        "Revision PublishingIntent",
      ).then(PublishingIntentSchema.parse),
    ]);
  const authoredStory = {
    schemaVersion: story.schemaVersion,
    storyId: story.storyId,
    title: story.title,
    beats: narratedBeats(story),
  } as const;
  return {
    root,
    brief,
    story,
    style,
    pending,
    globalVisual,
    publishing,
    editable: {
      brief,
      story: authoredStory,
      visualStyle: editableVisualStyle(style),
      scenes: narratedSceneBriefs(story, pending.scenes),
      globalVisual: { visualIntent: globalVisual.visualIntent },
      publishing: editablePublishing(publishing),
    },
  } as const;
};

export type CurrentRevisionDelivery = Readonly<{
  currentRevisionId: string;
  sourceCurrentId: string;
  deliveryBuildId: string;
}>;

export const readProjectRevisionContext = async ({
  locations,
  projectId,
  current,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly current: CurrentRevisionDelivery;
}) => {
  const project = await readEditableProject({ locations, projectId });
  return {
    schemaVersion: 1,
    contractVersion: "project-revision-context-v1",
    status: "project-revision-context",
    storyId: projectId,
    baseRevisionId: current.currentRevisionId,
    baseSourceCurrentId: current.sourceCurrentId,
    baseDeliveryBuildId: current.deliveryBuildId,
    editable: project.editable,
    constraints: {
      sameProject: true,
      preserveNarratedMeaningIdsAndOrder: true,
      preserveBoundaryScenes: true,
      candidateDeliveryPolicy: "automatic",
      currentDeliveryRemainsUntilPromotion: true,
    },
  } as const;
};

export const validateProjectRevisionAuthoring = async ({
  locations,
  input: rawInput,
}: {
  readonly locations: ProductionLocations;
  readonly input: unknown;
}) => {
  const input = ProjectRevisionInputSchema.parse(rawInput);
  const project = await readEditableProject({
    locations,
    projectId: input.storyId,
  });
  const expectedMeaningIds = project.editable.story.beats.map(
    ({ meaningId }) => meaningId,
  );
  if (input.patch.story !== undefined) {
    assertSameMeaningOrder(
      expectedMeaningIds,
      input.patch.story.beats.map(({ meaningId }) => meaningId),
      "Project revision Story",
    );
  }
  if (input.patch.scenes !== undefined) {
    assertSameMeaningOrder(
      expectedMeaningIds,
      input.patch.scenes.map(({ meaningId }) => meaningId),
      "Project revision Scene briefs",
    );
  }
  const changedSections = Object.entries(input.patch)
    .filter(
      ([section, value]) =>
        serializeCanonicalJson(value) !==
        serializeCanonicalJson(
          project.editable[section as keyof typeof project.editable],
        ),
    )
    .map(([section]) => section)
    .sort();
  if (changedSections.length === 0) {
    throw new Error("Project revision patch does not change current authoring.");
  }
  return { input, changedSections } as const;
};

const applyRevisionPatch = async ({
  locations,
  projectId,
  config,
  input,
  originalityBaseline,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly config: ProducerConfig;
  readonly input: ProjectRevisionInput;
  readonly originalityBaseline: SceneOriginalityBaseline;
}) => {
  const project = await readEditableProject({ locations, projectId });
  const patch = input.patch;
  const expectedMeaningIds = project.editable.story.beats.map(
    ({ meaningId }) => meaningId,
  );
  const authoredStory = patch.story ?? project.editable.story;
  assertSameMeaningOrder(
    expectedMeaningIds,
    authoredStory.beats.map(({ meaningId }) => meaningId),
    "Project revision Story",
  );
  const revisedByMeaning = new Map(
    authoredStory.beats.map((beat) => [beat.meaningId, beat] as const),
  );
  const story = StorySpecSchema.parse({
    ...project.story,
    title: authoredStory.title,
    beats: project.story.beats.map((beat) =>
      beat.kind === "silent-scene"
        ? beat
        : (revisedByMeaning.get(beat.meaningId) ?? beat),
    ),
  });
  const authoredScenes = patch.scenes ?? project.editable.scenes;
  assertSameMeaningOrder(
    expectedMeaningIds,
    authoredScenes.map(({ meaningId }) => meaningId),
    "Project revision Scene briefs",
  );
  const authoredSceneByMeaning = new Map(
    authoredScenes.map((scene) => [scene.meaningId, scene] as const),
  );
  const pending = buildPendingSceneAuthoring({
    schemaVersion: 1,
    contractVersion: "pending-scene-authoring-v1",
    storyId: projectId,
    scenes: project.pending.scenes.map((scene) =>
      authoredSceneByMeaning.get(scene.meaningId) ?? scene,
    ),
  });
  const brief = VideoBriefSchema.parse(patch.brief ?? project.brief);
  const narration = NarrationSpecSchema.parse(
    await readRegularJson(
      join(project.root, "narration.json"),
      "Revision NarrationSpec",
    ),
  );
  const render = RenderSpecSchema.parse(
    await readRegularJson(join(project.root, "render.json"), "Revision RenderSpec"),
  );
  const sound = ProjectSoundPlanSchema.parse(
    await readRegularJson(join(project.root, "sound.json"), "Revision sound plan"),
  );
  const assets = ProjectAssetManifestSchema.parse(
    await readRegularJson(
      join(project.root, "assets.manifest.json"),
      "Revision asset manifest",
    ),
  );
  const previousRequirements = AuthoringRequirementsSchema.parse(
    await readRegularJson(
      join(project.root, "production/requirements.json"),
      "Revision requirements",
    ),
  );
  const previousPool = StoryResourcePoolSchema.parse(
    await readRegularJson(
      join(project.root, "production/story-resource-pool.json"),
      "Revision resource pool",
    ),
  );
  const sourceBytes = {
    brief: jsonBytes(brief),
    story: jsonBytes(story),
    narration: jsonBytes(narration),
    render: jsonBytes(render),
    sound: jsonBytes(sound),
  };
  const requirements = buildAuthoringRequirements({
    source: { brief, story, narration, render, projectSound: sound },
    sourceChecksums: {
      videoBrief: checksum(sourceBytes.brief),
      storySpec: checksum(sourceBytes.story),
      narrationSpec: checksum(sourceBytes.narration),
      renderSpec: checksum(sourceBytes.render),
      projectSound: checksum(sourceBytes.sound),
    },
    enhancementSelection: previousRequirements.enhancementSelection,
    resourcePolicy: previousRequirements.resourcePolicy,
    additionalRequirements: previousRequirements.additionalRequirements,
    readability: {
      edgeInsetPx: previousRequirements.readabilityPolicy.baseEdgeInsetPx,
    },
  });
  const catalog = ResourceCatalogSchema.parse(
    (
      await generateWorkspaceProjectResourceCatalog({
        locations,
        projectId,
        mode: "write",
      })
    ).catalog,
  );
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId: projectId,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    ...(patch.visualStyle ?? project.editable.visualStyle),
  });
  const styleEntry = catalog.entries.find(
    ({ descriptor }) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  if (styleEntry === undefined) {
    throw new Error("Project revision selected style is unavailable.");
  }
  const visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  const resourcePool = buildStoryResourcePool({
    storyId: projectId,
    requirementsFingerprint: requirements.requirementsFingerprint,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    allowedResourceIds: previousPool.allowedResourceIds,
    allowedSnapshots: previousPool.allowedSnapshots,
    selfAuthoredVisualsAllowed: true,
  });
  const allowedResources = new Set(resourcePool.allowedResourceIds);
  for (const scene of pending.scenes) {
    if (scene.candidateResourceIds.some((id) => !allowedResources.has(id))) {
      throw new Error(
        `Project revision Scene requests a resource outside the current pool: ${scene.meaningId}.`,
      );
    }
  }
  const globalVisual = buildGlobalVisualBrief({
    storyId: projectId,
    responsibility: "project-global-background-texture-decoration-continuity-v1",
    visualIntent:
      patch.globalVisual?.visualIntent ?? project.globalVisual.visualIntent,
    constraints: project.globalVisual.constraints,
  });
  const publishing = buildPublishingIntent({
    story,
    authored: patch.publishing ?? project.editable.publishing,
    publishingCollections: config.publishingCollections,
  });
  const values = [
    ["brief.json", brief],
    ["story.json", story],
    ["visual-style.json", visualStyle],
    ["publishing-intent.json", publishing],
    ["production/requirements.json", requirements],
    ["production/story-resource-pool.json", resourcePool],
    ["production/global-visual-brief.json", globalVisual],
    ["production/scene-originality-baseline.json", originalityBaseline],
    ["production/pending-scene-production-brief.json", pending],
    ["assets.manifest.json", assets],
  ] as const;
  for (const [path, value] of values) {
    await replaceJson(project.root, path, value);
  }
  const storyChanged =
    serializeCanonicalJson(story) !== serializeCanonicalJson(project.story);
  if (storyChanged) {
    for (const path of [
      "generated/narration-preparation.generated.json",
      "generated/sealed-narration.generated.json",
      "generated/mastered-narration.generated.json",
      "generated/semantic-timing.generated.json",
      "production/scene-production-brief.json",
    ]) {
      await removeFileIfPresent(project.root, path);
    }
  } else {
    const projected = await projectPendingSceneAuthoring(
      { locations, projectId },
      generateWorkspaceProjectResourceCatalog,
    );
    if (!projected.projected) {
      throw new Error("Project revision could not project current Scene authoring.");
    }
  }
  await replaceJson(project.root, "production/project-revision-candidate.json", {
    schemaVersion: 1,
    contractVersion: "project-revision-materialization-v1",
    storyId: projectId,
    candidateId: computeProjectRevisionCandidateId(input),
    baseRevisionId: input.baseRevisionId,
    changedSections: Object.keys(input.patch).sort(),
    visualStyleFingerprint,
  });
};

const candidateRecord = async ({
  locations,
  storyId,
  candidateId,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly candidateId: string;
}) =>
  ProjectRevisionCandidateRecordSchema.parse(
    await readRegularJson(
      projectRevisionCandidateRecordPath({ locations, storyId, candidateId }),
      "Project revision candidate record",
    ),
  );

export const createProjectRevisionCandidate = async ({
  locations,
  config,
  input: rawInput,
  current,
  verifyCurrent,
  now = () => new Date(),
}: {
  readonly locations: ProductionLocations;
  readonly config: ProducerConfig;
  readonly input: unknown;
  readonly current: CurrentRevisionDelivery;
  readonly verifyCurrent?: () => Promise<CurrentRevisionDelivery>;
  readonly now?: () => Date;
}) => {
  const { input } = await validateProjectRevisionAuthoring({
    locations,
    input: rawInput,
  });
  if (
    input.baseRevisionId !== current.currentRevisionId ||
    current.sourceCurrentId.length === 0 ||
    current.deliveryBuildId.length === 0
  ) {
    throw new Error("Project revision base is stale against current Delivery.");
  }
  const candidateId = computeProjectRevisionCandidateId(input);
  const targetRoot = projectRevisionCandidateRoot({
    locations,
    storyId: input.storyId,
    candidateId,
  });
  const rspRoot = dirname(locations.taskWorkspaceRoot);
  const parent = dirname(targetRoot);
  assertContained(rspRoot, parent, "Project revision candidate parent");
  await mkdir(parent, { recursive: true });
  const lock = await acquireRepositoryOperationLock({
    rootDir: locations.operationLockRoot,
    ownerId: "workspace-project-revision-create",
  });
  const stagingRoot = join(parent, `.staging-${candidateId}-${randomUUID()}`);
  assertContained(parent, stagingRoot, "Project revision staging");
  try {
    const lockedCurrent =
      verifyCurrent === undefined ? current : await verifyCurrent();
    if (
      lockedCurrent.currentRevisionId !== current.currentRevisionId ||
      lockedCurrent.sourceCurrentId !== current.sourceCurrentId ||
      lockedCurrent.deliveryBuildId !== current.deliveryBuildId
    ) {
      throw new Error("Project revision base changed before candidate creation.");
    }
    const existing = await metadata(targetRoot);
    if (existing !== null) {
      if (existing.isSymbolicLink() || !existing.isDirectory()) {
        throw new Error("Project revision candidate target is unsafe.");
      }
      const record = await candidateRecord({
        locations,
        storyId: input.storyId,
        candidateId,
      });
      if (
        serializeCanonicalJson(record.input) !== serializeCanonicalJson(input)
      ) {
        throw new Error("Project revision candidate identity conflicts.");
      }
      return {
        status: "project-revision-candidate-current" as const,
        storyId: input.storyId,
        candidateId,
        baseRevisionId: input.baseRevisionId,
        changedSections: record.changedSections,
        nextAction: "inspect-candidate" as const,
      };
    }
    const originalityBaseline =
      await snapshotWorkspaceSceneOriginalityBaseline({
        locations,
        projectId: input.storyId,
      });
    await mkdir(stagingRoot);
    const stagedLocations = createProjectRevisionCandidateLocations({
      locations,
      storyId: input.storyId,
      candidateId,
    });
    const sourceContainer = join(stagingRoot, "projects");
    const mediaContainer = join(stagingRoot, "media");
    await Promise.all([mkdir(sourceContainer), mkdir(mediaContainer)]);
    await Promise.all([
      copyRegularTree(
        join(locations.projectSourceRoot, input.storyId),
        join(sourceContainer, input.storyId),
      ),
      copyRegularTree(
        join(locations.projectMediaRoot, input.storyId),
        join(mediaContainer, input.storyId),
      ),
    ]);
    const stagingLocations = {
      ...stagedLocations,
      projectSourceRoot: sourceContainer,
      projectMediaRoot: mediaContainer,
      sourceCurrentRoot: join(stagingRoot, "current", "source"),
      deliveryRoot: join(stagingRoot, "deliveries"),
    } as ProductionLocations;
    await Promise.all([
      mkdir(stagingLocations.sourceCurrentRoot, { recursive: true }),
      mkdir(stagingLocations.deliveryRoot, { recursive: true }),
    ]);
    await applyRevisionPatch({
      locations: stagingLocations,
      projectId: input.storyId,
      config,
      input,
      originalityBaseline,
    });
    const record = ProjectRevisionCandidateRecordSchema.parse({
      schemaVersion: 1,
      contractVersion: "project-revision-candidate-v1",
      candidateId,
      input,
      baseSourceCurrentId: current.sourceCurrentId,
      baseDeliveryBuildId: current.deliveryBuildId,
      changedSections: Object.keys(input.patch).sort(),
      createdAt: now().toISOString(),
    });
    await writeFile(join(stagingRoot, "candidate.json"), jsonBytes(record), {
      flag: "wx",
    });
    await rename(stagingRoot, targetRoot);
    return {
      status: "project-revision-candidate-created" as const,
      storyId: input.storyId,
      candidateId,
      baseRevisionId: input.baseRevisionId,
      changedSections: record.changedSections,
      nextAction: "inspect-candidate" as const,
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await lock.release();
  }
};

const moveRequired = async (source: string, target: string, label: string) => {
  const state = await lstat(source);
  if (state.isSymbolicLink()) throw new Error(`${label} is symbolic.`);
  await mkdir(dirname(target), { recursive: true });
  await rename(source, target);
};

export const promoteProjectRevisionCandidate = async ({
  locations,
  storyId,
  candidateId,
  readCurrent,
  regenerate,
  verify,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly candidateId: string;
  readonly readCurrent: () => Promise<CurrentRevisionDelivery>;
  readonly regenerate: () => Promise<void>;
  readonly verify: () => Promise<CurrentRevisionDelivery>;
}) => {
  const record = await candidateRecord({ locations, storyId, candidateId });
  const current = await readCurrent();
  if (
    current.currentRevisionId !== record.input.baseRevisionId ||
    current.sourceCurrentId !== record.baseSourceCurrentId ||
    current.deliveryBuildId !== record.baseDeliveryBuildId
  ) {
    throw new Error("Project revision promotion base is stale.");
  }
  const candidateLocations = createProjectRevisionCandidateLocations({
    locations,
    storyId,
    candidateId,
  });
  const candidateRoot = projectRevisionCandidateRoot({
    locations,
    storyId,
    candidateId,
  });
  const rollbackRoot = join(candidateRoot, "rollback");
  if ((await metadata(rollbackRoot)) !== null) {
    throw new Error("Project revision rollback root already exists.");
  }
  const lock = await acquireRepositoryOperationLock({
    rootDir: locations.operationLockRoot,
    ownerId: "workspace-project-revision-promote",
  });
  const replacements = [
    {
      live: join(locations.projectSourceRoot, storyId),
      candidate: join(candidateLocations.projectSourceRoot, storyId),
      rollback: join(rollbackRoot, "projects", storyId),
    },
    {
      live: join(locations.projectMediaRoot, storyId),
      candidate: join(candidateLocations.projectMediaRoot, storyId),
      rollback: join(rollbackRoot, "media", storyId),
    },
    {
      live: join(locations.sourceCurrentRoot, `${storyId}.json`),
      candidate: join(candidateLocations.sourceCurrentRoot, `${storyId}.json`),
      rollback: join(rollbackRoot, "current", `${storyId}.json`),
    },
    {
      live: join(locations.deliveryRoot, storyId),
      candidate: join(candidateLocations.deliveryRoot, storyId),
      rollback: join(rollbackRoot, "deliveries", storyId),
    },
  ] as const;
  const moved: typeof replacements[number][] = [];
  try {
    const lockedCurrent = await readCurrent();
    if (
      lockedCurrent.currentRevisionId !== current.currentRevisionId ||
      lockedCurrent.sourceCurrentId !== current.sourceCurrentId ||
      lockedCurrent.deliveryBuildId !== current.deliveryBuildId
    ) {
      throw new Error("Project revision promotion base changed before commit.");
    }
    await mkdir(rollbackRoot, { recursive: true });
    for (const replacement of replacements) {
      await moveRequired(
        replacement.live,
        replacement.rollback,
        "Current revision promotion source",
      );
      try {
        await moveRequired(
          replacement.candidate,
          replacement.live,
          "Candidate revision promotion source",
        );
      } catch (error) {
        await rename(replacement.rollback, replacement.live);
        throw error;
      }
      moved.push(replacement);
    }
    await regenerate();
    const promoted = await verify();
    if (
      promoted.currentRevisionId === record.input.baseRevisionId ||
      promoted.sourceCurrentId === record.baseSourceCurrentId ||
      promoted.deliveryBuildId === record.baseDeliveryBuildId
    ) {
      throw new Error("Project revision promotion did not advance current identity.");
    }
    await rm(rollbackRoot, { recursive: true });
    await rm(candidateRoot, { recursive: true });
    return {
      status: "project-revision-promoted" as const,
      storyId,
      candidateId,
      revisionId: promoted.currentRevisionId,
      sourceCurrentId: promoted.sourceCurrentId,
      deliveryBuildId: promoted.deliveryBuildId,
    };
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const replacement of [...moved].reverse()) {
      await rename(replacement.live, replacement.candidate).catch(
        (rollbackError) => rollbackErrors.push(rollbackError),
      );
      await rename(replacement.rollback, replacement.live).catch(
        (rollbackError) => rollbackErrors.push(rollbackError),
      );
    }
    await regenerate().catch((rollbackError) =>
      rollbackErrors.push(rollbackError),
    );
    if (rollbackErrors.length === 0) {
      await rm(rollbackRoot, { recursive: true }).catch((rollbackError) =>
        rollbackErrors.push(rollbackError),
      );
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Project revision promotion failed and rollback was incomplete.",
      );
    }
    throw error;
  } finally {
    await lock.release();
  }
};

export const readProjectRevisionCandidateRecord = candidateRecord;
