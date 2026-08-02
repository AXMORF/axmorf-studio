import Renderer0 from "./scenes/error-accumulation/Renderer";
import Renderer1 from "./scenes/net-drift/Renderer";
import Renderer2 from "./scenes/position-is-time/Renderer";
import Renderer3 from "./scenes/practical-conclusion/Renderer";
import Renderer4 from "./scenes/two-relativistic-effects/Renderer";
import type {SceneRendererRegistry} from "../../remotion/runtime/story-visual/types";

export const rendererRegistryFingerprint = "sha256:93b7059c9e3de9421e0dbe2a9dfe84b9bd6cdbc465cb6175bdc20f893ea336af";
export const rendererSourceGraphFingerprints = {
  "gps-relativity-error-accumulation": "sha256:2ca3b8b5d918ab653ee48be11d27d4c06d042894ddaaa9e4809388d85589ef6e",
  "gps-relativity-net-drift": "sha256:2065362e5f791742d41f4afbb1dddbb42c4365a8f1ec2eb1e9e5fcdee5542142",
  "gps-relativity-position-is-time": "sha256:ded9d2567273fa0a9971842f21c10444938e0e3c33f2e98eb1173fd6cde420a4",
  "gps-relativity-practical-conclusion": "sha256:97f7eda98d70f68714990a81d7eedc301ce2bff6a187a3f75a1ae2c913a4d54d",
  "gps-relativity-two-relativistic-effects": "sha256:f58cf2c199975c989e6d0a5fee66855fca7176b151a12a8aa5e9909b9f09c91b",
} as const;
export const rendererRegistry = {
  "gps-relativity-error-accumulation": Renderer0,
  "gps-relativity-net-drift": Renderer1,
  "gps-relativity-position-is-time": Renderer2,
  "gps-relativity-practical-conclusion": Renderer3,
  "gps-relativity-two-relativistic-effects": Renderer4,
} as const satisfies SceneRendererRegistry;
