import { z } from "zod";

import { Sha256DigestSchema } from "./primitives";

/** Musical frames are relative to composition frame zero, never a speech clock. */
export const SynthesizedMusicTimelineSchema = z
  .object({
    schemaVersion: z.literal(1),
    fps: z.number().int().min(1).max(120),
    bpm: z.number().finite().min(50).max(180),
    beatsPerBar: z.number().int().min(2).max(7),
    bars: z.number().int().min(1).max(16),
    style: z.enum(["organic", "electronic"]),
    seed: z.number().int().min(1).max(0xffffffff),
    durationInFrames: z.number().int().positive().max(20_000),
    beatFrames: z.array(z.number().int().nonnegative()).max(112).readonly(),
    music: z
      .array(
        z
          .object({
            type: z.enum(["kick", "hat", "bass", "pluck", "pad"]),
            frame: z.number().int().nonnegative(),
            durationInFrames: z.number().int().positive(),
            note: z.number().int().min(0).max(127),
            gain: z.number().finite().min(0).max(1),
          })
          .strict()
          .readonly(),
      )
      .min(1)
      .max(1024)
      .readonly(),
    audioChecksum: Sha256DigestSchema,
  })
  .strict()
  .superRefine((timeline, context) => {
    const framesPerBeat = (60 * timeline.fps) / timeline.bpm;
    const beats = timeline.bars * timeline.beatsPerBar;
    if (
      framesPerBeat < 1 ||
      timeline.durationInFrames !== Math.round(beats * framesPerBeat) ||
      timeline.beatFrames.length !== beats ||
      timeline.beatFrames.some(
        (frame, index) => frame !== Math.round(index * framesPerBeat),
      ) ||
      timeline.music.some((event) => event.frame >= timeline.durationInFrames)
    ) {
      context.addIssue({
        code: "custom",
        message: "Synthesized music timeline grid is stale.",
      });
    }
  })
  .readonly();

export type SynthesizedMusicTimeline = z.infer<
  typeof SynthesizedMusicTimelineSchema
>;

export const resolveSceneMusicTiming = ({
  timeline: rawTimeline,
  sceneStartFrame,
  durationInFrames,
}: {
  readonly timeline: SynthesizedMusicTimeline;
  readonly sceneStartFrame: number;
  readonly durationInFrames: number;
}) => {
  const timeline = SynthesizedMusicTimelineSchema.parse(rawTimeline);
  if (
    !Number.isSafeInteger(sceneStartFrame) ||
    sceneStartFrame < 0 ||
    !Number.isSafeInteger(durationInFrames) ||
    durationInFrames < 1
  ) {
    throw new Error(
      "Scene music timing requires a valid measured frame window.",
    );
  }
  const beatFrames: number[] = [];
  const barFrames: number[] = [];
  const firstCycle = Math.floor(sceneStartFrame / timeline.durationInFrames);
  const lastCycle = Math.floor(
    (sceneStartFrame + durationInFrames - 1) / timeline.durationInFrames,
  );
  for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
    timeline.beatFrames.forEach((frame, index) => {
      const local = cycle * timeline.durationInFrames + frame - sceneStartFrame;
      if (local < 0 || local >= durationInFrames) return;
      beatFrames.push(local);
      if (index % timeline.beatsPerBar === 0) barFrames.push(local);
    });
  }
  return {
    fps: timeline.fps,
    bpm: timeline.bpm,
    beatsPerBar: timeline.beatsPerBar,
    sceneStartFrame,
    beatFrames,
    barFrames,
  } as const;
};
