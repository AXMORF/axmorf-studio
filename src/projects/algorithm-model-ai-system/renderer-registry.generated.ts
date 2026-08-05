import Renderer0 from "./scenes/algorithm-rules/Renderer";
import Renderer1 from "./scenes/model-learns/Renderer";
import Renderer2 from "./scenes/system-operates/Renderer";
import Renderer3 from "./scenes/three-layers/Renderer";
import Renderer4 from "./scenes/whole-picture/Renderer";
import type {SceneRendererRegistry} from "../../remotion/runtime/story-visual/types";

export const rendererRegistryFingerprint = "sha256:ea090e69cbd2cfea5499db86ed93f3d1539af01d467acec7a62dbbd7b4418994";
export const rendererSourceGraphFingerprints = {
  "algorithm-model-ai-system-algorithm-rules": "sha256:ae53b02901900b1aa3e57fa386ee066391b9be9d3b0e6d70c3d57419194578cb",
  "algorithm-model-ai-system-model-learns": "sha256:bddb0eaecbafd1420aa62b332f5038272033855b8d7366e67ac9ab2cdb0c138e",
  "algorithm-model-ai-system-system-operates": "sha256:36e37ccc8c8327beee84acf7b63822f9b04854ed6b7648f0f8086426796f94b9",
  "algorithm-model-ai-system-three-layers": "sha256:5abd9389769db5163042c9487861065f0f7c6747ca367c4cf0e84eb677276223",
  "algorithm-model-ai-system-whole-picture": "sha256:c6725a56380565ee09e99985663b568bb7930530045388ad0ad5d36a205cffd3",
} as const;
export const rendererRegistry = {
  "algorithm-model-ai-system-algorithm-rules": Renderer0,
  "algorithm-model-ai-system-model-learns": Renderer1,
  "algorithm-model-ai-system-system-operates": Renderer2,
  "algorithm-model-ai-system-three-layers": Renderer3,
  "algorithm-model-ai-system-whole-picture": Renderer4,
} as const satisfies SceneRendererRegistry;
