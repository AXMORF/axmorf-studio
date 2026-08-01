import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import {
  NarrationGenerationProgressSchema,
  RawNarrationCandidateSchema,
  type CanonicalMeasuredChunk,
  type NarrationGenerationExpected,
  type NarrationGenerationProgress,
  type RawNarrationCandidate,
  planChunkGeneration,
} from "../domain/candidate-progress";
import {
  decodeCanonicalPcmWav,
  sha256Bytes,
} from "../domain/pcm-wav";
import {
  Sha256DigestSchema,
  StoryIdSchema,
} from "../../../src/contracts/primitives";

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
    digestBody(generationInputFingerprint),
    digestBody(providerAttemptFingerprint),
  );
  return {
    attemptDirectory,
    progressPath: join(attemptDirectory, "progress.json"),
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
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

const toRawCandidate = (
  measured: CanonicalMeasuredChunk,
): RawNarrationCandidate =>
  RawNarrationCandidateSchema.parse({
    stage: "candidate",
    chunkId: measured.chunkId,
    meaningId: measured.meaningId,
    ttsText: measured.ttsText,
    requestFingerprint: measured.requestFingerprint,
    candidateId: measured.candidateId,
    rawChecksum: measured.rawChecksum,
    rawRelativePath: measured.rawRelativePath,
  });

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
  if (progressBytes === undefined) {
    return NarrationGenerationProgressSchema.parse({
      schemaVersion: 1,
      storyId,
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunks: [],
    });
  }

  let rawProgress: unknown;
  try {
    rawProgress = JSON.parse(progressBytes.toString("utf8"));
  } catch (error) {
    throw new Error("Narration progress JSON is malformed.", { cause: error });
  }
  const parsed = NarrationGenerationProgressSchema.parse(rawProgress);
  if (
    parsed.storyId !== storyId ||
    parsed.generationInputFingerprint !== generationInputFingerprint ||
    parsed.providerAttemptFingerprint !== providerAttemptFingerprint
  ) {
    throw new Error("Narration progress fingerprints are stale.");
  }

  const verifiedChunks: (
    | RawNarrationCandidate
    | CanonicalMeasuredChunk
  )[] = [];
  for (const chunk of parsed.chunks) {
    const expectedPaths = getCandidateRelativePaths({
      chunkId: chunk.chunkId,
      candidateId: chunk.candidateId,
    });
    if (chunk.rawRelativePath !== expectedPaths.rawRelativePath) {
      throw new Error("Narration raw candidate path is malformed.");
    }
    const rawBytes = await readIfPresent(
      resolveInsideAttempt(paths.attemptDirectory, chunk.rawRelativePath),
    );
    if (rawBytes === undefined || sha256Bytes(rawBytes) !== chunk.rawChecksum) {
      continue;
    }
    if (chunk.stage === "candidate") {
      verifiedChunks.push(chunk);
      continue;
    }
    if (
      chunk.normalizedRelativePath !== expectedPaths.normalizedRelativePath
    ) {
      throw new Error("Narration normalized candidate path is malformed.");
    }
    const normalizedBytes = await readIfPresent(
      resolveInsideAttempt(
        paths.attemptDirectory,
        chunk.normalizedRelativePath,
      ),
    );
    if (
      normalizedBytes === undefined ||
      sha256Bytes(normalizedBytes) !== chunk.normalizedChecksum
    ) {
      verifiedChunks.push(toRawCandidate(chunk));
      continue;
    }
    try {
      const measured = decodeCanonicalPcmWav(normalizedBytes);
      if (
        measured.sampleFrameCount !== chunk.sampleFrameCount ||
        measured.sampleFrameCount <= 0
      ) {
        verifiedChunks.push(toRawCandidate(chunk));
        continue;
      }
    } catch {
      verifiedChunks.push(toRawCandidate(chunk));
      continue;
    }
    verifiedChunks.push(chunk);
  }

  const verified = NarrationGenerationProgressSchema.parse({
    ...parsed,
    chunks: verifiedChunks,
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

const writeProgressAtomic = async (
  progressPath: string,
  progress: NarrationGenerationProgress,
): Promise<void> => {
  await mkdir(dirname(progressPath), { recursive: true });
  const temporaryPath = join(
    dirname(progressPath),
    `.progress.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(progress, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, progressPath);
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
  const relativePath =
    chunk.stage === "candidate"
      ? chunk.rawRelativePath
      : chunk.normalizedRelativePath;
  await writeExclusiveOrVerify(
    resolveInsideAttempt(paths.attemptDirectory, relativePath),
    bytes,
  );
  await writeProgressAtomic(paths.progressPath, progress);
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
  const paths = getNarrationWorkPaths({
    rootDir,
    storyId: progress.storyId,
    generationInputFingerprint: progress.generationInputFingerprint,
    providerAttemptFingerprint: progress.providerAttemptFingerprint,
  });
  return readFile(resolveInsideAttempt(paths.attemptDirectory, relativePath));
};
