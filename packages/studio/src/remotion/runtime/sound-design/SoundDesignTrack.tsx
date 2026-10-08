import { Fragment, type FC } from "react";

import {
  ProjectSoundPlanSchema,
  ResourceAssetDescriptorSchema,
  computeResourceDescriptorFingerprint,
} from "../../../contracts";
import { SceneCoverageMapSchema } from "../../../contracts/scene-package";
import {
  MeaningIdSchema,
  StoryIdSchema,
  type Sha256Digest,
} from "../../../contracts/primitives";
import { createFingerprint } from "../../../contracts/fingerprint";
import {
  SemanticTimingSchema,
  resolveSemanticContentFrameRange,
} from "../../../contracts/semantic-timing";
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
  readonly semanticTiming?: unknown;
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
  const timings = rawInput.storyBeatTimings.map((timing, index) => {
    if (
      timing.meaningId !== coverage.storyBeatOrder[index] ||
      !Number.isSafeInteger(timing.startFrame) ||
      !Number.isSafeInteger(timing.endFrame) ||
      (timing.startFrame as number) < 0 ||
      (timing.endFrame as number) <= (timing.startFrame as number) ||
      (index > 0 &&
        rawInput.storyBeatTimings[index - 1]?.endFrame !== timing.startFrame)
    ) {
      throw new Error("Sound design Beat order or timing is invalid.");
    }
    return {
      meaningId: coverage.storyBeatOrder[index],
      kind: timing.kind,
      startFrame: timing.startFrame as number,
      endFrame: timing.endFrame as number,
    };
  });
  const projections = new Map<string, SceneSoundProjection>();
  const projectionByMember = new Map<string, SceneSoundProjection>();
  for (const projection of rawInput.sceneSoundProjections) {
    if (
      projection.storyId !== storyId ||
      projections.has(projection.meaningId)
    ) {
      throw new Error("Scene sound projections are unknown or duplicated.");
    }
    const ids = projection.coveredMeaningIds ?? [projection.meaningId];
    const firstIndex = coverage.storyBeatOrder.indexOf(
      MeaningIdSchema.parse(projection.meaningId),
    );
    const firstTiming = timings[firstIndex];
    const lastTiming = timings[firstIndex + ids.length - 1];
    const packageMembers = coverage.entries.filter(
      (entry) =>
        entry.status === "ready" &&
        entry.packageFingerprint === projection.packageFingerprint,
    );
    if (
      (projection.coveredMeaningIds !== undefined && ids.length < 2) ||
      ids[0] !== projection.meaningId ||
      new Set(ids).size !== ids.length ||
      ids.some((id, index) => {
        MeaningIdSchema.parse(id);
        const member = coverage.entries[firstIndex + index];
        return (
          projectionByMember.has(id) ||
          member?.meaningId !== id ||
          member.status !== "ready" ||
          member.packageFingerprint !== projection.packageFingerprint
        );
      }) ||
      packageMembers.length !== ids.length ||
      packageMembers.some((member, index) => member.meaningId !== ids[index]) ||
      firstTiming === undefined ||
      lastTiming === undefined ||
      projection.beatStartFrame !== firstTiming.startFrame ||
      projection.beatEndFrame !== lastTiming.endFrame
    ) {
      throw new Error(
        "Ready sound coverage and projection ownership do not match.",
      );
    }
    projections.set(projection.meaningId, projection);
    for (const id of ids) projectionByMember.set(id, projection);
  }
  const entries: SoundDesignEntry[] = coverage.entries.map((coverageEntry) => {
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
    const projection = projectionByMember.get(coverageEntry.meaningId);
    if (
      projection === undefined ||
      projection.packageFingerprint !== coverageEntry.packageFingerprint
    ) {
      throw new Error("Ready sound coverage and projection do not match.");
    }
    return {
      meaningId: coverageEntry.meaningId,
      status: "ready",
      sceneSoundProjection: projection,
    };
  });
  const ownerOrder = Array.from(
    new Set(
      entries.flatMap((entry) =>
        entry.status === "ready" ? [entry.sceneSoundProjection.meaningId] : [],
      ),
    ),
  );
  if (projections.size !== ownerOrder.length) {
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
  const sceneContributions = ownerOrder.flatMap((ownerId) => {
    const projection = projections.get(ownerId)!;
    return projection.contributions.map((contribution) => ({
      ...contribution,
      contributionId: `${ownerId}:${contribution.contributionId}`,
      startFrame: projection.beatStartFrame + contribution.startFrame,
      endFrame: projection.beatStartFrame + contribution.endFrame,
      loop: false,
    }));
  });
  const narratedTimings = timings.filter(
    ({ kind }) => kind === "narrated-scene",
  );
  const firstNarrated = narratedTimings[0];
  const lastNarrated = narratedTimings.at(-1);
  const semanticTiming =
    rawInput.semanticTiming === undefined
      ? null
      : SemanticTimingSchema.parse(rawInput.semanticTiming);
  if (semanticTiming !== null && semanticTiming.storyId !== storyId)
    throw new Error("Sound design timing belongs to another Story.");
  if (
    semanticTiming !== null &&
    (semanticTiming.storyBeats.length !== timings.length ||
      semanticTiming.storyBeats.some((timing, index) => {
        const current = timings[index];
        return (
          current === undefined ||
          timing.meaningId !== current.meaningId ||
          timing.kind !== current.kind ||
          timing.startFrame !== current.startFrame ||
          timing.endFrame !== current.endFrame
        );
      }))
  )
    throw new Error(
      "Sound design timing does not match the current Beat coverage.",
    );
  const contentFrameRange =
    semanticTiming === null
      ? firstNarrated === undefined || lastNarrated === undefined
        ? null
        : {
            startFrame: firstNarrated.startFrame,
            endFrame: lastNarrated.endFrame,
          }
      : resolveSemanticContentFrameRange(semanticTiming);
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
        contentFrameRange === null ||
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
        startFrame: contentFrameRange.startFrame,
        endFrame: contentFrameRange.endFrame,
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
