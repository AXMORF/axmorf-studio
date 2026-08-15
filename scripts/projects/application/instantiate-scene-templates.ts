import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import {
  ProjectAssetManifestSchema,
  ProjectSceneTemplateInstantiationSchema,
  ResourceIdSchema,
  SceneTemplateInstanceSchema,
  StorySpecSchema,
  buildProjectAssetManifest,
  buildProjectSceneTemplateInstantiation,
  buildSceneTemplateInstance,
  buildSilentScenePreset,
  computeStoryFingerprint,
  createFingerprint,
  serializeCanonicalJson,
  type ProjectAssetManifest,
  type ProjectSceneTemplateInstantiation,
  type ResourceAssetDescriptor,
  type Sha256Digest,
  type StorySpec,
} from "../../../src/contracts";
import {
  SCENE_TEMPLATE_AUDIO_PROJECTION,
  getSceneTemplateDefinition,
  renderCopiedSceneRenderer,
  type SceneTemplateDefinition,
} from "../../../src/remotion/capabilities/scenes/registry";
import { assertSceneTemplateAudioProjectionCurrent } from "../../scene-templates/audio-projection";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "../../external-references/project-files";
import { collectRendererSourceGraph } from "../../renderer-registry/domain";
import { writeTextFileAtomic } from "../../shared/atomic-file";

type SceneDefaults = Readonly<{
  introSceneTemplateId: string | null;
  outroSceneTemplateId: string | null;
}>;

const INSTANTIATION_PATH = "production/scene-template-instantiation.json";
const INTRO_MEANING_ID = "configured-intro-scene";
const OUTRO_MEANING_ID = "configured-outro-scene";

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const readOptionalFile = async (path: string): Promise<Buffer | null> => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Scene template target must be a regular file.");
    }
    return readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const writeBinaryCreate = async (destination: string, bytes: Uint8Array) => {
  const existing = await readOptionalFile(destination);
  if (existing !== null) {
    if (checksum(existing) !== checksum(bytes)) {
      throw new Error(
        `Copied Scene template conflicts with ${basename(destination)}.`,
      );
    }
    return false;
  }
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const temporary = join(
    parent,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let installed = false;
  try {
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const raced = await readOptionalFile(destination);
      if (raced === null || checksum(raced) !== checksum(bytes)) {
        throw new Error(
          `Copied Scene template conflicts with ${basename(destination)}.`,
        );
      }
      return false;
    }
    await unlink(temporary);
    installed = true;
    return true;
  } finally {
    if (!installed) {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
};

const assertBinaryCreateCompatible = async (
  destination: string,
  bytes: Uint8Array,
) => {
  const existing = await readOptionalFile(destination);
  if (existing !== null && checksum(existing) !== checksum(bytes)) {
    throw new Error(
      `Copied Scene template conflicts with ${basename(destination)}.`,
    );
  }
};

const readProjectAssetManifest = async ({
  rootDir,
  projectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}): Promise<ProjectAssetManifest> => {
  const path = join(rootDir, `src/projects/${projectId}/assets.manifest.json`);
  const bytes = await readOptionalFile(path);
  if (bytes === null) {
    return buildProjectAssetManifest({
      projectId,
      assets: [],
      externalAssets: [],
    });
  }
  const manifest = ProjectAssetManifestSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  if (manifest.projectId !== projectId) {
    throw new Error("Project asset manifest identity is stale.");
  }
  return manifest;
};

const templateFingerprint = async ({
  rootDir,
  definition,
}: {
  readonly rootDir: string;
  readonly definition: SceneTemplateDefinition;
}) => {
  const sourceFiles = await Promise.all(
    definition.sourceFiles.map(async (file) => ({
      sourcePath: file.sourcePath,
      destinationName: file.destinationName,
      checksum: checksumExternalBytes(
        await readExternalRegularFile(rootDir, file.sourcePath),
      ),
    })),
  );
  const assets = await Promise.all(
    definition.assets.map(async (asset) => {
      const bytes = await readExternalRegularFile(rootDir, asset.sourcePath);
      const actual = checksumExternalBytes(bytes);
      if (actual !== asset.sourceDescriptor.checksum) {
        throw new Error(
          `Configured Scene template asset is stale: ${asset.sourcePath}.`,
        );
      }
      return { ...asset, checksum: actual };
    }),
  );
  return createFingerprint({
    namespace: "scene-template",
    version: 1,
    value: { definition, sourceFiles, assets },
  });
};

const localResourceId = (projectId: string, meaningId: string, key: string) =>
  ResourceIdSchema.parse(`asset.${projectId}.${meaningId}.${key}`);

const instantiateOne = async ({
  sourceRootDir,
  targetRootDir,
  projectId,
  meaningId,
  templateId,
}: {
  readonly sourceRootDir: string;
  readonly targetRootDir: string;
  readonly projectId: string;
  readonly meaningId: string;
  readonly templateId: string;
}) => {
  const definition = getSceneTemplateDefinition(templateId);
  const sourceTemplateFingerprint = await templateFingerprint({
    rootDir: sourceRootDir,
    definition,
  });
  const sceneRoot = `src/projects/${projectId}/scenes/${meaningId}`;
  const publicRoot = `public/projects/${projectId}/scenes/${meaningId}`;
  const copiedSourceFiles: Array<{
    repositoryPath: string;
    checksum: Sha256Digest;
  }> = [];
  const projectFiles: Array<{
    repositoryPath: string;
    bytes: Uint8Array;
  }> = [];
  for (const file of definition.sourceFiles) {
    const bytes = await readExternalRegularFile(sourceRootDir, file.sourcePath);
    const repositoryPath = `${sceneRoot}/${file.destinationName}`;
    await writeBinaryCreate(join(targetRootDir, repositoryPath), bytes);
    projectFiles.push({ repositoryPath, bytes });
    copiedSourceFiles.push({
      repositoryPath,
      checksum: checksumExternalBytes(bytes),
    });
  }
  const rendererPath = `${sceneRoot}/Renderer.tsx`;
  const rendererBytes = Buffer.from(renderCopiedSceneRenderer(definition));
  await writeBinaryCreate(join(targetRootDir, rendererPath), rendererBytes);
  projectFiles.push({ repositoryPath: rendererPath, bytes: rendererBytes });
  copiedSourceFiles.push({
    repositoryPath: rendererPath,
    checksum: checksumExternalBytes(rendererBytes),
  });

  const assetByKey = new Map<
    string,
    { resourceId: string; descriptor: ResourceAssetDescriptor }
  >();
  const copiedAssetFiles: Array<{
    repositoryPath: string;
    checksum: Sha256Digest;
  }> = [];
  for (const asset of definition.assets) {
    const bytes = await readExternalRegularFile(
      sourceRootDir,
      asset.sourcePath,
    );
    const resourceId = localResourceId(projectId, meaningId, asset.assetKey);
    const repositoryPath = `${publicRoot}/${asset.destinationName}`;
    await writeBinaryCreate(join(targetRootDir, repositoryPath), bytes);
    projectFiles.push({ repositoryPath, bytes });
    copiedAssetFiles.push({
      repositoryPath,
      checksum: checksumExternalBytes(bytes),
    });
    assetByKey.set(asset.assetKey, {
      resourceId,
      descriptor: {
        schemaVersion: 1,
        id: resourceId,
        kind: "asset",
        status: "approved",
        title: asset.sourceDescriptor.title,
        description: asset.sourceDescriptor.description,
        useCases: asset.sourceDescriptor.useCases,
        tags: asset.sourceDescriptor.tags,
        authority: {
          kind: "repository-file",
          repositoryPath: `src/projects/${projectId}/assets.manifest.json`,
        },
        allowedUse: "runtime-approved",
        assetKind: "audio",
        mediaRole: asset.targetMediaRole,
        localPath: repositoryPath,
        checksum: asset.sourceDescriptor.checksum,
        license: asset.sourceDescriptor.license,
        media: asset.sourceDescriptor.media,
      },
    });
  }
  const soundCues = definition.soundCues.map((cue) => {
    const asset = assetByKey.get(cue.assetKey);
    if (asset === undefined) {
      throw new Error("Scene template sound cue asset is missing.");
    }
    return {
      cueId: cue.cueId,
      resourceId: asset.resourceId,
      anchorId: cue.anchorId,
      offsetFrames: cue.offsetFrames,
      durationInFrames: cue.durationInFrames,
      volume: cue.volume,
    };
  });
  const resourceIds = [...assetByKey.values()]
    .map(({ resourceId }) => resourceId)
    .sort((left, right) => left.localeCompare(right));
  const graph = await collectRendererSourceGraph({
    rootDir: targetRootDir,
    projectId,
    rendererPath,
  });
  const instance = buildSceneTemplateInstance({
    schemaVersion: 1,
    storyId: projectId,
    meaningId,
    templateId,
    templateFingerprint: sourceTemplateFingerprint,
    rendererSourceGraphFingerprint: graph.sourceGraphFingerprint,
    durationInFrames: definition.durationInFrames,
    visualIntent: definition.visualIntent,
    soundIntent: definition.soundIntent,
    resourceIds,
    soundCues,
    copiedSourceFiles: copiedSourceFiles.sort((left, right) =>
      left.repositoryPath.localeCompare(right.repositoryPath),
    ),
    copiedAssetFiles: copiedAssetFiles.sort((left, right) =>
      left.repositoryPath.localeCompare(right.repositoryPath),
    ),
    visual: {
      ...definition.visual,
      orderedShotIds: definition.orderedShotIds,
      visualResourceIds: [],
    },
    anchors: definition.anchors,
    shots: definition.shots.map((shot) => ({
      ...shot,
      visualResourceIds: [],
    })),
  });
  const preset = buildSilentScenePreset({
    presetId: templateId,
    durationInFrames: definition.durationInFrames,
    visualIntent: definition.visualIntent,
    soundIntent: definition.soundIntent,
    resourceIds,
    implementation: {
      kind: "template-copy",
      templateId,
      templateFingerprint: sourceTemplateFingerprint,
      instanceFingerprint: instance.instanceFingerprint,
      rendererSourceFingerprint: graph.sourceGraphFingerprint,
      soundCues,
    },
  });
  return {
    instance,
    preset,
    beat: {
      kind: "silent-scene" as const,
      meaningId,
      narrativePurpose: definition.narrativePurpose,
      preset,
    },
    assets: [...assetByKey.values()].map(({ descriptor }) => descriptor),
    selection: {
      templateId,
      meaningId,
      templateFingerprint: sourceTemplateFingerprint,
      instanceFingerprint: instance.instanceFingerprint,
      presetFingerprint: preset.presetFingerprint,
    },
    projectFiles,
  } as const;
};

const verifyExistingInstantiation = async ({
  rootDir,
  projectId,
  story,
  instantiation,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly story: StorySpec;
  readonly instantiation: ProjectSceneTemplateInstantiation;
}) => {
  if (
    instantiation.storyId !== projectId ||
    instantiation.materializedStoryFingerprint !==
      computeStoryFingerprint(story)
  ) {
    throw new Error("Project Scene template instantiation is stale.");
  }
  for (const selection of [
    instantiation.selections.intro,
    instantiation.selections.outro,
  ]) {
    if (selection === null) continue;
    const beat = story.beats.find(
      ({ meaningId }) => meaningId === selection.meaningId,
    );
    if (
      beat?.kind !== "silent-scene" ||
      beat.preset.presetFingerprint !== selection.presetFingerprint ||
      beat.preset.implementation.kind !== "template-copy" ||
      beat.preset.implementation.templateId !== selection.templateId ||
      beat.preset.implementation.templateFingerprint !==
        selection.templateFingerprint ||
      beat.preset.implementation.instanceFingerprint !==
        selection.instanceFingerprint
    ) {
      throw new Error("Copied Scene template StoryBeat is stale.");
    }
    const instancePath = join(
      rootDir,
      `src/projects/${projectId}/scenes/${selection.meaningId}/scene-template-instance.json`,
    );
    const instance = SceneTemplateInstanceSchema.parse(
      JSON.parse((await readFile(instancePath)).toString("utf8")),
    );
    if (instance.instanceFingerprint !== selection.instanceFingerprint) {
      throw new Error("Copied Scene template instance is stale.");
    }
    for (const file of [
      ...instance.copiedSourceFiles,
      ...instance.copiedAssetFiles,
    ]) {
      const bytes = await readExternalRegularFile(rootDir, file.repositoryPath);
      if (checksumExternalBytes(bytes) !== file.checksum) {
        throw new Error(
          `Copied Scene template file is stale: ${file.repositoryPath}.`,
        );
      }
    }
    const graph = await collectRendererSourceGraph({
      rootDir,
      projectId,
      rendererPath: `src/projects/${projectId}/scenes/${selection.meaningId}/Renderer.tsx`,
    });
    if (
      graph.sourceGraphFingerprint !== instance.rendererSourceGraphFingerprint
    ) {
      throw new Error("Copied Scene template Renderer source is stale.");
    }
  }
};

type PreparedSceneTemplates = Readonly<{
  story: StorySpec;
  storyBytes: string;
  instantiation: ProjectSceneTemplateInstantiation;
  copiedMeaningIds: readonly string[];
  noOp: boolean;
  commit: null | Readonly<{
    sourceStoryFingerprint: Sha256Digest;
    sourceAssetManifest: ProjectAssetManifest;
    assetManifest: ProjectAssetManifest;
    projectFiles: readonly Readonly<{
      repositoryPath: string;
      bytes: Uint8Array;
    }>[];
    instances: readonly Readonly<{
      repositoryPath: string;
      bytes: string;
    }>[];
  }>;
}>;

const configuredBaseStory = (story: StorySpec): StorySpec => {
  const beats = [...story.beats];
  if (
    beats[0]?.kind === "silent-scene" &&
    beats[0].meaningId === INTRO_MEANING_ID &&
    beats[0].preset.implementation.kind === "template-copy"
  ) {
    beats.shift();
  }
  const last = beats.at(-1);
  if (
    last?.kind === "silent-scene" &&
    last.meaningId === OUTRO_MEANING_ID &&
    last.preset.implementation.kind === "template-copy"
  ) {
    beats.pop();
  }
  if (
    beats.some(
      (beat) =>
        beat.kind === "silent-scene" &&
        beat.preset.implementation.kind === "template-copy",
    )
  ) {
    throw new Error(
      "Template-copied StoryBeat requires its Project instantiation artifact.",
    );
  }
  return StorySpecSchema.parse({ ...story, beats });
};

const mergeCopiedAssets = ({
  projectId,
  previousManifest,
  copiedAssets,
}: {
  readonly projectId: string;
  readonly previousManifest: ProjectAssetManifest;
  readonly copiedAssets: readonly ResourceAssetDescriptor[];
}) => {
  const assets = new Map(
    previousManifest.assets.map((asset) => [asset.id, asset] as const),
  );
  for (const asset of copiedAssets) {
    const existing = assets.get(asset.id);
    if (
      existing !== undefined &&
      serializeCanonicalJson(existing) !== serializeCanonicalJson(asset)
    ) {
      throw new Error("Configured Scene asset identity already exists.");
    }
    assets.set(asset.id, asset);
  }
  return buildProjectAssetManifest({
    projectId,
    assets: [...assets.values()],
    externalAssets: previousManifest.externalAssets,
  });
};

export const prepareConfiguredSceneTemplates = async ({
  rootDir,
  projectId,
  story: rawStory,
  sceneDefaults,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly story: unknown;
  readonly sceneDefaults: SceneDefaults;
}) => {
  const sourceStory = StorySpecSchema.parse(rawStory);
  const projectDir = join(rootDir, "src/projects", projectId);
  const instantiationPath = join(projectDir, INSTANTIATION_PATH);
  const existingBytes = await readOptionalFile(instantiationPath);
  if (existingBytes !== null) {
    const instantiation = ProjectSceneTemplateInstantiationSchema.parse(
      JSON.parse(existingBytes.toString("utf8")),
    );
    await verifyExistingInstantiation({
      rootDir,
      projectId,
      story: sourceStory,
      instantiation,
    });
    return {
      story: sourceStory,
      storyBytes: jsonBytes(sourceStory),
      instantiation,
      copiedMeaningIds: [
        instantiation.selections.intro?.meaningId,
        instantiation.selections.outro?.meaningId,
      ].filter((value): value is NonNullable<typeof value> => value != null),
      noOp: true,
      commit: null,
    } as const;
  }
  if (
    sceneDefaults.introSceneTemplateId !== null ||
    sceneDefaults.outroSceneTemplateId !== null
  ) {
    await assertSceneTemplateAudioProjectionCurrent({
      rootDir,
      loadedProjection: SCENE_TEMPLATE_AUDIO_PROJECTION,
    });
  }
  const story = configuredBaseStory(sourceStory);
  const reserved = new Set<string>(
    story.beats.map(({ meaningId }) => meaningId),
  );
  for (const meaningId of [INTRO_MEANING_ID, OUTRO_MEANING_ID]) {
    if (reserved.has(meaningId)) {
      throw new Error(`Configured Scene meaningId is reserved: ${meaningId}.`);
    }
  }
  const stagingRoot = await mkdtemp(
    join(tmpdir(), "rsp-scene-template-instantiation-"),
  );
  let intro: Awaited<ReturnType<typeof instantiateOne>> | null;
  let outro: Awaited<ReturnType<typeof instantiateOne>> | null;
  try {
    [intro, outro] = await Promise.all([
      sceneDefaults.introSceneTemplateId === null
        ? null
        : instantiateOne({
            sourceRootDir: rootDir,
            targetRootDir: stagingRoot,
            projectId,
            meaningId: INTRO_MEANING_ID,
            templateId: sceneDefaults.introSceneTemplateId,
          }),
      sceneDefaults.outroSceneTemplateId === null
        ? null
        : instantiateOne({
            sourceRootDir: rootDir,
            targetRootDir: stagingRoot,
            projectId,
            meaningId: OUTRO_MEANING_ID,
            templateId: sceneDefaults.outroSceneTemplateId,
          }),
    ]);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
  const materializedStory = StorySpecSchema.parse({
    ...story,
    beats: [
      ...(intro === null ? [] : [intro.beat]),
      ...story.beats,
      ...(outro === null ? [] : [outro.beat]),
    ],
  });
  const previousManifest = await readProjectAssetManifest({
    rootDir,
    projectId,
  });
  const assetManifest = mergeCopiedAssets({
    projectId,
    previousManifest,
    copiedAssets: [...(intro?.assets ?? []), ...(outro?.assets ?? [])],
  });
  const instantiation = buildProjectSceneTemplateInstantiation({
    schemaVersion: 1,
    storyId: projectId,
    selections: {
      intro: intro?.selection ?? null,
      outro: outro?.selection ?? null,
    },
    materializedStoryFingerprint: computeStoryFingerprint(materializedStory),
  });
  if (
    computeStoryFingerprint(sourceStory) !== computeStoryFingerprint(story) &&
    computeStoryFingerprint(sourceStory) !==
      computeStoryFingerprint(materializedStory)
  ) {
    throw new Error("Partial Scene template Story materialization is stale.");
  }
  return {
    story: materializedStory,
    storyBytes: jsonBytes(materializedStory),
    instantiation,
    copiedMeaningIds: [intro?.beat.meaningId, outro?.beat.meaningId].filter(
      (value): value is NonNullable<typeof value> => value != null,
    ),
    noOp: false,
    commit: {
      sourceStoryFingerprint: computeStoryFingerprint(sourceStory),
      sourceAssetManifest: previousManifest,
      assetManifest,
      projectFiles: [
        ...(intro?.projectFiles ?? []),
        ...(outro?.projectFiles ?? []),
      ],
      instances: [intro, outro]
        .filter((value): value is NonNullable<typeof value> => value !== null)
        .map((value) => ({
          repositoryPath: `src/projects/${projectId}/scenes/${value.beat.meaningId}/scene-template-instance.json`,
          bytes: jsonBytes(value.instance),
        })),
    },
  } as const;
};

export const commitConfiguredSceneTemplates = async ({
  rootDir,
  projectId,
  prepared,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly prepared: PreparedSceneTemplates;
}) => {
  if (prepared.commit === null) return;
  const currentStory = StorySpecSchema.parse(
    JSON.parse(
      await readFile(
        join(rootDir, `src/projects/${projectId}/story.json`),
        "utf8",
      ),
    ),
  );
  const currentStoryFingerprint = computeStoryFingerprint(currentStory);
  if (
    currentStoryFingerprint !== prepared.commit.sourceStoryFingerprint &&
    currentStoryFingerprint !== computeStoryFingerprint(prepared.story)
  ) {
    throw new Error("Project Story changed during Scene template preparation.");
  }
  const currentManifest = await readProjectAssetManifest({
    rootDir,
    projectId,
  });
  if (
    serializeCanonicalJson(currentManifest) !==
      serializeCanonicalJson(prepared.commit.sourceAssetManifest) &&
    serializeCanonicalJson(currentManifest) !==
      serializeCanonicalJson(prepared.commit.assetManifest)
  ) {
    throw new Error(
      "Project asset manifest changed during Scene template preparation.",
    );
  }
  const immutableFiles = [
    ...prepared.commit.projectFiles.map((file) => ({
      repositoryPath: file.repositoryPath,
      bytes: file.bytes,
    })),
    ...prepared.commit.instances.map((instance) => ({
      repositoryPath: instance.repositoryPath,
      bytes: Buffer.from(instance.bytes),
    })),
    {
      repositoryPath: `src/projects/${projectId}/${INSTANTIATION_PATH}`,
      bytes: Buffer.from(jsonBytes(prepared.instantiation)),
    },
  ];
  for (const file of immutableFiles) {
    await assertBinaryCreateCompatible(
      join(rootDir, file.repositoryPath),
      file.bytes,
    );
  }
  for (const file of prepared.commit.projectFiles) {
    await writeBinaryCreate(join(rootDir, file.repositoryPath), file.bytes);
  }
  for (const instance of prepared.commit.instances) {
    await writeBinaryCreate(
      join(rootDir, instance.repositoryPath),
      Buffer.from(instance.bytes),
    );
  }
  await writeTextFileAtomic({
    destination: join(
      rootDir,
      `src/projects/${projectId}/assets.manifest.json`,
    ),
    bytes: jsonBytes(prepared.commit.assetManifest),
    mode: "replace",
  });
  await writeTextFileAtomic({
    destination: join(rootDir, `src/projects/${projectId}/story.json`),
    bytes: prepared.storyBytes,
    mode: "replace",
  });
  await writeBinaryCreate(
    join(rootDir, `src/projects/${projectId}/${INSTANTIATION_PATH}`),
    Buffer.from(jsonBytes(prepared.instantiation)),
  );
};

export const materializeConfiguredSceneTemplates = async (
  input: Parameters<typeof prepareConfiguredSceneTemplates>[0],
) => {
  const prepared = await prepareConfiguredSceneTemplates(input);
  await commitConfiguredSceneTemplates({
    rootDir: input.rootDir,
    projectId: input.projectId,
    prepared,
  });
  return prepared;
};
