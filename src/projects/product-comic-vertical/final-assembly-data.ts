import {
  FinalAssemblyPlanSchema,
  GlobalSoundPlanSchema,
  GlobalVisualPlanSchema,
  GlobalVisualProjectionSchema,
  NarrativeAutoCheckReportSchema,
  ResourceCatalogSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  createFingerprint,
} from "../../contracts";
import {resolveGlobalSound} from "../../remotion/runtime/global-sound";
import finalAssemblyJson from "./generated/final-assembly.generated.json";
import globalVisualProjectionJson from "./generated/global-visual-projection.generated.json";
import narrativeReportJson from "./generated/narrative-auto-check.generated.json";
import assemblyCatalogJson from "./generated/resource-catalog.generated.json";
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import globalSoundPlanJson from "./global-sound-plan.json";
import globalVisualPlanJson from "./global-visual-plan.json";
import {
  productComicVerticalSoundDesignProjection,
  productComicVerticalStoryVisualProjection,
} from "./scene-runtime-data";

const assemblyCatalog = ResourceCatalogSchema.parse(assemblyCatalogJson);
const timing = SemanticTimingSchema.parse(semanticTimingJson);
const sealedNarration = SealedNarrationManifestSchema.parse(sealedNarrationJson);
const narrativeReport = NarrativeAutoCheckReportSchema.parse(narrativeReportJson);
const globalSoundPlan = GlobalSoundPlanSchema.parse(globalSoundPlanJson);
const globalVisualPlan = GlobalVisualPlanSchema.parse(globalVisualPlanJson);
const globalVisualProjection = GlobalVisualProjectionSchema.parse(
  globalVisualProjectionJson,
);
const finalAssembly = FinalAssemblyPlanSchema.parse(finalAssemblyJson);
const finalSound = resolveGlobalSound({
  rawPlan: globalSoundPlan,
  rawTiming: timing,
  soundDesignProjectionFingerprint:
    productComicVerticalSoundDesignProjection.soundDesignProjectionFingerprint,
});
const captionCuesFingerprint = createFingerprint({
  namespace: "caption-cues",
  version: 1,
  value: timing.captionCues,
});

if (
  finalAssembly.storyId !== "product-comic-vertical" ||
  finalAssembly.compositionId !== "ProductComicVertical" ||
  finalAssembly.narrativeReportFingerprint !== narrativeReport.reportFingerprint ||
  finalAssembly.sealedNarrationChecksum !== sealedNarration.completeAudio.checksum ||
  finalAssembly.sealedNarrationFingerprint !==
    sealedNarration.sealedNarrationFingerprint ||
  finalAssembly.semanticTimingFingerprint !== timing.fingerprint ||
  finalAssembly.captionCuesFingerprint !== captionCuesFingerprint ||
  finalAssembly.resourceCatalogFingerprint !== assemblyCatalog.catalogFingerprint ||
  globalSoundPlan.catalogFingerprint !== assemblyCatalog.catalogFingerprint ||
  globalVisualPlan.catalogFingerprint !== assemblyCatalog.catalogFingerprint ||
  finalAssembly.globalSoundPlanFingerprint !== globalSoundPlan.planFingerprint ||
  finalAssembly.finalSoundProjectionFingerprint !==
    finalSound.projection.projectionFingerprint ||
  finalAssembly.globalVisualPlanFingerprint !== globalVisualPlan.planFingerprint ||
  finalAssembly.globalVisualProjectionFingerprint !==
    globalVisualProjection.projectionFingerprint ||
  finalAssembly.storyVisualProjectionFingerprint !==
    productComicVerticalStoryVisualProjection.projectionFingerprint ||
  finalAssembly.soundDesignProjectionFingerprint !==
    productComicVerticalSoundDesignProjection.soundDesignProjectionFingerprint
) {
  throw new Error("Product comic M9 FinalAssembly runtime identity is stale.");
}

export const productComicVerticalFinalAssemblyData = {
  assemblyCatalog,
  finalSound,
  globalVisualPlan,
  globalVisualProjection,
  finalAssembly,
  narrativeReportFingerprint: narrativeReport.reportFingerprint,
  captionCuesFingerprint,
  storyVisualProjectionFingerprint:
    productComicVerticalStoryVisualProjection.projectionFingerprint,
  sceneSoundProjectionFingerprint:
    productComicVerticalSoundDesignProjection.soundDesignProjectionFingerprint,
} as const;
