import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  resolveBeatPulse,
  resolveBreathScale,
  useRhythmResponse,
} from "../../../remotion";
import { ReviewMeasure } from "../../film/review-measure";
import {
  ReviewMotionProvider,
  useReviewMotion,
} from "../../film/review-motion";
import { PaperCollageExample } from "./PaperCollageExample";

const GlobalOnly = () => {
  const frame = useCurrentFrame();
  const beats = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
  const pulse = resolveBeatPulse(frame, beats);
  useRhythmResponse({ object: "global", kind: "global-light", frames: beats });
  useRhythmResponse({ object: "global", kind: "global-scale", frames: beats });
  return (
    <AbsoluteFill
      style={{
        background: "#f5edda",
        transform: `scale(${resolveBreathScale(pulse)})`,
      }}
    >
      <AbsoluteFill style={{ background: "#fffaf0", opacity: pulse * 0.2 }} />
    </AbsoluteFill>
  );
};
const Chapter = ({ globalOnly }: { globalOnly: boolean }) => {
  useReviewMotion({
    type: "scene-track",
    scenes: [
      {
        id: "receipt",
        chapter: "核对费用",
        boundaryFrame: 0,
        endFrame: 180,
        enter: null,
      },
    ],
  });
  return globalOnly ? <GlobalOnly /> : <PaperCollageExample />;
};
export const BeatResponseGallery = ({
  globalOnly = false,
}: {
  globalOnly: boolean;
}) => {
  const frame = useCurrentFrame();
  return (
    <ReviewMotionProvider>
      <ReviewMeasure index={0} frame={frame}>
        <Chapter globalOnly={globalOnly} />
      </ReviewMeasure>
    </ReviewMotionProvider>
  );
};
