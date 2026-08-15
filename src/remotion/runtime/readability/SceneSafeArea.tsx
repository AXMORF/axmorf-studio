import type { FC, ReactNode } from "react";

import {
  ProductionReadabilityPolicySchema,
  type ProductionReadabilityPolicy,
} from "../../../contracts/production-readability";
import { SceneReadabilityProvider } from "./SceneReadability";

export const SceneSafeArea: FC<
  Readonly<{
    policy: ProductionReadabilityPolicy;
    children: ReactNode;
  }>
> = ({ policy: rawPolicy, children }) => {
  const policy = ProductionReadabilityPolicySchema.parse(rawPolicy);
  const safeArea = policy.sceneContentSafeAreaPx;
  return (
    <SceneReadabilityProvider value={policy}>
      <div
        data-scene-safe-area={policy.policyFingerprint}
        style={{
          position: "absolute",
          top: safeArea.top,
          right: safeArea.right,
          bottom: safeArea.bottom,
          left: safeArea.left,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </SceneReadabilityProvider>
  );
};
