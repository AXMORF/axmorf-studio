import {
  AUTHORED_FRAME_TIMING_ALGORITHM_ID,
  type SemanticTiming,
} from "@axmorf/studio/contracts";

type PublishedTimeline = Readonly<{
  storyId: string;
  fps: number;
  frameCount: number;
  publishing: Readonly<{
    chapters: readonly Readonly<{ meaningId: string; startFrame: number }>[];
  }>;
}>;

export const planSceneReview = (
  timing: SemanticTiming,
  delivery: PublishedTimeline,
) => {
  const content = timing.storyBeats.filter(
    (beat) =>
      beat.kind !== "silent-scene" ||
      (timing.algorithmId === AUTHORED_FRAME_TIMING_ALGORITHM_ID &&
        beat.startFrame >= timing.contentFrameRange.startFrame &&
        beat.endFrame <= timing.contentFrameRange.endFrame),
  );
  const chapters = delivery.publishing.chapters;
  const chaptersOmitted =
    timing.algorithmId === AUTHORED_FRAME_TIMING_ALGORITHM_ID &&
    chapters.length === 0;
  if (
    timing.storyId !== delivery.storyId ||
    timing.fps !== delivery.fps ||
    timing.durationInFrames !== delivery.frameCount ||
    (!chaptersOmitted && content.length !== chapters.length) ||
    (!chaptersOmitted &&
      content.some(
        (beat, index) =>
          beat.meaningId !== chapters[index]?.meaningId ||
          beat.startFrame !== chapters[index]?.startFrame,
      ))
  ) {
    throw new Error("Current SemanticTiming is stale against the delivery.");
  }

  const scenes = timing.storyBeats.map((beat) => {
    const lastFrame = beat.endFrame - 1;
    const middleFrame =
      beat.startFrame + Math.floor((lastFrame - beat.startFrame) / 2);
    return {
      meaningId: beat.meaningId,
      kind: beat.kind,
      frames: {
        opening: beat.startFrame,
        change: middleFrame,
        result: lastFrame,
      },
    } as const;
  });
  const frames = [
    ...new Set(scenes.flatMap((scene) => Object.values(scene.frames))),
  ].sort((left, right) => left - right);
  const imageByFrame = new Map(
    frames.map(
      (frame, index) =>
        [frame, `frame-${String(index + 1).padStart(4, "0")}.png`] as const,
    ),
  );
  const sample = (frame: number) => {
    const image = imageByFrame.get(frame);
    if (image === undefined)
      throw new Error("Scene review frame mapping is incomplete.");
    return { frame, image };
  };
  return {
    frames,
    scenes: scenes.map((scene) => ({
      meaningId: scene.meaningId,
      kind: scene.kind,
      samples: {
        opening: sample(scene.frames.opening),
        change: sample(scene.frames.change),
        result: sample(scene.frames.result),
      },
    })),
  };
};
