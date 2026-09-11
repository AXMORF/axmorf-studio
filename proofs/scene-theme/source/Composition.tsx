import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "../../../packages/studio/src/contracts/scene-readability";
import type { VisualTheme } from "../../../packages/studio/src/contracts/visual-theme";
import { AxmorfIntroScene } from "../../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfIntroScene";
import { AxmorfOutroScene } from "../../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfOutroScene";
import { CompositionAssembly } from "../../../packages/studio/src/remotion/runtime/composition-assembly/CompositionAssembly";
import { ThemedGlobalVisualBackground } from "../../../packages/studio/src/remotion/runtime/global-visual/ThemedGlobalVisualBackground";
import { SceneViewport } from "../../../packages/studio/src/remotion/runtime/readability/SceneViewport";
import {
  REFERENCE_CASES,
  SCENE_THEME_PROOF,
  type ReferenceCase,
} from "./matrix";

export type SceneThemeProofProps = Readonly<{
  theme: VisualTheme;
  referenceCase: ReferenceCase;
}>;

const BoundaryScene = ({
  kind,
  theme,
  referenceCase,
}: SceneThemeProofProps & { readonly kind: "intro" | "outro" }) => {
  const sceneFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const policy = resolveSceneReadabilityPolicy({ width, height });
  const viewport = resolveSceneViewport(policy);
  return (
    <SceneViewport policy={policy}>
      {kind === "intro" ? (
        <AxmorfIntroScene {...viewport} sceneFrame={sceneFrame} theme={theme} />
      ) : (
        <AxmorfOutroScene
          {...viewport}
          sceneFrame={sceneFrame}
          theme={theme}
          sourceReferences={REFERENCE_CASES[referenceCase]}
        />
      )}
    </SceneViewport>
  );
};

const BodyScene = ({ theme }: Pick<SceneThemeProofProps, "theme">) => {
  const { width, height } = useVideoConfig();
  return (
    <SceneViewport policy={resolveSceneReadabilityPolicy({ width, height })}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: 80,
          gap: 30,
          fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
        }}
      >
        <div style={{ color: theme.accent, fontSize: 36 }}>
          AXMORF · VISUAL THEME
        </div>
        <div
          style={{ color: theme.primaryText, fontSize: 64, fontWeight: 650 }}
        >
          片头、正文、片尾
          <br />
          共用一套颜色
        </div>
        <div
          style={{ color: theme.secondaryText, fontSize: 36, lineHeight: 1.5 }}
        >
          固定正文用于检查实际背景与品牌动画之间的连续性。
        </div>
      </AbsoluteFill>
    </SceneViewport>
  );
};

/** Deliberately hostile paint: the production wrapper must bound and contain it. */
const DecorationStress = () => {
  const frame = useCurrentFrame();
  const color = frame < 20 ? "#ffffff" : "#000000";
  return (
    <AbsoluteFill
      data-proof-opaque-decoration
      style={{ backgroundColor: color, zIndex: 999_999 }}
    >
      <AbsoluteFill style={{ backgroundColor: color, zIndex: 999_999 }} />
      {frame >= 40 ? (
        <svg
          data-proof-high-z-index-svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 2_000_000,
          }}
        >
          <rect width={50} height={100} fill="#ffffff" />
          <rect x={50} width={50} height={100} fill="#000000" />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};

/** Synthetic proof only: no Project, provider, narration, or media acquisition. */
export const SceneThemeProofComposition = (props: SceneThemeProofProps) => (
  <CompositionAssembly
    globalVisualBackgroundLayers={
      <ThemedGlobalVisualBackground theme={props.theme}>
        <Sequence
          from={SCENE_THEME_PROOF.introFrames}
          durationInFrames={SCENE_THEME_PROOF.bodyFrames}
        >
          <DecorationStress />
        </Sequence>
      </ThemedGlobalVisualBackground>
    }
    storyVisualTrack={
      <>
        <Sequence durationInFrames={SCENE_THEME_PROOF.introFrames}>
          <BoundaryScene {...props} kind="intro" />
        </Sequence>
        <Sequence
          from={SCENE_THEME_PROOF.introFrames}
          durationInFrames={SCENE_THEME_PROOF.bodyFrames}
        >
          <BodyScene theme={props.theme} />
        </Sequence>
        <Sequence
          from={SCENE_THEME_PROOF.introFrames + SCENE_THEME_PROOF.bodyFrames}
          durationInFrames={SCENE_THEME_PROOF.outroFrames}
        >
          <BoundaryScene {...props} kind="outro" />
        </Sequence>
      </>
    }
    narrativeCore={null}
  />
);
