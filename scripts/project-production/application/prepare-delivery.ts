import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

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
  type ResourceCatalog,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import { collectDeliveryCoverSourceGraph } from "../adapters/cover-source";
import { checkMasteredNarrationArtifacts } from "../../narration/mastering";
import { collectGlobalVisualSourceGraph } from "./global-visual-validator";
import { compileTargetProjectComposition } from "./project-composition-compiler";
import { ensureProjectAuthoringBuildScaffold } from "./project-scaffold";
import { generateProjectRegistry } from "../../registry/generate";
import { generateRendererRegistryFromProjectFiles } from "../../renderer-registry/generate";
import {
  generateSceneCoverageFromProjectFiles,
  generateScenePackageFromProjectFiles,
} from "../../scene-package/generate";
import { writeTextFileAtomic } from "../../shared/atomic-file";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "./production-scope";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

const pathState = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const ensureRealDirectoryChain = async ({
  root,
  directory,
  createMissing,
}: {
  readonly root: string;
  readonly directory: string;
  readonly createMissing: boolean;
}) => {
  const resolvedRoot = resolve(root);
  const resolvedDirectory = resolve(directory);
  const fromRoot = relative(resolvedRoot, resolvedDirectory);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    resolve(resolvedRoot, fromRoot) !== resolvedDirectory
  ) {
    throw new Error("Candidate render directory escaped its scope.");
  }
  const rootState = await lstat(resolvedRoot);
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
    throw new Error("Candidate render directory root must be real.");
  }
  let current = resolvedRoot;
  for (const segment of fromRoot.split(sep).filter(Boolean)) {
    current = join(current, segment);
    let state = await pathState(current);
    if (state === null) {
      if (!createMissing) {
        throw new Error("Candidate render directory chain is incomplete.");
      }
      await mkdir(current);
      state = await lstat(current);
    }
    if (state.isSymbolicLink() || !state.isDirectory()) {
      throw new Error("Candidate render directory chain is unsafe.");
    }
  }
};

type CopiedPublicFile = Readonly<{
  checksum: Sha256Digest;
  sizeBytes: number;
}>;

const fileIdentityMatches = (
  left: Awaited<ReturnType<FileHandle["stat"]>>,
  right: Awaited<ReturnType<FileHandle["stat"]>>,
) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs;

const writeAll = async (handle: FileHandle, bytes: Uint8Array) => {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
      null,
    );
    if (bytesWritten === 0) {
      throw new Error("Candidate render public copy made no progress.");
    }
    offset += bytesWritten;
  }
};

const copyStableRegularFile = async ({
  source,
  destination,
}: {
  readonly source: string;
  readonly destination: string;
}): Promise<CopiedPublicFile> => {
  const pathBefore = await lstat(source);
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) {
    throw new Error("Candidate render public source contains an unsafe file.");
  }
  const sourceHandle = await open(source, "r");
  let destinationHandle: FileHandle | undefined;
  try {
    const before = await sourceHandle.stat();
    if (
      !before.isFile() ||
      before.dev !== pathBefore.dev ||
      before.ino !== pathBefore.ino
    ) {
      throw new Error("Candidate render public file changed before copying.");
    }
    destinationHandle = await open(destination, "wx");
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await sourceHandle.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;
      const bytes = buffer.subarray(0, bytesRead);
      hash.update(bytes);
      await writeAll(destinationHandle, bytes);
      position += bytesRead;
    }
    await destinationHandle.sync();
    const after = await sourceHandle.stat();
    const pathAfter = await lstat(source);
    if (
      !fileIdentityMatches(before, after) ||
      pathAfter.isSymbolicLink() ||
      !pathAfter.isFile() ||
      pathAfter.dev !== after.dev ||
      pathAfter.ino !== after.ino ||
      position !== before.size
    ) {
      throw new Error("Candidate render public file changed while copying.");
    }
    return {
      checksum: `sha256:${hash.digest("hex")}` as Sha256Digest,
      sizeBytes: position,
    };
  } finally {
    await destinationHandle?.close();
    await sourceHandle.close();
  }
};

const copyRegularTree = async ({
  source,
  destination,
  publicPathPrefix,
  copiedFiles,
}: {
  readonly source: string;
  readonly destination: string;
  readonly publicPathPrefix: string;
  readonly copiedFiles: Map<string, CopiedPublicFile>;
}) => {
  const directoryBefore = await lstat(source);
  if (directoryBefore.isSymbolicLink() || !directoryBefore.isDirectory()) {
    throw new Error("Candidate render public source must be a real directory.");
  }
  await mkdir(destination, { recursive: true });
  const entries = (await readdir(source, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    const publicPath = `${publicPathPrefix}/${entry.name}`;
    const state = await lstat(sourcePath);
    if (state.isSymbolicLink()) {
      throw new Error("Candidate render public source contains a symlink.");
    }
    if (state.isDirectory()) {
      await copyRegularTree({
        source: sourcePath,
        destination: destinationPath,
        publicPathPrefix: publicPath,
        copiedFiles,
      });
    } else if (state.isFile()) {
      copiedFiles.set(
        `public/${publicPath}`,
        await copyStableRegularFile({
          source: sourcePath,
          destination: destinationPath,
        }),
      );
    } else {
      throw new Error(
        "Candidate render public source contains a special file.",
      );
    }
  }
  const directoryAfter = await lstat(source);
  const entriesAfter = (await readdir(source, { withFileTypes: true }))
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right));
  if (
    directoryAfter.isSymbolicLink() ||
    !directoryAfter.isDirectory() ||
    directoryAfter.dev !== directoryBefore.dev ||
    directoryAfter.ino !== directoryBefore.ino ||
    entriesAfter.length !== entries.length ||
    entriesAfter.some((name, index) => name !== entries[index]?.name)
  ) {
    throw new Error("Candidate render public directory changed while copying.");
  }
};

const candidateEntrypointSource = (
  stylesheetImport: string,
) => `import ${JSON.stringify(stylesheetImport)};
import {registerRoot} from "remotion";
import {createRemotionRoot} from "@axmorf/studio/remotion";
import {projectRegistry} from "./projects/project-registry.generated";

const CandidateRemotionRoot = () => createRemotionRoot(projectRegistry);
registerRoot(CandidateRemotionRoot);
`;

const verifyCopiedCatalogAssets = ({
  catalog,
  copiedFiles,
}: {
  readonly catalog: ResourceCatalog;
  readonly copiedFiles: ReadonlyMap<string, CopiedPublicFile>;
}) => {
  for (const { descriptor } of catalog.entries) {
    if (descriptor.kind !== "asset") continue;
    const copied = copiedFiles.get(descriptor.localPath);
    if (
      copied === undefined ||
      copied.checksum !== descriptor.checksum ||
      (descriptor.media?.sizeBytes !== undefined &&
        copied.sizeBytes !== descriptor.media.sizeBytes)
    ) {
      throw new Error(
        `Candidate render asset drifted from ResourceCatalog: ${descriptor.localPath}.`,
      );
    }
  }
};

type RenderViewReplacementFilesystem = Readonly<{
  rename: typeof rename;
  rm: typeof rm;
}>;

export const replaceCandidateRenderView = async ({
  staging,
  destination,
  backup,
  filesystem = { rename, rm },
}: {
  readonly staging: string;
  readonly destination: string;
  readonly backup: string;
  readonly filesystem?: RenderViewReplacementFilesystem;
}) => {
  let hadPreviousView = false;
  try {
    await filesystem.rename(destination, backup);
    hadPreviousView = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await filesystem.rename(staging, destination);
  } catch (installError) {
    if (!hadPreviousView) throw installError;
    try {
      await filesystem.rename(backup, destination);
    } catch (rollbackError) {
      throw new AggregateError(
        [installError, rollbackError],
        "Candidate render view install and rollback both failed.",
      );
    }
    throw installError;
  }
  if (hadPreviousView) {
    await filesystem.rm(backup, { recursive: true, force: true });
  }
};

export const prepareCandidateRenderView = async ({
  scope,
  resourceCatalog,
}: {
  readonly scope: ProductionScope;
  readonly resourceCatalog: ResourceCatalog;
}) => {
  if (scope.kind === "live-project") {
    return {
      entryPoint: join(scope.shared.runtimeRoot, "src/index.ts"),
      publicDir: join(scope.shared.runtimeRoot, "public"),
    } as const;
  }
  const outputRoot = resolve(scope.outputRoot);
  const isolatedRoot = resolve(scope.isolatedRoot);
  const fromIsolated = relative(isolatedRoot, outputRoot);
  if (
    fromIsolated === "" ||
    fromIsolated === ".." ||
    fromIsolated.startsWith(`..${sep}`)
  ) {
    throw new Error("Candidate render output root escaped its scope.");
  }
  await ensureRealDirectoryChain({
    root: scope.repositoryRoot,
    directory: scope.candidateRoot,
    createMissing: false,
  });
  await ensureRealDirectoryChain({
    root: scope.candidateRoot,
    directory: scope.isolatedRoot,
    createMissing: false,
  });
  await ensureRealDirectoryChain({
    root: scope.isolatedRoot,
    directory: outputRoot,
    createMissing: true,
  });
  const staging = join(outputRoot, `.render-public-${randomUUID()}`);
  const publicDir = join(outputRoot, "render-public");
  const copiedFiles = new Map<string, CopiedPublicFile>();
  await mkdir(staging);
  try {
    try {
      await copyRegularTree({
        source: join(scope.shared.runtimeRoot, "public/assets"),
        destination: join(staging, "assets"),
        publicPathPrefix: "assets",
        copiedFiles,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await copyRegularTree({
      source: join(scope.projectPublicRoot, scope.storyId),
      destination: join(staging, "projects", scope.storyId),
      publicPathPrefix: `projects/${scope.storyId}`,
      copiedFiles,
    });
    verifyCopiedCatalogAssets({ catalog: resourceCatalog, copiedFiles });
    const replaced = join(
      outputRoot,
      `.render-public-replaced-${randomUUID()}`,
    );
    await replaceCandidateRenderView({
      staging,
      destination: publicDir,
      backup: replaced,
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  const entryPoint = join(scope.isolatedRoot, "src/index.ts");
  await ensureRealDirectoryChain({
    root: scope.isolatedRoot,
    directory: dirname(entryPoint),
    createMissing: true,
  });
  const stylesheetPath = join(scope.shared.runtimeRoot, "src/index.css");
  const relativeStylesheetPath = relative(dirname(entryPoint), stylesheetPath)
    .split(sep)
    .join("/");
  const stylesheetImport = relativeStylesheetPath.startsWith(".")
    ? relativeStylesheetPath
    : `./${relativeStylesheetPath}`;
  await writeTextFileAtomic({
    destination: entryPoint,
    bytes: candidateEntrypointSource(stylesheetImport),
    mode: "replace",
  });
  return { entryPoint, publicDir } as const;
};

export const prepareProjectAuthoringBuild = async ({
  rootDir,
  projectId: rawProjectId,
  scope: suppliedScope,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly scope?: ProductionScope;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  if (scope.repositoryRoot !== rootDir || scope.storyId !== projectId) {
    throw new Error("Project build scope is cross-bound.");
  }
  const contentRoot = scope.isolatedRoot;
  const projectRoot = join(scope.projectSourceRoot, projectId);
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
      rootDir: contentRoot,
      projectId,
      meaningId,
      mode: "write",
    });
  }
  const coverage = await generateSceneCoverageFromProjectFiles({
    rootDir: contentRoot,
    projectId,
    mode: "write",
  });
  const rendererRegistry = await generateRendererRegistryFromProjectFiles({
    rootDir: contentRoot,
    projectId,
    mode: "write",
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
    rootDir: contentRoot,
    storyId: projectId,
    meaningIds,
    runtimeInputFingerprint,
  });
  await Promise.all([
    collectGlobalVisualSourceGraph({
      rootDir: contentRoot,
      runtimeRootDir: scope.shared.runtimeRoot,
      storyId: projectId,
    }),
    collectDeliveryCoverSourceGraph({
      rootDir: contentRoot,
      storyId: projectId,
      compositionId: deriveCoverCompositionBaseId(projectId),
    }),
    checkMasteredNarrationArtifacts({
      rootDir: contentRoot,
      storyId: projectId,
    }),
  ]);
  await generateProjectRegistry({ rootDir: contentRoot, mode: "write" });
  await compileTargetProjectComposition({
    rootDir: contentRoot,
    runtimeRootDir: scope.shared.runtimeRoot,
    storyId: projectId,
  });
  const renderView = await prepareCandidateRenderView({
    scope,
    resourceCatalog,
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
    runtimeRootDir: scope.shared.runtimeRoot,
    entryPoint: renderView.entryPoint,
    coverEntryPoint: join(projectRoot, "delivery/cover/index.ts"),
    publicDir: renderView.publicDir,
  } as const;
};
