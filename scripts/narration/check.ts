import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { validateNarrativeArtifactBundle } from "../../src/contracts/narrative-artifact-bundle";
import type { NarrativeProjectSource } from "../../src/contracts/project";
import {
  SealedNarrationManifestSchema,
  type SealedNarrationManifest,
} from "../../src/contracts/sealed-narration";
import {
  SemanticTimingSchema,
  type SemanticTiming,
} from "../../src/contracts/semantic-timing";
import {
  concatenateCanonicalPcm,
  createExplicitPausePcm,
  measureCanonicalPcmWav,
  sha256Bytes,
} from "./domain/pcm-wav";
import type { ProductionLocations } from "../project-production/application/production-locations";
import {
  resolveNarrationMediaLogicalPath,
  resolveNarrationProjectRoot,
} from "./production-paths";

export type M2NarrationCheckResult = {
  readonly storyId: string;
  readonly generationInputFingerprint: string;
  readonly sealedNarrationFingerprint: string;
  readonly semanticTimingFingerprint: string;
  readonly chunkCount: number;
  readonly captionCueCount: number;
  readonly completeAudioChecksum: string;
  readonly completeAudioSampleFrameCount: number;
};

const readJson = async (path: string, label: string): Promise<unknown> => {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
};

const readManifest = async (
  locations: ProductionLocations,
  storyId: string,
): Promise<SealedNarrationManifest> =>
  SealedNarrationManifestSchema.parse(
    await readJson(
      join(
        resolveNarrationProjectRoot({ locations, storyId }),
        "generated/sealed-narration.generated.json",
      ),
      "sealed-narration.generated.json",
    ),
  );

const readTiming = async (
  locations: ProductionLocations,
  storyId: string,
): Promise<SemanticTiming> =>
  SemanticTimingSchema.parse(
    await readJson(
      join(
        resolveNarrationProjectRoot({ locations, storyId }),
        "generated/semantic-timing.generated.json",
      ),
      "semantic-timing.generated.json",
    ),
  );

export const checkM2NarrationArtifacts = async ({
  locations,
  projectSource,
}: {
  readonly locations: ProductionLocations;
  readonly projectSource: NarrativeProjectSource;
}): Promise<M2NarrationCheckResult> => {
  const manifest = await readManifest(locations, projectSource.story.storyId);
  const timing = await readTiming(locations, projectSource.story.storyId);

  const reconstructedParts: Buffer[] = [];
  let chunkCount = 0;
  for (const segment of manifest.segments) {
    if (segment.kind === "pause") {
      const pause = createExplicitPausePcm(segment.pauseMs);
      if (pause.sampleFrameCount !== segment.sampleFrameCount) {
        throw new Error("Explicit pause sampleFrameCount is stale.");
      }
      reconstructedParts.push(pause.wav);
      continue;
    }
    let wav: Buffer;
    try {
      wav = await readFile(
        resolveNarrationMediaLogicalPath({
          locations,
          storyId: manifest.storyId,
          logicalPath: segment.localPath,
        }),
      );
    } catch (error) {
      throw new Error(`Narration chunk audio is missing: ${segment.chunkId}.`, {
        cause: error,
      });
    }
    if (sha256Bytes(wav) !== segment.checksum) {
      throw new Error(`Narration chunk checksum is stale: ${segment.chunkId}.`);
    }
    const measured = measureCanonicalPcmWav(wav);
    if (measured.sampleFrameCount !== segment.sampleFrameCount) {
      throw new Error(
        `Narration chunk sampleFrameCount is stale: ${segment.chunkId}.`,
      );
    }
    reconstructedParts.push(wav);
    chunkCount += 1;
  }

  const reconstructedComplete = concatenateCanonicalPcm(reconstructedParts);
  let completeWav: Buffer;
  try {
    completeWav = await readFile(
      resolveNarrationMediaLogicalPath({
        locations,
        storyId: manifest.storyId,
        logicalPath: manifest.completeAudio.localPath,
      }),
    );
  } catch (error) {
    throw new Error("Complete narration audio is missing.", { cause: error });
  }
  if (sha256Bytes(completeWav) !== manifest.completeAudio.checksum) {
    throw new Error("Complete narration audio checksum is stale.");
  }
  if (sha256Bytes(reconstructedComplete) !== sha256Bytes(completeWav)) {
    throw new Error(
      "Complete narration audio does not equal the ordered chunk and pause timeline.",
    );
  }
  const completeMeasurement = measureCanonicalPcmWav(completeWav);
  if (
    completeMeasurement.sampleFrameCount !==
    manifest.completeAudio.sampleFrameCount
  ) {
    throw new Error("Complete narration audio sampleFrameCount is stale.");
  }

  validateNarrativeArtifactBundle({
    projectSource,
    sealedNarration: manifest,
    semanticTiming: timing,
  });
  return {
    storyId: projectSource.story.storyId,
    generationInputFingerprint: manifest.generationInputFingerprint,
    sealedNarrationFingerprint: manifest.sealedNarrationFingerprint,
    semanticTimingFingerprint: timing.fingerprint,
    chunkCount,
    captionCueCount: timing.captionCues.length,
    completeAudioChecksum: manifest.completeAudio.checksum,
    completeAudioSampleFrameCount: manifest.completeAudio.sampleFrameCount,
  };
};
