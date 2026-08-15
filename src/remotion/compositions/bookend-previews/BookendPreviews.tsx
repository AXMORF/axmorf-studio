import type { FC, ReactNode } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  DEFAULT_INTRO_SCENE_PRESET,
  DEFAULT_OUTRO_SCENE_PRESET,
  ProducerAssetManifestSchema,
  type SilentScenePreset,
} from "../../../contracts";
import assetManifestJson from "../../catalog/assets.manifest.json";
import {
  AxmorfIntroScene,
  AxmorfOutroScene,
} from "../../capabilities/story-bookends";
import { BOOKEND_IMPLEMENTATION_TIMING } from "../../capabilities/story-bookends/timing";

const PREVIEW_FPS = 30;
const assetManifest = ProducerAssetManifestSchema.parse(assetManifestJson);

const buildPreviewSpec = ({
  preset,
  implementationId,
  anchorFrame,
}: {
  readonly preset: SilentScenePreset;
  readonly implementationId: keyof typeof BOOKEND_IMPLEMENTATION_TIMING;
  readonly anchorFrame: number;
}) => {
  const implementation = preset.implementation;
  const timing = BOOKEND_IMPLEMENTATION_TIMING[implementationId];
  if (
    implementation.kind !== "reusable-scene" ||
    implementation.implementationId !== implementationId ||
    implementation.soundCues.length !== 1 ||
    preset.durationInFrames !== timing.durationInFrames
  ) {
    throw new Error("System bookend preview is stale against its preset.");
  }
  const cue = implementation.soundCues[0];
  const descriptor = assetManifest.assets.find(
    (asset) => asset.id === cue.resourceId,
  );
  if (
    descriptor === undefined ||
    descriptor.kind !== "asset" ||
    descriptor.assetKind !== "audio" ||
    descriptor.mediaRole !== "scene-sfx" ||
    descriptor.allowedUse !== "runtime-approved" ||
    !descriptor.localPath.startsWith("public/")
  ) {
    throw new Error("System bookend preview audio identity is invalid.");
  }
  const durationInSeconds = descriptor.media?.durationInSeconds;
  if (
    durationInSeconds === undefined ||
    Math.round(durationInSeconds * PREVIEW_FPS) !== cue.durationInFrames ||
    anchorFrame + cue.offsetFrames < 0 ||
    anchorFrame + cue.offsetFrames + cue.durationInFrames >
      preset.durationInFrames
  ) {
    throw new Error("System bookend preview audio identity is invalid.");
  }
  return {
    durationInFrames: preset.durationInFrames,
    cue: {
      startFrame: anchorFrame + cue.offsetFrames,
      durationInFrames: cue.durationInFrames,
      volume: cue.volume,
      publicPath: descriptor.localPath,
      checksum: descriptor.checksum,
    },
  } as const;
};

export const SYSTEM_BOOKEND_PREVIEW_SPECS = {
  intro: buildPreviewSpec({
    preset: DEFAULT_INTRO_SCENE_PRESET,
    implementationId: "axmorf-brand-intro-v1",
    anchorFrame:
      BOOKEND_IMPLEMENTATION_TIMING["axmorf-brand-intro-v1"].anchors[
        "brand-reveal-start"
      ],
  }),
  outro: buildPreviewSpec({
    preset: DEFAULT_OUTRO_SCENE_PRESET,
    implementationId: "axmorf-source-follow-outro-v1",
    anchorFrame:
      BOOKEND_IMPLEMENTATION_TIMING["axmorf-source-follow-outro-v1"].anchors[
        "brand-lockup-start"
      ],
  }),
} as const;

const PreviewStage: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(circle at 50% 38%, #fffdf9 0%, #f8f4ee 58%, #f2ebe3 100%)",
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);

const PreviewSound: FC<{
  readonly spec: (typeof SYSTEM_BOOKEND_PREVIEW_SPECS)[keyof typeof SYSTEM_BOOKEND_PREVIEW_SPECS];
}> = ({ spec }) => (
  <Sequence
    from={spec.cue.startFrame}
    durationInFrames={spec.cue.durationInFrames}
  >
    <Html5Audio
      src={staticFile(spec.cue.publicPath.slice("public/".length))}
      volume={() => spec.cue.volume}
    />
  </Sequence>
);

export const DefaultIntroPreview: FC = () => {
  const sceneFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <PreviewStage>
      <AxmorfIntroScene
        sceneFrame={sceneFrame}
        width={width}
        height={height}
      />
      <PreviewSound spec={SYSTEM_BOOKEND_PREVIEW_SPECS.intro} />
    </PreviewStage>
  );
};

export const DefaultOutroPreview: FC = () => {
  const sceneFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <PreviewStage>
      <AxmorfOutroScene
        sceneFrame={sceneFrame}
        width={width}
        height={height}
        sourceReferences={[
          {
            title: "Remotion 官方文档",
            url: "https://www.remotion.dev/docs",
          },
          {
            title: "Remotion Story Producer 架构文档",
            url: "docs/ARCHITECTURE.md",
          },
        ]}
      />
      <PreviewSound spec={SYSTEM_BOOKEND_PREVIEW_SPECS.outro} />
    </PreviewStage>
  );
};
