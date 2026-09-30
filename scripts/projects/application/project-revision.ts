import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  AuthoringRequirementsSchema,
  PROJECT_REVISION_SECTION_NAMES,
  GlobalVisualBriefSchema,
  NarrationSpecSchema,
  PendingSceneAuthoringSchema,
  ProjectRevisionContextSchema,
  ProjectRevisionEditableAuthoringSchema,
  ProjectRevisionInputSchema,
  ProjectRevisionMaterializationRecordSchema,
  ProjectRevisionValidationResultSchema,
  ProjectSoundPlanSchema,
  PublishingIntentSchema,
  RenderSpecSchema,
  ResourceCatalogSchema,
  SceneOriginalityBaselineSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  VideoBriefSchema,
  VisualStyleSpecSchema,
  assertCaptionAuthoringValid,
  parseAuthoringInput,
  buildAuthoringRequirements,
  buildGlobalVisualBrief,
  buildPendingSceneAuthoring,
  buildPublishingIntent,
  buildStoryResourcePool,
  computeProjectRevisionAuthoringFingerprint,
  computeProjectRevisionCandidateId,
  computeVisualStyleFingerprint,
  serializeCanonicalJson,
  validateStoryResourcePool,
  type DeliveryPublish,
  type ProducerConfig,
  type ProjectRevisionInput,
  type ProjectRevisionSectionName,
  type SceneOriginalityBaseline,
} from "@axmorf/studio/contracts";
import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../../config/producer-config";
import { inspectCurrentDelivery } from "../../project-production/adapters/current-delivery-inspection";
import { readCurrentProductionRevision } from "../../project-production/application/current-revision";
import { createProjectRevisionProductionScope } from "../../project-production/application/production-scope";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import { readContainedRegularFile } from "../adapters/project-create-store";
import {
  createProjectRevisionCandidateDefinition,
  installProjectRevisionCandidateAuthoring,
  stageProjectRevisionCandidateAuthoring,
} from "./project-revision-candidate-store";
import {
  SCENE_ORIGINALITY_BASELINE_PATH,
  snapshotWorkspaceSceneOriginalityBaseline,
} from "./scene-originality";

export const PROJECT_REVISION_MATERIALIZATION_PATH =
  "production/project-revision-candidate.json" as const;

const PROJECT_CREATE_RECEIPT_PATH = "production/project-create.json" as const;

const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

const assertContained = ({
  root,
  target,
  label,
}: {
  readonly root: string;
  readonly target: string;
  readonly label: string;
}) => {
  const fromRoot = relative(resolve(root), resolve(target));
  if (
    fromRoot === "" ||
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`)
  ) {
    throw new Error(`${label} must stay below its fixed root.`);
  }
};

const assertRealDirectoryChain = async ({
  root,
  relativeDirectory,
}: {
  readonly root: string;
  readonly relativeDirectory: string;
}) => {
  const resolvedRoot = resolve(root);
  const rootState = await lstat(resolvedRoot);
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
    throw new Error("Project revision staging root must be a real directory.");
  }
  let current = resolvedRoot;
  for (const segment of relativeDirectory.split("/").filter(Boolean)) {
    current = join(current, segment);
    assertContained({
      root: resolvedRoot,
      target: current,
      label: "Project revision output",
    });
    try {
      const state = await lstat(current);
      if (state.isSymbolicLink() || !state.isDirectory()) {
        throw new Error("Project revision output parent is unsafe.");
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      await mkdir(current);
    }
  }
};

const writeContainedJson = async ({
  rootDir,
  relativePath,
  value,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly value: unknown;
}) => {
  if (
    relativePath.includes("\\") ||
    relativePath
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Project revision output path is invalid.");
  }
  const destination = join(rootDir, ...relativePath.split("/"));
  assertContained({
    root: rootDir,
    target: destination,
    label: "Project revision output",
  });
  await assertRealDirectoryChain({
    root: rootDir,
    relativeDirectory: relativePath.split("/").slice(0, -1).join("/"),
  });
  try {
    const current = await lstat(destination);
    if (current.isSymbolicLink() || !current.isFile()) {
      throw new Error("Project revision output target is unsafe.");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  await writeFile(destination, jsonBytes(value), { flag: "w" });
};

const assertSafeRemovalTree = async (path: string): Promise<void> => {
  const state = await lstat(path);
  if (state.isSymbolicLink()) {
    throw new Error("Project revision cleanup rejects symbolic links.");
  }
  if (state.isFile()) return;
  if (!state.isDirectory()) {
    throw new Error("Project revision cleanup rejects special entries.");
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (
      entry.name === "" ||
      entry.name === "." ||
      entry.name === ".." ||
      entry.name.includes("/") ||
      entry.name.includes("\\")
    ) {
      throw new Error("Project revision cleanup found an unsafe entry.");
    }
    await assertSafeRemovalTree(join(path, entry.name));
  }
};

const removeContainedIfPresent = async ({
  rootDir,
  relativePath,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
}) => {
  const target = join(rootDir, ...relativePath.split("/"));
  assertContained({ root: rootDir, target, label: "Project revision cleanup" });
  try {
    await assertSafeRemovalTree(target);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  await rm(target, { recursive: true });
};

const readProjectJson = async ({
  rootDir,
  storyId,
  relativePath,
  label,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly relativePath: string;
  readonly label: string;
}) =>
  JSON.parse(
    new TextDecoder().decode(
      await readContainedRegularFile({
        rootDir,
        relativePath: `src/projects/${storyId}/${relativePath}`,
        label,
      }),
    ),
  ) as unknown;

const narratedBeats = (story: ReturnType<typeof StorySpecSchema.parse>) =>
  story.beats.filter((beat) => beat.kind === "narrated-scene");

const editableVisualStyle = (
  visualStyle: ReturnType<typeof VisualStyleSpecSchema.parse>,
) => ({
  styleProfileId: visualStyle.styleProfileId,
  artDirection: visualStyle.artDirection,
  ...(visualStyle.theme === undefined ? {} : { theme: visualStyle.theme }),
  continuityRules: visualStyle.continuityRules,
  forbiddenTreatments: visualStyle.forbiddenTreatments,
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
  rootDir,
  storyId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}) => {
  const [brief, story, visualStyle, pending, globalVisual, publishing] =
    await Promise.all([
      readProjectJson({
        rootDir,
        storyId,
        relativePath: "brief.json",
        label: "Revision VideoBrief",
      }).then(VideoBriefSchema.parse),
      readProjectJson({
        rootDir,
        storyId,
        relativePath: "story.json",
        label: "Revision StorySpec",
      }).then(StorySpecSchema.parse),
      readProjectJson({
        rootDir,
        storyId,
        relativePath: "visual-style.json",
        label: "Revision VisualStyleSpec",
      }).then(VisualStyleSpecSchema.parse),
      readProjectJson({
        rootDir,
        storyId,
        relativePath: "production/pending-scene-production-brief.json",
        label: "Revision pending Scene authoring",
      }).then(PendingSceneAuthoringSchema.parse),
      readProjectJson({
        rootDir,
        storyId,
        relativePath: "production/global-visual-brief.json",
        label: "Revision GlobalVisualBrief",
      }).then(GlobalVisualBriefSchema.parse),
      readProjectJson({
        rootDir,
        storyId,
        relativePath: "publishing-intent.json",
        label: "Revision PublishingIntent",
      }).then(PublishingIntentSchema.parse),
    ]);
  const storyIds = [
    brief.storyId,
    story.storyId,
    visualStyle.storyId,
    pending.storyId,
    globalVisual.storyId,
    publishing.storyId,
  ];
  if (storyIds.some((candidate) => candidate !== storyId)) {
    throw new Error("Project revision authoring is cross-bound.");
  }
  if (
    pending.scenes.length !== story.beats.length ||
    pending.scenes.some(
      ({ meaningId }, index) => meaningId !== story.beats[index]?.meaningId,
    )
  ) {
    throw new Error("Project revision pending Scene authoring is stale.");
  }
  const narratedMeaningIds = new Set(
    narratedBeats(story).map(({ meaningId }) => meaningId),
  );
  const editable = ProjectRevisionEditableAuthoringSchema.parse({
    brief,
    story: {
      schemaVersion: story.schemaVersion,
      storyId,
      title: story.title,
      beats: narratedBeats(story),
    },
    visualStyle: editableVisualStyle(visualStyle),
    scenes: pending.scenes.filter(({ meaningId }) =>
      narratedMeaningIds.has(meaningId),
    ),
    globalVisual: { visualIntent: globalVisual.visualIntent },
    publishing: editablePublishing(publishing),
  });
  return {
    brief,
    story,
    visualStyle,
    pending,
    globalVisual,
    publishing,
    editable,
  } as const;
};

export type ProjectRevisionStateDependencies = Readonly<{
  readCurrentRevision?: typeof readCurrentProductionRevision;
  inspectDelivery?: typeof inspectCurrentDelivery;
}>;

const readVerifiedRevisionState = async ({
  rootDir,
  storyId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly dependencies?: ProjectRevisionStateDependencies;
}) => {
  const readCurrentRevision =
    dependencies.readCurrentRevision ?? readCurrentProductionRevision;
  const inspectDelivery =
    dependencies.inspectDelivery ?? inspectCurrentDelivery;
  const revisionBefore = await readCurrentRevision({
    rootDir,
    projectId: storyId,
  });
  const deliveryBefore = await inspectDelivery({ rootDir, storyId });
  if (deliveryBefore === null) {
    throw new Error("Project revision requires a verified current Delivery.");
  }
  if (
    revisionBefore.storyId !== storyId ||
    deliveryBefore.storyId !== storyId ||
    deliveryBefore.revisionId !== revisionBefore.revisionId ||
    deliveryBefore.publishing.storyId !== storyId ||
    deliveryBefore.publishing.fps !== deliveryBefore.fps ||
    deliveryBefore.publishing.frameCount !== deliveryBefore.frameCount
  ) {
    throw new Error(
      "Project revision current Revision and Delivery publish tuple disagree.",
    );
  }
  const project = await readEditableProject({ rootDir, storyId });
  const revision = await readCurrentRevision({ rootDir, projectId: storyId });
  if (
    serializeCanonicalJson(revisionBefore) !== serializeCanonicalJson(revision)
  ) {
    throw new Error(
      "Project revision source changed during context inspection.",
    );
  }
  const delivery = await inspectDelivery({ rootDir, storyId });
  if (delivery === null) {
    throw new Error(
      "Project revision Delivery changed during context inspection.",
    );
  }
  if (
    serializeCanonicalJson(deliveryBefore) !== serializeCanonicalJson(delivery)
  ) {
    throw new Error(
      "Project revision Delivery changed during context inspection.",
    );
  }
  const context = ProjectRevisionContextSchema.parse({
    schemaVersion: 1,
    contractVersion: "project-revision-context-v1",
    status: "project-revision-context",
    storyId,
    baseRevisionId: revision.revisionId,
    baseDeliveryBuildId: delivery.deliveryBuildId,
    editable: project.editable,
    constraints: {
      sameProject: true,
      preserveNarratedMeaningIdsAndOrder: true,
      preserveBoundaryScenes: true,
      currentDeliveryRemainsUntilPromotion: true,
    },
  });
  return { revision, delivery, project, context } as const;
};

export const readProjectRevisionContext = async ({
  rootDir: rawRootDir,
  projectId,
  dependencies,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly dependencies?: ProjectRevisionStateDependencies;
}) =>
  (
    await readVerifiedRevisionState({
      rootDir: resolve(rawRootDir),
      storyId: projectId,
      dependencies,
    })
  ).context;

const assertMeaningOrder = ({
  expected,
  actual,
  label,
}: {
  readonly expected: readonly string[];
  readonly actual: readonly string[];
  readonly label: string;
}) => {
  if (
    expected.length !== actual.length ||
    expected.some((meaningId, index) => meaningId !== actual[index])
  ) {
    throw new Error(
      `${label} must preserve narrated meaning IDs and order exactly.`,
    );
  }
};

const inspectProjectRevisionAuthoring = async ({
  rootDir,
  input: rawInput,
  dependencies,
}: {
  readonly rootDir: string;
  readonly input: unknown;
  readonly dependencies?: ProjectRevisionStateDependencies;
}) => {
  const input = parseAuthoringInput(ProjectRevisionInputSchema, rawInput);
  if (input.patch.story !== undefined) {
    assertCaptionAuthoringValid({
      story: input.patch.story,
      pathPrefix: ["patch", "story"],
    });
  }
  const state = await readVerifiedRevisionState({
    rootDir,
    storyId: input.storyId,
    dependencies,
  });
  if (
    input.baseRevisionId !== state.context.baseRevisionId ||
    input.baseDeliveryBuildId !== state.context.baseDeliveryBuildId
  ) {
    throw new Error("Project revision base is stale against current Delivery.");
  }
  const expectedMeaningIds = state.context.editable.story.beats.map(
    ({ meaningId }) => meaningId,
  );
  const nextStyle = input.patch.visualStyle;
  const currentTheme = state.context.editable.visualStyle.theme;
  if (nextStyle !== undefined) {
    if (currentTheme !== undefined && nextStyle.theme === undefined) {
      throw new Error(
        "Project revision visualStyle must preserve or replace the current theme.",
      );
    }
    if (
      currentTheme === undefined &&
      nextStyle.theme !== undefined &&
      state.project.story.beats.some(
        (beat) =>
          beat.kind === "silent-scene" &&
          beat.preset.implementation.kind === "template-copy",
      )
    ) {
      throw new Error(
        "Project revision theme is incompatible with legacy immutable boundary templates; create a new Project to adopt themed templates.",
      );
    }
  }
  if (input.patch.story !== undefined) {
    assertMeaningOrder({
      expected: expectedMeaningIds,
      actual: input.patch.story.beats.map(({ meaningId }) => meaningId),
      label: "Project revision Story",
    });
  }
  if (input.patch.scenes !== undefined) {
    assertMeaningOrder({
      expected: expectedMeaningIds,
      actual: input.patch.scenes.map(({ meaningId }) => meaningId),
      label: "Project revision Scene authoring",
    });
  }
  const changedSections = PROJECT_REVISION_SECTION_NAMES.filter(
    (section) =>
      input.patch[section] !== undefined &&
      serializeCanonicalJson(input.patch[section]) !==
        serializeCanonicalJson(state.context.editable[section]),
  ) as ProjectRevisionSectionName[];
  if (changedSections.length === 0) {
    throw new Error(
      "Project revision patch does not change current authoring.",
    );
  }
  const result = ProjectRevisionValidationResultSchema.parse({
    schemaVersion: 1,
    contractVersion: "project-revision-input-v1",
    status: "project-revision-valid",
    storyId: input.storyId,
    candidateId: computeProjectRevisionCandidateId(input),
    baseRevisionId: input.baseRevisionId,
    baseDeliveryBuildId: input.baseDeliveryBuildId,
    changedSections,
  });
  return { input, state, changedSections, result } as const;
};

export const validateProjectRevisionAuthoring = async (
  input: Parameters<typeof inspectProjectRevisionAuthoring>[0],
) => (await inspectProjectRevisionAuthoring(input)).result;

const assertSceneSelectionsAreAllowed = ({
  pending,
  pool,
}: {
  readonly pending: ReturnType<typeof PendingSceneAuthoringSchema.parse>;
  readonly pool: ReturnType<typeof StoryResourcePoolSchema.parse>;
}) => {
  const resources = new Set(pool.allowedResourceIds);
  const snapshots = new Map(
    pool.allowedSnapshots.map(({ sourceId, allowedCardIds }) => [
      sourceId,
      new Set(allowedCardIds),
    ]),
  );
  for (const scene of pending.scenes) {
    if (scene.candidateResourceIds.some((id) => !resources.has(id))) {
      throw new Error(
        `Project revision Scene requests a resource outside the current pool: ${scene.meaningId}.`,
      );
    }
    for (const selection of scene.allowedSnapshotCards) {
      const cards = snapshots.get(selection.sourceId);
      if (
        cards === undefined ||
        selection.cardIds.some((cardId) => !cards.has(cardId))
      ) {
        throw new Error(
          `Project revision Scene requests a snapshot outside the current pool: ${scene.meaningId}.`,
        );
      }
    }
  }
};

const applyProjectRevisionPatch = async ({
  rootDir,
  input,
  config,
  changedSections,
  originalityBaseline,
}: {
  readonly rootDir: string;
  readonly input: ProjectRevisionInput;
  readonly config: ProducerConfig;
  readonly changedSections: readonly ProjectRevisionSectionName[];
  readonly originalityBaseline: SceneOriginalityBaseline;
}) => {
  const storyId = input.storyId;
  const project = await readEditableProject({ rootDir, storyId });
  const authoredStory = input.patch.story ?? project.editable.story;
  const revisedBeatByMeaning = new Map(
    authoredStory.beats.map((beat) => [beat.meaningId, beat] as const),
  );
  const story = StorySpecSchema.parse({
    ...project.story,
    title: authoredStory.title,
    beats: project.story.beats.map((beat) =>
      beat.kind === "silent-scene"
        ? beat
        : (revisedBeatByMeaning.get(beat.meaningId) ?? beat),
    ),
  });
  const authoredScenes = input.patch.scenes ?? project.editable.scenes;
  const revisedSceneByMeaning = new Map(
    authoredScenes.map((scene) => [scene.meaningId, scene] as const),
  );
  const pending = buildPendingSceneAuthoring({
    schemaVersion: 1,
    contractVersion: "pending-scene-authoring-v1",
    storyId,
    scenes: project.pending.scenes.map(
      (scene) => revisedSceneByMeaning.get(scene.meaningId) ?? scene,
    ),
  });
  const [
    narration,
    render,
    sound,
    previousRequirements,
    previousPool,
    catalog,
  ] = await Promise.all([
    readProjectJson({
      rootDir,
      storyId,
      relativePath: "narration.json",
      label: "Revision NarrationSpec",
    }).then(NarrationSpecSchema.parse),
    readProjectJson({
      rootDir,
      storyId,
      relativePath: "render.json",
      label: "Revision RenderSpec",
    }).then(RenderSpecSchema.parse),
    readProjectJson({
      rootDir,
      storyId,
      relativePath: "sound.json",
      label: "Revision ProjectSoundPlan",
    }).then(ProjectSoundPlanSchema.parse),
    readProjectJson({
      rootDir,
      storyId,
      relativePath: "production/requirements.json",
      label: "Revision AuthoringRequirements",
    }).then(AuthoringRequirementsSchema.parse),
    readProjectJson({
      rootDir,
      storyId,
      relativePath: "production/story-resource-pool.json",
      label: "Revision StoryResourcePool",
    }).then(StoryResourcePoolSchema.parse),
    readProjectJson({
      rootDir,
      storyId,
      relativePath: "generated/resource-catalog.generated.json",
      label: "Revision ResourceCatalog",
    }).then(ResourceCatalogSchema.parse),
  ]);
  const brief = VideoBriefSchema.parse(input.patch.brief ?? project.brief);
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
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    ...(input.patch.visualStyle ?? project.editable.visualStyle),
  });
  const styleEntry = catalog.entries.find(
    ({ descriptor }) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  if (styleEntry === undefined) {
    throw new Error("Project revision selected style profile is unavailable.");
  }
  computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  const resourcePool = buildStoryResourcePool({
    storyId,
    requirementsFingerprint: requirements.requirementsFingerprint,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    allowedResourceIds: previousPool.allowedResourceIds,
    allowedSnapshots: previousPool.allowedSnapshots,
    selfAuthoredVisualsAllowed: true,
  });
  validateStoryResourcePool({
    pool: resourcePool,
    catalog,
    requirementsFingerprint: requirements.requirementsFingerprint,
  });
  assertSceneSelectionsAreAllowed({ pending, pool: resourcePool });
  const globalVisual = buildGlobalVisualBrief({
    storyId,
    responsibility: project.globalVisual.responsibility,
    visualIntent:
      input.patch.globalVisual?.visualIntent ??
      project.editable.globalVisual.visualIntent,
    constraints: project.globalVisual.constraints,
  });
  const publishing = buildPublishingIntent({
    story,
    authored: input.patch.publishing ?? project.editable.publishing,
    publishingCollections: config.publishingCollections,
  });
  const editable = ProjectRevisionEditableAuthoringSchema.parse({
    brief,
    story: authoredStory,
    visualStyle: editableVisualStyle(visualStyle),
    scenes: authoredScenes,
    globalVisual: { visualIntent: globalVisual.visualIntent },
    publishing: editablePublishing(publishing),
  });
  const values = [
    ["brief.json", brief],
    ["story.json", story],
    ["visual-style.json", visualStyle],
    ["publishing-intent.json", publishing],
    ["production/requirements.json", requirements],
    ["production/story-resource-pool.json", resourcePool],
    ["production/global-visual-brief.json", globalVisual],
    [SCENE_ORIGINALITY_BASELINE_PATH, originalityBaseline],
    ["production/pending-scene-production-brief.json", pending],
  ] as const;
  for (const [relativePath, value] of values) {
    await writeContainedJson({
      rootDir,
      relativePath: `src/projects/${storyId}/${relativePath}`,
      value,
    });
  }
  await removeContainedIfPresent({
    rootDir,
    relativePath: `src/projects/${storyId}/${PROJECT_CREATE_RECEIPT_PATH}`,
  });
  const storyChanged =
    serializeCanonicalJson(story) !== serializeCanonicalJson(project.story);
  const sceneAuthoringChanged = changedSections.some(
    (section) =>
      section === "brief" ||
      section === "scenes" ||
      section === "story" ||
      section === "visualStyle",
  );
  if (sceneAuthoringChanged) {
    await removeContainedIfPresent({
      rootDir,
      relativePath: `src/projects/${storyId}/production/scene-production-brief.json`,
    });
  }
  if (storyChanged) {
    for (const relativePath of [
      `.narration-work/${storyId}`,
      `public/projects/${storyId}/narration`,
      `public/projects/${storyId}/narration-mastered`,
      `src/projects/${storyId}/generated/narration-preparation.generated.json`,
      `src/projects/${storyId}/generated/sealed-narration.generated.json`,
      `src/projects/${storyId}/generated/mastered-narration.generated.json`,
      `src/projects/${storyId}/generated/semantic-timing.generated.json`,
      `src/projects/${storyId}/generated/scene-coverage.generated.json`,
      `src/projects/${storyId}/production-scene-runtime.generated.ts`,
      `src/projects/${storyId}/Composition.tsx`,
      ...narratedBeats(project.story).map(
        ({ meaningId }) => `src/projects/${storyId}/scenes/${meaningId}`,
      ),
    ]) {
      await removeContainedIfPresent({ rootDir, relativePath });
    }
  }
  const authoringLogicalPaths = [
    `src/projects/${storyId}/assets.manifest.json`,
    `src/projects/${storyId}/brief.json`,
    `src/projects/${storyId}/generated/resource-catalog.generated.json`,
    `src/projects/${storyId}/narration.json`,
    `src/projects/${storyId}/production/global-visual-brief.json`,
    `src/projects/${storyId}/production/pending-scene-production-brief.json`,
    `src/projects/${storyId}/production/requirements.json`,
    `src/projects/${storyId}/${SCENE_ORIGINALITY_BASELINE_PATH}`,
    `src/projects/${storyId}/production/story-resource-pool.json`,
    `src/projects/${storyId}/publishing-intent.json`,
    `src/projects/${storyId}/render.json`,
    `src/projects/${storyId}/sound.json`,
    `src/projects/${storyId}/story.json`,
    `src/projects/${storyId}/visual-style.json`,
  ].sort((left, right) => left.localeCompare(right));
  const authoringFiles = await Promise.all(
    authoringLogicalPaths.map(async (logicalPath) => {
      const bytes = await readContainedRegularFile({
        rootDir,
        relativePath: logicalPath,
        label: `Project revision authored file ${logicalPath}`,
      });
      return {
        logicalPath,
        checksum: checksum(bytes),
        sizeBytes: bytes.byteLength,
      } as const;
    }),
  );
  const materialization = ProjectRevisionMaterializationRecordSchema.parse({
    schemaVersion: 1,
    contractVersion: "project-revision-materialization-v1",
    storyId,
    candidateId: computeProjectRevisionCandidateId(input),
    baseRevisionId: input.baseRevisionId,
    baseDeliveryBuildId: input.baseDeliveryBuildId,
    changedSections,
    authoringFingerprint: computeProjectRevisionAuthoringFingerprint(editable),
    authoringFiles,
  });
  const materializationLogicalPath =
    `src/projects/${storyId}/${PROJECT_REVISION_MATERIALIZATION_PATH}` as const;
  await writeContainedJson({
    rootDir,
    relativePath: materializationLogicalPath,
    value: materialization,
  });
  return {
    materialization,
    ownedLogicalPaths: [
      ...authoringLogicalPaths,
      materializationLogicalPath,
    ].sort((left, right) => left.localeCompare(right)),
    requirementsFingerprint: requirements.requirementsFingerprint,
    publishingIntentFingerprint: publishing.intentFingerprint,
    pendingAuthoringFingerprint: pending.authoringFingerprint,
    storyChanged,
  } as const;
};

const inspectProjectRevisionCandidateAuthoring = async ({
  rootDir,
  input,
}: {
  readonly rootDir: string;
  readonly input: ProjectRevisionInput;
}) => {
  const storyId = input.storyId;
  const record = ProjectRevisionMaterializationRecordSchema.parse(
    await readProjectJson({
      rootDir,
      storyId,
      relativePath: PROJECT_REVISION_MATERIALIZATION_PATH,
      label: "Project revision materialization record",
    }),
  );
  if (
    record.storyId !== storyId ||
    record.candidateId !== computeProjectRevisionCandidateId(input) ||
    record.baseRevisionId !== input.baseRevisionId ||
    record.baseDeliveryBuildId !== input.baseDeliveryBuildId
  ) {
    throw new Error("Project revision materialization identity is stale.");
  }
  const project = await readEditableProject({ rootDir, storyId });
  if (
    record.authoringFingerprint !==
    computeProjectRevisionAuthoringFingerprint(project.editable)
  ) {
    throw new Error("Project revision authored projection is stale.");
  }
  for (const file of record.authoringFiles) {
    const bytes = await readContainedRegularFile({
      rootDir,
      relativePath: file.logicalPath,
      label: `Project revision authored file ${file.logicalPath}`,
    });
    if (
      bytes.byteLength !== file.sizeBytes ||
      checksum(bytes) !== file.checksum
    ) {
      throw new Error(
        `Project revision authored file is stale: ${file.logicalPath}.`,
      );
    }
  }
  return record;
};

const sameBase = (
  left: Readonly<{
    context: Readonly<{
      baseRevisionId: string;
      baseDeliveryBuildId: string;
      editable: unknown;
    }>;
  }>,
  right: typeof left,
) =>
  left.context.baseRevisionId === right.context.baseRevisionId &&
  left.context.baseDeliveryBuildId === right.context.baseDeliveryBuildId &&
  serializeCanonicalJson(left.context.editable) ===
    serializeCanonicalJson(right.context.editable);

export const createProjectRevisionCandidate = async ({
  rootDir: rawRootDir,
  projectId,
  input: rawInput,
  env,
  dependencies,
  acquireLock = acquireRepositoryOperationLock,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly input: unknown;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: ProjectRevisionStateDependencies;
  readonly acquireLock?: typeof acquireRepositoryOperationLock;
}) => {
  const rootDir = resolve(rawRootDir);
  const initial = await inspectProjectRevisionAuthoring({
    rootDir,
    input: rawInput,
    dependencies,
  });
  if (initial.input.storyId !== projectId) {
    throw new Error("Project revision CLI and input Story identities differ.");
  }
  const lock = await acquireLock({
    rootDir,
    ownerId: "project-revision-create",
  });
  try {
    const locked = await inspectProjectRevisionAuthoring({
      rootDir,
      input: initial.input,
      dependencies,
    });
    if (!sameBase(initial.state, locked.state)) {
      throw new Error(
        "Project revision base changed before candidate creation.",
      );
    }
    const configPath = await resolveProducerConfigPathFromEnvironment({
      rootDir,
      env,
    });
    const configState = await lstat(configPath);
    if (configState.isSymbolicLink() || !configState.isFile()) {
      throw new Error("Producer config must be a regular non-symbolic file.");
    }
    const config = await readProducerConfig({ configPath });
    const originalityBaseline = SceneOriginalityBaselineSchema.parse(
      await snapshotWorkspaceSceneOriginalityBaseline({
        rootDir,
        subjectStoryId: initial.input.storyId,
      }),
    );
    const candidateId = computeProjectRevisionCandidateId(initial.input);
    const scope = createProjectRevisionProductionScope({
      rootDir,
      storyId: initial.input.storyId,
      candidateId,
    });
    const baseDirectories = {
      source: join(rootDir, "src", "projects", initial.input.storyId),
      public: join(rootDir, "public", "projects", initial.input.storyId),
      narration: join(rootDir, ".narration-work", initial.input.storyId),
      delivery: join(rootDir, "deliveries", initial.input.storyId),
    } as const;
    await createProjectRevisionCandidateDefinition({
      scope,
      input: initial.input,
      baseDirectories,
    });
    const afterSnapshot = await readVerifiedRevisionState({
      rootDir,
      storyId: initial.input.storyId,
      dependencies,
    });
    if (!sameBase(locked.state, afterSnapshot)) {
      throw new Error("Project revision base changed while snapshotting.");
    }
    let prepared:
      | Awaited<ReturnType<typeof applyProjectRevisionPatch>>
      | undefined;
    const staged = await stageProjectRevisionCandidateAuthoring({
      scope,
      populate: async (stagingDirectory) => {
        prepared = await applyProjectRevisionPatch({
          rootDir: stagingDirectory,
          input: initial.input,
          config,
          changedSections: locked.changedSections,
          originalityBaseline,
        });
      },
    });
    try {
      if (prepared === undefined) {
        throw new Error("Project revision authoring was not prepared.");
      }
      const installed = await installProjectRevisionCandidateAuthoring({
        scope,
        stagingDirectory: staged.stagingDirectory,
        ownedLogicalPaths: prepared.ownedLogicalPaths,
      });
      const verified = await inspectProjectRevisionCandidateAuthoring({
        rootDir: scope.isolatedRoot,
        input: initial.input,
      });
      if (
        serializeCanonicalJson(verified) !==
        serializeCanonicalJson(prepared.materialization)
      ) {
        throw new Error(
          "Installed Project revision materialization record differs.",
        );
      }
      return {
        status: installed.status,
        storyId: initial.input.storyId,
        candidateId,
        baseRevisionId: initial.input.baseRevisionId,
        baseDeliveryBuildId: initial.input.baseDeliveryBuildId,
        changedSections: locked.changedSections,
        authoringFingerprint: prepared.materialization.authoringFingerprint,
        storyChanged: prepared.storyChanged,
        requirementsFingerprint: prepared.requirementsFingerprint,
        publishingIntentFingerprint: prepared.publishingIntentFingerprint,
        pendingAuthoringFingerprint: prepared.pendingAuthoringFingerprint,
        nextAction: "inspect-candidate",
      } as const;
    } catch (error) {
      await rm(staged.stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  } finally {
    await lock.release();
  }
};

export const readProjectRevisionInputFile = async ({
  rootDir: rawRootDir,
  inputPath,
}: {
  readonly rootDir: string;
  readonly inputPath: string;
}) => {
  const rootDir = resolve(rawRootDir);
  const relativePath = relative(rootDir, resolve(inputPath))
    .split(sep)
    .join("/");
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("/")
  ) {
    throw new Error("Project revision input must stay inside the repository.");
  }
  return parseAuthoringInput(
    ProjectRevisionInputSchema,
    JSON.parse(
      new TextDecoder().decode(
        await readContainedRegularFile({
          rootDir,
          relativePath,
          label: "Project revision input",
        }),
      ),
    ),
  );
};

export type ProjectRevisionContext = Awaited<
  ReturnType<typeof readProjectRevisionContext>
>;
export type ProjectRevisionDelivery = DeliveryPublish;
