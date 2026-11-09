import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { FilmSoundSpecSchema, validateFilmSoundEffects } from "./film-sfx";
import { FilmMusicOnsetsSchema, FilmMusicAlignmentSchema } from "./film-score";

/**
 * Direct film contracts. A film is an ordinary Remotion source directory that
 * the Agent owns; these schemas only cover the script/recipe it writes and the
 * files that the voice, music, and delivery services generate for it.
 */

export const CAPTION_MAX_DISPLAY_HALF_UNITS = 72 as const;

const isRegionalIndicator = (codePoint: number) =>
  codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;

const isGraphemeContinuation = (codePoint: number) =>
  codePoint === 0x200d ||
  codePoint === 0x20e3 ||
  (codePoint >= 0x0300 && codePoint <= 0x036f) ||
  (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
  (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
  (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
  (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
  (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
  (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
  (codePoint >= 0xe0100 && codePoint <= 0xe01ef);

const splitCaptionGraphemes = (text: string) => {
  const codePoints = Array.from(text);
  const graphemes: string[] = [];
  let regionalIndicatorCount = 0;
  for (const codePointText of codePoints) {
    const codePoint = codePointText.codePointAt(0);
    if (codePoint === undefined) continue;
    const previous = graphemes.at(-1);
    const previousCodePoint = previous?.codePointAt(previous.length - 1);
    const append =
      previous !== undefined &&
      (isGraphemeContinuation(codePoint) ||
        previousCodePoint === 0x200d ||
        (isRegionalIndicator(codePoint) && regionalIndicatorCount % 2 === 1));
    if (append) graphemes[graphemes.length - 1] = previous + codePointText;
    else graphemes.push(codePointText);
    regionalIndicatorCount = isRegionalIndicator(codePoint)
      ? regionalIndicatorCount + 1
      : 0;
  }
  return graphemes;
};

export const countCaptionDisplayHalfUnits = (text: string) =>
  splitCaptionGraphemes(text).reduce(
    (total, grapheme) =>
      total +
      (Array.from(grapheme).every(
        (character) => (character.codePointAt(0) ?? 0x80) <= 0x7f,
      )
        ? 1
        : 2),
    0,
  );

export const FILM_SCHEMA_VERSION = 1 as const;
export const FILM_SPEECH_DUCKING_RAMP_FRAMES = 8;
export const FILM_COVER_VARIANTS = [
  { variant: "4x3", file: "cover-4x3.png", width: 1600, height: 1200 },
  { variant: "3x4", file: "cover-3x4.png", width: 1200, height: 1600 },
] as const;

/** Shared Still that tiles review frames into one contact sheet. */
export const FILM_CONTACT_SHEET_ID = "axmorf-contact-sheet";

/** Shared phone-readability threshold, in delivered composition pixels. */
export const minimumReadableFontSize = (width: number, height: number) =>
  Math.round(Math.min(width, height) * 0.024);

/** Default caption size; a 72 half-unit sentence fits on at most two lines. */
export const resolveFilmCaptionFontSize = (width: number, height: number) =>
  Math.round(Math.min(width, height) * (width < height ? 0.046 : 0.04));

/** Captions below this read poorly on a phone (about 43px on a 1080-wide frame). */
export const minimumCaptionFontSize = (width: number, height: number) =>
  Math.round(Math.min(width, height) * 0.04);

export const FILM_REVIEW_MEASUREMENT_MARKER = "AXMORF_REVIEW_MEASUREMENT";
export const FILM_REVIEW_MAX_TEXTS = 120;
// Conservative review hints: dense edge coverage, with any confirmed hit reported.
export const FILM_REVIEW_FOREGROUND_COLUMNS = 20;
export const FILM_REVIEW_FOREGROUND_ROWS = 7;
export const FILM_REVIEW_FOREGROUND_OPACITY = 0.3;
export const FilmReviewForegroundSchema = z
  .strictObject({
    samples: z.number().int().positive(),
    covered: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .refine(({ samples, covered, unknown }) => covered + unknown <= samples);
export type FilmReviewForeground = z.infer<typeof FilmReviewForegroundSchema>;

export const FilmReviewRectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type FilmReviewRect = z.infer<typeof FilmReviewRectSchema>;

// Bound telemetry to keep review's existing console transport small. Partial
// measurements remain unknown; this cap is not a film authoring limit.
export const FILM_REVIEW_MAX_OBJECTS = 120;
export const FilmReviewGraphicsSchema = z.strictObject({
  objects: z
    .array(
      z.strictObject({
        id: z.number().int().nonnegative(),
        label: z.string().min(1).max(160),
        role: z.enum(["subject", "relation", "background"]),
        ancestors: z
          .array(z.number().int().nonnegative())
          .max(FILM_REVIEW_MAX_OBJECTS),
        rect: FilmReviewRectSchema,
      }),
    )
    .max(FILM_REVIEW_MAX_OBJECTS),
  /** Sum of clipped painted-element bounding-box areas, not a silhouette union. */
  unlabeledArea: z.number().nonnegative(),
  unlabeledCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  unknown: z.array(z.string().min(1).max(240)).max(20),
});
export type FilmReviewGraphics = z.infer<typeof FilmReviewGraphicsSchema>;

/** Internal review telemetry; no DOM or Node dependencies. */
export const FilmReviewMeasurementSchema = z.strictObject({
  index: z.number().int().nonnegative(),
  frame: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Body frame is inside a FilmSceneTrack overlay or overlap window. */
  transitionWindow: z.boolean().optional(),
  /** Actual rendered caption size, or the canvas default between sentences. */
  captionFontSize: z.number().positive().optional(),
  texts: z
    .array(
      z.strictObject({
        snippet: z.string().min(1).max(24),
        caption: z.boolean(),
        statusTag: z.boolean().optional(),
        fontSize: z.number().nonnegative(),
        rect: FilmReviewRectSchema,
        captionRect: FilmReviewRectSchema.optional(),
        foreground: FilmReviewForegroundSchema.optional(),
        /** Computed sRGB fill, including fill/ancestor alpha. Absent if unmeasurable. */
        color: z
          .tuple([
            z.number().int().min(0).max(255),
            z.number().int().min(0).max(255),
            z.number().int().min(0).max(255),
            z.number().min(0).max(1),
          ])
          .optional(),
        textGroup: z.string().min(1).max(80).optional(),
      }),
    )
    .max(FILM_REVIEW_MAX_TEXTS),
  /** Optional for older telemetry; absence is unknown, never a clean frame. */
  graphics: FilmReviewGraphicsSchema.optional(),
  truncated: z.boolean(),
  error: z.string().min(1).max(1_000).optional(),
});
export type FilmReviewMeasurement = z.infer<typeof FilmReviewMeasurementSchema>;

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

/**
 * A registered audio asset used as the film's music. The beat grid is
 * authored (film:music suggests values) so the cut stays reproducible.
 */
export const FilmMusicTrackSchema = z
  .object({
    /** File name of an audio entry in assets.json (`film:asset` registers it). */
    asset: z.string().regex(/^[a-z0-9][a-z0-9._-]*\.(?:wav|mp3|m4a)$/u),
    /** Seconds cut from the start of the file before the film's music begins. */
    trimStartSeconds: z.number().finite().min(0).max(3_600).default(0),
    /** Omit bpm and firstDownbeatSeconds once: film:music then suggests both. */
    bpm: z.number().finite().min(50).max(220).optional(),
    beatsPerBar: z.number().int().min(2).max(7).default(4),
    /** Time of the first downbeat after the trim, in seconds. */
    firstDownbeatSeconds: z.number().finite().min(0).max(60).optional(),
    /** Bars (0-based, after the trim) where a new song section begins. */
    sectionBars: z.array(z.number().int().min(0).max(1_000)).max(64).optional(),
  })
  .strict()
  .superRefine((track, context) => {
    const bars = track.sectionBars ?? [];
    if (bars.some((bar, index) => index > 0 && bar <= bars[index - 1]!)) {
      context.addIssue({
        code: "custom",
        path: ["sectionBars"],
        message: "sectionBars must be strictly increasing.",
      });
    }
    if (
      (track.bpm === undefined) !==
      (track.firstDownbeatSeconds === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["bpm"],
        message: "Set bpm and firstDownbeatSeconds together.",
      });
    }
  });
export type FilmMusicTrack = z.infer<typeof FilmMusicTrackSchema>;

export const FilmMusicSpecSchema = z
  .object({
    /** studio-v3 (or compatible studio-v2) score without fps; injected from film. */
    score: z.record(z.string(), z.unknown()).optional(),
    /** A registered, licensed audio file instead of a synthesized score. */
    track: FilmMusicTrackSchema.optional(),
    startFrame: NonNegativeFrameSchema.default(0),
    volume: VolumeSchema.default(0.24),
    /** Music volume while narration is speaking. */
    underSpeechVolume: VolumeSchema.default(0.09),
    mixProfile: z.literal("voiceover").optional(),
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
    if ((music.score === undefined) === (music.track === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message:
          "Set exactly one of music.score (synthesized) or music.track (registered audio).",
      });
    }
    if (music.score !== undefined && "fps" in music.score) {
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
    sound: FilmSoundSpecSchema.optional(),
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
    if (spec.timeline.durationInFrames !== undefined) {
      try {
        validateFilmSoundEffects(spec, spec.timeline.durationInFrames);
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["sound", "effects"],
          message: (error as Error).message,
        });
      }
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

const scoreUsesSentenceAnchors = (score: FilmMusicSpec["score"]) => {
  const hasString = (value: unknown, key: string) =>
    typeof value === "object" &&
    value !== null &&
    key in value &&
    typeof (value as Record<string, unknown>)[key] === "string";
  const arrangement = score?.arrangement;
  const sections =
    typeof arrangement === "object" && arrangement !== null
      ? (arrangement as { sections?: unknown }).sections
      : undefined;
  return (
    (Array.isArray(sections) &&
      sections.some((section) => hasString(section, "from"))) ||
    (Array.isArray(score?.hits) &&
      score.hits.some((hit) => hasString(hit, "frame"))) ||
    (Array.isArray(score?.breaks) &&
      score.breaks.some(
        (gap) => hasString(gap, "from") || hasString(gap, "to"),
      )) ||
    hasString(score?.ending, "landFrame")
  );
};

export const computeFilmMusicInputFingerprint = ({
  spec,
  durationInFrames,
  sentenceFrames,
}: {
  readonly spec: FilmSpec;
  readonly durationInFrames: number;
  readonly sentenceFrames?: readonly {
    readonly id: string;
    readonly startFrame: number;
  }[];
}) =>
  createFingerprint({
    namespace: "film-music-input",
    version: 1,
    value: {
      fps: spec.render.fps,
      durationInFrames,
      music: spec.music,
      ...(scoreUsesSentenceAnchors(spec.music?.score)
        ? {
            sentenceFrames:
              sentenceFrames?.map(({ id, startFrame }) => ({
                id,
                startFrame,
              })) ?? [],
          }
        : {}),
    },
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
    onsets: FilmMusicOnsetsSchema.optional(),
    alignment: FilmMusicAlignmentSchema.optional(),
    /** Anchored scores have an authored ending and never loop. */
    loop: z.boolean().optional(),
    /** Present for music.track: checksum of the registered source audio. */
    trackChecksum: Sha256Schema.optional(),
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

/** Shares readability's warn-level, marker + single-line JSON transport. */
export const FILM_REVIEW_MOTION_MARKER = "AXMORF_REVIEW_MOTION";
export const FILM_MOTION_CURVE_ID = "axmorf-motion-curve";
const ReviewFrameSchema = z.number().int().nonnegative();
export const FilmReviewMotionSceneSchema = z.strictObject({
  id: z.string(),
  chapter: z.string().nullable(),
  boundaryFrame: ReviewFrameSchema,
  endFrame: ReviewFrameSchema,
  enter: z
    .strictObject({
      kind: z.string(),
      mode: z.enum(["overlay", "overlap"]),
      startFrame: ReviewFrameSchema,
      endFrame: ReviewFrameSchema,
    })
    .nullable(),
});
export const FilmReviewMotionEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("scene-track"),
    scenes: z.array(FilmReviewMotionSceneSchema),
  }),
  z.strictObject({
    type: z.literal("sound-effects"),
    cues: z.array(
      z.strictObject({
        frame: ReviewFrameSchema,
        endFrame: ReviewFrameSchema,
        /** Actual start/end/center anchor; absent in legacy telemetry. */
        alignmentFrame: ReviewFrameSchema.optional(),
        sfx: z.string(),
        for: z.string(),
      }),
    ),
  }),
  z.strictObject({
    type: z.literal("recipe"),
    id: z.string(),
    preset: z.string().optional(),
    anticipate: ReviewFrameSchema,
    move: ReviewFrameSchema,
    land: ReviewFrameSchema,
    settle: ReviewFrameSchema,
  }),
  z.strictObject({ type: z.literal("world-camera"), moving: z.boolean() }),
  z.strictObject({
    type: z.literal("rhythm"),
    kind: z.enum(["pulse", "narration", "bar-camera", "impact"]),
    frames: z.array(ReviewFrameSchema),
  }),
]);
export type FilmReviewMotionEvent = z.infer<typeof FilmReviewMotionEventSchema>;
export const FilmReviewMotionSchema = z.strictObject({
  index: ReviewFrameSchema,
  frame: ReviewFrameSchema,
  events: z.array(FilmReviewMotionEventSchema).max(120),
  truncated: z.boolean(),
});
export type FilmReviewMotion = z.infer<typeof FilmReviewMotionSchema>;
export const FilmMotionRuleSchema = z.enum([
  "enter-then-hold",
  "hard-cut-heavy",
  "no-sound-effects",
  "off-beat-cuts",
  "static-camera",
  "repeated-composition",
  "accent-without-visual",
  "visual-without-sound",
  "sound-without-visual",
  "bar-without-change",
  "accent-underplayed",
  "beat-sections-static",
  "axiom-morph-missing", // Legacy reports only; no longer emitted.
]);
export const FilmMotionWarningSchema = z.strictObject({
  rule: FilmMotionRuleSchema,
  frames: z.tuple([ReviewFrameSchema, ReviewFrameSchema]),
  message: z.string(),
});
export const FilmMotionCurveSchema = z.strictObject({
  fps: z.number().positive(),
  sampleSeconds: z.number().positive(),
  samples: z.array(
    z.strictObject({
      frame: ReviewFrameSchema,
      difference: z.number().nonnegative(),
    }),
  ),
  seconds: z.array(
    z.strictObject({
      second: ReviewFrameSchema,
      difference: z.number().nonnegative(),
    }),
  ),
  cuts: z.array(
    z.strictObject({
      from: ReviewFrameSchema,
      to: ReviewFrameSchema,
      frame: ReviewFrameSchema,
      difference: z.number().nonnegative(),
    }),
  ),
});
export type FilmMotionCurve = z.infer<typeof FilmMotionCurveSchema>;
export const FilmMotionReviewSchema = z.strictObject({
  motion: z.strictObject({
    summary: z.strictObject({
      sampledFrames: ReviewFrameSchema,
      sceneCount: ReviewFrameSchema,
      cueCount: ReviewFrameSchema,
      recipeIds: z.array(z.string()),
      cameraPresets: z.array(z.string()),
      worldCameraSamples: ReviewFrameSchema,
      detectedCuts: ReviewFrameSchema,
      motionEnergy: z
        .strictObject({
          sampledFrames: ReviewFrameSchema,
          p95: z.number().nonnegative(),
          p99: z.number().nonnegative().optional(),
          median: z.number().nonnegative().optional(),
          anticipationThreshold: z.number().nonnegative().optional(),
          strongAccents: z
            .array(
              z.strictObject({
                frame: ReviewFrameSchema,
                strength: z.number().min(0).max(1),
                peak: z.number().nonnegative(),
                anticipationFrames: ReviewFrameSchema.optional(),
              }),
            )
            .nullable(),
          speechFrames: ReviewFrameSchema,
          speechMedian: z.number().nonnegative().nullable(),
          beatFrames: ReviewFrameSchema,
          beatMedian: z.number().nonnegative().nullable(),
        })
        .nullable()
        .optional(),
      rhythmSync: z
        .strictObject({
          accents: z
            .strictObject({
              total: ReviewFrameSchema,
              matched: ReviewFrameSchema,
            })
            .nullable(),
          landings: z
            .strictObject({
              total: ReviewFrameSchema,
              matched: ReviewFrameSchema,
            })
            .nullable(),
          sounds: z
            .strictObject({
              total: ReviewFrameSchema,
              matched: ReviewFrameSchema,
            })
            .nullable(),
          bars: z
            .strictObject({
              total: ReviewFrameSchema,
              matched: ReviewFrameSchema,
            })
            .nullable(),
        })
        .optional(),
    }),
    boundaryChecks: z.array(
      z.strictObject({
        boundaryFrame: ReviewFrameSchema,
        kind: z.string().nullable(),
        candidateCutFrames: z
          .tuple([ReviewFrameSchema, ReviewFrameSchema])
          .nullable(),
      }),
    ),
    telemetry: z.array(FilmReviewMotionSchema),
    badLines: ReviewFrameSchema,
    missingFrames: z.array(ReviewFrameSchema),
    unknown: z.array(
      z.strictObject({ rule: FilmMotionRuleSchema, reason: z.string() }),
    ),
    curve: z.strictObject({ json: z.string(), image: z.string() }),
    dense: z.array(
      z.strictObject({
        rule: FilmMotionRuleSchema,
        frames: z.tuple([ReviewFrameSchema, ReviewFrameSchema]),
        directory: z.string(),
        count: ReviewFrameSchema,
      }),
    ),
    denseSkipped: ReviewFrameSchema,
    animatic: z.string().nullable(),
    "strong-accent-strip": z
      .array(
        z.strictObject({
          frame: ReviewFrameSchema,
          strength: z.number().min(0.9).max(1),
          frames: z.array(ReviewFrameSchema).min(1),
          image: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
    energy: z
      .strictObject({
        json: z.string(),
        decodedFrames: ReviewFrameSchema,
        decodeMs: z.number().nonnegative(),
      })
      .nullable()
      .optional(),
  }),
  motionWarnings: z.array(FilmMotionWarningSchema),
});
