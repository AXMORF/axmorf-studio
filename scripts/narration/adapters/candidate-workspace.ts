import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import {
  CanonicalMeasuredChunkSchema,
  NarrationGenerationProgressSchema,
  RawNarrationCandidateSchema,
  type CanonicalMeasuredChunk,
  type NarrationGenerationExpected,
  type NarrationGenerationProgress,
  type RawNarrationCandidate,
  planChunkGeneration,
} from "../domain/candidate-progress";
import { decodeCanonicalPcmWav, sha256Bytes } from "../domain/pcm-wav";
import {
  Sha256DigestSchema,
  StoryIdSchema,
} from "@axmorf/studio/contracts";

const digestBody = (fingerprint: string): string =>
  Sha256DigestSchema.parse(fingerprint).slice("sha256:".length);

export const getNarrationWorkPaths = ({
  rootDir,
  storyId,
  generationInputFingerprint,
  providerAttemptFingerprint,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
}) => {
  const parsedStoryId = StoryIdSchema.parse(storyId);
  const attemptDirectory = join(
    rootDir,
    parsedStoryId,
    "generations-v2",
    digestBody(generationInputFingerprint),
    digestBody(providerAttemptFingerprint),
  );
  return {
    attemptDirectory,
    progressPath: join(attemptDirectory, "progress.json"),
  } as const;
};

const getChunkCachePaths = ({
  rootDir,
  storyId,
  providerAttemptFingerprint,
  requestFingerprint,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly providerAttemptFingerprint: string;
  readonly requestFingerprint: string;
}) => {
  const parsedStoryId = StoryIdSchema.parse(storyId);
  const cacheDirectory = join(
    rootDir,
    parsedStoryId,
    "chunk-cache-v1",
    digestBody(providerAttemptFingerprint),
    digestBody(requestFingerprint),
  );
  return {
    cacheDirectory,
    recordPath: join(cacheDirectory, "chunk.json"),
    lockPath: join(cacheDirectory, ".write.lock"),
  } as const;
};

export const getCandidateRelativePaths = ({
  chunkId,
  candidateId,
}: {
  readonly chunkId: string;
  readonly candidateId: string;
}) => {
  const candidateDigest = digestBody(candidateId);
  return {
    rawRelativePath: `candidates/${chunkId}/${candidateDigest}/raw.wav`,
    normalizedRelativePath: `candidates/${chunkId}/${candidateDigest}/normalized.wav`,
  } as const;
};

const resolveInsideAttempt = (
  attemptDirectory: string,
  relativePath: string,
): string => {
  const resolvedAttempt = resolve(attemptDirectory);
  const resolvedPath = resolve(attemptDirectory, relativePath);
  if (!resolvedPath.startsWith(`${resolvedAttempt}${sep}`)) {
    throw new Error("Narration candidate path escapes its attempt directory.");
  }
  return resolvedPath;
};

const readIfPresent = async (path: string): Promise<Buffer | undefined> => {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("Narration cache entry must be a regular file.");
    }
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

type VerifiedNarrationChunk = RawNarrationCandidate | CanonicalMeasuredChunk;

const parseChunkRecord = (bytes: Buffer): VerifiedNarrationChunk => {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error("Narration chunk cache record JSON is malformed.", {
      cause: error,
    });
  }
  const stage = (value as { readonly stage?: unknown } | null)?.stage;
  if (stage === "candidate") return RawNarrationCandidateSchema.parse(value);
  if (stage === "measured") return CanonicalMeasuredChunkSchema.parse(value);
  throw new Error("Narration chunk cache record stage is invalid.");
};

const assertChunkMatchesRequest = ({
  chunk,
  request,
}: {
  readonly chunk: VerifiedNarrationChunk;
  readonly request: NarrationGenerationExpected["chunks"][number];
}): void => {
  if (
    chunk.chunkId !== request.chunkId ||
    chunk.meaningId !== request.meaningId ||
    chunk.ttsText !== request.ttsText ||
    chunk.requestFingerprint !== request.requestFingerprint
  ) {
    throw new Error(
      `Narration chunk cache identity is stale for ${request.chunkId}.`,
    );
  }
};

const loadVerifiedCachedChunk = async ({
  rootDir,
  storyId,
  providerAttemptFingerprint,
  request,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly providerAttemptFingerprint: string;
  readonly request: NarrationGenerationExpected["chunks"][number];
}): Promise<VerifiedNarrationChunk | undefined> => {
  const paths = getChunkCachePaths({
    rootDir,
    storyId,
    providerAttemptFingerprint,
    requestFingerprint: request.requestFingerprint,
  });
  const recordBytes = await readIfPresent(paths.recordPath);
  if (recordBytes === undefined) return undefined;
  const chunk = parseChunkRecord(recordBytes);
  assertChunkMatchesRequest({ chunk, request });
  const expectedPaths = getCandidateRelativePaths({
    chunkId: chunk.chunkId,
    candidateId: chunk.candidateId,
  });
  if (chunk.rawRelativePath !== expectedPaths.rawRelativePath) {
    throw new Error("Narration raw candidate path is malformed.");
  }
  const rawBytes = await readIfPresent(
    resolveInsideAttempt(paths.cacheDirectory, chunk.rawRelativePath),
  );
  if (rawBytes === undefined || sha256Bytes(rawBytes) !== chunk.rawChecksum) {
    throw new Error("Narration chunk cache raw checksum is stale.");
  }
  if (chunk.stage === "candidate") return chunk;
  if (chunk.normalizedRelativePath !== expectedPaths.normalizedRelativePath) {
    throw new Error("Narration normalized candidate path is malformed.");
  }
  const normalizedBytes = await readIfPresent(
    resolveInsideAttempt(paths.cacheDirectory, chunk.normalizedRelativePath),
  );
  if (
    normalizedBytes === undefined ||
    sha256Bytes(normalizedBytes) !== chunk.normalizedChecksum
  ) {
    throw new Error("Narration chunk cache normalized checksum is stale.");
  }
  let measured;
  try {
    measured = decodeCanonicalPcmWav(normalizedBytes);
  } catch (error) {
    throw new Error("Narration chunk cache normalized PCM is invalid.", {
      cause: error,
    });
  }
  if (
    measured.sampleFrameCount !== chunk.sampleFrameCount ||
    measured.sampleFrameCount <= 0
  ) {
    throw new Error("Narration chunk cache PCM measurement is stale.");
  }
  return chunk;
};

export const loadVerifiedProgress = async ({
  rootDir,
  storyId,
  generationInputFingerprint,
  providerAttemptFingerprint,
  expected,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
  readonly expected?: NarrationGenerationExpected;
}): Promise<NarrationGenerationProgress> => {
  const paths = getNarrationWorkPaths({
    rootDir,
    storyId,
    generationInputFingerprint,
    providerAttemptFingerprint,
  });
  const progressBytes = await readIfPresent(paths.progressPath);
  let parsed: NarrationGenerationProgress;
  if (progressBytes === undefined) {
    parsed = NarrationGenerationProgressSchema.parse({
      schemaVersion: 1,
      storyId,
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunks: [],
    });
  } else {
    let rawProgress: unknown;
    try {
      rawProgress = JSON.parse(progressBytes.toString("utf8"));
    } catch (error) {
      throw new Error("Narration progress JSON is malformed.", {
        cause: error,
      });
    }
    parsed = NarrationGenerationProgressSchema.parse(rawProgress);
  }
  if (
    parsed.storyId !== storyId ||
    parsed.generationInputFingerprint !== generationInputFingerprint ||
    parsed.providerAttemptFingerprint !== providerAttemptFingerprint
  ) {
    throw new Error("Narration progress fingerprints are stale.");
  }

  const expectedById = new Map(
    expected?.chunks.map((request) => [request.chunkId, request] as const) ??
      [],
  );
  const verifiedById = new Map<string, VerifiedNarrationChunk>();
  for (const chunk of parsed.chunks) {
    const request = expectedById.get(chunk.chunkId) ?? {
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunkId: chunk.chunkId,
      meaningId: chunk.meaningId,
      ttsText: chunk.ttsText,
      requestFingerprint: chunk.requestFingerprint,
    };
    const cached = await loadVerifiedCachedChunk({
      rootDir,
      storyId,
      providerAttemptFingerprint,
      request,
    });
    if (cached === undefined) {
      throw new Error(
        `Narration progress references a missing chunk cache entry for ${chunk.chunkId}.`,
      );
    }
    if (
      cached.candidateId !== chunk.candidateId ||
      cached.rawChecksum !== chunk.rawChecksum
    ) {
      throw new Error(
        `Narration progress and chunk cache conflict for ${chunk.chunkId}.`,
      );
    }
    verifiedById.set(chunk.chunkId, cached);
  }

  if (expected !== undefined) {
    for (const request of expected.chunks) {
      if (verifiedById.has(request.chunkId)) continue;
      const cached = await loadVerifiedCachedChunk({
        rootDir,
        storyId,
        providerAttemptFingerprint,
        request,
      });
      if (cached !== undefined) verifiedById.set(request.chunkId, cached);
    }
  }

  const verified = NarrationGenerationProgressSchema.parse({
    ...parsed,
    chunks:
      expected === undefined
        ? parsed.chunks.flatMap((chunk) => {
            const verifiedChunk = verifiedById.get(chunk.chunkId);
            return verifiedChunk === undefined ? [] : [verifiedChunk];
          })
        : expected.chunks.flatMap((request) => {
            const verifiedChunk = verifiedById.get(request.chunkId);
            return verifiedChunk === undefined ? [] : [verifiedChunk];
          }),
  });
  if (expected !== undefined) {
    planChunkGeneration({ expected, verifiedProgress: verified });
  }
  return verified;
};

const writeExclusiveOrVerify = async (
  path: string,
  bytes: Buffer,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try {
    handle = await open(path, "wx");
    await handle.writeFile(Uint8Array.from(bytes));
    await handle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(path);
    if (sha256Bytes(existing) !== sha256Bytes(bytes)) {
      throw new Error("Content-addressed narration candidate is corrupt.");
    }
  } finally {
    await handle?.close();
  }
};

const writeJsonAtomic = async (
  targetPath: string,
  value: unknown,
): Promise<void> => {
  await mkdir(dirname(targetPath), { recursive: true });
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const existing = await readIfPresent(targetPath);
  if (existing?.toString("utf8") === serialized) return;
  const temporaryPath = join(
    dirname(targetPath),
    `.json.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, targetPath);
};

export const writeNarrationProgress = async ({
  rootDir,
  progress,
}: {
  readonly rootDir: string;
  readonly progress: NarrationGenerationProgress;
}): Promise<void> => {
  const parsed = NarrationGenerationProgressSchema.parse(progress);
  const paths = getNarrationWorkPaths({
    rootDir,
    storyId: parsed.storyId,
    generationInputFingerprint: parsed.generationInputFingerprint,
    providerAttemptFingerprint: parsed.providerAttemptFingerprint,
  });
  await writeJsonAtomic(paths.progressPath, parsed);
};

const writeCachedChunk = async ({
  rootDir,
  progress,
  chunk,
  bytes,
}: {
  readonly rootDir: string;
  readonly progress: NarrationGenerationProgress;
  readonly chunk: VerifiedNarrationChunk;
  readonly bytes: Buffer;
}): Promise<void> => {
  const paths = getChunkCachePaths({
    rootDir,
    storyId: progress.storyId,
    providerAttemptFingerprint: progress.providerAttemptFingerprint,
    requestFingerprint: chunk.requestFingerprint,
  });
  await mkdir(paths.cacheDirectory, { recursive: true });
  let lockHandle;
  try {
    lockHandle = await open(paths.lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Narration chunk cache write is already in progress for ${chunk.chunkId}.`,
      );
    }
    throw error;
  }
  try {
    const existingBytes = await readIfPresent(paths.recordPath);
    const existing =
      existingBytes === undefined ? undefined : parseChunkRecord(existingBytes);
    if (
      existing !== undefined &&
      (existing.requestFingerprint !== chunk.requestFingerprint ||
        existing.chunkId !== chunk.chunkId ||
        existing.meaningId !== chunk.meaningId ||
        existing.ttsText !== chunk.ttsText ||
        existing.candidateId !== chunk.candidateId ||
        existing.rawChecksum !== chunk.rawChecksum)
    ) {
      throw new Error(
        `Narration chunk cache identity conflict for ${chunk.chunkId}.`,
      );
    }
    if (existing?.stage === "measured" && chunk.stage === "candidate") {
      return;
    }
    if (
      existing?.stage === "measured" &&
      chunk.stage === "measured" &&
      (existing.normalizedChecksum !== chunk.normalizedChecksum ||
        existing.sampleFrameCount !== chunk.sampleFrameCount)
    ) {
      throw new Error(
        `Narration normalized chunk cache conflict for ${chunk.chunkId}.`,
      );
    }

    const relativePath =
      chunk.stage === "candidate"
        ? chunk.rawRelativePath
        : chunk.normalizedRelativePath;
    const actualChecksum = sha256Bytes(bytes);
    const expectedChecksum =
      chunk.stage === "candidate"
        ? chunk.rawChecksum
        : chunk.normalizedChecksum;
    if (actualChecksum !== expectedChecksum) {
      throw new Error("Narration chunk bytes do not match their manifest.");
    }
    if (chunk.stage === "measured") {
      const rawBytes = await readIfPresent(
        resolveInsideAttempt(paths.cacheDirectory, chunk.rawRelativePath),
      );
      if (
        rawBytes === undefined ||
        sha256Bytes(rawBytes) !== chunk.rawChecksum
      ) {
        throw new Error(
          `Narration measured chunk ${chunk.chunkId} is missing its verified raw candidate.`,
        );
      }
    }
    await writeExclusiveOrVerify(
      resolveInsideAttempt(paths.cacheDirectory, relativePath),
      bytes,
    );
    if (
      existing === undefined ||
      (existing.stage === "candidate" && chunk.stage === "measured")
    ) {
      await writeJsonAtomic(paths.recordPath, chunk);
    }
  } finally {
    await lockHandle.close();
    await unlink(paths.lockPath);
  }
};

export const writeCandidateAndProgress = async ({
  rootDir,
  progress,
  chunk,
  bytes,
}: {
  readonly rootDir: string;
  readonly progress: NarrationGenerationProgress;
  readonly chunk: RawNarrationCandidate | CanonicalMeasuredChunk;
  readonly bytes: Buffer;
}): Promise<void> => {
  const paths = getNarrationWorkPaths({
    rootDir,
    storyId: progress.storyId,
    generationInputFingerprint: progress.generationInputFingerprint,
    providerAttemptFingerprint: progress.providerAttemptFingerprint,
  });
  await writeCachedChunk({ rootDir, progress, chunk, bytes });
  await writeJsonAtomic(paths.progressPath, progress);
};

export const readCandidateBytes = async ({
  rootDir,
  progress,
  relativePath,
}: {
  readonly rootDir: string;
  readonly progress: NarrationGenerationProgress;
  readonly relativePath: string;
}): Promise<Buffer> => {
  const chunk = progress.chunks.find(
    (candidate) =>
      candidate.rawRelativePath === relativePath ||
      (candidate.stage === "measured" &&
        candidate.normalizedRelativePath === relativePath),
  );
  if (chunk === undefined) {
    throw new Error("Narration candidate path is not declared by progress.");
  }
  const paths = getChunkCachePaths({
    rootDir,
    storyId: progress.storyId,
    providerAttemptFingerprint: progress.providerAttemptFingerprint,
    requestFingerprint: chunk.requestFingerprint,
  });
  const bytes = await readIfPresent(
    resolveInsideAttempt(paths.cacheDirectory, relativePath),
  );
  if (bytes === undefined) {
    throw new Error("Narration candidate bytes are missing from chunk cache.");
  }
  const expectedChecksum =
    chunk.stage === "measured" && chunk.normalizedRelativePath === relativePath
      ? chunk.normalizedChecksum
      : chunk.rawChecksum;
  if (sha256Bytes(bytes) !== expectedChecksum) {
    throw new Error("Narration candidate bytes fail checksum verification.");
  }
  if (
    chunk.stage === "measured" &&
    chunk.normalizedRelativePath === relativePath
  ) {
    const measurement = decodeCanonicalPcmWav(bytes);
    if (
      measurement.sampleFrameCount !== chunk.sampleFrameCount ||
      measurement.sampleFrameCount <= 0
    ) {
      throw new Error("Narration candidate PCM measurement is stale.");
    }
  }
  return bytes;
};
