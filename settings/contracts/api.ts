import { z } from "zod";

import { FilmIdSchema, ProducerConfigSchema } from "@axmorf/studio/contracts";

export const SETTINGS_API_ROUTES = {
  settings: "/api/settings",
  diagnostics: "/api/diagnostics",
  films: "/api/films",
  filmDeletion: "/api/films/delete",
} as const;

export const ApiErrorSchema = z.object({ error: z.string().min(1) }).strict();

export const EnvironmentDiagnosticsSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(["pass", "attention"]),
    checks: z.array(
      z
        .object({
          id: z.string().min(1),
          status: z.enum(["pass", "fail"]),
          summary: z.string().min(1),
          remediation: z.string().min(1).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export type EnvironmentDiagnostics = z.infer<
  typeof EnvironmentDiagnosticsSchema
>;

/** Mirrors `film:list`: one row per `src/films/<filmId>/`. */
export const FilmSummarySchema = z
  .object({
    filmId: FilmIdSchema,
    title: z.string().nullable(),
    render: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fps: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    sentences: z.number().int().nonnegative().nullable(),
    voice: z.boolean(),
    music: z.enum(["none", "ready", "missing"]),
    delivered: z
      .object({
        at: z.string().datetime({ offset: true }),
        seconds: z.number().positive(),
        video: z.string().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type FilmSummary = z.infer<typeof FilmSummarySchema>;

export const FilmListResponseSchema = z
  .object({
    status: z.literal("films-listed"),
    films: z.array(FilmSummarySchema),
  })
  .strict();

export type FilmListResponse = z.infer<typeof FilmListResponseSchema>;

export const DeleteFilmRequestSchema = z
  .object({
    filmId: FilmIdSchema,
    confirmation: z.string(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.confirmation !== request.filmId) {
      context.addIssue({
        code: "custom",
        message: "请输入完整的作品 ID 确认删除。",
        path: ["confirmation"],
      });
    }
  });

export const DeleteFilmResponseSchema = z
  .object({ deletedFilmId: FilmIdSchema })
  .strict();

export { ProducerConfigSchema };

type DeepMutable<T> = T extends
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  ? T
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

type ProducerConfigDto = z.input<typeof ProducerConfigSchema>;

export type EditableConfig = Omit<
  DeepMutable<ProducerConfigDto>,
  "configFingerprint"
> & {
  configFingerprint?: ProducerConfigDto["configFingerprint"];
};

export type TtsProviderConfig = EditableConfig["tts"]["providers"][number];
export type VoxcpmProviderConfig = Extract<
  TtsProviderConfig,
  { kind: "voxcpm" }
>;
export type SpeechSdkProviderConfig = Extract<
  TtsProviderConfig,
  { kind: "speech-sdk" }
>;
export type EdgeTtsProviderConfig = Extract<
  TtsProviderConfig,
  { kind: "edge-tts" }
>;

export const parseEditableConfig = (raw: unknown): EditableConfig =>
  ProducerConfigSchema.parse(raw) as unknown as EditableConfig;
