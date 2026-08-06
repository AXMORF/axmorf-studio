import { Fragment, type FC } from "react";

import {
  STORY_VISUAL_RUNTIME_VERSION,
  MeaningIdSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  createFingerprint,
  type ScenePackage,
} from "../../../contracts";
import { SceneSlot } from "./SceneSlot";
import { StoryBeatTransitionOverlay } from "./StoryBeatTransitionOverlay";
import type {
  SceneRendererMountProps,
  SceneRendererRegistry,
  StoryBeatVisualTransition,
  StoryVisualEntry,
  StoryVisualProjection,
} from "./types";

type RawTiming = Readonly<{
  meaningId: unknown;
  startFrame: unknown;
  endFrame: unknown;
}>;

type RawTransition = Readonly<{
  fromMeaningId: unknown;
  toMeaningId: unknown;
  kind: unknown;
  durationInFrames: unknown;
  boundaryFrame?: unknown;
}>;

const parseNonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
};

const parseTiming = (timing: RawTiming) => {
  const meaningId = MeaningIdSchema.parse(timing.meaningId);
  const startFrame = parseNonNegativeInteger(timing.startFrame, "Beat start");
  const endFrame = parseNonNegativeInteger(timing.endFrame, "Beat end");
  if (endFrame <= startFrame) throw new Error("Beat timing must be non-empty.");
  return { meaningId, startFrame, endFrame } as const;
};

export const buildStoryVisualProjection = (rawInput: {
  readonly storyId: unknown;
  readonly leadInFrames: unknown;
  readonly tailFrames: unknown;
  readonly durationInFrames: unknown;
  readonly storyBeatTimings: readonly RawTiming[];
  readonly coverage: unknown;
  readonly packages: readonly unknown[];
  readonly registryFingerprint: unknown;
  readonly transitions: readonly RawTransition[];
}): StoryVisualProjection => {
  const storyId = StoryIdSchema.parse(rawInput.storyId);
  const leadInFrames = parseNonNegativeInteger(
    rawInput.leadInFrames,
    "Lead-in",
  );
  const tailFrames = parseNonNegativeInteger(rawInput.tailFrames, "Tail");
  const durationInFrames = parseNonNegativeInteger(
    rawInput.durationInFrames,
    "Composition duration",
  );
  const registryFingerprint = Sha256DigestSchema.parse(
    rawInput.registryFingerprint,
  );
  const storyBeatTimings = rawInput.storyBeatTimings.map(parseTiming);
  const firstTiming = storyBeatTimings[0];
  const lastTiming = storyBeatTimings.at(-1);
  const coverage = SceneCoverageMapSchema.parse(rawInput.coverage);
  const packages = rawInput.packages.map((value) =>
    ScenePackageSchema.parse(value),
  );
  if (
    coverage.storyId !== storyId ||
    storyBeatTimings.length !== coverage.entries.length ||
    firstTiming === undefined ||
    lastTiming === undefined ||
    firstTiming.startFrame !== leadInFrames ||
    lastTiming.endFrame + tailFrames !== durationInFrames
  ) {
    throw new Error("Visual projection does not match Story timing coverage.");
  }
  const packageByMeaning = new Map<string, ScenePackage>();
  for (const scenePackage of packages) {
    if (
      scenePackage.storyId !== storyId ||
      packageByMeaning.has(scenePackage.meaningId)
    ) {
      throw new Error("Visual projection ScenePackage identity is invalid.");
    }
    packageByMeaning.set(scenePackage.meaningId, scenePackage);
  }
  const entries: StoryVisualEntry[] = storyBeatTimings.map((timing, index) => {
    const prior = storyBeatTimings[index - 1];
    const coverageEntry = coverage.entries[index];
    if (
      timing.meaningId !== coverage.storyBeatOrder[index] ||
      coverageEntry?.meaningId !== timing.meaningId ||
      (prior !== undefined && timing.startFrame !== prior.endFrame)
    ) {
      throw new Error("Visual projection Beat order or timing is not contiguous.");
    }
    if (coverageEntry.status === "missing" || coverageEntry.status === "stale") {
      throw new Error("Visual projection rejects missing or stale coverage.");
    }
    if (coverageEntry.status === "fallback") {
      return {
        meaningId: timing.meaningId,
        status: "fallback",
        startFrame: timing.startFrame,
        endFrame: timing.endFrame,
        fallbackFingerprint: coverageEntry.fallbackFingerprint,
      };
    }
    const scenePackage = packageByMeaning.get(timing.meaningId);
    if (
      scenePackage === undefined ||
      coverageEntry.packageFingerprint !== scenePackage.packageFingerprint ||
      coverageEntry.rendererId !== scenePackage.rendererBinding.rendererId ||
      scenePackage.beatFrameRange.startFrame !== timing.startFrame ||
      scenePackage.beatFrameRange.endFrame !== timing.endFrame
    ) {
      throw new Error("Ready visual coverage and ScenePackage do not match.");
    }
    return {
      meaningId: timing.meaningId,
      status: "ready",
      startFrame: timing.startFrame,
      endFrame: timing.endFrame,
      rendererId: scenePackage.rendererBinding.rendererId,
      sceneVisualFingerprint: scenePackage.sceneVisualFingerprint,
    };
  });
  if (
    packageByMeaning.size !==
    entries.filter((entry) => entry.status === "ready").length
  ) {
    throw new Error("Visual projection contains an unclaimed ScenePackage.");
  }
  if (rawInput.transitions.length !== Math.max(0, entries.length - 1)) {
    throw new Error("Every adjacent StoryBeat boundary needs one transition.");
  }
  const transitions: StoryBeatVisualTransition[] = rawInput.transitions.map(
    (rawTransition, index) => {
      const left = entries[index];
      const right = entries[index + 1];
      const duration = parseNonNegativeInteger(
        rawTransition.durationInFrames,
        "Transition duration",
      );
      if (
        left === undefined ||
        right === undefined ||
        rawTransition.fromMeaningId !== left.meaningId ||
        rawTransition.toMeaningId !== right.meaningId ||
        (rawTransition.kind !== "hard-cut" &&
          rawTransition.kind !== "visual-overlay-v1") ||
        (rawTransition.kind === "hard-cut" && duration !== 0) ||
        (rawTransition.kind === "visual-overlay-v1" &&
          (duration <= 0 || duration > left.endFrame - left.startFrame)) ||
        (rawTransition.boundaryFrame !== undefined &&
          rawTransition.boundaryFrame !== right.startFrame)
      ) {
        throw new Error("StoryBeat visual transition is invalid.");
      }
      return {
        fromMeaningId: left.meaningId,
        toMeaningId: right.meaningId,
        kind: rawTransition.kind,
        durationInFrames: duration,
        boundaryFrame: right.startFrame,
      };
    },
  );
  const identity = {
    schemaVersion: 1 as const,
    storyId,
    leadInFrames,
    tailFrames,
    durationInFrames,
    storyBeatTimings,
    entries,
    transitions,
    registryFingerprint,
    runtimeVersion: STORY_VISUAL_RUNTIME_VERSION,
  };
  return {
    ...identity,
    projectionFingerprint: createFingerprint({
      namespace: "story-visual-projection",
      version: 1,
      value: identity,
    }),
  };
};

export type StoryVisualTrackProps = Readonly<{
  projection: StoryVisualProjection;
  registry: SceneRendererRegistry;
  rendererPropsByMeaning: Readonly<
    Record<string, SceneRendererMountProps>
  >;
}>;

export const StoryVisualTrack: FC<StoryVisualTrackProps> = ({
  projection,
  registry,
  rendererPropsByMeaning,
}) => (
  <Fragment>
    {projection.entries.map((entry) => {
      if (entry.status === "fallback") return null;
      const rendererProps = rendererPropsByMeaning[entry.meaningId];
      if (rendererProps === undefined) {
        throw new Error(`Scene renderer props are missing: ${entry.meaningId}.`);
      }
      return (
        <SceneSlot
          key={entry.meaningId}
          entry={entry}
          registry={registry}
          rendererProps={rendererProps}
        />
      );
    })}
    {projection.transitions.map((transition) => (
      <StoryBeatTransitionOverlay
        key={`${transition.fromMeaningId}:${transition.toMeaningId}`}
        beatTransition={transition}
      />
    ))}
  </Fragment>
);
