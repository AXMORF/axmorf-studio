import { z } from "zod";

const FramesSchema = z.array(z.number().int().nonnegative());
export const FilmMusicAccentSchema = z.strictObject({
  frame: z.number().int().nonnegative(),
  strength: z.number().finite().positive().max(1),
});
export type FilmMusicAccent = z.infer<typeof FilmMusicAccentSchema>;
const IntervalSchema = z
  .strictObject({
    from: z.number().int().nonnegative(),
    to: z.number().int().positive(),
  })
  .refine(
    ({ from, to }) => from < to,
    "Music interval must have positive length.",
  );
/** Actual synthesis events, projected onto the film clock (never inferred beats). */
export const FilmMusicOnsetsSchema = z.strictObject({
  kick: FramesSchema,
  snare: FramesSchema,
  clap: FramesSchema,
  hat: FramesSchema,
  bass: FramesSchema,
  hits: FramesSchema,
  sections: FramesSchema,
  /** v3 scheduling windows, half-open and on the film clock. */
  fills: z.array(IntervalSchema).optional(),
  breaks: z.array(IntervalSchema).optional(),
  accents: z.array(FilmMusicAccentSchema).optional(),
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
