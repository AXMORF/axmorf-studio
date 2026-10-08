import { AbsoluteFill, Composition, registerRoot } from "remotion";

import {
  NarrativeCore,
  SoundDesignTrack,
  StoryVisualTrack,
  type SceneRendererProps,
} from "../../../packages/studio/src/remotion";
import { createAuthoredGroupedRuntimeFixture } from "../../../tests/fixtures/scene/authored-grouped";

const fixture = createAuthoredGroupedRuntimeFixture();

const Renderer = ({
  sceneFrame,
  durationInFrames,
  viewportWidth,
  viewportHeight,
}: SceneRendererProps) => {
  const x = 32 + (sceneFrame / (durationInFrames - 1)) * (viewportWidth - 64);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 32,
          right: 32,
          top: viewportHeight / 2,
          height: 2,
          background: "#faf8ed",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - 14,
          top: viewportHeight / 2 - 14,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#00d3c8",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 32,
          top: viewportHeight / 2 + 28,
          fontSize: 36,
          color: "#faf8ed",
          fontFamily: "sans-serif",
        }}
      >
        {sceneFrame}
      </div>
    </>
  );
};

const Proof = ({ silent }: { readonly silent: boolean }) => (
  <AbsoluteFill style={{ background: "#101d2c" }}>
    <StoryVisualTrack
      projection={fixture.storyVisual}
      registry={{ "synthetic-proof-meaning-one": Renderer }}
      rendererPropsByMeaning={{
        "meaning-one": {
          storyId: fixture.task.storyId,
          meaningId: fixture.task.meaningId,
          durationInFrames: 120,
          fps: 30,
          storyBeat: fixture.task.storyBeat,
          coveredBeats: fixture.task.coveredBeats,
          sourceReferences: [],
          timingBeat: fixture.task.timingBeat,
          visualStyle: fixture.visualStyle,
          visualPlan: fixture.visual,
          shots: fixture.shots,
          syncAnchors: fixture.anchors,
          visualResources: [],
          readabilityPolicy: fixture.readabilityPolicy,
          sceneBoundaryVersion: "scene-composition-boundary-v2",
        },
      }}
    />
    <NarrativeCore
      src={null}
      narrationStartFrame={null}
      captionCues={fixture.semanticTiming.captionCues}
      safeAreaPx={fixture.readabilityPolicy.captionSafeAreaPx}
      readabilityPolicy={fixture.readabilityPolicy}
    />
    {silent ? null : <SoundDesignTrack projection={fixture.soundDesign} />}
  </AbsoluteFill>
);

const Root = () => (
  <Composition
    id="AuthoredGroupedProof"
    component={Proof}
    width={640}
    height={360}
    fps={30}
    durationInFrames={120}
    defaultProps={{ silent: false }}
  />
);

registerRoot(Root);
