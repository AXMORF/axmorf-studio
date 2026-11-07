import { z } from "zod";

import { createFingerprint } from "./fingerprint";

/** Bump whenever synthesis or PCM encoding changes: old audio must not hit cache. */
export const FILM_SFX_SYNTHESIZER_VERSION = "film-sfx-v2" as const;
export type FilmSfxSynthesizerVersion = "film-sfx-v1" | "film-sfx-v2";
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
  readonly music?: { readonly score?: Record<string, unknown> } | null;
};
const PitchClasses: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};
// Tune the settled fundamental (the arrival of a glide), not its noise layer.
const TonalBases: Partial<Record<FilmSoundEffectKind, number>> = {
  chime: 783.991,
  shimmer: 1567.982,
  swell: 140,
  riser: 2960,
  impact: 42,
  thud: 48,
  tick: 2100,
};
export const resolveFilmSoundEffectPitch = (
  effect: FilmSoundEffectSpec,
  spec: Pick<SfxSpecInput, "music">,
): FilmSoundEffectSpec => {
  if (effect.params?.pitch !== undefined) return effect;
  const arrangement = spec.music?.score?.arrangement as
    | { tonic?: unknown; mode?: unknown }
    | undefined;
  const base = TonalBases[effect.kind];
  const tonic =
    typeof arrangement?.tonic === "string" &&
    Object.hasOwn(PitchClasses, arrangement.tonic)
      ? PitchClasses[arrangement.tonic]
      : undefined;
  if (
    base === undefined ||
    tonic === undefined ||
    (arrangement?.mode !== "minor" && arrangement?.mode !== "major")
  )
    return effect;
  const midi = 69 + 12 * Math.log2(base / 440);
  // A tonic and its harmonic fifth belong to both supported scales. Preserve the
  // kind's register and timbre; an explicit (including zero) pitch always wins.
  const target = tonic + 12 * Math.round((midi - tonic) / 12);
  return { ...effect, params: { ...effect.params, pitch: target - midi } };
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
  synthesizerVersion = FILM_SFX_SYNTHESIZER_VERSION,
  spec = {},
}: {
  readonly effect: FilmSoundEffectSpec;
  readonly fps: number;
  readonly synthesizerVersion?: FilmSfxSynthesizerVersion;
  readonly spec?: Pick<SfxSpecInput, "music">;
}) =>
  createFingerprint({
    namespace: "film-sfx-effect",
    version: 1,
    value: {
      synthesizerVersion,
      fps,
      effect:
        synthesizerVersion === "film-sfx-v1"
          ? effect
          : resolveFilmSoundEffectPitch(effect, spec),
    },
  });
export const computeFilmSfxInputFingerprint = ({
  spec,
  durationInFrames,
  synthesizerVersion = FILM_SFX_SYNTHESIZER_VERSION,
}: {
  readonly spec: SfxSpecInput;
  readonly durationInFrames: number;
  readonly synthesizerVersion?: FilmSfxSynthesizerVersion;
}) =>
  createFingerprint({
    namespace: "film-sfx-input",
    version: 1,
    value: {
      synthesizerVersion,
      fps: spec.render.fps,
      durationInFrames,
      sound:
        spec.sound === undefined
          ? null
          : synthesizerVersion === "film-sfx-v1"
            ? spec.sound
            : {
                effects: spec.sound.effects.map((effect) =>
                  resolveFilmSoundEffectPitch(effect, spec),
                ),
              },
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
