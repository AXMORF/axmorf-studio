import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative, sep } from "node:path";

import {
  ProjectAssetManifestSchema,
  ResourceIdSchema,
  StorySpecSchema,
  buildProjectAssetManifest,
  buildProjectSceneTemplateInstantiation,
  buildSceneTemplateInstance,
  buildSilentScenePreset,
  computeStoryFingerprint,
  createFingerprint,
  serializeCanonicalJson,
  type ProducerConfig,
  type ResourceAssetDescriptor,
  type Sha256Digest,
} from "../../src/contracts";
import {
  SceneTemplateAudioProjectionSchema,
  buildDefaultSceneTemplateAudioProjection,
} from "../../src/remotion/capabilities/scene-templates/template-audio";
import {
  getSceneTemplateDefinition,
  renderCopiedSceneRenderer,
  type SceneTemplateDefinition,
} from "../../src/remotion/capabilities/scene-templates/registry";
import { collectRendererSourceGraph } from "../renderer-registry/domain";
import type { ProductionLocations } from "../project-production/application/production-locations";

const INTRO_MEANING_ID = "configured-intro-scene";
const OUTRO_MEANING_ID = "configured-outro-scene";

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;

const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

export const buildWorkspaceSceneTemplateAudioProjection = (
  rawManifest: unknown,
) => buildDefaultSceneTemplateAudioProjection(rawManifest);

const safeRelativePath = (value: string, label: string) => {
  if (
    value.includes("\\") ||
    normalize(value).split(sep).join("/") !== value ||
    value.startsWith("/") ||
    value
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} is unsafe.`);
  }
  return value;
};

const contained = (root: string, candidate: string) => {
  const value = relative(root, candidate);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`);
};

const readPackRegularFile = async ({
  root,
  relativePath,
  label,
}: {
  readonly root: string;
  readonly relativePath: string;
  readonly label: string;
}) => {
  const safe = safeRelativePath(relativePath, label);
  const destination = join(root, ...safe.split("/"));
  if (!contained(root, destination))
    throw new Error(`${label} escapes its root.`);
  const segments = safe.split("/");
  let current = root;
  const rootState = await lstat(root);
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
    throw new Error(`${label} root must be a real directory.`);
  }
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    const state = await lstat(current);
    if (state.isSymbolicLink() || !state.isDirectory()) {
      throw new Error(`${label} parent must be a real directory.`);
    }
  }
  const before = await lstat(destination);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a regular non-symbolic file.`);
  }
  const bytes = await readFile(destination);
  const after = await lstat(destination);
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
  return bytes;
};

const writeStageFile = async (
  destination: string,
  bytes: Uint8Array | string,
) => {
  await mkdir(dirname(destination), { recursive: true });
  const state = await lstat(destination).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    },
  );
  if (state !== null)
    throw new Error("Workspace template staging target already exists.");
  await writeFile(destination, bytes, { flag: "wx" });
};

const runtimeAssetRelativePath = (logicalPath: string) => {
  const prefix = "public/assets/";
  if (!logicalPath.startsWith(prefix)) {
    throw new Error("Runtime template asset is outside shared-assets.");
  }
  return safeRelativePath(
    logicalPath.slice(prefix.length),
    "Runtime template asset",
  );
};

const templateFingerprint = async ({
  sourceRoot,
  sharedAssetsRoot,
  definition,
}: {
  readonly sourceRoot: string;
  readonly sharedAssetsRoot: string;
  readonly definition: SceneTemplateDefinition;
}) => {
  const sourceFiles = await Promise.all(
    definition.sourceFiles.map(async (file) => ({
      sourcePath: file.sourcePath,
      destinationName: file.destinationName,
      checksum: checksum(
        await readPackRegularFile({
          root: sourceRoot,
          relativePath: file.sourcePath,
          label: "Runtime template source",
        }),
      ),
    })),
  );
  const assets = await Promise.all(
    definition.assets.map(async (asset) => {
      const bytes = await readPackRegularFile({
        root: sharedAssetsRoot,
        relativePath: runtimeAssetRelativePath(asset.sourcePath),
        label: "Runtime template shared asset",
      });
      const actual = checksum(bytes);
      if (actual !== asset.sourceDescriptor.checksum) {
        throw new Error(
          `Runtime template asset checksum is stale: ${asset.sourcePath}.`,
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

const instantiateOne = async ({
  locations,
  sourceRoot,
  sharedAssetsRoot,
  projectContainerRoot,
  projectRoot,
  mediaRoot,
  projectId,
  meaningId,
  templateId,
  audioProjection,
}: {
  readonly locations: ProductionLocations;
  readonly sourceRoot: string;
  readonly sharedAssetsRoot: string;
  readonly projectContainerRoot: string;
  readonly projectRoot: string;
  readonly mediaRoot: string;
  readonly projectId: string;
  readonly meaningId: string;
  readonly templateId: string;
  readonly audioProjection: ReturnType<
    typeof SceneTemplateAudioProjectionSchema.parse
  >;
}) => {
  const definition = getSceneTemplateDefinition(templateId, audioProjection);
  const sourceTemplateFingerprint = await templateFingerprint({
    sourceRoot,
    sharedAssetsRoot,
    definition,
  });
  const sceneRoot = join(projectRoot, "scenes", meaningId);
  const sceneMediaRoot = join(mediaRoot, "scenes", meaningId);
  const logicalSceneRoot = `src/projects/${projectId}/scenes/${meaningId}`;
  const logicalMediaRoot = `public/projects/${projectId}/scenes/${meaningId}`;
  const copiedSourceFiles: Array<{
    repositoryPath: string;
    checksum: Sha256Digest;
  }> = [];
  const copiedAssetFiles: Array<{
    repositoryPath: string;
    checksum: Sha256Digest;
  }> = [];
  for (const file of definition.sourceFiles) {
    const bytes = await readPackRegularFile({
      root: sourceRoot,
      relativePath: file.sourcePath,
      label: "Runtime template source",
    });
    await writeStageFile(join(sceneRoot, file.destinationName), bytes);
    copiedSourceFiles.push({
      repositoryPath: `${logicalSceneRoot}/${file.destinationName}`,
      checksum: checksum(bytes),
    });
  }
  const rendererPath = `${logicalSceneRoot}/Renderer.tsx`;
  const rendererBytes = Buffer.from(renderCopiedSceneRenderer(definition));
  await writeStageFile(join(sceneRoot, "Renderer.tsx"), rendererBytes);
  copiedSourceFiles.push({
    repositoryPath: rendererPath,
    checksum: checksum(rendererBytes),
  });

  const assetByKey = new Map<
    string,
    { resourceId: string; descriptor: ResourceAssetDescriptor }
  >();
  for (const asset of definition.assets) {
    const bytes = await readPackRegularFile({
      root: sharedAssetsRoot,
      relativePath: runtimeAssetRelativePath(asset.sourcePath),
      label: "Runtime template shared asset",
    });
    if (checksum(bytes) !== asset.sourceDescriptor.checksum) {
      throw new Error(
        `Runtime template asset checksum is stale: ${asset.sourcePath}.`,
      );
    }
    const resourceId = ResourceIdSchema.parse(
      `asset.${projectId}.${meaningId}.${asset.assetKey}`,
    );
    const repositoryPath = `${logicalMediaRoot}/${asset.destinationName}`;
    await writeStageFile(join(sceneMediaRoot, asset.destinationName), bytes);
    copiedAssetFiles.push({ repositoryPath, checksum: checksum(bytes) });
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
    if (asset === undefined)
      throw new Error("Runtime template sound cue asset is missing.");
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
    locations: {
      ...locations,
      projectSourceRoot: projectContainerRoot,
    },
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
    copiedSourceFiles: copiedSourceFiles.sort((a, b) =>
      a.repositoryPath.localeCompare(b.repositoryPath),
    ),
    copiedAssetFiles: copiedAssetFiles.sort((a, b) =>
      a.repositoryPath.localeCompare(b.repositoryPath),
    ),
    visual: {
      ...definition.visual,
      orderedShotIds: definition.orderedShotIds,
      visualResourceIds: [],
    },
    anchors: definition.anchors,
    shots: definition.shots.map((shot) => ({ ...shot, visualResourceIds: [] })),
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
  await writeStageFile(
    join(sceneRoot, "scene-template-instance.json"),
    jsonBytes(instance),
  );
  return {
    beat: {
      kind: "silent-scene" as const,
      meaningId,
      narrativePurpose: definition.narrativePurpose,
      preset,
    },
    selection: {
      templateId,
      meaningId,
      templateFingerprint: sourceTemplateFingerprint,
      instanceFingerprint: instance.instanceFingerprint,
      presetFingerprint: preset.presetFingerprint,
    },
    assets: [...assetByKey.values()].map(({ descriptor }) => descriptor),
  } as const;
};

const configuredBaseStory = (rawStory: unknown) => {
  const story = StorySpecSchema.parse(rawStory);
  const beats = [...story.beats];
  if (
    beats[0]?.kind === "silent-scene" &&
    beats[0].meaningId === INTRO_MEANING_ID &&
    beats[0].preset.implementation.kind === "template-copy"
  )
    beats.shift();
  const last = beats.at(-1);
  if (
    last?.kind === "silent-scene" &&
    last.meaningId === OUTRO_MEANING_ID &&
    last.preset.implementation.kind === "template-copy"
  )
    beats.pop();
  if (
    beats.some(
      (beat) =>
        beat.kind === "silent-scene" &&
        beat.preset.implementation.kind === "template-copy",
    )
  ) {
    throw new Error(
      "Template-copied StoryBeat must be a configured boundary Scene.",
    );
  }
  return StorySpecSchema.parse({ ...story, beats });
};

export const materializeWorkspaceSceneTemplates = async ({
  locations,
  projectContainerRoot,
  projectRoot,
  mediaRoot,
  projectId,
  story: rawStory,
  config,
  selections,
}: {
  readonly locations: ProductionLocations;
  readonly projectContainerRoot: string;
  readonly projectRoot: string;
  readonly mediaRoot: string;
  readonly projectId: string;
  readonly story: unknown;
  readonly config: ProducerConfig;
  readonly selections?: Readonly<{
    introSceneTemplateId: string | null;
    outroSceneTemplateId: string | null;
  }>;
}) => {
  const selected = selections ?? config.sceneDefaults;
  const sourceRoot = join(locations.runtimeResources, "source");
  const sharedAssetsRoot = join(locations.runtimeResources, "shared-assets");
  const audioProjection = buildWorkspaceSceneTemplateAudioProjection(
    JSON.parse(
      (
        await readPackRegularFile({
          root: sourceRoot,
          relativePath: "src/remotion/catalog/assets.manifest.json",
          label: "Runtime template audio manifest",
        })
      ).toString("utf8"),
    ),
  );
  const story = configuredBaseStory(rawStory);
  const reserved = new Set<string>(
    story.beats.map(({ meaningId }) => meaningId),
  );
  for (const meaningId of [INTRO_MEANING_ID, OUTRO_MEANING_ID]) {
    if (reserved.has(meaningId))
      throw new Error(`Configured Scene meaningId is reserved: ${meaningId}.`);
  }
  const intro =
    selected.introSceneTemplateId === null
      ? null
      : await instantiateOne({
          locations,
          sourceRoot,
          sharedAssetsRoot,
          projectContainerRoot,
          projectRoot,
          mediaRoot,
          projectId,
          meaningId: INTRO_MEANING_ID,
          templateId: selected.introSceneTemplateId,
          audioProjection,
        });
  const outro =
    selected.outroSceneTemplateId === null
      ? null
      : await instantiateOne({
          locations,
          sourceRoot,
          sharedAssetsRoot,
          projectContainerRoot,
          projectRoot,
          mediaRoot,
          projectId,
          meaningId: OUTRO_MEANING_ID,
          templateId: selected.outroSceneTemplateId,
          audioProjection,
        });
  const materializedStory = StorySpecSchema.parse({
    ...story,
    beats: [
      ...(intro === null ? [] : [intro.beat]),
      ...story.beats,
      ...(outro === null ? [] : [outro.beat]),
    ],
  });
  const manifest = buildProjectAssetManifest({
    projectId,
    assets: [...(intro?.assets ?? []), ...(outro?.assets ?? [])],
    externalAssets: [],
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
  await writeStageFile(
    join(projectRoot, "production/scene-template-instantiation.json"),
    jsonBytes(instantiation),
  );
  return {
    story: materializedStory,
    storyBytes: jsonBytes(materializedStory),
    assetManifest: ProjectAssetManifestSchema.parse(manifest),
    copiedMeaningIds: [intro?.beat.meaningId, outro?.beat.meaningId].filter(
      (value) => value !== undefined,
    ),
  } as const;
};
