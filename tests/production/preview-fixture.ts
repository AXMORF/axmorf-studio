const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

export const validGlobalVisualIdentity = {
  assignmentFingerprint: sha("c"),
  packageFingerprint: sha("d"),
  resultFingerprint: sha("e"),
  planFingerprint: sha("f"),
  projectionFingerprint: sha("0"),
  rendererSourceGraphFingerprint: sha("1"),
} as const;

export const validPreviewAssemblyInput = {
  storyId: "story-example",
  compositionId: "StoryExample",
  requirementsFingerprint: sha("1"),
  narrativeAutoCheckFingerprint: sha("2"),
  sealedNarrationFingerprint: sha("3"),
  semanticTimingFingerprint: sha("4"),
  captionCuesFingerprint: sha("5"),
  sceneCoverageFingerprint: sha("6"),
  scenePackages: [
    { meaningId: "opening", packageFingerprint: sha("7") },
    { meaningId: "conclusion", packageFingerprint: sha("8") },
  ],
  rendererRegistryFingerprint: sha("9"),
  storyVisualProjectionFingerprint: sha("a"),
  sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
  sceneLocalSound: {
    selection: "none",
    reason: "no-scene-local-audio",
  },
  compositionSourceChecksum: sha("b"),
  remotionVersion: "4.0.489",
  enhancements: {
    narrativeCore: "required",
    storyVisualTrack: "present",
    globalSoundPlan: "absent",
    bgm: "absent",
    crossSceneAmbience: "absent",
    ducking: "absent",
    globalVisualLayers: "absent",
  },
  layerOrder: ["story-visual", "narrative-core", "scene-local-sound"],
  mixOrder: ["narration", "scene-local-sound"],
  reviewPolicy: "mechanical-only",
} as const;

export const validPreviewEvidenceInput = {
  storyId: "story-example",
  compositionId: "StoryExample",
  requirementsFingerprint: sha("1"),
  previewAssemblyFingerprint: sha("2"),
  sceneCoverageFingerprint: sha("3"),
  rendererRegistryFingerprint: sha("4"),
  storyVisualProjectionFingerprint: sha("5"),
  media: {
    fullPreview: {
      relativePath: "out/story-example/production/run/preview.mp4",
      checksum: sha("6"),
    },
    representativeStills: [
      {
        relativePath: "out/story-example/production/run/still-0.png",
        checksum: sha("7"),
        frame: 0,
      },
    ],
    contactSheet: {
      relativePath: "out/story-example/production/run/contact-sheet.png",
      checksum: sha("8"),
    },
  },
  technical: {
    expected: {
      width: 1920,
      height: 1080,
      fps: 30,
      frameCount: 300,
      audio: "narration-plus-optional-scene-local",
    },
    actual: {
      width: 1920,
      height: 1080,
      fpsNumerator: 30,
      fpsDenominator: 1,
      frameCount: 300,
      durationSeconds: 10,
      videoStreamCount: 1,
      videoCodec: "h264",
      audioStreamCount: 1,
      audioCodec: "aac",
      decodedToEof: true,
    },
  },
  currentChecks: {
    coverage: "current-all-ready",
    rendererRegistry: "current",
    projections: "current",
    assembly: "current",
    mediaIdentity: "current",
  },
  absentEnhancements: {
    globalSoundPlan: true,
    bgm: true,
    crossSceneAmbience: true,
    ducking: true,
    globalVisualLayers: true,
  },
  aggregateStatus: "mechanically-ready",
  handoff: "awaiting explicit user preview decision",
} as const;
