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
  ProducerAssetManifestSchema,
} from "../../../contracts";
import assetManifestJson from "../../catalog/assets.manifest.json";
import {
  AxmorfIntroScene,
  AxmorfOutroScene,
} from "../../capabilities/scenes/templates/axmorf";
import { AXMORF_SCENE_TEMPLATE_TIMING } from "../../capabilities/scenes/templates/axmorf/timing";
import { getSceneTemplateDefinition } from "../../capabilities/scenes/registry";

const PREVIEW_FPS = 30;
const assetManifest = ProducerAssetManifestSchema.parse(assetManifestJson);

const buildPreviewSpec = ({
  templateId,
  timingId,
  anchorFrame,
}: {
  readonly templateId:
    | "axmorf-brand-reveal-v1"
    | "axmorf-source-follow-v1";
  readonly timingId: keyof typeof AXMORF_SCENE_TEMPLATE_TIMING;
  readonly anchorFrame: number;
}) => {
  const definition = getSceneTemplateDefinition(templateId);
  const timing = AXMORF_SCENE_TEMPLATE_TIMING[timingId];
  if (
    definition.soundCues.length !== 1 ||
    definition.assets.length !== 1 ||
    definition.durationInFrames !== timing.durationInFrames
  ) {
    throw new Error("System Scene template preview is stale.");
  }
  const cue = definition.soundCues[0];
  const templateAsset = definition.assets.find(
    ({ assetKey }) => assetKey === cue.assetKey,
  );
  const descriptor = assetManifest.assets.find(
    (asset) => asset.checksum === templateAsset?.checksum,
  );
  if (
    templateAsset === undefined ||
    descriptor === undefined ||
    descriptor.kind !== "asset" ||
    descriptor.assetKind !== "audio" ||
    descriptor.mediaRole !== "scene-sfx" ||
    descriptor.allowedUse !== "runtime-approved" ||
    !descriptor.localPath.startsWith("public/")
  ) {
    throw new Error("System Scene template preview audio identity is invalid.");
  }
  const durationInSeconds = descriptor.media?.durationInSeconds;
  if (
    durationInSeconds === undefined ||
    Math.round(durationInSeconds * PREVIEW_FPS) !== cue.durationInFrames ||
    anchorFrame + cue.offsetFrames < 0 ||
    anchorFrame + cue.offsetFrames + cue.durationInFrames >
      definition.durationInFrames
  ) {
    throw new Error("System Scene template preview audio identity is invalid.");
  }
  return {
    durationInFrames: definition.durationInFrames,
    cue: {
      startFrame: anchorFrame + cue.offsetFrames,
      durationInFrames: cue.durationInFrames,
      volume: cue.volume,
      publicPath: descriptor.localPath,
      checksum: descriptor.checksum,
    },
  } as const;
};

export const SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS = {
  intro: buildPreviewSpec({
    templateId: "axmorf-brand-reveal-v1",
    timingId: "axmorf-brand-reveal-v1",
    anchorFrame:
      AXMORF_SCENE_TEMPLATE_TIMING["axmorf-brand-reveal-v1"].anchors[
        "brand-reveal-start"
      ],
  }),
  outro: buildPreviewSpec({
    templateId: "axmorf-source-follow-v1",
    timingId: "axmorf-source-follow-v1",
    anchorFrame:
      AXMORF_SCENE_TEMPLATE_TIMING["axmorf-source-follow-v1"].anchors[
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
  readonly spec: (typeof SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS)[keyof typeof SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS];
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

export const BrandRevealTemplatePreview: FC = () => {
  const sceneFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <PreviewStage>
      <AxmorfIntroScene
        sceneFrame={sceneFrame}
        width={width}
        height={height}
      />
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
