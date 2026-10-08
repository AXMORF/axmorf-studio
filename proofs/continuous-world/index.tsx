import { registerRoot, Composition, AbsoluteFill } from "remotion";
import {
  ScenePackageSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  SceneSyncAnchorSetSchema,
  ShotPlanSetSchema,
  VisualStyleSpecSchema,
  buildSceneCoverageMap,
  resolveSceneReadabilityPolicy,
} from "@axmorf/studio/contracts";
import {
  CompositionAssembly,
  StoryVisualTrack,
  buildStoryVisualProjection,
  type SceneRendererMountProps,
} from "@axmorf/studio/remotion";
import proof from "./fixture.generated.json";
import Scene from "./Scene";

const scenePackage = ScenePackageSchema.parse(proof.scenePackage);
const task = SceneTaskInputSchema.parse(proof.task);
if (task.coveredBeats === undefined)
  throw new Error("Proof requires grouped Scene ownership.");
const coverage = buildSceneCoverageMap({
  storyId: task.storyId,
  storyBeatOrder: task.coveredBeats.map(({ storyBeat }) => storyBeat.meaningId),
  packages: [scenePackage],
  fallbacks: [],
  stalePackages: [],
});
const projection = buildStoryVisualProjection({
  storyId: proof.task.storyId,
  leadInFrames: 0,
  tailFrames: 0,
  durationInFrames: 150,
  storyBeatTimings: task.coveredBeats.map(({ timingBeat }) => timingBeat),
  coverage,
  packages: [scenePackage],
  registryFingerprint: scenePackage.rendererBinding.rendererSourceFingerprint,
  transitions: [
    {
      fromMeaningId: "choose",
      toMeaningId: "step",
      kind: "hard-cut",
      durationInFrames: 0,
    },
  ],
});
const mount: SceneRendererMountProps = {
  storyId: proof.task.storyId,
  meaningId: proof.task.meaningId,
  durationInFrames: 150,
  fps: 30,
  storyBeat: task.storyBeat,
  coveredBeats: task.coveredBeats,
  sourceReferences: [],
  timingBeat: proof.task.timingBeat,
  visualStyle: VisualStyleSpecSchema.parse(proof.visualStyle),
  visualPlan: SceneVisualPlanSchema.parse(proof.visual),
  shots: ShotPlanSetSchema.parse(proof.shots),
  syncAnchors: SceneSyncAnchorSetSchema.parse(proof.anchors),
  visualResources: [],
  sceneBoundaryVersion: "scene-composition-boundary-v2",
  readabilityPolicy: resolveSceneReadabilityPolicy({
    width: 1920,
    height: 1080,
  }),
};
const Film = () => (
  <CompositionAssembly
    globalVisualBackgroundLayers={
      <AbsoluteFill style={{ backgroundColor: "#172329" }} />
    }
    storyVisualTrack={
      <StoryVisualTrack
        projection={projection}
        registry={{ [scenePackage.rendererBinding.rendererId]: Scene }}
        rendererPropsByMeaning={{ choose: mount }}
      />
    }
    narrativeCore={null}
    soundDesignTrack={null}
  />
);
const Root = () => (
  <Composition
    id="ContinuousWorldProof"
    component={Film}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={150}
  />
);
registerRoot(Root);
