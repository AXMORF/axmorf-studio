export const buildDefaultSceneTemplateAudioProjection = (manifest) => {
  const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const intro = byId.get("asset.axmorf-cinematic-impact-v1");
  const outro = byId.get("asset.axmorf-closing-pulse-v1");
  if (intro === undefined || outro === undefined) {
    throw new Error("Default Scene template audio assets are missing.");
  }
  return {
    schemaVersion: 1,
    intro: {
      source: intro,
      targetMediaRole: "sound-effect",
      destinationName: "axmorf-cinematic-impact-v1.wav",
      soundCues: [
        {
          cueId: "reveal-impact",
          anchorId: "intro-sound-start",
          offsetFrames: 0,
          durationInFrames: 60,
          volume: 0.82,
        },
      ],
    },
    outro: {
      source: outro,
      targetMediaRole: "background-music",
      destinationName: "axmorf-closing-pulse-v1.wav",
      soundCues: [
        {
          cueId: "closing-music",
          anchorId: "closing-music-start",
          offsetFrames: 0,
          durationInFrames: 240,
          volume: 1,
        },
      ],
    },
  };
};
