import type { FC } from "react";

import { CaptionLayer, type CaptionLayerProps } from "./CaptionLayer";
import {
  NarrationAudioTrack,
  type NarrationAudioTrackProps,
} from "./NarrationAudioTrack";

export type NarrativeCoreProps = NarrationAudioTrackProps & CaptionLayerProps;

export const NarrativeCore: FC<NarrativeCoreProps> = (props) => (
  <>
    <NarrationAudioTrack
      src={props.src}
      narrationStartFrame={props.narrationStartFrame}
    />
    <CaptionLayer
      captionCues={props.captionCues}
      safeAreaPx={props.safeAreaPx}
      readabilityPolicy={props.readabilityPolicy}
    />
  </>
);
