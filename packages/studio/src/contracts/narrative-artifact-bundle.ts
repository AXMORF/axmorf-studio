import { z } from "zod";

import { serializeCanonicalJson } from "./fingerprint";
import { NarrativeProjectSourceSchema } from "./project";
import { SealedNarrationManifestSchema } from "./sealed-narration";
import {
  generateSemanticTiming,
  generateVisualSemanticTiming,
  SemanticTimingSchema,
} from "./semantic-timing";
import { isVisualStory } from "./story";

export const NarrativeArtifactBundleSchema = z
  .object({
    projectSource: NarrativeProjectSourceSchema,
    sealedNarration: SealedNarrationManifestSchema.nullable(),
    semanticTiming: SemanticTimingSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    if (
      isVisualStory(bundle.projectSource.story) !==
      (bundle.sealedNarration === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Visual Stories require no sealed PCM; narrated Stories require sealed narration.",
        path: ["sealedNarration"],
      });
    }
  })
  .readonly();

export type NarrativeArtifactBundle = z.infer<
  typeof NarrativeArtifactBundleSchema
>;

export const validateNarrativeArtifactBundle = (
  input: unknown,
): NarrativeArtifactBundle => {
  const bundle = NarrativeArtifactBundleSchema.parse(input);
  const { story, narration, render } = bundle.projectSource;
  const regenerated = isVisualStory(story)
    ? generateVisualSemanticTiming({ story, render })
    : (() => {
        if (narration === null || bundle.sealedNarration === null)
          throw new Error(
            "Narrated Stories require a NarrationSpec and sealed narration.",
          );
        return generateSemanticTiming({
          story,
          narration,
          render,
          sealedNarration: bundle.sealedNarration,
        });
      })();
  if (
    serializeCanonicalJson(regenerated) !==
    serializeCanonicalJson(bundle.semanticTiming)
  ) {
    throw new Error("semantic-timing.generated.json is stale.");
  }
  return bundle;
};
