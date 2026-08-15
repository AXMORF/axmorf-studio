export const SCENE_RUNTIME_PROOF_IDENTITY = {
  storyId: "scene-runtime-proof",
  meaningId: "runtime-proof-scene",
  captionChunkId: "scene-runtime-proof-chunk",
  compositionId: "SceneRuntimeProof",
  fidelityCompositionId: "SceneRuntimeFidelityAdaptation",
  durationInFrames: 120,
  fps: 30,
  width: 1920,
  height: 1080,
  stillFrame: 72,
  outputDirectory: "out/scene-runtime-proof",
  assetIds: {
    pulse: "asset.scene-runtime-proof-pulse",
    shape: "asset.scene-runtime-proof-shape",
  },
  publicAssetPaths: {
    pulse: "public/assets/library/scene-runtime-proof/proof-pulse.wav",
    shape: "public/assets/library/scene-runtime-proof/proof-shape.svg",
  },
} as const;
