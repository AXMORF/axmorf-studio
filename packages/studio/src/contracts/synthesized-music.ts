import { z } from "zod";

import { Sha256DigestSchema } from "./primitives";

/** Musical frames are relative to composition frame zero, never a speech clock. */
export const SynthesizedMusicTimelineSchema = z
  .object({
    schemaVersion: z.literal(1),
    fps: z.number().int().min(1).max(120),
    bpm: z.number().finite().min(50).max(180),
    beatsPerBar: z.number().int().min(2).max(7),
    bars: z.number().int().min(1).max(64),
    /** "drive" is a studio-v2-only band style: power chords, backbeat drums and fills. */
    style: z.enum(["organic", "electronic", "drive"]),
    seed: z.number().int().min(1).max(0xffffffff),
    /** Present only for studio-v2 scores; the original engine omits it. */
    engine: z.literal("studio-v2").optional(),
    durationInFrames: z.number().int().positive().max(20_000),
    beatFrames: z.array(z.number().int().nonnegative()).max(448).readonly(),
    /** Arrangement sections in composition frames, for aligning narrative turns. */
    sections: z
      .array(
        z
          .object({
            startFrame: z.number().int().nonnegative(),
            bars: z.number().int().positive(),
            energy: z.number().finite().positive().max(1),
          })
          .strict()
          .readonly(),
      )
      .max(64)
      .readonly()
      .optional(),
    /** Crash/arrival frames where a visual landing reads as on the music. */
    accentFrames: z
      .array(z.number().int().nonnegative())
      .max(64)
      .readonly()
      .optional(),
    music: z
      .array(
        z
          .object({
            type: z.enum([
              "kick",
              "hat",
              "bass",
              "pluck",
              "pad",
              "snare",
              "clap",
              "lead",
              "crash",
              "riser",
              "guitar",
              "tom",
            ]),
            frame: z.number().int().nonnegative(),
            /** studio-v2 onset in beats; audio starts here instead of at the rounded frame. */
            beat: z.number().finite().nonnegative().optional(),
            durationInFrames: z.number().int().positive(),
            note: z.number().int().min(0).max(127),
            gain: z.number().finite().min(0).max(1),
          })
          .strict()
          .readonly(),
      )
      .min(1)
      .max(8192)
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
      timeline.music.some(
        (event) => event.frame >= timeline.durationInFrames,
      ) ||
      (timeline.engine === undefined &&
        (timeline.style === "drive" ||
          timeline.music.some((event) => event.beat !== undefined) ||
          timeline.sections !== undefined ||
          timeline.accentFrames !== undefined ||
          timeline.bars > 16)) ||
      timeline.sections?.some(
        (section, index, sections) =>
          section.startFrame >= timeline.durationInFrames ||
          (index > 0 && section.startFrame <= sections[index - 1]!.startFrame),
      ) ||
      timeline.accentFrames?.some(
        (frame, index, frames) =>
          frame >= timeline.durationInFrames ||
          (index > 0 && frame <= frames[index - 1]!),
      )
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
  const sectionFrames: number[] = [];
  const accentFrames: number[] = [];
  const project = (frame: number, cycle: number) =>
    cycle * timeline.durationInFrames + frame - sceneStartFrame;
  const inside = (local: number) => local >= 0 && local < durationInFrames;
  const firstCycle = Math.floor(sceneStartFrame / timeline.durationInFrames);
  const lastCycle = Math.floor(
    (sceneStartFrame + durationInFrames - 1) / timeline.durationInFrames,
  );
  for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
    timeline.beatFrames.forEach((frame, index) => {
      const local = project(frame, cycle);
      if (!inside(local)) return;
      beatFrames.push(local);
      if (index % timeline.beatsPerBar === 0) barFrames.push(local);
    });
    for (const section of timeline.sections ?? []) {
      const local = project(section.startFrame, cycle);
      if (inside(local)) sectionFrames.push(local);
    }
    for (const frame of timeline.accentFrames ?? []) {
      const local = project(frame, cycle);
      if (inside(local)) accentFrames.push(local);
    }
  }
  return {
    fps: timeline.fps,
    bpm: timeline.bpm,
    beatsPerBar: timeline.beatsPerBar,
    sceneStartFrame,
    beatFrames,
    barFrames,
    ...(timeline.engine === undefined ? {} : { sectionFrames, accentFrames }),
  } as const;
};
