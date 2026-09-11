import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  Sha256DigestSchema,
  StoryIdSchema,
  type Sha256Digest,
} from "./primitives";
import { StyleProfileIdSchema } from "./scene-primitives";
import { VisualThemeSchema } from "./visual-theme";

export const VISUAL_STYLE_FINGERPRINT_VERSION =
  "visual-style-fingerprint-v1" as const;

const VisualStyleTextSchema = z.string().trim().min(1).max(512);

const UniqueVisualStyleRulesSchema = z
  .array(VisualStyleTextSchema)
  .max(32)
  .superRefine((rules, context) => {
    const seen = new Set<string>();
    rules.forEach((rule, index) => {
      if (seen.has(rule)) {
        context.addIssue({
          code: "custom",
          message: "Visual style rules must be unique.",
          path: [index],
        });
      }
      seen.add(rule);
    });
  })
  .readonly();

export const VisualStyleArtDirectionSchema = z
  .object({
    medium: VisualStyleTextSchema,
    palette: VisualStyleTextSchema,
    lighting: VisualStyleTextSchema,
    texture: VisualStyleTextSchema,
    compositionGrammar: VisualStyleTextSchema,
    motionLanguage: VisualStyleTextSchema,
    typography: VisualStyleTextSchema,
  })
  .strict()
  .readonly();

export const VisualStyleSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    styleProfileId: StyleProfileIdSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    artDirection: VisualStyleArtDirectionSchema,
    theme: VisualThemeSchema.optional(),
    continuityRules: UniqueVisualStyleRulesSchema,
    forbiddenTreatments: UniqueVisualStyleRulesSchema,
  })
  .strict()
  .readonly();

export type VisualStyleSpec = z.infer<typeof VisualStyleSpecSchema>;

export const computeVisualStyleFingerprint = ({
  visualStyle: rawVisualStyle,
  resolvedStyleDescriptorFingerprint: rawResolvedStyleDescriptorFingerprint,
}: {
  readonly visualStyle: unknown;
  readonly resolvedStyleDescriptorFingerprint: unknown;
}): Sha256Digest => {
  const visualStyle = VisualStyleSpecSchema.parse(rawVisualStyle);
  const resolvedStyleDescriptorFingerprint = Sha256DigestSchema.parse(
    rawResolvedStyleDescriptorFingerprint,
  );
  return createFingerprint({
    namespace: "visual-style",
    version: 1,
    value: {
      fingerprintVersion: VISUAL_STYLE_FINGERPRINT_VERSION,
      visualStyle,
      resolvedStyleDescriptorFingerprint,
    },
  });
};
