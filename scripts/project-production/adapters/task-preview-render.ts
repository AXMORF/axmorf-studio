import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import ts from "typescript";
import { z } from "zod";

import {
  AuthoringRequirementsSchema,
  MasteredNarrationManifestSchema,
  NarrationSpecSchema,
  ProducerLogicalPathSchema,
  RenderSpecSchema,
  SceneSelectedResourcesFileSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  ShotPlanSetSchema,
  StorySpecSchema,
  VideoBriefSchema,
  VisualStyleSpecSchema,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  createFingerprint,
  isVisualStory,
  resolveSceneSoundContributions,
  resolveSceneViewport,
  serializeCanonicalJson,
  validateNarrativeArtifactBundle,
  type ProducerTaskSpec,
  type RenderSpec,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import { measureCanonicalPcmWav } from "../../narration/domain/pcm-wav";
import { runMediaProcess } from "../../shared/media-process";
import { resolveMediaToolCommand } from "../../shared/media-tool-command";
import type { ProcessRunner } from "../../shared/process";
import { resolveRemotionCliInvocation } from "../../shared/remotion-command";
import { checksumBytes } from "./project-input-snapshot";

const ScenePreviewContextSchema = z
  .object({
    scene: z
      .object({
        taskInput: SceneTaskInputSchema,
        visualStyle: VisualStyleSpecSchema,
      })
      .passthrough(),
  })
  .passthrough();

type PreviewFile = Readonly<{
  path: string;
  checksum: Sha256Digest;
  sizeBytes: number;
  bytes: Uint8Array;
}>;

const containedPath = (root: string, rawPath: string) => {
  const path = ProducerLogicalPathSchema.parse(rawPath);
  const absolute = join(root, path);
  if (relative(root, absolute).split(sep).join("/") !== path) {
    throw new Error("Scene preview file escaped its owner root.");
  }
  return absolute;
};

const readOwnedFile = async (
  root: string,
  path: string,
): Promise<PreviewFile> => {
  const absolute = containedPath(root, path);
  let parent = root;
  for (const segment of path.split("/").slice(0, -1)) {
    parent = join(parent, segment);
    const metadata = await lstat(parent);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Scene preview file parent must be a real directory.");
    }
  }
  const before = await lstat(absolute);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error("Scene preview input must be a regular file.");
  }
  const bytes = Uint8Array.from(await readFile(absolute));
  const after = await lstat(absolute);
  if (
    !after.isFile() ||
    after.isSymbolicLink() ||
    before.ino !== after.ino ||
    before.dev !== after.dev ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    bytes.byteLength !== after.size
  ) {
    throw new Error("Scene preview input changed while being read.");
  }
  return {
    path,
    checksum: checksumBytes(bytes),
    sizeBytes: bytes.byteLength,
    bytes,
  };
};

const parseJson = (file: PreviewFile): unknown =>
  JSON.parse(new TextDecoder().decode(file.bytes));

// Bundle only this output graph. Relative imports may never escape to a live
// Project, another executor, or a previously rendered preview.
export const assertScenePreviewSourceImports = (
  files: readonly PreviewFile[],
) => {
  const paths = new Set(files.map(({ path }) => path));
  for (const file of files.filter(({ path }) => /\.[cm]?tsx?$/u.test(path))) {
    const source = ts.createSourceFile(
      file.path,
      new TextDecoder().decode(file.bytes),
      ts.ScriptTarget.Latest,
      true,
    );
    const check = (specifier: string) => {
      if (isAbsolute(specifier) || specifier.includes("\\")) {
        throw new Error(
          "Scene preview imports must use declared local files or packages.",
        );
      }
      if (!specifier.startsWith(".")) return;
      const base = posix.normalize(
        posix.join(posix.dirname(file.path), specifier),
      );
      const candidates = [
        base,
        ...[
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
          ".json",
          "/index.ts",
          "/index.tsx",
          "/index.js",
        ].map((suffix) => `${base}${suffix}`),
      ];
      if (!candidates.some((candidate) => paths.has(candidate))) {
        throw new Error(
          `Scene preview import is outside declared outputs: ${file.path} -> ${specifier}.`,
        );
      }
    };
    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        check(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        const argument = node.arguments[0];
        if (!argument || !ts.isStringLiteral(argument)) {
          throw new Error(
            "Scene preview imports require a static module path.",
          );
        }
        check(argument.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
};

export const readSceneTaskPreviewSnapshot = async ({
  task,
  workspace,
}: {
  readonly task: ProducerTaskSpec;
  readonly workspace: string;
}) => {
  const context = ScenePreviewContextSchema.parse(
    parseJson(await readOwnedFile(workspace, "inputs/context.json")),
  );
  const { taskInput, visualStyle } = context.scene;
  if (
    task.taskKind !== "scene-owner" ||
    taskInput.storyId !== task.storyId ||
    taskInput.meaningId !== task.semanticId
  ) {
    throw new Error("Scene preview snapshot is cross-bound.");
  }
  const files: PreviewFile[] = [];
  for (const path of [...task.declaredOutputSet].sort())
    files.push(await readOwnedFile(workspace, path));
  assertScenePreviewSourceImports(files);
  const sourceFingerprint = createFingerprint({
    namespace: "scene-task-preview-source",
    version: 1,
    value: {
      taskRevision: task.taskRevision,
      taskInputFingerprint: taskInput.taskInputFingerprint,
      files: files.map(({ path, checksum, sizeBytes }) => ({
        path,
        checksum,
        sizeBytes,
      })),
    },
  });
  const json = (path: string) => {
    const file = files.find((candidate) => candidate.path === path);
    if (!file) throw new Error(`Scene preview output is missing: ${path}.`);
    return parseJson(file);
  };
  return {
    taskInput,
    visualStyle,
    files,
    sourceFingerprint,
    visualPlan: SceneVisualPlanSchema.parse(json("src/visual-plan.json")),
    shots: ShotPlanSetSchema.parse(json("src/shot-plan.json")),
    syncAnchors: SceneSyncAnchorSetSchema.parse(json("src/sync-anchors.json")),
    soundPlan: SceneSoundPlanSchema.parse(json("src/sound-plan.json")),
    resources: SceneSelectedResourcesFileSchema.parse(
      json("src/selected-resources.json"),
    ).selectedResources,
  };
};

export const loadSceneTaskPreviewInputs = async ({
  rootDir,
  runtimeRootDir,
  snapshot,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir: string;
  readonly snapshot: Awaited<ReturnType<typeof readSceneTaskPreviewSnapshot>>;
}) => {
  const { taskInput } = snapshot;
  const projectRoot = `src/projects/${taskInput.storyId}`;
  const fixedFiles: PreviewFile[] = [];
  const json = async (path: string) => {
    const file = await readOwnedFile(rootDir, `${projectRoot}/${path}`);
    fixedFiles.push(file);
    return parseJson(file);
  };
  const story = StorySpecSchema.parse(await json("story.json"));
  const render = RenderSpecSchema.parse(await json("render.json"));
  const requirements = AuthoringRequirementsSchema.parse(
    await json("production/requirements.json"),
  );
  const timing = SemanticTimingSchema.parse(
    await json("generated/semantic-timing.generated.json"),
  );
  const brief = VideoBriefSchema.parse(await json("brief.json"));
  const narration = NarrationSpecSchema.nullable().parse(
    await json("narration.json"),
  );
  const visualOnly = isVisualStory(story);
  const sealedManifest = await json(
    "generated/sealed-narration.generated.json",
  );
  const masteredManifest = await json(
    "generated/mastered-narration.generated.json",
  );
  if (visualOnly && (sealedManifest !== null || masteredManifest !== null)) {
    throw new Error(
      "Visual Scene preview requires explicit null narration manifests.",
    );
  }
  const sealedNarration = visualOnly
    ? null
    : SealedNarrationManifestSchema.parse(sealedManifest);
  validateNarrativeArtifactBundle({
    projectSource: { brief, story, render, narration },
    sealedNarration,
    semanticTiming: timing,
  });
  const timingBeat = timing.storyBeats.find(
    ({ meaningId }) => meaningId === taskInput.meaningId,
  );
  if (
    story.storyId !== taskInput.storyId ||
    requirements.storyId !== taskInput.storyId ||
    timingBeat === undefined ||
    computeStoryFingerprint(story) !== taskInput.storyFingerprint ||
    computeRenderSpecFingerprint(render) !== taskInput.renderFingerprint ||
    serializeCanonicalJson(timingBeat) !==
      serializeCanonicalJson(taskInput.timingBeat) ||
    resolveSceneViewport(requirements.readabilityPolicy).viewportFingerprint !==
      taskInput.sceneViewport.viewportFingerprint ||
    timing.fps !== render.fps
  )
    throw new Error("Scene preview fixed inputs differ from its frozen task.");

  const publicFiles: PreviewFile[] = [];
  const readPublic = async (path: string, expected: Sha256Digest) => {
    if (!path.startsWith("public/"))
      throw new Error("Scene preview media must be a local public asset.");
    const existing = publicFiles.find((file) => file.path === path);
    if (existing) {
      if (existing.checksum !== expected)
        throw new Error("Scene preview media identities conflict.");
      return existing;
    }
    let file: PreviewFile;
    try {
      file = await readOwnedFile(rootDir, path);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" ||
        rootDir === runtimeRootDir ||
        path.startsWith("public/projects/")
      )
        throw error;
      file = await readOwnedFile(runtimeRootDir, path);
    }
    if (file.checksum !== expected)
      throw new Error(`Scene preview media checksum drifted: ${path}.`);
    publicFiles.push(file);
    return file;
  };
  for (const { descriptor } of snapshot.resources) {
    if (descriptor.kind === "asset")
      await readPublic(descriptor.localPath, descriptor.checksum);
  }
  let narrationAudio: null | Readonly<{
    publicPath: string;
    trimBefore: number;
    trimAfter: number;
  }> = null;
  if (taskInput.storyBeat.kind === "narrated-scene") {
    if (!sealedNarration || timing.narrationStartFrame === null)
      throw new Error("Narrated preview requires fixed narration timing.");
    const master = MasteredNarrationManifestSchema.parse(masteredManifest);
    if (
      master.storyId !== taskInput.storyId ||
      master.sealedNarrationFingerprint !==
        sealedNarration.sealedNarrationFingerprint ||
      serializeCanonicalJson(master.sourceAudio) !==
        serializeCanonicalJson(sealedNarration.completeAudio) ||
      !master.outputAudio.localPath.startsWith(
        `public/projects/${taskInput.storyId}/`,
      )
    ) {
      throw new Error(
        "Scene preview narration master is cross-bound or stale.",
      );
    }
    const audio = await readPublic(
      master.outputAudio.localPath,
      master.outputAudio.checksum,
    );
    const measurement = measureCanonicalPcmWav(Buffer.from(audio.bytes));
    if (
      measurement.sampleFrameCount !== master.outputAudio.sampleFrameCount ||
      serializeCanonicalJson(measurement.pcm) !==
        serializeCanonicalJson(master.outputAudio.pcm)
    ) {
      throw new Error("Scene preview narration sample count drifted.");
    }
    narrationAudio = {
      publicPath: master.outputAudio.localPath,
      trimBefore: taskInput.timingBeat.startFrame - timing.narrationStartFrame,
      trimAfter: taskInput.timingBeat.endFrame - timing.narrationStartFrame,
    };
  }
  const captionCues = timing.captionCues
    .filter(({ meaningId }) => meaningId === taskInput.meaningId)
    .map((cue) => ({
      ...cue,
      startFrame: cue.startFrame - taskInput.timingBeat.startFrame,
      endFrame: cue.endFrame - taskInput.timingBeat.startFrame,
    }));
  const frames = resolveSceneSoundContributions({
    soundPlan: snapshot.soundPlan,
    syncAnchors: snapshot.syncAnchors,
  });
  const sceneSounds = snapshot.soundPlan.contributions.map(
    (contribution, index) => {
      const resource = snapshot.resources.find(
        ({ selected }) =>
          selected.resourceId === contribution.resource.resourceId,
      );
      const resolvedFrames = frames[index];
      if (!resource || resource.descriptor.kind !== "asset" || !resolvedFrames)
        throw new Error("Scene preview sound resource is missing.");
      return {
        ...resolvedFrames,
        publicPath: resource.descriptor.localPath,
        volume: contribution.volume,
        loop: false,
      };
    },
  );
  return {
    render,
    readabilityPolicy: requirements.readabilityPolicy,
    captionCues,
    narrationAudio,
    sceneSounds,
    publicFiles,
    fixedInputFingerprint: createFingerprint({
      namespace: "scene-task-preview-fixed-inputs",
      version: 1,
      value: [...fixedFiles, ...publicFiles]
        .map(({ path, checksum, sizeBytes }) => ({ path, checksum, sizeBytes }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    }),
  };
};

export const resolveSceneTaskPreviewSize = (
  render: Pick<RenderSpec, "width" | "height">,
) => {
  let scale = 1;
  while (
    Math.max(render.width, render.height) * scale > 960 &&
    Math.min(render.width, render.height) * scale >= 8
  )
    scale /= 2;
  const even = (dimension: number) =>
    Math.max(2, Math.floor(Math.round(dimension * scale) / 2) * 2);
  return { scale, width: even(render.width), height: even(render.height) };
};

export const buildSceneTaskPreviewEntry = ({
  snapshot,
  inputs,
}: {
  readonly snapshot: Awaited<ReturnType<typeof readSceneTaskPreviewSnapshot>>;
  readonly inputs: Awaited<ReturnType<typeof loadSceneTaskPreviewInputs>>;
}) => {
  const { taskInput, visualStyle } = snapshot;
  const durationInFrames =
    taskInput.timingBeat.endFrame - taskInput.timingBeat.startFrame;
  const props = {
    storyId: taskInput.storyId,
    meaningId: taskInput.meaningId,
    durationInFrames,
    fps: inputs.render.fps,
    viewportWidth: taskInput.sceneViewport.width,
    viewportHeight: taskInput.sceneViewport.height,
    storyBeat: taskInput.storyBeat,
    sourceReferences: taskInput.sourceReferences,
    timingBeat: taskInput.timingBeat,
    ...(taskInput.continuity.handoffs === undefined
      ? {}
      : { continuity: taskInput.continuity.handoffs }),
    visualStyle,
    visualPlan: snapshot.visualPlan,
    shots: snapshot.shots,
    syncAnchors: snapshot.syncAnchors,
    visualResources: snapshot.resources
      .filter(({ selected }) => selected.role === "scene-visual")
      .map(({ selected, descriptor }) => {
        if (
          descriptor.kind !== "asset" ||
          !descriptor.localPath.startsWith("public/")
        )
          throw new Error("Scene preview visual resource is not local.");
        return {
          resourceId: selected.resourceId,
          publicPath: descriptor.localPath,
          descriptorFingerprint: selected.descriptorFingerprint,
        };
      }),
  };
  return `import {AbsoluteFill, Audio, Composition, registerRoot, staticFile, useCurrentFrame} from "remotion";
import {CaptionLayer, SceneViewport, SoundContribution} from "@axmorf/studio/remotion";
import type {SceneRendererProps} from "@axmorf/studio/remotion";
import Renderer from "./source/src/Renderer";
const rawProps = ${serializeCanonicalJson(props)};
const props = {...rawProps, visualResources: rawProps.visualResources.map(({publicPath, ...resource}) => ({...resource, src: staticFile(publicPath.slice("public/".length))}))} as unknown as Omit<SceneRendererProps, "sceneFrame">;
const policy = ${serializeCanonicalJson(inputs.readabilityPolicy)};
const captions = ${serializeCanonicalJson(inputs.captionCues)};
const sounds = ${serializeCanonicalJson(inputs.sceneSounds)};
const narration = ${serializeCanonicalJson(inputs.narrationAudio)} as null | {publicPath: string; trimBefore: number; trimAfter: number};
const Preview = () => {
 const sceneFrame = useCurrentFrame();
 return <AbsoluteFill style={{backgroundColor: ${JSON.stringify(visualStyle.theme?.background ?? "#020617")}}}>
  <SceneViewport policy={policy}><Renderer {...props} sceneFrame={sceneFrame}/></SceneViewport>
  <CaptionLayer captionCues={captions} safeAreaPx={policy.captionSafeAreaPx} readabilityPolicy={policy}/>
  {narration === null ? null : <Audio src={staticFile(narration.publicPath.slice(7))} trimBefore={narration.trimBefore} trimAfter={narration.trimAfter}/>}
  {sounds.map(contribution => <SoundContribution key={contribution.contributionId} contribution={contribution}/>)}
 </AbsoluteFill>;
};
registerRoot(() => <Composition id="BoundScenePreview" component={Preview} durationInFrames={${durationInFrames}} fps={${inputs.render.fps}} width={${inputs.render.width}} height={${inputs.render.height}}/>);
`;
};

const ensurePreviewDirectory = async (rootDir: string, path: string) => {
  containedPath(rootDir, path);
  let current = rootDir;
  for (const segment of path.split("/")) {
    current = join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error("Scene preview output parent must be a real directory.");
  }
  return current;
};

export const renderSceneTaskPreview = async ({
  rootDir,
  runtimeRootDir,
  task,
  snapshot,
  attemptId,
  assertSourceCurrent,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir: string;
  readonly task: ProducerTaskSpec;
  readonly snapshot: Awaited<ReturnType<typeof readSceneTaskPreviewSnapshot>>;
  readonly attemptId: string;
  readonly assertSourceCurrent: () => Promise<void>;
  readonly runProcess?: ProcessRunner;
}) => {
  const inputs = await loadSceneTaskPreviewInputs({
    rootDir,
    runtimeRootDir,
    snapshot,
  });
  const parent = await ensurePreviewDirectory(
    rootDir,
    `out/${task.storyId}/task-preview/${task.taskRevision}`,
  );
  const directory = await mkdtemp(join(parent, "preview-"));
  try {
    const write = async (path: string, bytes: Uint8Array | string) => {
      const target = containedPath(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    };
    for (const file of snapshot.files)
      await write(`source/${file.path}`, file.bytes);
    for (const file of inputs.publicFiles) await write(file.path, file.bytes);
    await write("index.tsx", buildSceneTaskPreviewEntry({ snapshot, inputs }));
    await mkdir(join(directory, "public"), { recursive: true });
    const size = resolveSceneTaskPreviewSize(inputs.render);
    const durationInFrames =
      snapshot.taskInput.timingBeat.endFrame -
      snapshot.taskInput.timingBeat.startFrame;
    const invocation = await resolveRemotionCliInvocation(runtimeRootDir);
    const videoPath = join(directory, "preview.mp4");
    const rendered = await runProcess(
      invocation.command,
      [
        ...invocation.argsPrefix,
        "render",
        join(directory, "index.tsx"),
        "BoundScenePreview",
        videoPath,
        "--codec=h264",
        "--audio-codec=aac",
        "--pixel-format=yuv420p",
        "--log=error",
        "--concurrency=1",
        `--scale=${size.scale}`,
        `--frames=0-${durationInFrames - 1}`,
        `--public-dir=${join(directory, "public")}`,
      ],
      { cwd: runtimeRootDir },
    );
    if (rendered.status !== 0)
      throw new Error("Remotion could not render the bound Scene preview.");
    const video = await readOwnedFile(directory, "preview.mp4");
    if (video.sizeBytes === 0)
      throw new Error("Scene preview must be a non-empty regular MP4.");
    const probeCommand = await resolveMediaToolCommand({
      rootDir: runtimeRootDir,
      tool: "ffprobe",
      args: [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,r_frame_rate,nb_read_frames",
        "-of",
        "json",
        videoPath,
      ],
    });
    const probed = await runProcess(probeCommand.command, probeCommand.args, {
      cwd: runtimeRootDir,
    });
    if (probed.status !== 0)
      throw new Error("Scene preview metadata could not be inspected.");
    const stream = z
      .object({
        streams: z
          .array(
            z.object({
              codec_name: z.literal("h264"),
              width: z.literal(size.width),
              height: z.literal(size.height),
              r_frame_rate: z.string(),
              nb_read_frames: z.string(),
            }),
          )
          .length(1),
      })
      .parse(JSON.parse(probed.stdout)).streams[0]!;
    const [numerator, denominator] = stream.r_frame_rate.split("/").map(Number);
    if (
      !denominator ||
      !numerator ||
      numerator / denominator !== inputs.render.fps ||
      Number(stream.nb_read_frames) !== durationInFrames
    )
      throw new Error(
        "Scene preview fps or complete Scene frame count drifted.",
      );
    const decodeCommand = await resolveMediaToolCommand({
      rootDir: runtimeRootDir,
      tool: "ffmpeg",
      // The bundled FFmpeg lacks the null muxer's default wrapped_avframe
      // encoder. Decode both streams with its supported raw codecs, as delivery does.
      args: [
        "-v",
        "error",
        "-xerror",
        "-i",
        videoPath,
        "-c:v",
        "rawvideo",
        "-c:a",
        "pcm_s16le",
        "-f",
        "null",
        "-",
      ],
    });
    const decoded = await runProcess(
      decodeCommand.command,
      decodeCommand.args,
      { cwd: runtimeRootDir },
    );
    if (decoded.status !== 0)
      throw new Error("Scene preview did not decode completely to EOF.");
    await assertSourceCurrent();
    const latestInputs = await loadSceneTaskPreviewInputs({
      rootDir,
      runtimeRootDir,
      snapshot,
    });
    if (latestInputs.fixedInputFingerprint !== inputs.fixedInputFingerprint)
      throw new Error(
        "Scene preview fixed inputs or media changed during rendering.",
      );
    const logical = (path: string) => {
      const value = relative(resolve(runtimeRootDir), path)
        .split(sep)
        .join("/");
      return ProducerLogicalPathSchema.parse(value);
    };
    const result = {
      videoPath: logical(videoPath),
      manifestPath: logical(join(directory, "preview.json")),
      checksum: video.checksum,
      width: size.width,
      height: size.height,
      scale: size.scale,
      fps: inputs.render.fps,
      frameCount: durationInFrames,
      decodedToEof: true as const,
      narration:
        inputs.narrationAudio === null
          ? ("not-applicable" as const)
          : ("included" as const),
      captions: "top-level-caption-layer" as const,
      sceneSoundCount: inputs.sceneSounds.length,
      fixedInputFingerprint: inputs.fixedInputFingerprint,
    };
    await write(
      "preview.json",
      `${serializeCanonicalJson({ schemaVersion: 1, status: "scene-task-preview-complete", storyId: task.storyId, taskRevision: task.taskRevision, attemptId, sourceFingerprint: snapshot.sourceFingerprint, reviewStatus: "needs-temporal-review", ...result })}\n`,
    );
    return result;
  } catch (error) {
    // Only this newly created diagnostic directory is owned by the adapter.
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};
