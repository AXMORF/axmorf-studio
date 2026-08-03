import type {FC} from "react";

import {CallToActionPanels} from "./shots/CallToActionPanels";

type CallToActionRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  timingBeat: Readonly<{startFrame: number; endFrame: number}>;
}>;

const CallToActionRenderer: FC<CallToActionRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  timingBeat,
}) => {
  if (
    storyId !== "product-comic-vertical" ||
    meaningId !== "call-to-action" ||
    timingBeat.startFrame !== 4703 ||
    timingBeat.endFrame !== 5101 ||
    durationInFrames !== 398
  ) {
    throw new Error("call-to-action Renderer received stale Scene identity.");
  }
  return (
    <CallToActionPanels
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
    />
  );
};

export default CallToActionRenderer;
