import {
  FinalAssemblyPlanSchema,
  GlobalSoundPlanSchema,
  GlobalVisualPlanSchema,
  GlobalVisualProjectionSchema,
  ResourceCatalogSchema,
  SemanticTimingSchema,
} from "../../contracts";
import {resolveGlobalSound} from "../../remotion/runtime/global-sound";
import finalAssemblyJson from "./generated/final-assembly.generated.json";
import globalVisualProjectionJson from "./generated/global-visual-projection.generated.json";
import assemblyCatalogJson from "./generated/resource-catalog.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import globalSoundPlanJson from "./global-sound-plan.json";
import globalVisualPlanJson from "./global-visual-plan.json";
import {gpsRelativitySoundDesignProjection} from "./scene-runtime-data";

const assemblyCatalog = ResourceCatalogSchema.parse(assemblyCatalogJson);
const timing = SemanticTimingSchema.parse(semanticTimingJson);
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
    gpsRelativitySoundDesignProjection.soundDesignProjectionFingerprint,
});

if (
  finalAssembly.storyId !== "gps-relativity" ||
  finalAssembly.compositionId !== "GpsRelativity" ||
  finalAssembly.resourceCatalogFingerprint !==
    assemblyCatalog.catalogFingerprint ||
  globalSoundPlan.catalogFingerprint !== assemblyCatalog.catalogFingerprint ||
  globalVisualPlan.catalogFingerprint !== assemblyCatalog.catalogFingerprint ||
  finalAssembly.globalSoundPlanFingerprint !==
    globalSoundPlan.planFingerprint ||
  finalAssembly.finalSoundProjectionFingerprint !==
    finalSound.projection.projectionFingerprint ||
  finalAssembly.globalVisualPlanFingerprint !==
    globalVisualPlan.planFingerprint ||
  finalAssembly.globalVisualProjectionFingerprint !==
    globalVisualProjection.projectionFingerprint ||
  finalAssembly.soundDesignProjectionFingerprint !==
    gpsRelativitySoundDesignProjection.soundDesignProjectionFingerprint
) {
  throw new Error("GPS M8 FinalAssembly runtime identity is stale.");
}

export const gpsRelativityFinalAssemblyData = {
  assemblyCatalog,
  finalSound,
  globalVisualPlan,
  globalVisualProjection,
  finalAssembly,
  sceneSoundProjectionFingerprint:
    gpsRelativitySoundDesignProjection.soundDesignProjectionFingerprint,
} as const;
