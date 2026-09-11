import type { FC } from "react";
import type { VisualTheme } from "@axmorf/studio/contracts";

import { BrandFollowScene } from "./BrandFollowScene";
import { SourceCreditsScene } from "./SourceCreditsScene";

export type AxmorfOutroSceneProps = Readonly<{
  sceneFrame: number;
  width: number;
  height: number;
  theme: VisualTheme;
  sourceReferences: readonly Readonly<{ title: string; url: string }>[];
}>;

export const AxmorfOutroScene: FC<AxmorfOutroSceneProps> = ({
  sceneFrame,
  width,
  height,
  theme,
  sourceReferences,
}) =>
  sceneFrame < 120 ? (
    <SourceCreditsScene
      sceneFrame={sceneFrame}
      width={width}
      height={height}
      theme={theme}
      references={sourceReferences}
    />
  ) : (
    <BrandFollowScene
      sceneFrame={sceneFrame - 120}
      width={width}
      height={height}
      theme={theme}
    />
  );
