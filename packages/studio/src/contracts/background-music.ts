import { z } from "zod";

import { ResourceIdSchema } from "./resource-catalog";

const VolumeSchema = z.number().finite().min(0).max(1);

export const AutomaticBackgroundMusicSchema = z
  .object({
    mode: z.literal("auto"),
    volume: VolumeSchema.optional(),
    /** Music volume while narration speaks; omitted keeps one constant volume. */
    underSpeechVolume: VolumeSchema.optional(),
    resourceIds: z
      .array(ResourceIdSchema)
      .min(1)
      .max(256)
      .superRefine((ids, context) => {
        if (new Set(ids).size !== ids.length) {
          context.addIssue({
            code: "custom",
            message: "Background music resource IDs must be unique.",
          });
        }
      })
      .readonly()
      .optional(),
  })
  .strict()
  .readonly();

export const ProjectBackgroundMusicSelectionSchema = z
  .union([
    AutomaticBackgroundMusicSchema,
    z
      .object({
        mode: z.literal("synthesized"),
        sourcePath: z
          .string()
          .regex(
            /^public\/assets\/generated-score\/[a-z0-9]+(?:-[a-z0-9]+)*\/music\.wav$/u,
          ),
        timelinePath: z
          .string()
          .regex(
            /^public\/assets\/generated-score\/[a-z0-9]+(?:-[a-z0-9]+)*\/timeline\.json$/u,
          ),
        volume: VolumeSchema.optional(),
        underSpeechVolume: VolumeSchema.optional(),
      })
      .strict()
      .readonly(),
    z
      .object({
        mode: z.literal("selected"),
        resourceId: ResourceIdSchema,
        volume: VolumeSchema.optional(),
        underSpeechVolume: VolumeSchema.optional(),
      })
      .strict()
      .readonly(),
  ])
  .nullable();

export type ProjectBackgroundMusicSelection = z.infer<
  typeof ProjectBackgroundMusicSelectionSchema
>;
