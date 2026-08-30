import { Fragment, type FC } from "react";

import {
  ProjectSoundPlanSchema,
  ResourceAssetDescriptorSchema,
  computeResourceDescriptorFingerprint,
} from "../../../contracts";
import { SceneCoverageMapSchema } from "../../../contracts/scene-package";
import {
  StoryIdSchema,
  type Sha256Digest,
} from "../../../contracts/primitives";
import { createFingerprint } from "../../../contracts/fingerprint";
import type { SceneSoundProjection } from "../scene-sound";
import {
  SoundContribution,
  type SoundContributionValue,
} from "./SoundContribution";

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
  contributions: readonly (SoundContributionValue &
    Readonly<{ resourceId: string; checksum: Sha256Digest }>)[];
  runtimeVersion: "scene-audio-runtime-v2";
  soundDesignProjectionFingerprint: Sha256Digest;
}>;

export const buildSoundDesignProjection = (rawInput: {
  readonly storyId: unknown;
  readonly coverage: unknown;
  readonly storyBeatTimings: readonly Readonly<{
    meaningId: unknown;
    kind?: unknown;
    startFrame: unknown;
    endFrame: unknown;
  }>[];
  readonly sceneSoundProjections: readonly SceneSoundProjection[];
  readonly projectSoundPlan?: unknown;
  readonly projectSoundResources?: readonly unknown[];
}): SoundDesignProjection => {
  const storyId = StoryIdSchema.parse(rawInput.storyId);
  const coverage = SceneCoverageMapSchema.parse(rawInput.coverage);
  if (
    coverage.storyId !== storyId ||
    coverage.entries.length !== rawInput.storyBeatTimings.length
  ) {
    throw new Error("Sound design coverage does not match Story timing.");
  }
  const projectSound =
    rawInput.projectSoundPlan === undefined
      ? null
      : ProjectSoundPlanSchema.parse(rawInput.projectSoundPlan);
  if (projectSound !== null && projectSound.storyId !== storyId) {
    throw new Error("Project sound plan does not match the Story.");
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
  const sceneContributions = entries.flatMap((entry) =>
    entry.status === "ready"
      ? entry.sceneSoundProjection.contributions.map((contribution) => ({
          ...contribution,
          contributionId: `${entry.meaningId}:${contribution.contributionId}`,
          startFrame:
            entry.sceneSoundProjection.beatStartFrame + contribution.startFrame,
          endFrame:
            entry.sceneSoundProjection.beatStartFrame + contribution.endFrame,
          loop: false,
        }))
      : [],
  );
  const narratedTimings = rawInput.storyBeatTimings.filter(
    ({ kind }) => kind === "narrated-scene",
  );
  const firstNarrated = narratedTimings[0];
  const lastNarrated = narratedTimings.at(-1);
  const projectResources = (rawInput.projectSoundResources ?? []).map(
    (resource) => ResourceAssetDescriptorSchema.parse(resource),
  );
  const expectedProjectResourceIds = new Set(
    (projectSound?.contributions ?? []).map(({ resourceId }) => resourceId),
  );
  if (
    new Set(projectResources.map(({ id }) => id)).size !==
      projectResources.length ||
    projectResources.length !== expectedProjectResourceIds.size ||
    projectResources.some(({ id }) => !expectedProjectResourceIds.has(id))
  ) {
    throw new Error("Project sound resources do not exactly match the plan.");
  }
  const projectContributions = (projectSound?.contributions ?? []).map(
    (contribution) => {
      const resource = projectResources.find(
        ({ id }) => id === contribution.resourceId,
      );
      if (
        firstNarrated === undefined ||
        lastNarrated === undefined ||
        resource === undefined ||
        resource.assetKind !== "audio" ||
        resource.mediaRole !== "background-music" ||
        resource.allowedUse !== "runtime-approved" ||
        resource.status !== "approved" ||
        resource.license.verificationStatus !== "verified" ||
        computeResourceDescriptorFingerprint(resource) !==
          contribution.descriptorFingerprint
      ) {
        throw new Error("Project sound contribution is not runtime-approved.");
      }
      return {
        contributionId: `project:${contribution.contributionId}`,
        resourceId: resource.id,
        publicPath: resource.localPath,
        checksum: resource.checksum,
        startFrame: firstNarrated.startFrame as number,
        endFrame: lastNarrated.endFrame as number,
        volume: contribution.volume,
        loop: contribution.loop,
      };
    },
  );
  const contributions = [...sceneContributions, ...projectContributions];
  if (
    new Set(contributions.map(({ contributionId }) => contributionId)).size !==
    contributions.length
  ) {
    throw new Error("Sound contribution IDs must be unique.");
  }
  const identity = {
    schemaVersion: 1 as const,
    storyId,
    entries: fingerprintEntries,
    contributions,
    runtimeVersion: "scene-audio-runtime-v2" as const,
  };
  return {
    schemaVersion: 1,
    storyId,
    entries,
    contributions,
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
}> = ({ projection }) => (
  <Fragment>
    {projection.contributions.map((contribution) => (
      <SoundContribution
        key={contribution.contributionId}
        contribution={contribution}
      />
    ))}
  </Fragment>
);
