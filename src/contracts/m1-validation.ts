import { z } from "zod";

import { serializeCanonicalJson } from "./fingerprint";
import { NarrativeProjectSourceSchema } from "./project";
import { SealedNarrationManifestSchema } from "./sealed-narration";
import {
  generateSemanticTiming,
  SemanticTimingSchema,
} from "./semantic-timing";

export const M1ArtifactBundleSchema = z
  .object({
    projectSource: NarrativeProjectSourceSchema,
    sealedNarration: SealedNarrationManifestSchema,
    semanticTiming: SemanticTimingSchema,
  })
  .strict()
  .readonly();

export type M1ArtifactBundle = z.infer<typeof M1ArtifactBundleSchema>;

export const validateM1ArtifactBundle = (input: unknown): M1ArtifactBundle => {
  const bundle = M1ArtifactBundleSchema.parse(input);
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
