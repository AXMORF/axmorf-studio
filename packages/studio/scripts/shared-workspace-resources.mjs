export const buildDefaultSceneTemplateAudioProjection = (manifest) => {
  const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const intro = byId.get(
    "asset.mixkit.movie-trailer-epic-impact-2908-intro-2s",
  );
  const outro = byId.get("asset.mixkit.deep-urban-623-outro-8s");
  if (intro === undefined || outro === undefined) {
    throw new Error("Default Scene template audio assets are missing.");
  }
  return {
    schemaVersion: 1,
    intro: {
      source: intro,
      targetMediaRole: "sound-effect",
      destinationName: "mixkit-movie-trailer-epic-impact-2908-intro-2s.wav",
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
      destinationName: "mixkit-deep-urban-623-outro-8s.mp3",
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
