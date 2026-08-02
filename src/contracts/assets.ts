import { z } from "zod";

import {
  ResourceAssetDescriptorSchema,
  type ResourceAssetDescriptor,
} from "./resource-catalog";

export {
  ResourceAssetKindSchema as AssetKindSchema,
  ResourceMediaRoleSchema as AssetMediaRoleSchema,
} from "./resource-catalog";

export type AssetKind = ResourceAssetDescriptor["assetKind"];
export type AssetSoundRole = Extract<
  ResourceAssetDescriptor["mediaRole"],
  "narration" | "global-bgm" | "scene-ambience" | "scene-sfx"
>;
export type ProducerAsset = ResourceAssetDescriptor;

export const ProducerAssetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    assets: z
      .array(ResourceAssetDescriptorSchema)
      .superRefine((assets, context) => {
        const seen = new Set<string>();
        assets.forEach((asset, index) => {
          if (seen.has(asset.id)) {
            context.addIssue({
              code: "custom",
              message: "Asset IDs must be unique.",
              path: [index, "id"],
            });
          }
          seen.add(asset.id);
        });
      })
      .readonly(),
  })
  .strict()
  .readonly();

export type ProducerAssetManifest = z.infer<typeof ProducerAssetManifestSchema>;

export const assertProducerAssetManifest = (manifest: unknown): void => {
  ProducerAssetManifestSchema.parse(manifest);
};
