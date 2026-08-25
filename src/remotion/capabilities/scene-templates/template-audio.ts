import { z } from "zod";

import {
  ProducerAssetManifestSchema,
  ResourceAssetDescriptorSchema,
} from "../../../contracts";

export const SCENE_TEMPLATE_AUDIO_PROJECTION_PATH =
  "src/remotion/catalog/scene-template-audio.generated.json";
export const SCENE_TEMPLATE_AUDIO_MANIFEST_PATH =
  "src/remotion/catalog/assets.manifest.json";

export const DEFAULT_SCENE_TEMPLATE_AUDIO_IDS = Object.freeze({
  intro: "asset.axmorf.default-intro-impact",
  outro: "asset.axmorf.default-outro-music",
});

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
    targetMediaRole: z.enum(["sound-effect", "background-music"]),
    destinationName: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
    soundCues: z.array(SoundCueSchema).length(1).readonly(),
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

export const buildDefaultSceneTemplateAudioProjection = (
  rawManifest: unknown,
): SceneTemplateAudioProjection => {
  const manifest = ProducerAssetManifestSchema.parse(rawManifest);
  const select = ({
    resourceId,
    expectedRole,
    minimumDurationInSeconds,
  }: {
    readonly resourceId: string;
    readonly expectedRole: "sound-effect" | "background-music";
    readonly minimumDurationInSeconds: number;
  }) => {
    const descriptor = manifest.assets.find(({ id }) => id === resourceId);
    if (
      descriptor === undefined ||
      descriptor.assetKind !== "audio" ||
      descriptor.mediaRole !== expectedRole ||
      descriptor.allowedUse !== "runtime-approved" ||
      descriptor.status !== "approved" ||
      descriptor.license.verificationStatus !== "verified" ||
      descriptor.media?.durationInSeconds === undefined ||
      descriptor.media.durationInSeconds < minimumDurationInSeconds
    ) {
      throw new Error(
        `Default Scene template audio is unavailable: ${resourceId}.`,
      );
    }
    return descriptor;
  };
  const intro = select({
    resourceId: DEFAULT_SCENE_TEMPLATE_AUDIO_IDS.intro,
    expectedRole: "sound-effect",
    minimumDurationInSeconds: 2,
  });
  const outro = select({
    resourceId: DEFAULT_SCENE_TEMPLATE_AUDIO_IDS.outro,
    expectedRole: "background-music",
    minimumDurationInSeconds: 8,
  });
  return SceneTemplateAudioProjectionSchema.parse({
    schemaVersion: 1,
    intro: {
      source: intro,
      targetMediaRole: "sound-effect",
      destinationName: "mixkit-movie-trailer-epic-impact-2908.wav",
      soundCues: [
        {
          cueId: "reveal-impact",
          anchorId: "intro-sound-start",
          offsetFrames: 0,
          durationInFrames: 60,
          volume: 0.82,
        },
      ],
    },
    outro: {
      source: outro,
      targetMediaRole: "background-music",
      destinationName: "mixkit-deep-urban-623.mp3",
      soundCues: [
        {
          cueId: "closing-music",
          anchorId: "closing-music-start",
          offsetFrames: 0,
          durationInFrames: 240,
          volume: 1,
        },
      ],
    },
  });
};
