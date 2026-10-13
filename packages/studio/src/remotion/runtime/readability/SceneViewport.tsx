import type { FC, ReactNode } from "react";

import {
  SceneReadabilityPolicySchema,
  resolveSceneViewport,
  type SceneReadabilityPolicy,
} from "../../../contracts/scene-readability";
import { SceneTypographyProvider } from "./SceneReadability";
import type { StoryBeat } from "../../../contracts/story";

export const SceneViewport: FC<
  Readonly<{
    policy: SceneReadabilityPolicy;
    storyBeat?: StoryBeat;
    children: ReactNode;
  }>
> = ({ policy: rawPolicy, storyBeat, children }) => {
  const policy = SceneReadabilityPolicySchema.parse(rawPolicy);
  const viewport = resolveSceneViewport(policy, storyBeat);
  const safeArea = policy.sceneContentSafeAreaPx;
  return (
    <SceneTypographyProvider value={viewport}>
      <div
        data-scene-viewport={viewport.viewportFingerprint}
        data-scene-viewport-coordinate-space={viewport.coordinateSpace}
        style={{
          position: "absolute",
          top: viewport.schemaVersion === 2 ? 0 : safeArea.top,
          left: viewport.schemaVersion === 2 ? 0 : safeArea.left,
          width: viewport.width,
          height: viewport.height,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </SceneTypographyProvider>
  );
};
