import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  CAPTION_MAX_DISPLAY_HALF_UNITS,
  countCaptionDisplayHalfUnits,
} from "./scene-readability";

/**
 * Direct film contracts. A film is an ordinary Remotion source directory that
 * the Agent owns; these schemas only cover the script/recipe it writes and the
 * files that the voice, music, and delivery services generate for it.
 */

export const FILM_SCHEMA_VERSION = 1 as const;
export const FILM_SPEECH_DUCKING_RAMP_FRAMES = 8;
export const FILM_COVER_VARIANTS = [
  { variant: "4x3", file: "cover-4x3.png", width: 1600, height: 1200 },
  { variant: "3x4", file: "cover-3x4.png", width: 1200, height: 1600 },
] as const;

/** Shared Still that tiles review frames into one contact sheet. */
export const FILM_CONTACT_SHEET_ID = "axmorf-contact-sheet";

/** Remotion composition ids registered for each film. */
export const filmCompositionIds = (filmId: string) =>
  ({
    film: filmId,
    review: `${filmId}--review`,
    cover4x3: `${filmId}--cover-4x3`,
    cover3x4: `${filmId}--cover-3x4`,
  }) as const;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const NonNegativeFrameSchema = z.number().int().min(0).max(1_000_000);
const PositiveFrameSchema = z.number().int().min(1).max(1_000_000);
const VolumeSchema = z.number().min(0).max(1);
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const FilmIdSchema = z.string().min(3).max(64).regex(slugPattern, {
  message: "Film ids use lowercase letters, digits, and single hyphens.",
});
export type FilmId = z.infer<typeof FilmIdSchema>;

export const FilmSentenceSchema = z
  .object({
    id: z.string().min(1).max(32).regex(slugPattern),
    text: z.string().trim().min(1).max(200),
    pauseAfterMs: z.number().int().min(0).max(5_000).optional(),
  })
  .strict()
  .superRefine((sentence, context) => {
    const halfUnits = countCaptionDisplayHalfUnits(sentence.text);
    if (halfUnits > CAPTION_MAX_DISPLAY_HALF_UNITS) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: `Sentence ${sentence.id} uses ${halfUnits} caption half-units; split it at a natural pause so each sentence fits ${CAPTION_MAX_DISPLAY_HALF_UNITS}.`,
      });
    }
  });
export type FilmSentence = z.infer<typeof FilmSentenceSchema>;

export const FilmMusicSpecSchema = z
  .object({
    /** studio-v2 score recipe without fps; the film fps is injected. */
    score: z.record(z.string(), z.unknown()),
    startFrame: NonNegativeFrameSchema.default(0),
    volume: VolumeSchema.default(0.24),
    /** Music volume while narration is speaking. */
    underSpeechVolume: VolumeSchema.default(0.09),
    fadeOutFrames: NonNegativeFrameSchema.default(45),
  })
  .strict()
  .superRefine((music, context) => {
    if (music.underSpeechVolume > music.volume) {
      context.addIssue({
        code: "custom",
        path: ["underSpeechVolume"],
        message: "underSpeechVolume cannot be louder than volume.",
      });
    }
    if ("fps" in music.score) {
      context.addIssue({
        code: "custom",
        path: ["score", "fps"],
        message: "Omit score.fps; the film render fps is used.",
      });
    }
  });
export type FilmMusicSpec = z.infer<typeof FilmMusicSpecSchema>;

/**
 * System brand bookends. Durations are authored at 30 fps and scale with the
 * film fps; they must stay equal to the scene-template timing.
 */
export const FILM_BOOKEND_TEMPLATES = {
  "axmorf-brand-reveal-v1": { role: "intro", durationAt30Fps: 60 },
  "axmorf-source-follow-v1": { role: "outro", durationAt30Fps: 240 },
} as const;
export type FilmBookendTemplateId = keyof typeof FILM_BOOKEND_TEMPLATES;

export const FilmBookendsSchema = z
  .object({
    intro: z.literal("axmorf-brand-reveal-v1").nullable(),
    outro: z.literal("axmorf-source-follow-v1").nullable(),
    theme: z.enum(["dark", "light"]).default("dark"),
    /** References listed on the outro before the brand lockup. */
    sources: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(80),
            url: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(6)
      .default([]),
  })
  .strict();
export type FilmBookends = z.infer<typeof FilmBookendsSchema>;

const bookendFrames = (id: FilmBookendTemplateId | null, fps: number) =>
  id === null
    ? 0
    : Math.round((FILM_BOOKEND_TEMPLATES[id].durationAt30Fps * fps) / 30);

/** Frames the system intro and outro add around the authored film body. */
export const resolveFilmBookendFrames = (spec: {
  readonly render: { readonly fps: number };
  readonly bookends?: FilmBookends | undefined;
}) => ({
  introFrames: bookendFrames(spec.bookends?.intro ?? null, spec.render.fps),
  outroFrames: bookendFrames(spec.bookends?.outro ?? null, spec.render.fps),
});

export const FilmSpecSchema = z
  .object({
    schemaVersion: z.literal(FILM_SCHEMA_VERSION),
    filmId: FilmIdSchema,
    render: z
      .object({
        width: z.number().int().min(320).max(4096),
        height: z.number().int().min(320).max(4096),
        fps: z.number().int().min(12).max(60),
      })
      .strict()
      .refine(
        ({ width, height }) => width % 2 === 0 && height % 2 === 0,
        "H.264 delivery needs an even width and height.",
      ),
    timeline: z
      .object({
        narrationStartFrame: NonNegativeFrameSchema.default(15),
        tailFrames: NonNegativeFrameSchema.default(45),
        /** Fixed total length; required when the film has no narration. */
        durationInFrames: PositiveFrameSchema.optional(),
      })
      .strict()
      .default({ narrationStartFrame: 15, tailFrames: 45 }),
    narration: z.array(FilmSentenceSchema).max(200),
    music: FilmMusicSpecSchema.nullable().default(null),
    /** Omitted means no bookends; film:new fills it from the Workspace defaults. */
    bookends: FilmBookendsSchema.optional(),
    publish: z
      .object({
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().max(2_000).default(""),
        tags: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
      })
      .strict(),
  })
  .strict()
  .superRefine((spec, context) => {
    const seen = new Set<string>();
    spec.narration.forEach((sentence, index) => {
      if (seen.has(sentence.id)) {
        context.addIssue({
          code: "custom",
          path: ["narration", index, "id"],
          message: `Sentence id ${sentence.id} is repeated.`,
        });
      }
      seen.add(sentence.id);
    });
    if (spec.narration.length === 0 && !spec.timeline.durationInFrames) {
      context.addIssue({
        code: "custom",
        path: ["timeline", "durationInFrames"],
        message: "A film without narration needs timeline.durationInFrames.",
      });
    }
  });
export type FilmSpec = z.infer<typeof FilmSpecSchema>;

/** Inputs that decide the generated timing; editing any of them makes it stale. */
export const computeFilmTimingInputFingerprint = (spec: FilmSpec) =>
  createFingerprint({
    namespace: "film-timing-input",
    version: 1,
    value: {
      fps: spec.render.fps,
      timeline: spec.timeline,
      narration: spec.narration.map(({ id, text, pauseAfterMs }) => ({
        id,
        text,
        pauseAfterMs: pauseAfterMs ?? 0,
      })),
    },
  });

export const computeFilmMusicInputFingerprint = ({
  spec,
  durationInFrames,
}: {
  readonly spec: FilmSpec;
  readonly durationInFrames: number;
}) =>
  createFingerprint({
    namespace: "film-music-input",
    version: 1,
    value: { fps: spec.render.fps, durationInFrames, music: spec.music },
  });

export const FilmTimingSchema = z
  .object({
    schemaVersion: z.literal(FILM_SCHEMA_VERSION),
    filmId: FilmIdSchema,
    inputFingerprint: Sha256Schema,
    fps: z.number().int().min(1),
    narrationStartFrame: NonNegativeFrameSchema,
    narrationEndFrame: NonNegativeFrameSchema,
    durationInFrames: PositiveFrameSchema,
    narration: z
      .object({
        publicPath: z.string().startsWith("public/films/"),
        checksum: Sha256Schema,
        sampleRate: z.number().int().positive(),
        sampleFrameCount: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    sentences: z.array(
      z
        .object({
          id: z.string(),
          text: z.string(),
          startFrame: NonNegativeFrameSchema,
          endFrame: PositiveFrameSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type FilmTiming = z.infer<typeof FilmTimingSchema>;

export const FilmMusicSchema = z
  .object({
    schemaVersion: z.literal(FILM_SCHEMA_VERSION),
    filmId: FilmIdSchema,
    inputFingerprint: Sha256Schema,
    publicPath: z.string().startsWith("public/films/"),
    checksum: Sha256Schema,
    startFrame: NonNegativeFrameSchema,
    /** Length of one pass of the score; it loops when the film is longer. */
    scoreDurationInFrames: PositiveFrameSchema,
    volume: VolumeSchema,
    underSpeechVolume: VolumeSchema,
    fadeOutFrames: NonNegativeFrameSchema,
    bpm: z.number().positive(),
    beatsPerBar: z.number().int().positive(),
    /** Absolute film frames, already offset by startFrame and repeated per loop. */
    beatFrames: z.array(NonNegativeFrameSchema),
    barFrames: z.array(NonNegativeFrameSchema),
    sectionFrames: z.array(NonNegativeFrameSchema),
    accentFrames: z.array(NonNegativeFrameSchema),
  })
  .strict();
export type FilmMusic = z.infer<typeof FilmMusicSchema>;

export const FilmAssetSchema = z
  .object({
    publicPath: z.string().startsWith("public/films/"),
    checksum: Sha256Schema,
    kind: z.enum(["image", "svg", "audio", "video"]),
    origin: z.enum(["generated", "original", "licensed"]),
    /** Tool, model, or author that produced the file. */
    creator: z.string().trim().min(1).max(200),
    license: z.string().trim().min(1).max(200),
    sourceUrl: z.string().url().optional(),
    attribution: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.origin === "licensed" && !asset.sourceUrl) {
      context.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "Licensed assets record where they were obtained.",
      });
    }
  });
export type FilmAsset = z.infer<typeof FilmAssetSchema>;

export const FilmAssetsSchema = z
  .object({
    schemaVersion: z.literal(FILM_SCHEMA_VERSION),
    filmId: FilmIdSchema,
    assets: z.array(FilmAssetSchema),
  })
  .strict();
export type FilmAssets = z.infer<typeof FilmAssetsSchema>;

const DeliveredFileSchema = z
  .object({ path: z.string(), checksum: Sha256Schema, size: z.number().int() })
  .strict();

export const FilmPublishSchema = z
  .object({
    schemaVersion: z.literal(FILM_SCHEMA_VERSION),
    filmId: FilmIdSchema,
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    durationInFrames: PositiveFrameSchema,
    fps: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    deliveredAt: z.string().datetime(),
    files: z
      .object({
        video: DeliveredFileSchema,
        cover4x3: DeliveredFileSchema,
        cover3x4: DeliveredFileSchema,
      })
      .strict(),
    attributions: z.array(z.string()),
  })
  .strict();
export type FilmPublish = z.infer<typeof FilmPublishSchema>;

/** Same frame boundary rule as sealed narration: ceil(samples × fps / rate). */
export const filmFrameFromSamples = (
  sampleFrames: number,
  fps: number,
  sampleRate: number,
) => {
  const numerator = BigInt(sampleFrames) * BigInt(fps);
  const denominator = BigInt(sampleRate);
  return Number((numerator + denominator - 1n) / denominator);
};
