import Renderer0 from "./scenes/analogy-limit/Renderer";
import Renderer1 from "./scenes/artificial-neuron/Renderer";
import Renderer2 from "./scenes/biological-neuron/Renderer";
import Renderer3 from "./scenes/name-origin/Renderer";
import Renderer4 from "./scenes/network-learning/Renderer";
import type {SceneRendererRegistry} from "../../remotion/runtime/story-visual/types";

export const rendererRegistryFingerprint = "sha256:17dfc1aa9fb0b827e9976cb6f3fdc32491684acc755a26a267ee83468d9e5b80";
export const rendererSourceGraphFingerprints = {
  "neural-network-name-analogy-limit": "sha256:a2adcaa58a25bb80e16665565b81d3d2b5f14cc02b8682630b00393d299d23ce",
  "neural-network-name-artificial-neuron": "sha256:48235f914f0a381573eb10270444fe444b1cef9046f6646b7e43664f47a57911",
  "neural-network-name-biological-neuron": "sha256:3f914aedb2666369c3cbe81abf5cf8f86ddf55202c97f959729e49e26af9cc7d",
  "neural-network-name-name-origin": "sha256:67dee6449f8d73328c3aac0158cf1ffc487cde77ed7f3adae2f0d1474fdbd6ac",
  "neural-network-name-network-learning": "sha256:b8ee85f006079c761aadf8827d9f4db195e380d3870bca609fbc31f2a1d34e4b",
} as const;
export const rendererRegistry = {
  "neural-network-name-analogy-limit": Renderer0,
  "neural-network-name-artificial-neuron": Renderer1,
  "neural-network-name-biological-neuron": Renderer2,
  "neural-network-name-name-origin": Renderer3,
  "neural-network-name-network-learning": Renderer4,
} as const satisfies SceneRendererRegistry;
