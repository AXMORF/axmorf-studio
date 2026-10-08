import type { FC } from "react";

import { CaptionLayer, type CaptionLayerProps } from "./CaptionLayer";
import {
  NarrationAudioTrack,
  type NarrationAudioTrackProps,
} from "./NarrationAudioTrack";

export type NarrativeCoreProps = (
  | NarrationAudioTrackProps
  | Readonly<{ src: null; narrationStartFrame: null }>
) &
  CaptionLayerProps;

export const NarrativeCore: FC<NarrativeCoreProps> = (props) => (
  <>
    {props.src === null ? null : (
      <NarrationAudioTrack
        src={props.src}
        narrationStartFrame={props.narrationStartFrame}
      />
    )}
    <CaptionLayer
      captionCues={props.captionCues}
      safeAreaPx={props.safeAreaPx}
      readabilityPolicy={props.readabilityPolicy}
    />
  </>
);
