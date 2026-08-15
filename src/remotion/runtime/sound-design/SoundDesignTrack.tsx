import { Fragment, type FC } from "react";

import { SceneCoverageMapSchema } from "../../../contracts/scene-package";
import {
  StoryIdSchema,
  type Sha256Digest,
} from "../../../contracts/primitives";
import { createFingerprint } from "../../../contracts/fingerprint";
import {
  SceneSoundContribution,
  type SceneSoundProjection,
} from "../scene-sound";

type SoundDesignEntry =
  | Readonly<{
      meaningId: string;
      status: "ready";
      sceneSoundProjection: SceneSoundProjection;
    }>
  | Readonly<{
      meaningId: string;
      status: "fallback";
      fallbackFingerprint: Sha256Digest;
    }>;

export type SoundDesignProjection = Readonly<{
  schemaVersion: 1;
  storyId: string;
  entries: readonly SoundDesignEntry[];
  runtimeVersion: "scene-audio-runtime-v1";
  soundDesignProjectionFingerprint: Sha256Digest;
}>;

export const buildSoundDesignProjection = (rawInput: {
  readonly storyId: unknown;
  readonly coverage: unknown;
  readonly storyBeatTimings: readonly Readonly<{
    meaningId: unknown;
    startFrame: unknown;
    endFrame: unknown;
  }>[];
  readonly sceneSoundProjections: readonly SceneSoundProjection[];
}): SoundDesignProjection => {
  const storyId = StoryIdSchema.parse(rawInput.storyId);
  const coverage = SceneCoverageMapSchema.parse(rawInput.coverage);
  if (
    coverage.storyId !== storyId ||
    coverage.entries.length !== rawInput.storyBeatTimings.length
  ) {
    throw new Error("Sound design coverage does not match Story timing.");
  }
  const projections = new Map<string, SceneSoundProjection>();
  for (const projection of rawInput.sceneSoundProjections) {
    if (
      projection.storyId !== storyId ||
      projections.has(projection.meaningId)
    ) {
      throw new Error("Scene sound projections are unknown or duplicated.");
    }
    projections.set(projection.meaningId, projection);
  }
  const entries: SoundDesignEntry[] = coverage.entries.map(
    (coverageEntry, index) => {
      const timing = rawInput.storyBeatTimings[index];
      if (
        timing === undefined ||
        timing.meaningId !== coverageEntry.meaningId ||
        !Number.isInteger(timing.startFrame) ||
        !Number.isInteger(timing.endFrame) ||
        (index > 0 &&
          rawInput.storyBeatTimings[index - 1]?.endFrame !== timing.startFrame)
      ) {
        throw new Error("Sound design Beat order or timing is invalid.");
      }
      if (
        coverageEntry.status === "missing" ||
        coverageEntry.status === "stale"
      ) {
        throw new Error("Sound design rejects missing or stale coverage.");
      }
      if (coverageEntry.status === "fallback") {
        return {
          meaningId: coverageEntry.meaningId,
          status: "fallback",
          fallbackFingerprint: coverageEntry.fallbackFingerprint,
        };
      }
      const projection = projections.get(coverageEntry.meaningId);
      if (
        projection === undefined ||
        projection.packageFingerprint !== coverageEntry.packageFingerprint ||
        projection.beatStartFrame !== timing.startFrame ||
        projection.beatEndFrame !== timing.endFrame
      ) {
        throw new Error("Ready sound coverage and projection do not match.");
      }
      return {
        meaningId: coverageEntry.meaningId,
        status: "ready",
        sceneSoundProjection: projection,
      };
    },
  );
  if (
    projections.size !==
    entries.filter((entry) => entry.status === "ready").length
  ) {
    throw new Error("Sound design contains an unclaimed Scene projection.");
  }
  const fingerprintEntries = entries.map((entry) =>
    entry.status === "ready"
      ? {
          meaningId: entry.meaningId,
          status: entry.status,
          sceneSoundProjectionFingerprint:
            entry.sceneSoundProjection.sceneSoundProjectionFingerprint,
        }
      : entry,
  );
  const identity = {
    schemaVersion: 1 as const,
    storyId,
    entries: fingerprintEntries,
    runtimeVersion: "scene-audio-runtime-v1" as const,
  };
  return {
    schemaVersion: 1,
    storyId,
    entries,
    runtimeVersion: identity.runtimeVersion,
    soundDesignProjectionFingerprint: createFingerprint({
      namespace: "sound-design-projection",
      version: 1,
      value: identity,
    }),
  };
};

export const SoundDesignTrack: FC<{
  readonly projection: SoundDesignProjection;
  readonly sceneBusGain?: number;
}> = ({ projection, sceneBusGain = 1 }) => (
  <Fragment>
    {projection.entries.map((entry) =>
      entry.status === "ready" ? (
        <SceneSoundContribution
          key={entry.meaningId}
          projection={entry.sceneSoundProjection}
          busGain={sceneBusGain}
        />
      ) : null,
    )}
  </Fragment>
);
