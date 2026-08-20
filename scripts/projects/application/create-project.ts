import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  AuthoringRequirementsSchema,
  NarrationSpecSchema,
  ProjectAssetManifestSchema,
  RenderSpecSchema,
  ResourceCatalogSchema,
  SemanticTimingSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildAuthoringRequirements,
  buildGlobalVisualBrief,
  buildProjectAssetManifest,
  buildPublishingIntent,
  buildSceneProductionBrief,
  buildStoryResourcePool,
  computeVisualStyleFingerprint,
  serializeCanonicalJson,
  validateSceneProductionBrief,
  validateStoryResourcePool,
  type ProducerConfig,
  type ResourceDescriptor,
} from "../../../src/contracts";
import {
  PendingSceneAuthoringSchema,
  ProjectCreateInputSchema,
  buildPendingSceneAuthoring,
  computeProjectCreateInputFingerprint,
  type ProjectCreateInput,
} from "../../../src/contracts/project-create";
import {
  Sha256DigestSchema,
  StoryIdSchema,
} from "../../../src/contracts/primitives";
import {
  buildResourceCatalog,
  renderResourceCatalogJson,
} from "../../catalog/domain";
import { loadCatalogAuthorityDescriptors } from "../../catalog/project-files";
import { generateProjectResourceCatalog } from "../../catalog/generate";
import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../../config/producer-config";
import { writeTextFileAtomic } from "../../shared/atomic-file";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import {
  commitConfiguredSceneTemplates,
  prepareConfiguredSceneTemplates,
} from "./instantiate-scene-templates";
import {
  commitProjectSound,
  prepareProjectSound,
} from "./localize-project-sound";
import {
  PROJECT_CREATE_CATALOG_PATH,
  commitStagedProjectCreate,
  createProjectCreateStaging,
  inspectProjectCreateTargets,
  readContainedRegularFile,
} from "../adapters/project-create-store";
import {
  SCENE_TEMPLATE_DEFINITIONS,
  getSceneTemplateDefinition,
} from "../../../src/remotion/capabilities/scene-templates/registry";

const CREATION_RECEIPT_PATH = "production/project-create.json" as const;
export const PENDING_SCENE_AUTHORING_PATH =
  "production/pending-scene-production-brief.json" as const;

const checksum = (bytes: Uint8Array) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );

const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const writeStageBytes = async ({
  stagingRoot,
  relativePath,
  bytes,
}: {
  readonly stagingRoot: string;
  readonly relativePath: string;
  readonly bytes: Uint8Array | string;
}) => {
  const destination = join(stagingRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
};

const copyOptionalRegular = async ({
  rootDir,
  stagingRoot,
  relativePath,
}: {
  readonly rootDir: string;
  readonly stagingRoot: string;
  readonly relativePath: string;
}) => {
  try {
    await lstat(join(rootDir, relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await writeStageBytes({
    stagingRoot,
    relativePath,
    bytes: await readContainedRegularFile({
      rootDir,
      relativePath,
      label: `Project create selected source ${relativePath}`,
    }),
  });
};

const copySceneTemplateAuthorities = async ({
  rootDir,
  stagingRoot,
  enabled,
}: {
  readonly rootDir: string;
  readonly stagingRoot: string;
  readonly enabled: boolean;
}) => {
  if (!enabled) return;
  const paths = new Set(
    SCENE_TEMPLATE_DEFINITIONS.flatMap((definition) => [
      ...definition.sourceFiles.map(({ sourcePath }) => sourcePath),
      ...definition.assets.map(({ sourcePath }) => sourcePath),
    ]),
  );
  for (const relativePath of paths) {
    await copyOptionalRegular({ rootDir, stagingRoot, relativePath });
  }
  for (const relativePath of [
    "private/reference-assets/scene-template-sound-overrides.json",
    "private/reference-assets/assets.manifest.json",
    "private/reference-assets/MIXKIT_AUDIO_LICENSE.md",
  ]) {
    await copyOptionalRegular({ rootDir, stagingRoot, relativePath });
  }
};

const projectDescriptors = ({
  manifest,
  manifestBytes,
}: {
  readonly manifest: ReturnType<typeof ProjectAssetManifestSchema.parse>;
  readonly manifestBytes: string;
}): readonly ResourceDescriptor[] =>
  manifest.assets.map((descriptor) => ({
    ...descriptor,
    authority: {
      ...descriptor.authority,
      sourceChecksum: checksum(Buffer.from(manifestBytes)),
    },
  }));

const ensureSelectionsAreCurrent = ({
  input,
  catalog,
}: {
  readonly input: ProjectCreateInput;
  readonly catalog: ReturnType<typeof ResourceCatalogSchema.parse>;
}) => {
  if (input.resources.allowedSnapshots.length > 0) {
    throw new Error(
      "Project create snapshot selection requires an explicitly localized immutable snapshot.",
    );
  }
  const byId = new Map(
    catalog.entries.map((entry) => [entry.descriptor.id, entry] as const),
  );
  for (const resourceId of input.resources.allowedResourceIds) {
    const entry = byId.get(resourceId);
    if (
      entry === undefined ||
      entry.descriptor.status !== "approved" ||
      entry.descriptor.allowedUse === "blocked" ||
      entry.descriptor.kind === "authoring-reference"
    ) {
      throw new Error(`Project create resource is unavailable: ${resourceId}.`);
    }
  }
  const style = catalog.entries.find(
    ({ descriptor }) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === input.visualStyle.styleProfileId,
  );
  if (style === undefined) {
    throw new Error(
      `Project create style profile is unavailable: ${input.visualStyle.styleProfileId}.`,
    );
  }
  return style;
};

const synthesizePendingScenes = ({
  story,
  authoredScenes,
}: {
  readonly story: ReturnType<typeof StorySpecSchema.parse>;
  readonly authoredScenes: ProjectCreateInput["scenes"];
}) => {
  const authoredByMeaning = new Map(
    authoredScenes.map((scene) => [scene.meaningId, scene] as const),
  );
  return story.beats.map((beat) => {
    const authored = authoredByMeaning.get(beat.meaningId);
    if (authored !== undefined) return authored;
    if (
      beat.kind !== "silent-scene" ||
      beat.preset.implementation.kind !== "template-copy"
    ) {
      throw new Error(
        `Project create Scene authoring is missing: ${beat.meaningId}.`,
      );
    }
    return {
      meaningId: beat.meaningId,
      visualIntent: beat.preset.visualIntent,
      compositionIntent:
        "Preserve the configured boundary Scene composition without semantic substitution.",
      motionIntent:
        "Preserve the configured boundary Scene frame-driven motion exactly.",
      soundIntent: beat.preset.soundIntent,
      continuityBrief:
        "Keep this configured boundary isolated from narrated Scene ownership.",
      candidateResourceIds: beat.preset.resourceIds,
      allowedSnapshotCards: [],
    } as const;
  });
};

type FileManifestEntry = Readonly<{
  logicalPath: string;
  checksum: ReturnType<typeof checksum>;
}>;

const collectFiles = async ({
  rootDir,
  relativeRoot,
}: {
  readonly rootDir: string;
  readonly relativeRoot: string;
}): Promise<readonly FileManifestEntry[]> => {
  const absoluteRoot = join(rootDir, relativeRoot);
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const files: FileManifestEntry[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isSymbolicLink()) {
      throw new Error("Project create staging contains a symbolic link.");
    }
    const logicalPath = `${relativeRoot}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(
        ...(await collectFiles({ rootDir, relativeRoot: logicalPath })),
      );
    } else if (entry.isFile()) {
      if (!logicalPath.endsWith(`/${CREATION_RECEIPT_PATH}`)) {
        files.push({
          logicalPath,
          checksum: checksum(await readFile(join(rootDir, logicalPath))),
        });
      }
    } else {
      throw new Error("Project create staging contains a special file.");
    }
  }
  return files.sort((left, right) =>
    left.logicalPath.localeCompare(right.logicalPath),
  );
};

const buildCreationReceipt = ({
  storyId,
  inputFingerprint,
  files,
  catalogChecksum,
}: {
  readonly storyId: string;
  readonly inputFingerprint: ReturnType<
    typeof computeProjectCreateInputFingerprint
  >;
  readonly files: readonly FileManifestEntry[];
  readonly catalogChecksum: ReturnType<typeof checksum>;
}) => {
  const catalog = {
    logicalPath: PROJECT_CREATE_CATALOG_PATH,
    checksum: catalogChecksum,
  } as const;
  const creationIdentity = checksum(
    Buffer.from(
      serializeCanonicalJson({
        identityVersion: "project-create-identity-v1",
        storyId,
        inputFingerprint,
        files,
        catalog,
      }),
    ),
  );
  return {
    schemaVersion: 1,
    contractVersion: "project-create-receipt-v1",
    storyId,
    sourceState: "configured-authoring",
    inputFingerprint,
    creationIdentity,
    files,
    catalog,
  } as const;
};

const assertExactKeys = ({
  record,
  expected,
  label,
}: {
  readonly record: Readonly<Record<string, unknown>>;
  readonly expected: readonly string[];
  readonly label: string;
}) => {
  const actual = Object.keys(record).sort((left, right) =>
    left.localeCompare(right),
  );
  const canonicalExpected = [...expected].sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    actual.length !== canonicalExpected.length ||
    actual.some((key, index) => key !== canonicalExpected[index])
  ) {
    throw new Error(`${label} has an invalid exact field set.`);
  }
};

const parseCreationReceipt = (raw: unknown) => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Project create receipt is malformed.");
  }
  const record = raw as Record<string, unknown>;
  assertExactKeys({
    record,
    expected: [
      "schemaVersion",
      "contractVersion",
      "storyId",
      "sourceState",
      "inputFingerprint",
      "creationIdentity",
      "files",
      "catalog",
    ],
    label: "Project create receipt",
  });
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== "project-create-receipt-v1" ||
    record.sourceState !== "configured-authoring" ||
    !Array.isArray(record.files)
  ) {
    throw new Error("Project create receipt is malformed.");
  }
  const storyId = StoryIdSchema.parse(record.storyId);
  const inputFingerprint = Sha256DigestSchema.parse(record.inputFingerprint);
  const creationIdentity = Sha256DigestSchema.parse(record.creationIdentity);
  const files = record.files.map((file) => {
    if (file === null || typeof file !== "object" || Array.isArray(file)) {
      throw new Error("Project create receipt file manifest is malformed.");
    }
    const entry = file as Record<string, unknown>;
    assertExactKeys({
      record: entry,
      expected: ["logicalPath", "checksum"],
      label: "Project create receipt file manifest",
    });
    const logicalPath = String(entry.logicalPath);
    const expectedPrefix = `src/projects/${storyId}/`;
    const publicPrefix = `public/projects/${storyId}/`;
    if (
      (!logicalPath.startsWith(expectedPrefix) &&
        !logicalPath.startsWith(publicPrefix)) ||
      logicalPath.includes("\\") ||
      logicalPath
        .split("/")
        .some((segment) => segment === "." || segment === "..")
    ) {
      throw new Error("Project create receipt file path is unsafe.");
    }
    return {
      logicalPath,
      checksum: Sha256DigestSchema.parse(entry.checksum),
    };
  });
  const canonical = [...files].sort((left, right) =>
    left.logicalPath.localeCompare(right.logicalPath),
  );
  if (
    new Set(canonical.map(({ logicalPath }) => logicalPath)).size !==
      canonical.length ||
    canonical.some(
      ({ logicalPath }, index) => logicalPath !== files[index]?.logicalPath,
    )
  ) {
    throw new Error("Project create receipt file manifest is not canonical.");
  }
  if (
    record.catalog === null ||
    typeof record.catalog !== "object" ||
    Array.isArray(record.catalog)
  ) {
    throw new Error("Project create receipt Catalog manifest is malformed.");
  }
  const rawCatalog = record.catalog as Record<string, unknown>;
  assertExactKeys({
    record: rawCatalog,
    expected: ["logicalPath", "checksum"],
    label: "Project create receipt Catalog manifest",
  });
  if (rawCatalog.logicalPath !== PROJECT_CREATE_CATALOG_PATH) {
    throw new Error("Project create receipt Catalog path is stale.");
  }
  const catalogChecksum = Sha256DigestSchema.parse(rawCatalog.checksum);
  const expected = buildCreationReceipt({
    storyId,
    inputFingerprint,
    files,
    catalogChecksum,
  });
  if (expected.creationIdentity !== creationIdentity) {
    throw new Error("Project create receipt identity is stale.");
  }
  return { ...expected, creationIdentity };
};

const verifyExistingCreation = async ({
  rootDir,
  storyId,
  expected = null,
  expectedCatalogBytes = null,
  requireExactFileSet = false,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly expected?: ReturnType<typeof buildCreationReceipt> | null;
  readonly expectedCatalogBytes?: string | null;
  readonly requireExactFileSet?: boolean;
}) => {
  let current;
  try {
    current = parseCreationReceipt(
      JSON.parse(
        (
          await readContainedRegularFile({
            rootDir,
            relativePath: `src/projects/${storyId}/${CREATION_RECEIPT_PATH}`,
            label: "Project create receipt",
          })
        ).toString("utf8"),
      ),
    );
  } catch (error) {
    throw new Error("Existing Project is not a complete created Project.", {
      cause: error,
    });
  }
  if (
    expected !== null &&
    current.creationIdentity !== expected.creationIdentity
  ) {
    throw new Error(
      "Project create identity conflicts with the existing Project.",
    );
  }
  if (requireExactFileSet) {
    const actualFiles = [
      ...(await collectFiles({
        rootDir,
        relativeRoot: `src/projects/${storyId}`,
      })),
      ...(await collectFiles({
        rootDir,
        relativeRoot: `public/projects/${storyId}`,
      })),
    ].sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
    if (
      actualFiles.length !== current.files.length ||
      actualFiles.some(
        (file, index) => file.logicalPath !== current.files[index]?.logicalPath,
      )
    ) {
      throw new Error("Created Project exact file set is stale.");
    }
  }
  for (const file of current.files) {
    let bytes: Buffer;
    try {
      bytes = await readContainedRegularFile({
        rootDir,
        relativePath: file.logicalPath,
        label: `Created Project file ${file.logicalPath}`,
      });
    } catch (error) {
      throw new Error(`Created Project file is stale: ${file.logicalPath}.`, {
        cause: error,
      });
    }
    if (checksum(bytes) !== file.checksum) {
      throw new Error(
        `Created Project file checksum drift: ${file.logicalPath}.`,
      );
    }
  }
  let catalogBytes: Buffer;
  try {
    catalogBytes = await readContainedRegularFile({
      rootDir,
      relativePath: PROJECT_CREATE_CATALOG_PATH,
      label: "ResourceCatalog",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("ResourceCatalog drift: generated file is missing.", {
        cause: error,
      });
    }
    throw error;
  }
  try {
    ResourceCatalogSchema.parse(JSON.parse(catalogBytes.toString("utf8")));
  } catch (error) {
    throw new Error("ResourceCatalog contract is malformed.", {
      cause: error,
    });
  }
  if (checksum(catalogBytes) !== current.catalog.checksum) {
    throw new Error("ResourceCatalog drift: generated bytes are stale.");
  }
  if (
    expectedCatalogBytes !== null &&
    !catalogBytes.equals(Buffer.from(expectedCatalogBytes))
  ) {
    throw new Error("ResourceCatalog drift: generated bytes are stale.");
  }
  return current;
};

const prepareCreation = async ({
  rootDir,
  stagingRoot,
  storyId,
  input,
  config,
}: {
  readonly rootDir: string;
  readonly stagingRoot: string;
  readonly storyId: string;
  readonly input: ProjectCreateInput;
  readonly config: ProducerConfig;
}) => {
  const stageRepositoryRoot = join(stagingRoot, "root");
  const projectRoot = `src/projects/${storyId}`;
  const publicRoot = `public/projects/${storyId}`;
  const selectedSceneTemplates = input.sceneTemplates ?? config.sceneDefaults;
  for (const templateId of [
    selectedSceneTemplates.introSceneTemplateId,
    selectedSceneTemplates.outroSceneTemplateId,
  ]) {
    if (templateId !== null) getSceneTemplateDefinition(templateId);
  }
  await Promise.all([
    mkdir(join(stageRepositoryRoot, projectRoot), { recursive: true }),
    mkdir(join(stageRepositoryRoot, publicRoot), { recursive: true }),
  ]);
  await copySceneTemplateAuthorities({
    rootDir,
    stagingRoot: stageRepositoryRoot,
    enabled:
      selectedSceneTemplates.introSceneTemplateId !== null ||
      selectedSceneTemplates.outroSceneTemplateId !== null,
  });
  const initialManifest = buildProjectAssetManifest({
    projectId: storyId,
    assets: [],
    externalAssets: [],
  });
  for (const [path, value] of [
    [`${projectRoot}/brief.json`, input.brief],
    [`${projectRoot}/story.json`, StorySpecSchema.parse(input.story)],
    [`${projectRoot}/assets.manifest.json`, initialManifest],
  ] as const) {
    await writeStageBytes({
      stagingRoot: stageRepositoryRoot,
      relativePath: path,
      bytes: jsonBytes(value),
    });
  }
  const sceneTemplates = await prepareConfiguredSceneTemplates({
    rootDir: stageRepositoryRoot,
    projectId: storyId,
    story: input.story,
    sceneDefaults: selectedSceneTemplates,
  });
  await commitConfiguredSceneTemplates({
    rootDir: stageRepositoryRoot,
    projectId: storyId,
    prepared: sceneTemplates,
  });
  const story = sceneTemplates.story;
  const baseManifest = ProjectAssetManifestSchema.parse(
    JSON.parse(
      await readFile(
        join(stageRepositoryRoot, projectRoot, "assets.manifest.json"),
        "utf8",
      ),
    ),
  );
  const sound = await prepareProjectSound({
    rootDir,
    projectId: storyId,
    config,
    baseAssetManifest: baseManifest,
  });
  await commitProjectSound({ rootDir: stageRepositoryRoot, prepared: sound });

  const narration = NarrationSpecSchema.parse({
    schemaVersion: 2,
    voiceProfileId: config.tts.defaultVoiceProfileId,
    mode: "voice-clone",
  });
  const render = RenderSpecSchema.parse({
    schemaVersion: 1,
    compositionId: input.render.compositionId,
    leadInFrames: input.render.leadInFrames,
    tailFrames: input.render.tailFrames,
    ...config.renderDefaults,
    output: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels: input.render.audioChannels,
    },
  });
  const publishing = buildPublishingIntent({
    story,
    authored: input.publishing,
    publishingCollections: config.publishingCollections,
  });
  const sourceBytes = {
    brief: jsonBytes(input.brief),
    story: sceneTemplates.storyBytes,
    narration: jsonBytes(narration),
    render: jsonBytes(render),
    sound: jsonBytes(sound.plan),
    assets: jsonBytes(sound.assetManifest),
  } as const;
  const requirements = buildAuthoringRequirements({
    source: {
      brief: input.brief,
      story,
      narration,
      render,
      projectSound: sound.plan,
    },
    sourceChecksums: {
      videoBrief: checksum(Buffer.from(sourceBytes.brief)),
      storySpec: checksum(Buffer.from(sourceBytes.story)),
      narrationSpec: checksum(Buffer.from(sourceBytes.narration)),
      renderSpec: checksum(Buffer.from(sourceBytes.render)),
      projectSound: checksum(Buffer.from(sourceBytes.sound)),
    },
    ...input.production,
    readability: { edgeInsetPx: config.readability.edgeInsetPx },
  });
  const currentDescriptors = await loadCatalogAuthorityDescriptors(rootDir);
  const baseDescriptors = currentDescriptors.filter(
    (descriptor) =>
      !descriptor.authority.repositoryPath.startsWith("src/projects/"),
  );
  const createdDescriptors = projectDescriptors({
    manifest: sound.assetManifest,
    manifestBytes: sourceBytes.assets,
  });
  const projectCatalog = buildResourceCatalog([
    ...baseDescriptors,
    ...createdDescriptors,
  ]);
  const targetAuthorityPrefix = `src/projects/${storyId}/`;
  const aggregateCatalog = buildResourceCatalog([
    ...currentDescriptors.filter(
      (descriptor) =>
        !descriptor.authority.repositoryPath.startsWith(targetAuthorityPrefix),
    ),
    ...createdDescriptors,
  ]);
  const styleEntry = ensureSelectionsAreCurrent({
    input,
    catalog: projectCatalog,
  });
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId,
    resourceCatalogFingerprint: projectCatalog.catalogFingerprint,
    ...input.visualStyle,
  });
  const configuredSceneResourceIds = story.beats.flatMap((beat) =>
    beat.kind === "silent-scene" ? beat.preset.resourceIds : [],
  );
  const allowedResourceIds = [
    ...new Set([
      ...input.resources.allowedResourceIds,
      ...configuredSceneResourceIds,
    ]),
  ].sort((left, right) => left.localeCompare(right));
  const resourcePool = buildStoryResourcePool({
    storyId,
    requirementsFingerprint: requirements.requirementsFingerprint,
    resourceCatalogFingerprint: projectCatalog.catalogFingerprint,
    allowedResourceIds,
    allowedSnapshots: [],
    selfAuthoredVisualsAllowed: true,
  });
  validateStoryResourcePool({
    pool: resourcePool,
    catalog: projectCatalog,
    requirementsFingerprint: requirements.requirementsFingerprint,
  });
  computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  const globalVisual = buildGlobalVisualBrief({
    storyId,
    responsibility:
      "project-global-background-texture-decoration-continuity-v1",
    visualIntent: input.globalVisual.visualIntent,
    constraints: {
      captionOwner: "caption-layer",
      sceneSemanticOwner: "scene-package",
      visibleText: "forbidden",
      motion: "remotion-frame-api-only",
      runtimeExternalAccess: "forbidden",
      genericDsl: "forbidden",
    },
  });
  const pending = buildPendingSceneAuthoring({
    schemaVersion: 1,
    contractVersion: "pending-scene-authoring-v1",
    storyId,
    scenes: synthesizePendingScenes({
      story,
      authoredScenes: input.scenes,
    }),
  });
  for (const [path, value] of [
    [`${projectRoot}/story.json`, story],
    [`${projectRoot}/narration.json`, narration],
    [`${projectRoot}/render.json`, render],
    [`${projectRoot}/publishing-intent.json`, publishing],
    [`${projectRoot}/sound.json`, sound.plan],
    [`${projectRoot}/assets.manifest.json`, sound.assetManifest],
    [`${projectRoot}/visual-style.json`, visualStyle],
    [`${projectRoot}/production/requirements.json`, requirements],
    [`${projectRoot}/production/story-resource-pool.json`, resourcePool],
    [`${projectRoot}/production/global-visual-brief.json`, globalVisual],
    [`${projectRoot}/${PENDING_SCENE_AUTHORING_PATH}`, pending],
    [
      `${projectRoot}/generated/resource-catalog.generated.json`,
      projectCatalog,
    ],
  ] as const) {
    await writeStageBytes({
      stagingRoot: stageRepositoryRoot,
      relativePath: path,
      bytes: jsonBytes(value),
    });
  }
  const aggregateCatalogBytes = renderResourceCatalogJson(aggregateCatalog);
  await writeStageBytes({
    stagingRoot,
    relativePath: "catalog/resource-catalog.json",
    bytes: aggregateCatalogBytes,
  });
  const files = [
    ...(await collectFiles({
      rootDir: stageRepositoryRoot,
      relativeRoot: projectRoot,
    })),
    ...(await collectFiles({
      rootDir: stageRepositoryRoot,
      relativeRoot: publicRoot,
    })),
  ].sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
  const receipt = buildCreationReceipt({
    storyId,
    inputFingerprint: computeProjectCreateInputFingerprint(input),
    files,
    catalogChecksum: checksum(Buffer.from(aggregateCatalogBytes)),
  });
  await writeStageBytes({
    stagingRoot: stageRepositoryRoot,
    relativePath: `${projectRoot}/${CREATION_RECEIPT_PATH}`,
    bytes: jsonBytes(receipt),
  });
  return {
    receipt,
    copiedSceneMeaningIds: sceneTemplates.copiedMeaningIds,
    requirementsFingerprint: requirements.requirementsFingerprint,
    publishingIntentFingerprint: publishing.intentFingerprint,
    pendingAuthoringFingerprint: pending.authoringFingerprint,
    aggregateCatalogBytes,
  } as const;
};

export const createProject = async ({
  rootDir: rawRootDir,
  projectId: rawProjectId,
  inputPath,
  env,
  store = { commit: commitStagedProjectCreate },
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly inputPath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly store?: Readonly<{
    commit: typeof commitStagedProjectCreate;
  }>;
}) => {
  const rootDir = resolve(rawRootDir);
  const projectId = StoryIdSchema.parse(rawProjectId);
  const relativeInputPath = relative(rootDir, resolve(inputPath))
    .split(sep)
    .join("/");
  if (
    relativeInputPath.startsWith("../") ||
    relativeInputPath === ".." ||
    relativeInputPath.startsWith("/")
  ) {
    throw new Error("Project create input must stay inside the repository.");
  }
  const lock = await acquireRepositoryOperationLock({
    rootDir,
    ownerId: "project-create",
  });
  let staging: Awaited<ReturnType<typeof createProjectCreateStaging>> | null =
    null;
  try {
    const input = ProjectCreateInputSchema.parse(
      JSON.parse(
        (
          await readContainedRegularFile({
            rootDir,
            relativePath: relativeInputPath,
            label: "Project create input",
          })
        ).toString("utf8"),
      ),
    );
    if (input.storyId !== projectId) {
      throw new Error("Project create CLI and input Story identities differ.");
    }
    const configPath = await resolveProducerConfigPathFromEnvironment({
      rootDir,
      env,
    });
    const configMetadata = await lstat(configPath);
    if (configMetadata.isSymbolicLink() || !configMetadata.isFile()) {
      throw new Error("Producer config must be a regular non-symbolic file.");
    }
    const config = await readProducerConfig({ configPath });
    const globalBgm = config.audioDefaults?.globalBgm;
    if (globalBgm !== undefined && globalBgm !== null) {
      await readContainedRegularFile({
        rootDir,
        relativePath: globalBgm.sourcePath,
        label: "Configured background music",
      });
    }
    const targets = await inspectProjectCreateTargets({
      rootDir,
      storyId: projectId,
    });
    const existing =
      targets.state === "existing"
        ? await verifyExistingCreation({
            rootDir,
            storyId: projectId,
          })
        : null;
    staging = await createProjectCreateStaging({ rootDir });
    const prepared = await prepareCreation({
      rootDir,
      stagingRoot: staging.stagingRoot,
      storyId: projectId,
      input,
      config,
    });
    if (existing !== null) {
      const current = await verifyExistingCreation({
        rootDir,
        storyId: projectId,
        expected: prepared.receipt,
        expectedCatalogBytes: prepared.aggregateCatalogBytes,
      });
      await staging.cleanup();
      staging = null;
      return {
        status: "project-create-current",
        storyId: projectId,
        sourceState: "configured-authoring",
        creationIdentity: current.creationIdentity,
        writtenLogicalPaths: [],
        pendingAuthoringRequirements: [PENDING_SCENE_AUTHORING_PATH],
        nextAction: "prepare-narration",
      } as const;
    }
    await store.commit({
      rootDir,
      storyId: projectId,
      stagingRoot: staging.stagingRoot,
      verifyLive: async () => {
        await verifyExistingCreation({
          rootDir,
          storyId: projectId,
          expected: prepared.receipt,
          expectedCatalogBytes: prepared.aggregateCatalogBytes,
          requireExactFileSet: true,
        });
      },
    });
    staging = null;
    return {
      status: "project-created",
      storyId: projectId,
      sourceState: "configured-authoring",
      creationIdentity: prepared.receipt.creationIdentity,
      writtenLogicalPaths: [
        ...prepared.receipt.files.map(({ logicalPath }) => logicalPath),
        `src/projects/${projectId}/${CREATION_RECEIPT_PATH}`,
        PROJECT_CREATE_CATALOG_PATH,
      ].sort((left, right) => left.localeCompare(right)),
      pendingAuthoringRequirements: [PENDING_SCENE_AUTHORING_PATH],
      nextAction: "prepare-narration",
      requirementsFingerprint: prepared.requirementsFingerprint,
      publishingIntentFingerprint: prepared.publishingIntentFingerprint,
      pendingAuthoringFingerprint: prepared.pendingAuthoringFingerprint,
      copiedSceneMeaningIds: prepared.copiedSceneMeaningIds,
    } as const;
  } finally {
    await staging?.cleanup();
    await lock.release();
  }
};

const readProjectJson = async ({
  rootDir,
  projectId,
  relativePath,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly relativePath: string;
}) =>
  JSON.parse(
    await readFile(
      join(rootDir, "src/projects", projectId, relativePath),
      "utf8",
    ),
  ) as unknown;

export const projectPendingSceneAuthoring = async ({
  rootDir: rawRootDir,
  projectId: rawProjectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const rootDir = resolve(rawRootDir);
  const projectId = StoryIdSchema.parse(rawProjectId);
  const required = [
    PENDING_SCENE_AUTHORING_PATH,
    "story.json",
    "production/requirements.json",
    "generated/semantic-timing.generated.json",
    "visual-style.json",
    "production/story-resource-pool.json",
  ] as const;
  const values: unknown[] = [];
  const missing: string[] = [];
  for (const relativePath of required) {
    try {
      values.push(await readProjectJson({ rootDir, projectId, relativePath }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        missing.push(`src/projects/${projectId}/${relativePath}`);
        values.push(null);
      } else {
        throw error;
      }
    }
  }
  if (missing.length > 0) {
    return { projected: false, missingLogicalInputs: missing.sort() } as const;
  }
  const pending = PendingSceneAuthoringSchema.parse(values[0]);
  const story = StorySpecSchema.parse(values[1]);
  const requirements = AuthoringRequirementsSchema.parse(values[2]);
  const timing = SemanticTimingSchema.parse(values[3]);
  const visualStyle = VisualStyleSpecSchema.parse(values[4]);
  const catalog = ResourceCatalogSchema.parse(
    (
      await generateProjectResourceCatalog({
        rootDir,
        projectId,
        mode: "write",
      })
    ).catalog,
  );
  const pool = validateStoryResourcePool({
    pool: StoryResourcePoolSchema.parse(values[5]),
    catalog,
    requirementsFingerprint: requirements.requirementsFingerprint,
  });
  const styleEntry = catalog.entries.find(
    ({ descriptor }) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  if (
    pending.storyId !== projectId ||
    story.storyId !== projectId ||
    requirements.storyId !== projectId ||
    timing.storyId !== projectId ||
    visualStyle.storyId !== projectId ||
    styleEntry === undefined ||
    visualStyle.resourceCatalogFingerprint !== catalog.catalogFingerprint
  ) {
    throw new Error("Pending Scene authoring identity is stale.");
  }
  const visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  const brief = buildSceneProductionBrief({
    storyId: projectId,
    requirementsFingerprint: requirements.requirementsFingerprint,
    semanticTimingFingerprint: timing.fingerprint,
    visualStyleFingerprint,
    resourcePoolFingerprint: pool.poolFingerprint,
    soundPolicy: requirements.enhancementSelection.sound,
    reviewPolicy: "mechanical-only",
    scenes: pending.scenes,
  });
  validateSceneProductionBrief({
    brief,
    story,
    requirements,
    semanticTimingFingerprint: timing.fingerprint,
    visualStyleFingerprint,
    pool,
  });
  const destination = join(
    rootDir,
    "src/projects",
    projectId,
    "production/scene-production-brief.json",
  );
  const result = await writeTextFileAtomic({
    destination,
    bytes: jsonBytes(brief),
    mode: "replace",
  });
  return {
    projected: true,
    written: result.written,
    logicalPath: `src/projects/${projectId}/production/scene-production-brief.json`,
    briefFingerprint: brief.briefFingerprint,
    missingLogicalInputs: [],
  } as const;
};
