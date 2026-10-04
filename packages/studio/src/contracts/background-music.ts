import { z } from "zod";

import { ResourceIdSchema } from "./resource-catalog";

const VolumeSchema = z.number().finite().min(0).max(1);

export const AutomaticBackgroundMusicSchema = z
  .object({
    mode: z.literal("auto"),
    volume: VolumeSchema.optional(),
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
        mode: z.literal("selected"),
        resourceId: ResourceIdSchema,
        volume: VolumeSchema.optional(),
      })
      .strict()
      .readonly(),
  ])
  .nullable();

export type ProjectBackgroundMusicSelection = z.infer<
  typeof ProjectBackgroundMusicSelectionSchema
>;
