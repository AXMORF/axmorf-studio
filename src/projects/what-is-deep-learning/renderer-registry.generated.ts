import Renderer0 from "./scenes/depth-enables-learning/Renderer";
import Renderer1 from "./scenes/features-build-up/Renderer";
import Renderer2 from "./scenes/layers-find-patterns/Renderer";
import Renderer3 from "./scenes/power-has-limits/Renderer";
import Renderer4 from "./scenes/training-adjusts-weights/Renderer";
import type {SceneRendererRegistry} from "../../remotion/runtime/story-visual/types";

export const rendererRegistryFingerprint = "sha256:29bbd14f54c54d230f3dd5a80929bd37cd341133a26efca3284eba423759ba6a";
export const rendererSourceGraphFingerprints = {
  "what-is-deep-learning-depth-enables-learning": "sha256:bd1a50f0ed08479aa2cfa5cdf6caa4d3cea764662c231ffb2ca90c1f13dcb281",
  "what-is-deep-learning-features-build-up": "sha256:ea4d25def971a7c81148f8e4c2e8537677ab82ecafb472e5aa1e685ccd77dd53",
  "what-is-deep-learning-layers-find-patterns": "sha256:f51b83eee385cfe5a2aa893bc7cb9966b65e3aaef8391697f0b146d20259af12",
  "what-is-deep-learning-power-has-limits": "sha256:e34901d14169e2643cf1aaa347bbefb8b423b49db4e828603647c80e030f8911",
  "what-is-deep-learning-training-adjusts-weights": "sha256:6e04d7b0820ff808f362c12825c400a8e8e9de957420b1fd59808ddfbc8fb810",
} as const;
export const rendererRegistry = {
  "what-is-deep-learning-depth-enables-learning": Renderer0,
  "what-is-deep-learning-features-build-up": Renderer1,
  "what-is-deep-learning-layers-find-patterns": Renderer2,
  "what-is-deep-learning-power-has-limits": Renderer3,
  "what-is-deep-learning-training-adjusts-weights": Renderer4,
} as const satisfies SceneRendererRegistry;
