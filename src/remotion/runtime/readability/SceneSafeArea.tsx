import type { FC, ReactNode } from "react";

import {
  SceneReadabilityPolicySchema,
  type SceneReadabilityPolicy,
} from "../../../contracts/scene-readability";
import { SceneReadabilityProvider } from "./SceneReadability";

export const SCENE_SAFE_AREA_COORDINATE_SPACE =
  "composition-full-frame" as const;

export const SceneSafeArea: FC<
  Readonly<{
    policy: SceneReadabilityPolicy;
    children: ReactNode;
  }>
> = ({ policy: rawPolicy, children }) => {
  const policy = SceneReadabilityPolicySchema.parse(rawPolicy);
  const safeArea = policy.sceneContentSafeAreaPx;
  const clipPath = `inset(${safeArea.top}px ${safeArea.right}px ${safeArea.bottom}px ${safeArea.left}px)`;
  return (
    <SceneReadabilityProvider value={policy}>
      <div
        data-scene-safe-area={policy.policyFingerprint}
        data-scene-safe-area-coordinate-space={SCENE_SAFE_AREA_COORDINATE_SPACE}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          clipPath,
        }}
      >
        {children}
      </div>
    </SceneReadabilityProvider>
  );
};
