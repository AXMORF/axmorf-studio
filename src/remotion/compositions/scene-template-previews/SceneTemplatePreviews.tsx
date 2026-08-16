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
  AxmorfIntroScene,
  AxmorfOutroScene,
} from "../../capabilities/scene-templates/axmorf";
import { AXMORF_SCENE_TEMPLATE_TIMING } from "../../capabilities/scene-templates/axmorf/timing";
import { getSceneTemplateDefinition } from "../../capabilities/scene-templates/registry";

const PREVIEW_FPS = 30;

const buildPreviewSpec = ({
  templateId,
  timingId,
}: {
  readonly templateId: "axmorf-brand-reveal-v1" | "axmorf-source-follow-v1";
  readonly timingId: keyof typeof AXMORF_SCENE_TEMPLATE_TIMING;
}) => {
  const definition = getSceneTemplateDefinition(templateId);
  const timing = AXMORF_SCENE_TEMPLATE_TIMING[timingId];
  if (
    definition.assets.length > 1 ||
    definition.durationInFrames !== timing.durationInFrames
  ) {
    throw new Error("System Scene template preview is stale.");
  }
  const templateAsset = definition.assets[0];
  if (templateAsset === undefined) {
    if (definition.soundCues.length !== 0) {
      throw new Error(
        "System Scene template preview audio identity is invalid.",
      );
    }
    return {
      durationInFrames: definition.durationInFrames,
      audio: null,
    } as const;
  }
  const descriptor = templateAsset.sourceDescriptor;
  const cue = definition.soundCues[0];
  const cueAnchorFrame =
    cue === undefined
      ? undefined
      : definition.anchors.find(({ eventId }) => eventId === cue.anchorId)
          ?.sceneLocalFrame;
  if (
    descriptor.assetKind !== "audio" ||
    !descriptor.localPath.startsWith("public/") ||
    definition.soundCues.length !== 1 ||
    cueAnchorFrame === undefined
  ) {
    throw new Error("System Scene template preview audio identity is invalid.");
  }
  const startFrame = cueAnchorFrame + cue!.offsetFrames;
  const durationInFrames = cue!.durationInFrames;
  const durationInSeconds = descriptor.media?.durationInSeconds;
  if (
    durationInSeconds === undefined ||
    Math.floor(durationInSeconds * PREVIEW_FPS) < durationInFrames ||
    startFrame < 0 ||
    startFrame + durationInFrames > definition.durationInFrames
  ) {
    throw new Error("System Scene template preview audio identity is invalid.");
  }
  return {
    durationInFrames: definition.durationInFrames,
    audio: {
      startFrame,
      durationInFrames,
      volume: cue!.volume,
      publicPath: descriptor.localPath,
      checksum: descriptor.checksum,
      role: templateAsset.targetMediaRole,
    },
  } as const;
};

export const SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS = {
  intro: buildPreviewSpec({
    templateId: "axmorf-brand-reveal-v1",
    timingId: "axmorf-brand-reveal-v1",
  }),
  outro: buildPreviewSpec({
    templateId: "axmorf-source-follow-v1",
    timingId: "axmorf-source-follow-v1",
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
  readonly spec: (typeof SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS)[keyof typeof SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS];
}> = ({ spec }) =>
  spec.audio === null ? null : (
    <Sequence
      from={spec.audio.startFrame}
      durationInFrames={spec.audio.durationInFrames}
    >
      <Html5Audio
        src={staticFile(spec.audio.publicPath.slice("public/".length))}
        volume={() => spec.audio.volume}
      />
    </Sequence>
  );

export const BrandRevealTemplatePreview: FC = () => {
  const sceneFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <PreviewStage>
      <AxmorfIntroScene sceneFrame={sceneFrame} width={width} height={height} />
      <PreviewSound spec={SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.intro} />
    </PreviewStage>
  );
};

export const SourceFollowTemplatePreview: FC = () => {
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
      <PreviewSound spec={SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.outro} />
    </PreviewStage>
  );
};
