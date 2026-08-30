import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  buildProducerTaskSpec,
  computeGenerationInputFingerprint,
  createFingerprint,
  MasteredNarrationManifestSchema,
  NarrationPreparationReceiptSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type MasteredNarrationManifest,
  type ProducerTaskSpec,
  type ProductionRevisionId,
  type SealedNarrationManifest,
  type SemanticTiming,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import { resolveProducerNarrationExecution } from "../../config/narration-execution";
import { checkM2NarrationArtifacts } from "../../narration/check";
import { runNarrationGeneration } from "../../narration/generate-runner";
import type { NarrationGenerationProgress } from "../../narration/domain/candidate-progress";
import { writeMasteredNarrationArtifacts } from "../../narration/mastering";
import { loadNarrationProjectFiles } from "../../narration/project-files";
import { createChunkAudioGenerator } from "../../narration/adapters/provider-dispatcher";
import { normalizeProviderAudio } from "../../narration/adapters/ffmpeg-normalizer";
import {
  loadVerifiedProgress,
  readCandidateBytes,
} from "../../narration/adapters/candidate-workspace";
import { runNarrationSeal } from "../../narration/seal-runner";
import { writeJsonAtomic } from "../../narration/adapters/atomic-files";
import {
  inspectArtifact,
  commitTaskArtifact,
} from "../adapters/artifact-store";
import { createTaskWorkspace } from "../adapters/task-workspace";
import {
  checksumBytes,
  readRegularBytes,
} from "../adapters/project-input-snapshot";
import { isTemplateSceneLiveProjectionPath } from "../domain/template-scene-output";
import { checkTaskByKind } from "./check-task";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "./production-scope";

export type PreparedNarrationInputs = Readonly<{
  providerAttemptFingerprint: Sha256Digest;
  masteringPolicy: MasteredNarrationManifest["masteringPolicy"];
  sealedNarration: SealedNarrationManifest;
  semanticTiming: SemanticTiming;
  masteredNarration: MasteredNarrationManifest;
  sealedManifestBytes: Uint8Array;
  semanticTimingBytes: Uint8Array;
  masteredManifestBytes: Uint8Array;
  completeAudioBytes: Uint8Array;
  masteredAudioBytes: Uint8Array;
  chunkAudioBytes: ReadonlyMap<string, Uint8Array>;
  actualCost: Readonly<{
    providerRequests: number;
    providerCacheHits: number;
  }>;
}>;

export type PrepareNarration = (input: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly scope?: ProductionScope;
}) => Promise<PreparedNarrationInputs>;

const readJsonBytes = async <T>(
  path: string,
  schema: { readonly parse: (raw: unknown) => T },
  label: string,
) => {
  const bytes = await readRegularBytes(path, label);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
  return { bytes, value: schema.parse(raw) } as const;
};

const readExistingSeal = async (path: string) => {
  try {
    return SealedNarrationManifestSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

export const sealedNarrationMatchesMeasuredProgress = ({
  sealedNarration,
  progress,
}: {
  readonly sealedNarration: SealedNarrationManifest;
  readonly progress: NarrationGenerationProgress;
}) => {
  const measuredById = new Map(
    progress.chunks.flatMap((chunk) =>
      chunk.stage === "measured" ? [[chunk.chunkId, chunk] as const] : [],
    ),
  );
  const sealedChunks = sealedNarration.segments.filter(
    (segment) => segment.kind === "chunk",
  );
  return (
    measuredById.size === sealedChunks.length &&
    sealedChunks.every(
      (segment) =>
        measuredById.get(segment.chunkId)?.normalizedChecksum ===
        segment.checksum,
    )
  );
};

export const buildNarrationChunkTask = ({
  storyId,
  revisionId,
  narrationFingerprint,
  providerAttemptFingerprint,
  chunk,
}: {
  readonly storyId: string;
  readonly revisionId: ProductionRevisionId;
  readonly narrationFingerprint: Sha256Digest;
  readonly providerAttemptFingerprint: Sha256Digest;
  readonly chunk: Readonly<{
    chunkId: string;
    meaningId: string;
    ttsText: string;
  }>;
}) => {
  const chunkInput = {
    chunkId: chunk.chunkId,
    meaningId: chunk.meaningId,
    ttsText: chunk.ttsText,
  };
  const context = contextFile({
    ...chunkInput,
    normalizationPolicy: "pcm-s16le-normalize-v1",
  });
  return {
    task: buildProducerTaskSpec({
      taskKind: "narration-chunk",
      storyId,
      semanticId: null,
      revisionId,
      dependencyArtifacts: [],
      inputFingerprints: [
        { id: "narration", fingerprint: narrationFingerprint },
        { id: "provider-attempt", fingerprint: providerAttemptFingerprint },
        {
          id: "read:inputs/context.json",
          fingerprint: context.fingerprint,
        },
        {
          id: "tts-chunk",
          fingerprint: createFingerprint({
            namespace: "producer-narration-chunk-input",
            version: 1,
            value: chunkInput,
          }),
        },
      ].sort((left, right) => left.id.localeCompare(right.id)),
      declaredReadSet: ["inputs/context.json"],
      declaredOutputSet: ["public/chunk.wav"],
      validatorPolicyVersion: "narration-chunk-validator-v1",
    }),
    contextBytes: context.bytes,
  } as const;
};

/**
 * The fixed prepare intentionally reuses the existing narration implementation.
 * It never retries or selects a fallback provider: one authored chunk maps to the
 * provider request/cache entry already defined by scripts/narration.
 */
export const prepareNarrationInputs: PrepareNarration = async ({
  rootDir,
  projectId,
  env,
  scope: suppliedScope,
}) => {
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  if (scope.repositoryRoot !== rootDir || scope.storyId !== projectId) {
    throw new Error("Narration preparation scope is cross-bound.");
  }
  const contentRoot = scope.isolatedRoot;
  const { projectSource } = await loadNarrationProjectFiles({
    rootDir: contentRoot,
    projectId,
  });
  const execution = await resolveProducerNarrationExecution({
    rootDir: scope.shared.runtimeRoot,
    env,
    narration: projectSource.narration,
  });
  const workRoot = scope.narrationWorkRoot;
  let current = true;
  let actualCost = {
    providerRequests: 0,
    providerCacheHits: 0,
  };
  try {
    await checkM2NarrationArtifacts({ rootDir: contentRoot, projectSource });
    const progress = await loadVerifiedProgress({
      rootDir: workRoot,
      storyId: projectId,
      generationInputFingerprint: computeGenerationInputFingerprint(
        projectSource.story,
        projectSource.narration,
      ),
      providerAttemptFingerprint: execution.snapshot.providerAttemptFingerprint,
    });
    const activeSeal = await readExistingSeal(
      join(
        contentRoot,
        "src/projects",
        projectId,
        "generated/sealed-narration.generated.json",
      ),
    );
    if (
      activeSeal === undefined ||
      !sealedNarrationMatchesMeasuredProgress({
        sealedNarration: activeSeal,
        progress,
      })
    ) {
      current = false;
    }
  } catch {
    current = false;
  }
  if (!current) {
    const result = await runNarrationGeneration({
      rootDir: workRoot,
      story: projectSource.story,
      narration: projectSource.narration,
      providerAttemptFingerprint: execution.snapshot.providerAttemptFingerprint,
      generateChunk: createChunkAudioGenerator({
        resolved: execution.resolved,
      }),
      normalizePcm: (sourceBytes) =>
        normalizeProviderAudio({
          sourceBytes,
          speechRate: execution.snapshot.speechRate,
        }),
    });
    actualCost = {
      providerRequests: result.generatedChunkCount,
      providerCacheHits: result.reusedChunkCount + result.normalizedChunkCount,
    };
    const progress = await loadVerifiedProgress({
      rootDir: workRoot,
      storyId: projectId,
      generationInputFingerprint: result.generationInputFingerprint,
      providerAttemptFingerprint: result.providerAttemptFingerprint,
    });
    const normalizedChunks = new Map<string, Buffer>();
    for (const chunk of progress.chunks) {
      if (chunk.stage !== "measured") {
        throw new Error(
          "Narration fixed prepare did not produce every measured chunk.",
        );
      }
      normalizedChunks.set(
        chunk.chunkId,
        await readCandidateBytes({
          rootDir: workRoot,
          progress,
          relativePath: chunk.normalizedRelativePath,
        }),
      );
    }
    const sealPath = join(
      contentRoot,
      "src/projects",
      projectId,
      "generated/sealed-narration.generated.json",
    );
    const existing = await readExistingSeal(sealPath);
    await runNarrationSeal({
      rootDir: contentRoot,
      projectSource,
      progress,
      normalizedChunks,
      ...(existing === undefined
        ? {}
        : { supersedeFingerprint: existing.sealedNarrationFingerprint }),
    });
  }
  await writeMasteredNarrationArtifacts({
    rootDir: contentRoot,
    storyId: projectId,
    targetLoudnessLufs:
      execution.snapshot.masteringPolicy.targetIntegratedLoudnessLufs,
  });
  await checkM2NarrationArtifacts({ rootDir: contentRoot, projectSource });

  const generatedRoot = join(
    contentRoot,
    "src/projects",
    projectId,
    "generated",
  );
  const sealed = await readJsonBytes(
    join(generatedRoot, "sealed-narration.generated.json"),
    SealedNarrationManifestSchema,
    "sealed narration",
  );
  const timing = await readJsonBytes(
    join(generatedRoot, "semantic-timing.generated.json"),
    SemanticTimingSchema,
    "semantic timing",
  );
  const mastered = await readJsonBytes(
    join(generatedRoot, "mastered-narration.generated.json"),
    MasteredNarrationManifestSchema,
    "mastered narration",
  );
  if (
    serializeCanonicalJson(mastered.value.masteringPolicy) !==
    serializeCanonicalJson(execution.snapshot.masteringPolicy)
  ) {
    throw new Error(
      "Mastered narration policy is stale against producer configuration.",
    );
  }
  const chunkAudioBytes = new Map<string, Uint8Array>();
  for (const segment of sealed.value.segments) {
    if (segment.kind === "chunk") {
      chunkAudioBytes.set(
        segment.chunkId,
        await readRegularBytes(
          join(contentRoot, segment.localPath),
          segment.chunkId,
        ),
      );
    }
  }
  if (current) {
    actualCost = {
      providerRequests: 0,
      providerCacheHits: chunkAudioBytes.size,
    };
  }
  const completeAudioBytes = await readRegularBytes(
    join(contentRoot, sealed.value.completeAudio.localPath),
    "sealed complete narration",
  );
  const masteredAudioBytes = await readRegularBytes(
    join(contentRoot, mastered.value.outputAudio.localPath),
    "mastered narration audio",
  );
  const preparationReceipt = NarrationPreparationReceiptSchema.parse({
    schemaVersion: 1,
    contractVersion: "narration-preparation-v1",
    storyId: projectId,
    generationInputFingerprint: sealed.value.generationInputFingerprint,
    providerAttemptFingerprint: execution.snapshot.providerAttemptFingerprint,
    sealedNarrationFingerprint: sealed.value.sealedNarrationFingerprint,
    masteringPolicy: mastered.value.masteringPolicy,
  });
  await writeJsonAtomic({
    destination: join(generatedRoot, "narration-preparation.generated.json"),
    value: preparationReceipt,
  });
  return {
    providerAttemptFingerprint: execution.snapshot.providerAttemptFingerprint,
    masteringPolicy: execution.snapshot.masteringPolicy,
    sealedNarration: sealed.value,
    semanticTiming: timing.value,
    masteredNarration: mastered.value,
    sealedManifestBytes: sealed.bytes,
    semanticTimingBytes: timing.bytes,
    masteredManifestBytes: mastered.bytes,
    completeAudioBytes,
    masteredAudioBytes,
    chunkAudioBytes,
    actualCost,
  };
};

const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;

const readWorkspaceFile = async (path: string) => {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

/** Commit a deterministic fixed task without overwriting a raced workspace. */
export const ensureFixedTaskArtifact = async ({
  rootDir,
  task,
  files,
  workspaceRootDir = rootDir,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly files: Readonly<Record<string, Uint8Array | string>>;
  readonly workspaceRootDir?: string;
}): Promise<ArtifactAttestation> => {
  const existing = await inspectArtifact({ rootDir, task });
  if (existing !== null) {
    const expectedOutputs = new Map(
      task.declaredOutputSet.map((logicalPath) => {
        const bytes = files[logicalPath];
        if (bytes === undefined) {
          throw new Error("Fixed task output bytes are incomplete.");
        }
        return [logicalPath, checksum(bytes)] as const;
      }),
    );
    if (
      existing.outputManifest.some(
        ({ logicalPath, checksum: currentChecksum }) =>
          expectedOutputs.get(logicalPath) !== currentChecksum,
      )
    ) {
      throw new Error("Artifact identity has conflicting output bytes.");
    }
    return existing;
  }
  const workspace = await createTaskWorkspace({
    rootDir: workspaceRootDir,
    task,
    seedFiles: files,
  });
  for (const [logicalPath, expected] of Object.entries(files)) {
    const path = join(workspace, logicalPath);
    const current = await readWorkspaceFile(path);
    if (current === null) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, expected, { flag: "wx" });
    } else if (checksum(current) !== checksum(expected)) {
      throw new Error("Fixed task workspace has conflicting bytes.");
    }
  }
  await checkTaskByKind({
    rootDir: workspaceRootDir,
    taskRevision: task.taskRevision,
    runtimeRootDir: rootDir,
  });
  const committed = await commitTaskArtifact({ rootDir, task, workspace });
  if (committed.attestation === null) {
    throw new Error(
      "Fixed task artifact commit did not produce an attestation.",
    );
  }
  return committed.attestation;
};

export const contextFile = (value: unknown) => {
  const bytes = `${serializeCanonicalJson(value)}\n`;
  return {
    bytes,
    fingerprint: checksumBytes(new TextEncoder().encode(bytes)),
  } as const;
};

const collectRegularFiles = async (
  root: string,
  directory = root,
): Promise<Readonly<Record<string, Uint8Array>>> => {
  let metadata;
  try {
    metadata = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Fixed task source root is unsafe.");
  }
  const files: Record<string, Uint8Array> = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error("Fixed task source contains a non-regular entry.");
    }
    if (entry.isDirectory()) {
      Object.assign(files, await collectRegularFiles(root, path));
    } else {
      files[relative(root, path).split(sep).join("/")] = Uint8Array.from(
        await readFile(path),
      );
    }
  }
  return files;
};

export const readTemplateSceneFiles = async ({
  rootDir,
  projectId,
  meaningId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly meaningId: string;
}) => {
  const source = await collectRegularFiles(
    join(rootDir, "src/projects", projectId, "scenes", meaningId),
  );
  const publicFiles = await collectRegularFiles(
    join(rootDir, "public/projects", projectId, "scenes", meaningId),
  );
  return Object.fromEntries(
    [
      ...Object.entries(source).map(
        ([path, bytes]) => [`src/${path}`, bytes] as const,
      ),
      ...Object.entries(publicFiles).map(
        ([path, bytes]) => [`public/${path}`, bytes] as const,
      ),
    ]
      .filter(([path]) => !isTemplateSceneLiveProjectionPath(path))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
};
