import { z } from "zod";

import {
  ResourceAssetDescriptorSchema,
  ResourceIdSchema,
} from "../../../contracts";

export const SCENE_TEMPLATE_AUDIO_PROJECTION_PATH =
  "src/remotion/catalog/scene-template-audio.generated.json";
export const SCENE_TEMPLATE_AUDIO_OVERRIDE_PATH =
  "private/reference-assets/scene-template-sound-overrides.json";

export const SceneTemplateAudioOverrideSchema = z
  .object({
    schemaVersion: z.literal(1),
    introResourceId: ResourceIdSchema,
    outroResourceId: ResourceIdSchema,
  })
  .strict()
  .readonly();

const SoundCueSchema = z
  .object({
    cueId: z.string().trim().min(1).max(80),
    anchorId: z.string().trim().min(1).max(80),
    offsetFrames: z.number().int().safe(),
    durationInFrames: z.number().int().positive().safe(),
    volume: z.number().min(0).max(1).finite(),
  })
  .strict()
  .readonly();

const AudioBindingSchema = z
  .object({
    source: ResourceAssetDescriptorSchema,
    targetMediaRole: z.enum(["scene-sfx", "scene-ambience"]),
    destinationName: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
    soundCues: z.array(SoundCueSchema).max(1).readonly(),
  })
  .strict()
  .readonly();

export const SceneTemplateAudioProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    intro: AudioBindingSchema.nullable(),
    outro: AudioBindingSchema.nullable(),
  })
  .strict()
  .readonly();

export type SceneTemplateAudioProjection = z.infer<
  typeof SceneTemplateAudioProjectionSchema
>;
