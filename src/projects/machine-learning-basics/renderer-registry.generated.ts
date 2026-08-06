import Renderer0 from "./scenes/learn-with-cat-examples/Renderer";
import Renderer1 from "./scenes/not-human-thinking/Renderer";
import Renderer2 from "./scenes/one-sentence-summary/Renderer";
import Renderer3 from "./scenes/patterns-have-limits/Renderer";
import Renderer4 from "./scenes/rules-versus-examples/Renderer";
import Renderer5 from "./scenes/training-model-prediction/Renderer";
import type {SceneRendererRegistry} from "../../remotion/runtime/story-visual/types";

export const rendererRegistryFingerprint = "sha256:783ccb448a6ce1842f41a55c3dad3362ed7c14ef23252dadadd22c478dca83fb";
export const rendererSourceGraphFingerprints = {
  "machine-learning-basics-learn-with-cat-examples": "sha256:629df3e0fcb7754ad5fa4ce887cefd3009d1ff2ddfd4bd87208bdc7c2bfd1ab9",
  "machine-learning-basics-not-human-thinking": "sha256:d5d67ee021fbbd629b1e0e1a002b5267f2bff1a0ce1063a07fa057e771b389eb",
  "machine-learning-basics-one-sentence-summary": "sha256:52775394703495564af584c4180b18db899eca575f0ae3b75e06358063bb2f72",
  "machine-learning-basics-patterns-have-limits": "sha256:405bd8b1b4ca889380ed5818a696a663fa9c6790de85b32255664dd6fab734fc",
  "machine-learning-basics-rules-versus-examples": "sha256:f7fc6bef2272970c1e4a9fd0a3925670ca283efd61219f03d6b22774b185e0d7",
  "machine-learning-basics-training-model-prediction": "sha256:6db13ccdddb0b3a9afdf87f54ebb3e5460669461ab31e155b51cbc483d694224",
} as const;
export const rendererRegistry = {
  "machine-learning-basics-learn-with-cat-examples": Renderer0,
  "machine-learning-basics-not-human-thinking": Renderer1,
  "machine-learning-basics-one-sentence-summary": Renderer2,
  "machine-learning-basics-patterns-have-limits": Renderer3,
  "machine-learning-basics-rules-versus-examples": Renderer4,
  "machine-learning-basics-training-model-prediction": Renderer5,
} as const satisfies SceneRendererRegistry;
