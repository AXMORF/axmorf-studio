import { z } from "zod";

const FramesSchema = z.array(z.number().int().nonnegative());
/** Actual synthesis events, projected onto the film clock (never inferred beats). */
export const FilmMusicOnsetsSchema = z.strictObject({
  kick: FramesSchema,
  snare: FramesSchema,
  clap: FramesSchema,
  hat: FramesSchema,
  bass: FramesSchema,
  hits: FramesSchema,
  sections: FramesSchema,
});
export type FilmMusicOnsets = z.infer<typeof FilmMusicOnsetsSchema>;

export const FilmMusicAlignmentSchema = z.strictObject({
  bpm: z.number().finite().min(50).max(180),
  boundaries: z.array(
    z.strictObject({
      sectionIndex: z.number().int().nonnegative(),
      requestedFrame: z.number().int().nonnegative(),
      actualFrame: z.number().int().nonnegative(),
      /** Signed residual: actual minus requested, in film frames. */
      residualFrames: z.number().int(),
    }),
  ),
});
export type FilmMusicAlignment = z.infer<typeof FilmMusicAlignmentSchema>;
