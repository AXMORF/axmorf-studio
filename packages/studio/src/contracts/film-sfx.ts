import { z } from "zod";

import { createFingerprint } from "./fingerprint";

/** Bump whenever synthesis or PCM encoding changes: old audio must not hit cache. */
export const FILM_SFX_SYNTHESIZER_VERSION = "film-sfx-v1" as const;
export const FilmSoundEffectKindSchema = z.enum([
  "riser",
  "impact",
  "whoosh",
  "tick",
  "glitch",
  "shimmer",
  "swell",
  "thud",
  "paper",
  "clank",
  "chime",
  "click",
]);
export type FilmSoundEffectKind = z.infer<typeof FilmSoundEffectKindSchema>;
const FrameSchema = z.number().int().min(0).max(1_000_000);
const DurationSchema = z.number().int().min(1).max(1_000_000);
const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const FilmSoundEffectParamsSchema = z.strictObject({
  /** Semitones relative to this kind's base pitch. */
  pitch: z.number().finite().min(-36).max(36).optional(),
  brightness: z.number().finite().min(0).max(1).optional(),
  intensity: z.number().finite().min(0).max(1).optional(),
  /** Relative decay/tail within durationFrames; never extends the clip. */
  tail: z.number().finite().min(0).max(1).optional(),
  /** Signed stereo sweep width; zero is dual mono. */
  stereo: z.number().finite().min(-1).max(1).optional(),
  seed: z.number().int().min(0).max(0xffff_ffff).optional(),
});
export const FilmSoundEffectSpecSchema = z.strictObject({
  id: IdSchema,
  kind: FilmSoundEffectKindSchema,
  frame: FrameSchema,
  durationFrames: DurationSchema,
  anchor: z.enum(["start", "end", "center"]),
  params: FilmSoundEffectParamsSchema.optional(),
  for: z.string().trim().min(1).max(500),
});
export type FilmSoundEffectSpec = z.infer<typeof FilmSoundEffectSpecSchema>;
export const FilmSoundSpecSchema = z
  .strictObject({
    effects: z.array(FilmSoundEffectSpecSchema).max(1_000),
  })
  .superRefine(({ effects }, context) => {
    const seen = new Set<string>();
    effects.forEach(({ id }, index) => {
      if (seen.has(id))
        context.addIssue({
          code: "custom",
          path: ["effects", index, "id"],
          message: `Sound effect id ${id} is repeated.`,
        });
      seen.add(id);
    });
  });
export type FilmSoundSpec = z.infer<typeof FilmSoundSpecSchema>;

/** Exclusive end. For odd centers, the extra frame follows the center. */
export const resolveFilmSoundEffectFrames = (
  effect: FilmSoundEffectSpec,
  durationInFrames: number,
) => {
  const offset =
    effect.anchor === "end"
      ? effect.durationFrames
      : effect.anchor === "center"
        ? Math.floor(effect.durationFrames / 2)
        : 0;
  const startFrame = effect.frame - offset;
  const endFrame = startFrame + effect.durationFrames;
  if (startFrame < 0 || endFrame > durationInFrames) {
    throw new Error(
      `Sound effect ${effect.id} spans [${startFrame}, ${endFrame}), outside the film [0, ${durationInFrames}); adjust frame, anchor or durationFrames.`,
    );
  }
  return { startFrame, endFrame, alignmentFrame: effect.frame };
};

type SfxSpecInput = {
  readonly render: { readonly fps: number };
  readonly sound?: FilmSoundSpec;
};
export const validateFilmSoundEffects = (
  spec: SfxSpecInput,
  durationInFrames: number,
) => {
  for (const effect of spec.sound?.effects ?? [])
    resolveFilmSoundEffectFrames(effect, durationInFrames);
};
export const computeFilmSoundEffectFingerprint = ({
  effect,
  fps,
}: {
  readonly effect: FilmSoundEffectSpec;
  readonly fps: number;
}) =>
  createFingerprint({
    namespace: "film-sfx-effect",
    version: 1,
    value: { synthesizerVersion: FILM_SFX_SYNTHESIZER_VERSION, fps, effect },
  });
export const computeFilmSfxInputFingerprint = ({
  spec,
  durationInFrames,
}: {
  readonly spec: SfxSpecInput;
  readonly durationInFrames: number;
}) =>
  createFingerprint({
    namespace: "film-sfx-input",
    version: 1,
    value: {
      synthesizerVersion: FILM_SFX_SYNTHESIZER_VERSION,
      fps: spec.render.fps,
      durationInFrames,
      sound: spec.sound ?? null,
    },
  });

export const FilmGeneratedSoundEffectSchema = z.strictObject({
  id: IdSchema,
  kind: FilmSoundEffectKindSchema,
  for: z.string().trim().min(1).max(500),
  inputFingerprint: DigestSchema,
  publicPath: z
    .string()
    .regex(/^public\/films\/[a-z0-9-]+\/sfx\/[a-z0-9-]+\.wav$/u),
  checksum: DigestSchema,
  sampleRate: z.number().int().positive(),
  sampleFrameCount: z.number().int().positive(),
  durationInFrames: DurationSchema,
  durationInSeconds: z.number().finite().positive(),
  startFrame: FrameSchema,
  endFrame: DurationSchema,
  alignmentFrame: FrameSchema,
  anchor: z.enum(["start", "end", "center"]),
});
export type FilmGeneratedSoundEffect = z.infer<
  typeof FilmGeneratedSoundEffectSchema
>;
export const FilmSfxSchema = z.strictObject({
  schemaVersion: z.literal(1),
  filmId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  inputFingerprint: DigestSchema,
  synthesizerVersion: z.string().min(1),
  effects: z.array(FilmGeneratedSoundEffectSchema).max(1_000),
});
export type FilmSfx = z.infer<typeof FilmSfxSchema>;
