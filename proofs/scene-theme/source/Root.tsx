import { Composition } from "remotion";

import { SceneThemeProofComposition } from "./Composition";
import { SCENE_THEME_CASES, SCENE_THEME_PROOF } from "./matrix";

export const SceneThemeProofRoot = () => (
  <>
    {SCENE_THEME_CASES.map((scenario) => (
      <Composition
        key={scenario.id}
        id={scenario.id}
        component={SceneThemeProofComposition}
        width={scenario.width}
        height={scenario.height}
        fps={SCENE_THEME_PROOF.fps}
        durationInFrames={SCENE_THEME_PROOF.durationInFrames}
        defaultProps={{
          theme: scenario.theme,
          referenceCase: "six-mixed" as const,
        }}
      />
    ))}
  </>
);
