import Renderer0 from "./scenes/call-to-action/Renderer";
import Renderer1 from "./scenes/core-capabilities/Renderer";
import Renderer2 from "./scenes/differentiated-value/Renderer";
import Renderer3 from "./scenes/problem-friction/Renderer";
import Renderer4 from "./scenes/problem-hook/Renderer";
import Renderer5 from "./scenes/product-reveal/Renderer";
import Renderer6 from "./scenes/proof-and-fit/Renderer";
import Renderer7 from "./scenes/workflow-create/Renderer";
import Renderer8 from "./scenes/workflow-input/Renderer";
import Renderer9 from "./scenes/workflow-result/Renderer";
import type {SceneRendererRegistry} from "../../remotion/runtime/story-visual/types";

export const rendererRegistryFingerprint = "sha256:4aa87328d92c3d7936e984e2a117a00f81db2f5a92e97710eb939577f5806530";
export const rendererSourceGraphFingerprints = {
  "product-comic-vertical-call-to-action": "sha256:8111f764304605ce64a960ae1ead0b0a3b195b535ba221b12306ee403d1e3470",
  "product-comic-vertical-core-capabilities": "sha256:63803e65644106c05d0da7c3ab6e423914af4d3837d611c1e3903cb63a98836a",
  "product-comic-vertical-differentiated-value": "sha256:4c5700fa518a094002bc6046a2f570dd314efb53da2f62d613de2029283f64d0",
  "product-comic-vertical-problem-friction": "sha256:3bc14b296bd6a329b071a7aef5a527fcf0e4fb011d2ea126372f927cc6811c5d",
  "product-comic-vertical-problem-hook": "sha256:916adcdc214463abc43c272270f071a838f7a77a68cbb3f5622aa4e4a72569b2",
  "product-comic-vertical-product-reveal": "sha256:9bb3d14210be084aa04769b3c17507c79e15f7be2105569be7029c3caac19b93",
  "product-comic-vertical-proof-and-fit": "sha256:62985d8bd560c29be6386bfda3f09ab66d26b1f94553d6a4eab41a8919156b53",
  "product-comic-vertical-workflow-create": "sha256:c78966764885ff18bfe1896c756cbd33806dff1f12ed196d106823e0247500f5",
  "product-comic-vertical-workflow-input": "sha256:87f2a3862ac4771917b35e48157a9235c78f56b5fa48021b513c385dda16c1b8",
  "product-comic-vertical-workflow-result": "sha256:cbea565d41167ccec5ab42a582bcf441a8e7b98dc0cb2846f5745f5b58119020",
} as const;
export const rendererRegistry = {
  "product-comic-vertical-call-to-action": Renderer0,
  "product-comic-vertical-core-capabilities": Renderer1,
  "product-comic-vertical-differentiated-value": Renderer2,
  "product-comic-vertical-problem-friction": Renderer3,
  "product-comic-vertical-problem-hook": Renderer4,
  "product-comic-vertical-product-reveal": Renderer5,
  "product-comic-vertical-proof-and-fit": Renderer6,
  "product-comic-vertical-workflow-create": Renderer7,
  "product-comic-vertical-workflow-input": Renderer8,
  "product-comic-vertical-workflow-result": Renderer9,
} as const satisfies SceneRendererRegistry;
