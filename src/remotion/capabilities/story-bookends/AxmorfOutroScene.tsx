import type { FC } from "react";

import { BrandFollowScene } from "./BrandFollowScene";
import { SourceCreditsScene } from "./SourceCreditsScene";

export type AxmorfOutroSceneProps = Readonly<{
  sceneFrame: number;
  width: number;
  height: number;
  sourceReferences: readonly Readonly<{ title: string; url: string }>[];
}>;

export const AxmorfOutroScene: FC<AxmorfOutroSceneProps> = ({
  sceneFrame,
  width,
  height,
  sourceReferences,
}) =>
  sceneFrame < 120 ? (
    <SourceCreditsScene
      sceneFrame={sceneFrame}
      width={width}
      height={height}
      references={sourceReferences}
    />
  ) : (
    <BrandFollowScene
      sceneFrame={sceneFrame - 120}
      width={width}
      height={height}
    />
  );
