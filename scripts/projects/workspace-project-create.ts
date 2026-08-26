import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  NarrationSpecSchema,
  ProjectAssetManifestSchema,
  RenderSpecSchema,
  ResourceCatalogSchema,
  Sha256DigestSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildAuthoringRequirements,
  buildGlobalVisualBrief,
  buildPublishingIntent,
  buildStoryResourcePool,
  computeVisualStyleFingerprint,
  serializeCanonicalJson,
  validateStoryResourcePool,
  type ProducerConfig,
  type ResourceDescriptor,
} from "../../src/contracts";
import {
  buildPendingSceneAuthoring,
  computeProjectCreateInputFingerprint,
  type ProjectCreateInput,
} from "../../src/contracts/project-create";
import { buildResourceCatalog, renderResourceCatalogJson } from "../catalog/domain";
import { loadWorkspaceCatalogAuthorityDescriptors } from "../catalog/project-files";
import type { ProductionLocations } from "../project-production/application/production-locations";
import { prepareProjectSound } from "./application/localize-project-sound";
import { createWorkspaceProjectStorageLocations } from "./project-locations";
import { assertWorkspaceOwnedDirectoryChain } from "./workspace-owned-root";
import { materializeWorkspaceSceneTemplates } from "./workspace-scene-templates";
import { snapshotWorkspaceSceneOriginalityBaseline } from "./application/scene-originality-baseline";

export const WORKSPACE_PROJECT_CREATE_RECEIPT = "production/project-create.json";
export const WORKSPACE_PENDING_SCENE_AUTHORING =
  "production/pending-scene-production-brief.json";

const checksum = (bytes: Uint8Array) =>
  Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const metadata = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const writeStage = async (root: string, path: string, value: unknown) => {
  const destination = join(root, ...path.split("/"));
  const scope = relative(root, destination);
  if (scope === "" || scope === ".." || scope.startsWith(`..${sep}`)) {
    throw new Error("Workspace Project staged path escapes its root.");
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, typeof value === "string" || value instanceof Uint8Array ? value : jsonBytes(value), { flag: "wx" });
};

const projectDescriptors = (
  manifest: ReturnType<typeof ProjectAssetManifestSchema.parse>,
  manifestBytes: string,
): readonly ResourceDescriptor[] =>
  manifest.assets.map((descriptor) => ({
    ...descriptor,
    authority: { ...descriptor.authority, sourceChecksum: checksum(Buffer.from(manifestBytes)) },
  }));

const ensureSelections = (
  input: ProjectCreateInput,
  catalog: ReturnType<typeof ResourceCatalogSchema.parse>,
) => {
  if (input.resources.allowedSnapshots.length > 0) {
    throw new Error("Workspace Project snapshots require an immutable asset import.");
  }
  const byId = new Map(catalog.entries.map((entry) => [entry.descriptor.id, entry] as const));
  for (const resourceId of input.resources.allowedResourceIds) {
    const entry = byId.get(resourceId);
    if (
      entry === undefined ||
      entry.descriptor.status !== "approved" ||
      entry.descriptor.allowedUse === "blocked" ||
      entry.descriptor.kind === "authoring-reference"
    ) throw new Error(`Workspace Project resource is unavailable: ${resourceId}.`);
  }
  const style = catalog.entries.find(
    ({ descriptor }) => descriptor.kind === "style-profile" && descriptor.styleProfileId === input.visualStyle.styleProfileId,
  );
  if (style === undefined) throw new Error(`Workspace Project style is unavailable: ${input.visualStyle.styleProfileId}.`);
  return style;
};

const pendingScenes = (story: ReturnType<typeof StorySpecSchema.parse>, input: ProjectCreateInput) => {
  const authored = new Map(input.scenes.map((scene) => [scene.meaningId, scene] as const));
  return story.beats.map((beat) => {
    const selected = authored.get(beat.meaningId);
    if (selected !== undefined) return selected;
    if (beat.kind !== "silent-scene" || beat.preset.implementation.kind !== "template-copy") {
      throw new Error(`Workspace Project Scene authoring is missing: ${beat.meaningId}.`);
    }
    return {
      meaningId: beat.meaningId,
      visualIntent: beat.preset.visualIntent,
      compositionIntent: "Preserve the configured boundary Scene composition without semantic substitution.",
      motionIntent: "Preserve the configured boundary Scene frame-driven motion exactly.",
      soundIntent: beat.preset.soundIntent,
      continuityBrief: "Keep this configured boundary isolated from narrated Scene ownership.",
      candidateResourceIds: beat.preset.resourceIds,
      allowedSnapshotCards: [],
    } as const;
  });
};

type FileEntry = Readonly<{ logicalPath: string; checksum: ReturnType<typeof checksum> }>;
const collectFiles = async (root: string, logicalRoot: string): Promise<readonly FileEntry[]> => {
  const files: FileEntry[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error("Workspace Project contains a symbolic link.");
    const logicalPath = `${logicalRoot}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await collectFiles(join(root, entry.name), logicalPath)));
    else if (entry.isFile()) {
      if (!logicalPath.endsWith(`/${WORKSPACE_PROJECT_CREATE_RECEIPT}`)) {
        files.push({ logicalPath, checksum: checksum(await readFile(join(root, entry.name))) });
      }
    } else throw new Error("Workspace Project contains a special file.");
  }
  return files.sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
};

const creationReceipt = ({
  input,
  files,
  catalogBytes,
}: {
  readonly input: ProjectCreateInput;
  readonly files: readonly FileEntry[];
  readonly catalogBytes: string;
}) => {
  const inputFingerprint = computeProjectCreateInputFingerprint(input);
  const catalog = {
    logicalPath: "src/remotion/catalog/resource-catalog.generated.json",
    checksum: checksum(Buffer.from(catalogBytes)),
  } as const;
  const creationIdentity = checksum(
    Buffer.from(
      serializeCanonicalJson({
        identityVersion: "project-create-identity-v1",
        storyId: input.storyId,
        inputFingerprint,
        files,
        catalog,
      }),
    ),
  );
  return {
    schemaVersion: 1,
    contractVersion: "project-create-receipt-v1",
    storyId: input.storyId,
    sourceState: "configured-authoring",
    inputFingerprint,
    creationIdentity,
    files,
    catalog,
  } as const;
};

const prepareSound = async ({
  locations,
  projectId,
  config,
  baseAssetManifest,
  mediaRoot,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly config: ProducerConfig;
  readonly baseAssetManifest: unknown;
  readonly mediaRoot: string;
}) => {
  const configured = config.audioDefaults?.globalBgm ?? null;
  if (configured !== null) {
    const segments = configured.sourcePath.split("/");
    if (
      configured.sourcePath.startsWith("/") ||
      configured.sourcePath.includes("\\") ||
      segments.some((segment) => !segment || segment === "." || segment === "..")
    ) throw new Error("Workspace background music path is unsafe.");
    let current = locations.privateConfigRoot;
    const rootState = await lstat(current);
    if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
      throw new Error("Workspace private config root must be a real directory.");
    }
    for (const [index, segment] of segments.entries()) {
      current = join(current, segment);
      const state = await lstat(current);
      if (
        state.isSymbolicLink() ||
        (index === segments.length - 1 ? !state.isFile() : !state.isDirectory())
      ) {
        throw new Error("Workspace background music path must be real and non-symbolic.");
      }
    }
  }
  const prepared = await prepareProjectSound({
    rootDir: locations.privateConfigRoot,
    projectId,
    config,
    baseAssetManifest,
  });
  if (prepared.localizedAsset !== null) {
    const prefix = `public/projects/${projectId}/`;
    if (!prepared.localizedAsset.repositoryPath.startsWith(prefix)) {
      throw new Error("Workspace background music target is outside Project media.");
    }
    await writeStage(mediaRoot, prepared.localizedAsset.repositoryPath.slice(prefix.length), prepared.localizedAsset.bytes);
  }
  return prepared;
};

export const prepareWorkspaceProjectCreate = async ({
  locations,
  stagingRoot,
  input,
  config,
}: {
  readonly locations: ProductionLocations;
  readonly stagingRoot: string;
  readonly input: ProjectCreateInput;
  readonly config: ProducerConfig;
}) => {
  await Promise.all([
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectSourceRoot,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectMediaRoot,
    }),
  ]);
  const projectContainerRoot = join(stagingRoot, "project");
  const mediaContainerRoot = join(stagingRoot, "media");
  const projectRoot = join(projectContainerRoot, input.storyId);
  const mediaRoot = join(mediaContainerRoot, input.storyId);
  await Promise.all([mkdir(projectRoot, { recursive: true }), mkdir(mediaRoot, { recursive: true })]);
  await Promise.all([
    writeStage(projectRoot, "brief.json", input.brief),
    writeStage(projectRoot, "story.json", StorySpecSchema.parse(input.story)),
  ]);
  const templates = await materializeWorkspaceSceneTemplates({
    locations,
    projectContainerRoot,
    projectRoot,
    mediaRoot,
    projectId: input.storyId,
    story: input.story,
    config,
    selections: input.sceneTemplates,
  });
  const sound = await prepareSound({
    locations,
    projectId: input.storyId,
    config,
    baseAssetManifest: templates.assetManifest,
    mediaRoot,
  });
  const story = templates.story;
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
    story: templates.storyBytes,
    narration: jsonBytes(narration),
    render: jsonBytes(render),
    sound: jsonBytes(sound.plan),
    assets: jsonBytes(sound.assetManifest),
  };
  const requirements = buildAuthoringRequirements({
    source: { brief: input.brief, story, narration, render, projectSound: sound.plan },
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
  const [baseDescriptors, allDescriptors] = await Promise.all([
    loadWorkspaceCatalogAuthorityDescriptors({ locations, projectId: input.storyId }),
    loadWorkspaceCatalogAuthorityDescriptors({ locations }),
  ]);
  const createdDescriptors = projectDescriptors(sound.assetManifest, sourceBytes.assets);
  const projectCatalog = buildResourceCatalog([
    ...baseDescriptors.filter((descriptor) => !descriptor.authority.repositoryPath.startsWith(`src/projects/${input.storyId}/`)),
    ...createdDescriptors,
  ]);
  const aggregateCatalog = buildResourceCatalog([
    ...allDescriptors.filter(
      (descriptor) =>
        !descriptor.authority.repositoryPath.startsWith(
          `src/projects/${input.storyId}/`,
        ),
    ),
    ...createdDescriptors,
  ]);
  const styleEntry = ensureSelections(input, projectCatalog);
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId: input.storyId,
    resourceCatalogFingerprint: projectCatalog.catalogFingerprint,
    ...input.visualStyle,
  });
  computeVisualStyleFingerprint({ visualStyle, resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint });
  const allowedResourceIds = [...new Set([
    ...input.resources.allowedResourceIds,
    ...story.beats.flatMap((beat) => beat.kind === "silent-scene" ? beat.preset.resourceIds : []),
  ])].sort((a, b) => a.localeCompare(b));
  const resourcePool = buildStoryResourcePool({
    storyId: input.storyId,
    requirementsFingerprint: requirements.requirementsFingerprint,
    resourceCatalogFingerprint: projectCatalog.catalogFingerprint,
    allowedResourceIds,
    allowedSnapshots: [],
    selfAuthoredVisualsAllowed: true,
  });
  validateStoryResourcePool({ pool: resourcePool, catalog: projectCatalog, requirementsFingerprint: requirements.requirementsFingerprint });
  const globalVisual = buildGlobalVisualBrief({
    storyId: input.storyId,
    responsibility: "project-global-background-texture-decoration-continuity-v1",
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
    storyId: input.storyId,
    scenes: pendingScenes(story, input),
  });
  const originalityBaseline =
    await snapshotWorkspaceSceneOriginalityBaseline({
      locations,
      projectId: input.storyId,
    });
  for (const [path, value] of [
    ["story.json", story],
    ["narration.json", narration],
    ["render.json", render],
    ["publishing-intent.json", publishing],
    ["sound.json", sound.plan],
    ["assets.manifest.json", sound.assetManifest],
    ["visual-style.json", visualStyle],
    ["production/requirements.json", requirements],
    ["production/story-resource-pool.json", resourcePool],
    ["production/global-visual-brief.json", globalVisual],
    ["production/scene-originality-baseline.json", originalityBaseline],
    [WORKSPACE_PENDING_SCENE_AUTHORING, pending],
    ["generated/resource-catalog.generated.json", projectCatalog],
  ] as const) {
    const destination = join(projectRoot, ...path.split("/"));
    if ((await metadata(destination)) !== null) await rm(destination);
    await writeStage(projectRoot, path, value);
  }
  const aggregateCatalogBytes = renderResourceCatalogJson(aggregateCatalog);
  const projectionPath = join(stagingRoot, "projection/resource-catalog.generated.json");
  await writeStage(stagingRoot, "projection/resource-catalog.generated.json", aggregateCatalogBytes);
  const files = [
    ...(await collectFiles(projectRoot, `src/projects/${input.storyId}`)),
    ...(await collectFiles(mediaRoot, `public/projects/${input.storyId}`)),
  ].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
  const receipt = creationReceipt({ input, files, catalogBytes: aggregateCatalogBytes });
  await writeStage(projectRoot, WORKSPACE_PROJECT_CREATE_RECEIPT, receipt);
  return {
    projectRoot,
    mediaRoot,
    projectionPath,
    aggregateCatalogBytes,
    receipt,
    copiedSceneMeaningIds: templates.copiedMeaningIds,
    requirementsFingerprint: requirements.requirementsFingerprint,
    publishingIntentFingerprint: publishing.intentFingerprint,
    pendingAuthoringFingerprint: pending.authoringFingerprint,
  } as const;
};

export const commitWorkspaceProjectCreate = async ({
  locations,
  projectId,
  prepared,
  verify,
  move = rename,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly prepared: Pick<Awaited<ReturnType<typeof prepareWorkspaceProjectCreate>>, "projectRoot" | "mediaRoot" | "projectionPath">;
  readonly verify: () => Promise<void>;
  readonly move?: (source: string, destination: string) => Promise<void>;
}) => {
  const storage = createWorkspaceProjectStorageLocations(locations);
  const sourceTarget = join(locations.projectSourceRoot, projectId);
  const mediaTarget = join(locations.projectMediaRoot, projectId);
  const catalogTarget = storage.catalogProjectionPath;
  await Promise.all([
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectSourceRoot,
      targetDirectory: sourceTarget,
      allowMissingTarget: true,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectMediaRoot,
      targetDirectory: mediaTarget,
      allowMissingTarget: true,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: dirname(locations.sourceCurrentRoot),
    }),
  ]);
  if ((await metadata(sourceTarget)) !== null || (await metadata(mediaTarget)) !== null) {
    throw new Error("Workspace Project create target already exists.");
  }
  for (const [path, kind] of [[prepared.projectRoot, "directory"], [prepared.mediaRoot, "directory"], [prepared.projectionPath, "file"]] as const) {
    const state = await lstat(path);
    if (state.isSymbolicLink() || (kind === "file" ? !state.isFile() : !state.isDirectory())) {
      throw new Error("Workspace Project staged target is unsafe.");
    }
  }
  await Promise.all([mkdir(dirname(sourceTarget), { recursive: true }), mkdir(dirname(mediaTarget), { recursive: true }), mkdir(dirname(catalogTarget), { recursive: true })]);
  await Promise.all([
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectSourceRoot,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectMediaRoot,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: dirname(locations.sourceCurrentRoot),
    }),
  ]);
  const catalogState = await metadata(catalogTarget);
  if (catalogState !== null && (catalogState.isSymbolicLink() || !catalogState.isFile())) {
    throw new Error("Workspace Catalog target is unsafe.");
  }
  const backup = join(dirname(prepared.projectionPath), "resource-catalog.rollback.json");
  let sourceMoved = false;
  let mediaMoved = false;
  let catalogBackedUp = false;
  let catalogMoved = false;
  try {
    await move(prepared.projectRoot, sourceTarget); sourceMoved = true;
    await move(prepared.mediaRoot, mediaTarget); mediaMoved = true;
    if (catalogState !== null) { await move(catalogTarget, backup); catalogBackedUp = true; }
    await move(prepared.projectionPath, catalogTarget); catalogMoved = true;
    await verify();
  } catch (error) {
    const rollback: unknown[] = [];
    if (catalogMoved) await move(catalogTarget, prepared.projectionPath).catch((cause) => rollback.push(cause));
    if (catalogBackedUp) await move(backup, catalogTarget).catch((cause) => rollback.push(cause));
    if (mediaMoved) await move(mediaTarget, prepared.mediaRoot).catch((cause) => rollback.push(cause));
    if (sourceMoved) await move(sourceTarget, prepared.projectRoot).catch((cause) => rollback.push(cause));
    if (rollback.length > 0) throw new AggregateError([error, ...rollback], "Workspace Project create rollback failed.");
    throw error;
  }
};

export const verifyWorkspaceProjectCreation = async ({
  locations,
  projectId,
  expectedInputFingerprint,
  expectedCreationIdentity,
  expectedCatalogBytes,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly expectedInputFingerprint: string;
  readonly expectedCreationIdentity: string;
  readonly expectedCatalogBytes: string;
}) => {
  const projectRoot = join(locations.projectSourceRoot, projectId);
  const mediaRoot = join(locations.projectMediaRoot, projectId);
  await Promise.all([
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectSourceRoot,
      targetDirectory: projectRoot,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectMediaRoot,
      targetDirectory: mediaRoot,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: dirname(locations.sourceCurrentRoot),
    }),
  ]);
  const receipt = JSON.parse(
    await readFile(join(projectRoot, WORKSPACE_PROJECT_CREATE_RECEIPT), "utf8"),
  ) as Record<string, unknown>;
  const receiptKeys = Object.keys(receipt).sort();
  const expectedReceiptKeys = [
    "catalog",
    "contractVersion",
    "creationIdentity",
    "files",
    "inputFingerprint",
    "schemaVersion",
    "sourceState",
    "storyId",
  ];
  if (
    receiptKeys.length !== expectedReceiptKeys.length ||
    receiptKeys.some((key, index) => key !== expectedReceiptKeys[index]) ||
    receipt.schemaVersion !== 1 ||
    receipt.contractVersion !== "project-create-receipt-v1" ||
    receipt.storyId !== projectId ||
    receipt.inputFingerprint !== expectedInputFingerprint ||
    typeof receipt.creationIdentity !== "string" ||
    !Array.isArray(receipt.files) ||
    receipt.catalog === null ||
    typeof receipt.catalog !== "object" ||
    Array.isArray(receipt.catalog)
  ) throw new Error("Existing Workspace Project creation receipt is stale.");
  const receiptFiles = receipt.files as readonly unknown[];
  for (const file of receiptFiles) {
    if (
      file === null ||
      typeof file !== "object" ||
      Array.isArray(file) ||
      Object.keys(file).sort().join(",") !== "checksum,logicalPath"
    ) throw new Error("Existing Workspace Project receipt file is malformed.");
  }
  const actual = [
    ...(await collectFiles(projectRoot, `src/projects/${projectId}`)),
    ...(await collectFiles(mediaRoot, `public/projects/${projectId}`)),
  ].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
  if (
    actual.length !== receiptFiles.length ||
    actual.some((file, index) => {
      const expected = receiptFiles[index] as Record<string, unknown> | undefined;
      return expected?.logicalPath !== file.logicalPath || expected.checksum !== file.checksum;
    })
  ) throw new Error("Existing Workspace Project exact file set is stale.");
  const catalogRecord = receipt.catalog as Record<string, unknown>;
  if (
    Object.keys(catalogRecord).sort().join(",") !== "checksum,logicalPath" ||
    catalogRecord.logicalPath !==
      "src/remotion/catalog/resource-catalog.generated.json" ||
    typeof catalogRecord.checksum !== "string"
  ) throw new Error("Existing Workspace Project Catalog receipt is stale.");
  const expectedStoredIdentity = checksum(
    Buffer.from(
      serializeCanonicalJson({
        identityVersion: "project-create-identity-v1",
        storyId: projectId,
        inputFingerprint: expectedInputFingerprint,
        files: actual,
        catalog: {
          logicalPath: catalogRecord.logicalPath,
          checksum: Sha256DigestSchema.parse(catalogRecord.checksum),
        },
      }),
    ),
  );
  if (
    receipt.creationIdentity !== expectedStoredIdentity ||
    receipt.creationIdentity !== expectedCreationIdentity
  ) throw new Error("Workspace Project create identity conflicts with current bytes.");
  const catalogBytes = await readFile(
    createWorkspaceProjectStorageLocations(locations).catalogProjectionPath,
  );
  ResourceCatalogSchema.parse(JSON.parse(catalogBytes.toString("utf8")));
  if (
    checksum(catalogBytes) !== catalogRecord.checksum ||
    !catalogBytes.equals(Buffer.from(expectedCatalogBytes))
  ) throw new Error("Workspace Project ResourceCatalog bytes are stale.");
  return { creationIdentity: Sha256DigestSchema.parse(receipt.creationIdentity) } as const;
};
