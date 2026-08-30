import { z } from "zod";

const stableSlugSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const StoryIdSchema = stableSlugSchema.brand<"StoryId">();
export const MeaningIdSchema = stableSlugSchema.brand<"MeaningId">();
export const TtsChunkIdSchema = stableSlugSchema.brand<"TtsChunkId">();
export const VoiceProfileIdSchema = stableSlugSchema.brand<"VoiceProfileId">();

export const CompositionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  .brand<"CompositionId">();

export const PositiveIntegerSchema = z.number().int().positive().safe();
export const NonNegativeIntegerSchema = z.number().int().nonnegative().safe();

export const Sha256DigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/)
  .brand<"Sha256Digest">();

export const PublicProjectPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith("public/projects/") &&
      !value.startsWith("/") &&
      !value.includes("..") &&
      !value.includes("\\"),
    "Path must stay under public/projects and use forward slashes.",
  )
  .brand<"PublicProjectPath">();

export type StoryId = z.infer<typeof StoryIdSchema>;
export type MeaningId = z.infer<typeof MeaningIdSchema>;
export type TtsChunkId = z.infer<typeof TtsChunkIdSchema>;
export type VoiceProfileId = z.infer<typeof VoiceProfileIdSchema>;
export type CompositionId = z.infer<typeof CompositionIdSchema>;
export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;
export type PublicProjectPath = z.infer<typeof PublicProjectPathSchema>;
