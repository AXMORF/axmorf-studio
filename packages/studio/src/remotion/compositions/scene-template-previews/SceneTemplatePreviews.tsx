import { useEffect, useMemo, type FC, type ReactNode } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  prefetch,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { VISUAL_THEME_PRESETS, type VisualTheme } from "../../../contracts";

import {
  AxmorfIntroScene,
  AxmorfOutroScene,
} from "../../capabilities/scene-templates/axmorf";
import { AXMORF_SCENE_TEMPLATE_TIMING } from "../../capabilities/scene-templates/axmorf/timing";
import {
  DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION,
  getSceneTemplateDefinition,
} from "../../capabilities/scene-templates/registry";
import type { SceneTemplateAudioProjection } from "../../capabilities/scene-templates/template-audio";

const PREVIEW_FPS = 30;

const buildPreviewSpec = ({
  templateId,
  timingId,
  audioProjection,
}: {
  readonly templateId: "axmorf-brand-reveal-v1" | "axmorf-source-follow-v1";
  readonly timingId: keyof typeof AXMORF_SCENE_TEMPLATE_TIMING;
  readonly audioProjection: SceneTemplateAudioProjection;
}) => {
  const definition = getSceneTemplateDefinition(templateId, audioProjection);
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

export const buildSceneTemplatePreviewSpecs = (
  audioProjection: SceneTemplateAudioProjection,
) =>
  ({
    intro: buildPreviewSpec({
      templateId: "axmorf-brand-reveal-v1",
      timingId: "axmorf-brand-reveal-v1",
      audioProjection,
    }),
    outro: buildPreviewSpec({
      templateId: "axmorf-source-follow-v1",
      timingId: "axmorf-source-follow-v1",
      audioProjection,
    }),
  }) as const;

export const SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS =
  buildSceneTemplatePreviewSpecs(DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION);

const PreviewStage: FC<{
  readonly children: ReactNode;
  readonly theme: VisualTheme;
}> = ({ children, theme }) => (
  <AbsoluteFill
    style={{
      background: theme.background,
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
        pauseWhenBuffering
        preload="auto"
      />
    </Sequence>
  );

export type SceneTemplatePreviewProps = Readonly<{
  audioProjection?: SceneTemplateAudioProjection;
  theme?: VisualTheme;
  sourceReferences?: readonly Readonly<{ title: string; url: string }>[];
}>;

export const SceneTemplateAudioPreloader: FC<SceneTemplatePreviewProps> = ({
  audioProjection = DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION,
}) => {
  const sources = useMemo(() => {
    const specs = buildSceneTemplatePreviewSpecs(audioProjection);
    return [specs.intro.audio, specs.outro.audio].flatMap((audio) =>
      audio === null
        ? []
        : [staticFile(audio.publicPath.slice("public/".length))],
    );
  }, [audioProjection]);

  useEffect(() => {
    const handles = sources.map((src) =>
      prefetch(src, { method: "blob-url", logLevel: "warn" }),
    );
    return () => {
      for (const handle of handles) handle.free();
    };
  }, [sources]);

  return null;
};

export const BrandRevealTemplatePreview: FC<SceneTemplatePreviewProps> = ({
  audioProjection = DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION,
  theme = VISUAL_THEME_PRESETS.light,
}) => {
  const sceneFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const specs = useMemo(
    () => buildSceneTemplatePreviewSpecs(audioProjection),
    [audioProjection],
  );
  return (
    <PreviewStage theme={theme}>
      <AxmorfIntroScene
        sceneFrame={sceneFrame}
        width={width}
        height={height}
        theme={theme}
      />
      <PreviewSound spec={specs.intro} />
    </PreviewStage>
  );
};

export const SourceFollowTemplatePreview: FC<SceneTemplatePreviewProps> = ({
  audioProjection = DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION,
  theme = VISUAL_THEME_PRESETS.light,
  sourceReferences = [
    { title: "Remotion 官方文档", url: "https://www.remotion.dev/docs" },
    { title: "AXMORF Studio 架构文档", url: "docs/ARCHITECTURE.md" },
  ],
}) => {
  const sceneFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const specs = useMemo(
    () => buildSceneTemplatePreviewSpecs(audioProjection),
    [audioProjection],
  );
  return (
    <PreviewStage theme={theme}>
      <AxmorfOutroScene
        sceneFrame={sceneFrame}
        width={width}
        height={height}
        theme={theme}
        sourceReferences={sourceReferences}
      />
      <PreviewSound spec={specs.outro} />
    </PreviewStage>
  );
};
