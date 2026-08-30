import type { FC, ReactNode } from "react";

import {
  SceneReadabilityPolicySchema,
  resolveSceneViewport,
  type SceneReadabilityPolicy,
} from "../../../contracts/scene-readability";
import { SceneTypographyProvider } from "./SceneReadability";

export const SceneViewport: FC<
  Readonly<{
    policy: SceneReadabilityPolicy;
    children: ReactNode;
  }>
> = ({ policy: rawPolicy, children }) => {
  const policy = SceneReadabilityPolicySchema.parse(rawPolicy);
  const viewport = resolveSceneViewport(policy);
  const safeArea = policy.sceneContentSafeAreaPx;
  return (
    <SceneTypographyProvider value={viewport.minFontSizePx}>
      <div
        data-scene-viewport={viewport.viewportFingerprint}
        data-scene-viewport-coordinate-space={viewport.coordinateSpace}
        style={{
          position: "absolute",
          top: safeArea.top,
          left: safeArea.left,
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
