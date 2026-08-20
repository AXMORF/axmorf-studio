import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { CompositionIdSchema, PositiveIntegerSchema, Sha256DigestSchema, StoryIdSchema } from "./primitives";

export const COVER_SPEC_VERSION = "cover-spec-v2" as const;
const VariantSchema = z.object({ variantId: z.enum(["cover-4x3", "cover-3x4"]), aspectRatio: z.enum(["4:3", "3:4"]), width: PositiveIntegerSchema, height: PositiveIntegerSchema, layoutMode: z.literal("independent-composition") }).strict().readonly();
export const CoverSpecSchema = z.object({ schemaVersion: z.literal(2), contractVersion: z.literal(COVER_SPEC_VERSION), visualMode: z.literal("code-only-graphics"), variants: z.tuple([VariantSchema, VariantSchema]), forbiddenInputs: z.tuple([z.literal("image"), z.literal("video"), z.literal("audio"), z.literal("network"), z.literal("remote-font"), z.literal("scene-output"), z.literal("global-visual-output")]) }).strict().readonly();
export const FIXED_COVER_SPEC = CoverSpecSchema.parse({ schemaVersion: 2, contractVersion: COVER_SPEC_VERSION, visualMode: "code-only-graphics", variants: [
  { variantId: "cover-4x3", aspectRatio: "4:3", width: 1600, height: 1200, layoutMode: "independent-composition" },
  { variantId: "cover-3x4", aspectRatio: "3:4", width: 1200, height: 1600, layoutMode: "independent-composition" },
], forbiddenInputs: ["image", "video", "audio", "network", "remote-font", "scene-output", "global-visual-output"] });
export const COVER_SPEC_FINGERPRINT = createFingerprint({ namespace: "cover-spec", version: 2, value: FIXED_COVER_SPEC });
export const deriveCoverCompositionBaseId = (storyId: string) => CompositionIdSchema.parse(StoryIdSchema.parse(storyId).split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(""));
const CoverSourceFileSchema = z.object({ relativePath: z.string().min(1), checksum: Sha256DigestSchema }).strict();
export const computeCoverSourceGraphFingerprint = ({ storyId, sourceFiles }: { readonly storyId: unknown; readonly sourceFiles: unknown }) => createFingerprint({
  namespace: "cover-source-graph", version: 1,
  value: { storyId: StoryIdSchema.parse(storyId), sourceFiles: z.array(CoverSourceFileSchema).length(4).parse(sourceFiles) },
});
