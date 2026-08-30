import { z } from "zod";

import { serializeCanonicalJson } from "./fingerprint";
import { NarrativeProjectSourceSchema } from "./project";
import { SealedNarrationManifestSchema } from "./sealed-narration";
import {
  generateSemanticTiming,
  SemanticTimingSchema,
} from "./semantic-timing";

export const NarrativeArtifactBundleSchema = z
  .object({
    projectSource: NarrativeProjectSourceSchema,
    sealedNarration: SealedNarrationManifestSchema,
    semanticTiming: SemanticTimingSchema,
  })
  .strict()
  .readonly();

export type NarrativeArtifactBundle = z.infer<
  typeof NarrativeArtifactBundleSchema
>;

export const validateNarrativeArtifactBundle = (
  input: unknown,
): NarrativeArtifactBundle => {
  const bundle = NarrativeArtifactBundleSchema.parse(input);
  const regenerated = generateSemanticTiming({
    story: bundle.projectSource.story,
    narration: bundle.projectSource.narration,
    render: bundle.projectSource.render,
    sealedNarration: bundle.sealedNarration,
  });
  if (
    serializeCanonicalJson(regenerated) !==
    serializeCanonicalJson(bundle.semanticTiming)
  ) {
    throw new Error("semantic-timing.generated.json is stale.");
  }
  return bundle;
};
