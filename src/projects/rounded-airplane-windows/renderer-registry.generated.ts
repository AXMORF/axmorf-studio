import Renderer0 from "./scenes/rounded-load-path/Renderer";
import Renderer1 from "./scenes/square-corner-stress/Renderer";
import type {SceneRendererRegistry} from "../../remotion/runtime/story-visual/types";

export const rendererRegistryFingerprint = "sha256:83d659d71f0b43adc8aa92767c354ce59c9f4dfd9cb29374eded3a79c8b42624";
export const rendererSourceGraphFingerprints = {
  "rounded-airplane-windows-rounded-load-path": "sha256:e5a7d0c7e048aaa1739576269d4f44ba462c9afc05074677337fa0713a51ec0a",
  "rounded-airplane-windows-square-corner-stress": "sha256:2459d08144c731ce6ebeccc4aa427237338ab9fdbbedaa7ef5d569110dacc990",
} as const;
export const rendererRegistry = {
  "rounded-airplane-windows-rounded-load-path": Renderer0,
  "rounded-airplane-windows-square-corner-stress": Renderer1,
} as const satisfies SceneRendererRegistry;
