import type { FC } from "react";
import { Series } from "remotion";
import { z } from "zod";

import {
  VideoSourceReferencesSchema,
  type VideoSourceReference,
} from "../../../contracts/brief";
import { FIXED_OUTRO_DURATION_IN_FRAMES } from "../../../contracts/story-composition";
import {
  BRAND_FOLLOW_PLAYBACK_RATE,
  BrandFollowScene,
} from "./BrandFollowScene";
import { SourceCreditsScene } from "./SourceCreditsScene";

export { FIXED_OUTRO_MESSAGE } from "./content";
export { BRAND_FOLLOW_PLAYBACK_RATE };
export const FIXED_OUTRO_CREDITS_DURATION_IN_FRAMES = 120;
const BRAND_FOLLOW_SOURCE_DURATION_IN_FRAMES = 180;
export const FIXED_OUTRO_BRAND_DURATION_IN_FRAMES =
  BRAND_FOLLOW_SOURCE_DURATION_IN_FRAMES / BRAND_FOLLOW_PLAYBACK_RATE;
export { FIXED_OUTRO_DURATION_IN_FRAMES };

if (
  FIXED_OUTRO_CREDITS_DURATION_IN_FRAMES +
    FIXED_OUTRO_BRAND_DURATION_IN_FRAMES !==
  FIXED_OUTRO_DURATION_IN_FRAMES
) {
  throw new Error("FixedOutro sections must equal the fixed outro duration.");
}

export const FixedOutroPropsSchema = z
  .object({ references: VideoSourceReferencesSchema })
  .strict()
  .readonly();

export type FixedOutroProps = Readonly<{
  references: readonly VideoSourceReference[];
}>;

export const FixedOutro: FC<FixedOutroProps> = ({ references }) => {
  const validatedReferences = VideoSourceReferencesSchema.parse(references);

  return (
    <Series>
      <Series.Sequence
        durationInFrames={FIXED_OUTRO_CREDITS_DURATION_IN_FRAMES}
      >
        <SourceCreditsScene references={validatedReferences} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={FIXED_OUTRO_BRAND_DURATION_IN_FRAMES}>
        <BrandFollowScene />
      </Series.Sequence>
    </Series>
  );
};
