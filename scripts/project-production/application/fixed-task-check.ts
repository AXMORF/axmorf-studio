import { readFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { z } from "zod";
import ts from "typescript";

import {
  MasteredNarrationManifestSchema,
  NarrationMasteringPolicySchema,
  NarrationSpecSchema,
  ProjectSoundPlanSchema,
  RenderSpecSchema,
  SceneTemplateInstanceSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StoryBeatSchema,
  StorySpecSchema,
  computeGenerationInputFingerprint,
  createFingerprint,
  serializeCanonicalJson,
  type ProducerTaskSpec,
} from "../../../src/contracts";
import {
  measureCanonicalPcmWav,
  sha256Bytes,
} from "../../narration/domain/pcm-wav";
import { readTaskWorkspace } from "../adapters/task-workspace";
import {
  expectedTemplateSceneOutputSet,
  toTemplateSceneWorkspacePath,
} from "../domain/template-scene-output";
import { checkProducerTaskWorkspace } from "./task-check";
import { checkSceneTask } from "./scene-task-check";

const FIXED_TASK_KINDS = [
  "narration-chunk",
  "narration-seal",
  "semantic-timing",
  "composition-convergence",
] as const;

type FixedTaskKind = (typeof FIXED_TASK_KINDS)[number];

const policies: Readonly<Record<FixedTaskKind, string>> = {
  "narration-chunk": "narration-chunk-validator-v1",
  "narration-seal": "narration-seal-validator-v1",
  "semantic-timing": "semantic-timing-validator-v1",
  "composition-convergence": "composition-convergence-validator-v1",
};

const outputs: Readonly<Record<FixedTaskKind, readonly string[]>> = {
  "narration-chunk": ["public/chunk.wav"],
  "narration-seal": [
    "project/generated/sealed-narration.generated.json",
    "public/complete.wav",
  ],
  "semantic-timing": [
    "project/generated/mastered-narration.generated.json",
    "project/generated/semantic-timing.generated.json",
    "public/mastered-complete.wav",
  ],
  "composition-convergence": ["project/convergence.json"],
};

const requiredInputIds: Readonly<Record<FixedTaskKind, readonly string[]>> = {
  "narration-chunk": [
    "narration",
    "provider-attempt",
    "read:inputs/context.json",
    "tts-chunk",
  ],
  "narration-seal": ["generation-input", "read:inputs/context.json"],
  "semantic-timing": ["mastering-policy", "read:inputs/context.json", "render"],
  "composition-convergence": [
    "read:inputs/context.json",
    "render",
    "runtime",
    "sound",
    "story",
    "style",
  ],
};

const ChunkContextSchema = z
  .object({
    chunkId: z.string().min(1),
    meaningId: z.string().min(1),
    ttsText: z.string().trim().min(1),
    normalizationPolicy: z.literal("pcm-s16le-normalize-v1"),
  })
  .strict();

const SealContextSchema = z
  .object({
    story: StorySpecSchema,
    narration: NarrationSpecSchema,
    assemblyPolicy: z.literal("ordered-pcm-concat-v1"),
  })
  .strict();

const TimingContextSchema = z
  .object({
    storyId: z.string().min(1),
    render: RenderSpecSchema,
    masteringPolicy: NarrationMasteringPolicySchema,
  })
  .strict();

const CompositionContextSchema = z
  .object({
    storyId: z.string().min(1),
    revisionId: z.string().min(1),
    render: RenderSpecSchema,
    sound: ProjectSoundPlanSchema,
  })
  .strict();

const ConvergenceResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("composition-convergence-result-v1"),
    storyId: z.string().min(1),
    revisionId: z.string().min(1),
    taskRevision: z.string().min(1),
    dependencyArtifacts: z.array(
      z
        .object({
          taskRevision: z.string().min(1),
          artifactFingerprint: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

const parseJson = async <T>(
  path: string,
  schema: { readonly parse: (raw: unknown) => T },
) => schema.parse(JSON.parse(await readFile(path, "utf8")));

const assertCanonicalContext = async <T>(
  path: string,
  schema: { readonly parse: (raw: unknown) => T },
) => {
  const text = await readFile(path, "utf8");
  const parsed = schema.parse(JSON.parse(text));
  if (text !== `${serializeCanonicalJson(parsed)}\n`) {
    throw new Error("Fixed task context must use canonical JSON bytes.");
  }
  return parsed;
};

const same = (left: unknown, right: unknown) =>
  serializeCanonicalJson(left) === serializeCanonicalJson(right);

const assertTaskShape = (task: ProducerTaskSpec, kind: FixedTaskKind) => {
  if (task.taskKind !== kind || task.semanticId !== null) {
    throw new Error("Fixed task identity is cross-bound.");
  }
  if (task.validatorPolicyVersion !== policies[kind]) {
    throw new Error("Fixed task validator policy is incompatible.");
  }
  if (!same(task.declaredReadSet, ["inputs/context.json"])) {
    throw new Error("Fixed task declared read set is invalid.");
  }
  if (!same(task.declaredOutputSet, [...outputs[kind]].sort())) {
    throw new Error("Fixed task declared output set is invalid.");
  }
  const actualInputIds = task.inputFingerprints.map(({ id }) => id);
  if (!same(actualInputIds, [...requiredInputIds[kind]].sort())) {
    throw new Error("Fixed task input bindings are incomplete.");
  }
};

const assertDependencyCount = (
  task: ProducerTaskSpec,
  expected: number | { readonly minimum: number },
) => {
  const valid =
    typeof expected === "number"
      ? task.dependencyArtifacts.length === expected
      : task.dependencyArtifacts.length >= expected.minimum;
  if (!valid) throw new Error("Fixed task dependency bindings are incomplete.");
};

const checkChunk = async (workspace: string, task: ProducerTaskSpec) => {
  assertDependencyCount(task, 0);
  await assertCanonicalContext(
    join(workspace, "inputs/context.json"),
    ChunkContextSchema,
  );
  const wav = await readFile(join(workspace, "public/chunk.wav"));
  const measured = measureCanonicalPcmWav(wav);
  if (measured.sampleFrameCount <= 0) {
    throw new Error("Narration chunk must contain measured PCM samples.");
  }
};

const checkSeal = async (workspace: string, task: ProducerTaskSpec) => {
  const context = await assertCanonicalContext(
    join(workspace, "inputs/context.json"),
    SealContextSchema,
  );
  if (context.story.storyId !== task.storyId) {
    throw new Error("Narration seal context is cross-bound.");
  }
  const manifest = await parseJson(
    join(workspace, "project/generated/sealed-narration.generated.json"),
    SealedNarrationManifestSchema,
  );
  const chunkCount = manifest.segments.filter(
    ({ kind }) => kind === "chunk",
  ).length;
  assertDependencyCount(task, chunkCount);
  if (
    manifest.storyId !== task.storyId ||
    !same(manifest.narrationSpec, context.narration) ||
    manifest.generationInputFingerprint !==
      computeGenerationInputFingerprint(context.story, context.narration) ||
    manifest.assemblyAlgorithmId !== context.assemblyPolicy
  ) {
    throw new Error("Narration seal output is cross-bound.");
  }
  const expectedSegments = context.story.beats.flatMap((beat) => {
    if (beat.kind === "silent-scene") return [];
    const pauses = new Map(
      beat.explicitPauses.map((pause) => [pause.afterChunkId, pause]),
    );
    return beat.ttsChunks.flatMap((chunk) => [
      {
        kind: "chunk" as const,
        chunkId: chunk.chunkId,
        meaningId: beat.meaningId,
        ttsText: chunk.ttsText,
      },
      ...(pauses.has(chunk.chunkId)
        ? [
            {
              kind: "pause" as const,
              afterChunkId: chunk.chunkId,
              meaningId: beat.meaningId,
              pauseMs: pauses.get(chunk.chunkId)?.pauseMs,
            },
          ]
        : []),
    ]);
  });
  const actualSegments = manifest.segments.map((segment) =>
    segment.kind === "chunk"
      ? {
          kind: segment.kind,
          chunkId: segment.chunkId,
          meaningId: segment.meaningId,
          ttsText: segment.ttsText,
        }
      : {
          kind: segment.kind,
          afterChunkId: segment.afterChunkId,
          meaningId: segment.meaningId,
          pauseMs: segment.pauseMs,
        },
  );
  if (!same(actualSegments, expectedSegments)) {
    throw new Error(
      "Narration seal segments do not match authored TTS chunks.",
    );
  }
  const wav = await readFile(join(workspace, "public/complete.wav"));
  const measured = measureCanonicalPcmWav(wav);
  if (
    sha256Bytes(wav) !== manifest.completeAudio.checksum ||
    measured.sampleFrameCount !== manifest.completeAudio.sampleFrameCount ||
    !same(measured.pcm, manifest.completeAudio.pcm)
  ) {
    throw new Error("Narration seal WAV does not match its manifest.");
  }
};

const checksum = (bytes: Uint8Array) => sha256Bytes(Buffer.from(bytes));

const sceneSourcePrefix = (task: ProducerTaskSpec) =>
  `src/projects/${task.storyId}/scenes/${task.semanticId ?? ""}/`;
const relativeImports = (sourcePath: string, source: string) => {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith(".")
    ) {
      imports.push(statement.moduleSpecifier.text);
    }
  }
  return imports;
};

const resolveTemplateImport = (
  importer: string,
  specifier: string,
  available: ReadonlySet<string>,
) => {
  const base = posix.normalize(posix.join(dirname(importer), specifier));
  const match = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ].find((candidate) => available.has(candidate));
  if (match === undefined) {
    throw new Error(
      "Scene template Renderer import is not bound inside its workspace.",
    );
  }
  return match;
};

export const checkSceneTemplateWorkspaceBinding = async ({
  workspace,
  task,
}: {
  readonly workspace: string;
  readonly task: ProducerTaskSpec;
}) => {
  if (task.taskKind !== "scene-template" || task.semanticId === null) {
    throw new Error("Task is not a Scene template task.");
  }
  const instance = await parseJson(
    join(workspace, "src/scene-template-instance.json"),
    SceneTemplateInstanceSchema,
  );
  if (
    instance.storyId !== task.storyId ||
    instance.meaningId !== task.semanticId
  ) {
    throw new Error("Scene template instance is cross-bound.");
  }
  const rawContext = JSON.parse(
    await readFile(join(workspace, "inputs/context.json"), "utf8"),
  ) as { readonly scene?: { readonly beat?: unknown } };
  const beat = StoryBeatSchema.parse(rawContext.scene?.beat);
  if (
    beat.kind !== "silent-scene" ||
    beat.meaningId !== task.semanticId ||
    beat.preset.implementation.kind !== "template-copy" ||
    beat.preset.durationInFrames !== instance.durationInFrames ||
    beat.preset.visualIntent !== instance.visualIntent ||
    beat.preset.soundIntent !== instance.soundIntent ||
    !same(beat.preset.resourceIds, instance.resourceIds) ||
    beat.preset.implementation.templateId !== instance.templateId ||
    beat.preset.implementation.templateFingerprint !==
      instance.templateFingerprint ||
    beat.preset.implementation.instanceFingerprint !==
      instance.instanceFingerprint ||
    beat.preset.implementation.rendererSourceFingerprint !==
      instance.rendererSourceGraphFingerprint ||
    !same(beat.preset.implementation.soundCues, instance.soundCues)
  ) {
    throw new Error(
      "Scene template instance does not match its frozen StoryBeat.",
    );
  }
  const copied = [...instance.copiedSourceFiles, ...instance.copiedAssetFiles];
  const mapped = new Map<
    string,
    { readonly repositoryPath: string; readonly bytes: Buffer }
  >();
  for (const file of copied) {
    const logicalPath = toTemplateSceneWorkspacePath({
      storyId: task.storyId,
      meaningId: task.semanticId,
      repositoryPath: file.repositoryPath,
    });
    if (
      !task.declaredOutputSet.includes(logicalPath) ||
      mapped.has(file.repositoryPath)
    ) {
      throw new Error("Scene template copied file set is stale.");
    }
    const bytes = await readFile(join(workspace, logicalPath));
    if (checksum(bytes) !== file.checksum) {
      throw new Error(
        `Scene template copied file checksum drifted: ${logicalPath}.`,
      );
    }
    mapped.set(file.repositoryPath, {
      repositoryPath: file.repositoryPath,
      bytes,
    });
  }
  const expectedOutputs = expectedTemplateSceneOutputSet({
    storyId: task.storyId,
    meaningId: task.semanticId,
    copiedRepositoryPaths: copied.map(({ repositoryPath }) => repositoryPath),
  });
  if (!same(task.declaredOutputSet, expectedOutputs)) {
    throw new Error(
      "Scene template copied file set does not match task outputs.",
    );
  }
  const rendererPath = `${sceneSourcePrefix(task)}Renderer.tsx`;
  if (!mapped.has(rendererPath)) {
    throw new Error(
      "Scene template Renderer is missing from copied source files.",
    );
  }
  const available = new Set(
    instance.copiedSourceFiles.map(({ repositoryPath }) => repositoryPath),
  );
  const pending = [rendererPath];
  const graph = new Map<string, Buffer>();
  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (sourcePath === undefined || graph.has(sourcePath)) continue;
    const file = mapped.get(sourcePath);
    if (file === undefined) {
      throw new Error(
        "Scene template Renderer graph escapes copied source files.",
      );
    }
    graph.set(sourcePath, file.bytes);
    const source = file.bytes.toString("utf8");
    for (const specifier of relativeImports(sourcePath, source)) {
      pending.push(resolveTemplateImport(sourcePath, specifier, available));
    }
  }
  const files = [...graph]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, bytes]) => ({ sourcePath, checksum: checksum(bytes) }));
  const graphFingerprint = createFingerprint({
    namespace: "renderer-source-graph",
    version: 1,
    value: { rendererPath, files },
  });
  if (graphFingerprint !== instance.rendererSourceGraphFingerprint) {
    throw new Error("Scene template Renderer source graph is stale.");
  }
  return instance;
};

export const checkSceneTemplateTask = async (
  input: Parameters<typeof checkProducerTaskWorkspace>[0],
) => {
  const checked = await checkSceneTask(input);
  await checkSceneTemplateWorkspaceBinding({
    workspace: checked.workspace,
    task: checked.task,
  });
  return checked;
};

const checkTiming = async (workspace: string, task: ProducerTaskSpec) => {
  assertDependencyCount(task, 1);
  const context = await assertCanonicalContext(
    join(workspace, "inputs/context.json"),
    TimingContextSchema,
  );
  const mastered = await parseJson(
    join(workspace, "project/generated/mastered-narration.generated.json"),
    MasteredNarrationManifestSchema,
  );
  const timing = await parseJson(
    join(workspace, "project/generated/semantic-timing.generated.json"),
    SemanticTimingSchema,
  );
  if (
    context.storyId !== task.storyId ||
    mastered.storyId !== task.storyId ||
    timing.storyId !== task.storyId ||
    !same(mastered.masteringPolicy, context.masteringPolicy) ||
    timing.fps !== context.render.fps ||
    timing.leadInFrames !== context.render.leadInFrames ||
    timing.tailFrames !== context.render.tailFrames ||
    timing.sampleRate !== mastered.outputAudio.pcm.sampleRate
  ) {
    throw new Error("Semantic timing output is cross-bound.");
  }
  const lastSegment = timing.segments.at(-1);
  if (
    lastSegment === undefined ||
    lastSegment.sampleRange.endSampleFrame !==
      mastered.outputAudio.sampleFrameCount
  ) {
    throw new Error("Semantic timing sample authority is stale.");
  }
  const wav = await readFile(join(workspace, "public/mastered-complete.wav"));
  const measured = measureCanonicalPcmWav(wav);
  if (
    sha256Bytes(wav) !== mastered.outputAudio.checksum ||
    measured.sampleFrameCount !== mastered.outputAudio.sampleFrameCount ||
    !same(measured.pcm, mastered.outputAudio.pcm)
  ) {
    throw new Error("Mastered narration WAV does not match its manifest.");
  }
};

const checkComposition = async (workspace: string, task: ProducerTaskSpec) => {
  assertDependencyCount(task, { minimum: 2 });
  const context = await assertCanonicalContext(
    join(workspace, "inputs/context.json"),
    CompositionContextSchema,
  );
  const result = await parseJson(
    join(workspace, "project/convergence.json"),
    ConvergenceResultSchema,
  );
  if (
    context.storyId !== task.storyId ||
    context.revisionId !== task.revisionId ||
    context.sound.storyId !== task.storyId ||
    result.storyId !== task.storyId ||
    result.revisionId !== task.revisionId ||
    result.taskRevision !== task.taskRevision ||
    !same(result.dependencyArtifacts, task.dependencyArtifacts)
  ) {
    throw new Error("Composition convergence output is cross-bound.");
  }
};

export const checkFixedTask = async (
  input: Parameters<typeof checkProducerTaskWorkspace>[0],
) => {
  const checked = await checkProducerTaskWorkspace(input);
  const { task, workspace } = await readTaskWorkspace(input);
  if (!FIXED_TASK_KINDS.includes(task.taskKind as FixedTaskKind)) {
    throw new Error("Task is not a fixed producer task.");
  }
  const kind = task.taskKind as FixedTaskKind;
  assertTaskShape(task, kind);
  if (kind === "narration-chunk") await checkChunk(workspace, task);
  else if (kind === "narration-seal") await checkSeal(workspace, task);
  else if (kind === "semantic-timing") await checkTiming(workspace, task);
  else await checkComposition(workspace, task);
  return checked;
};
