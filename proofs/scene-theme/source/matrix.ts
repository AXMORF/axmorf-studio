import { VISUAL_THEME_PRESETS } from "../../../packages/studio/src/contracts/visual-theme";

export const SCENE_THEME_PROOF = {
  fps: 30,
  introFrames: 60,
  bodyFrames: 60,
  outroFrames: 240,
  durationInFrames: 360,
  outputDirectory: "out/scene-theme-proof",
} as const;

const longReference = {
  title: "让片头、正文与片尾共用经过检查的颜色：固定品牌动画与长标题排版回归",
  url: "https://example.com/research/visual-theme-consistency-and-fixed-brand-animation?view=full-reference",
};

export const REFERENCE_CASES = {
  none: [],
  "one-long": [longReference],
  "six-mixed": [
    longReference,
    { title: "颜色与可读性", url: "https://example.com/color" },
    { title: "动画结构检查", url: "https://example.com/motion" },
    { title: "Safe-area viewport", url: "https://example.com/viewport" },
    { title: "文字与引用布局", url: "https://example.com/type" },
    { title: "整片视觉一致性", url: "https://example.com/continuity" },
  ],
} as const;

export type ReferenceCase = keyof typeof REFERENCE_CASES;

export const SCENE_THEME_CASES = (["dark", "light"] as const).flatMap(
  (themeName) =>
    (["landscape", "portrait"] as const).map((orientation) => ({
      id: `SceneTheme-${themeName}-${orientation}`,
      themeName,
      orientation,
      theme: VISUAL_THEME_PRESETS[themeName],
      width: orientation === "landscape" ? 1920 : 1080,
      height: orientation === "landscape" ? 1080 : 1920,
    })),
);

export type SceneThemeCase = (typeof SCENE_THEME_CASES)[number];

const INTRO_CHECKPOINTS = [
  [0, "first"],
  [9, "vertical-trace"],
  [10, "logo-reveal-start"],
  [18, "horizontal-trace"],
  [24, "logo-resolve"],
  [34, "trace-exit"],
  [45, "wordmark-resolve"],
  [59, "stable"],
] as const;

const OUTRO_CHECKPOINTS = [
  [0, "first"],
  [54, "references-enter"],
  [88, "references-stable"],
  [103, "before-fade"],
  [104, "fade-start"],
  [111, "fade-middle"],
  [119, "fade-end"],
  [120, "brand-handoff-maximum-zoom"],
  [122, "brand-maximum-zoom"],
  [132, "brand-shrink-middle"],
  [146, "brand-shrink-end"],
  [165, "wordmark-enter"],
  [180, "wordmark-resolve"],
  [214, "before-click"],
  [220, "after-click"],
  [239, "stable"],
] as const;

export const DECORATION_STRESS_CHECKPOINTS = [
  [0, "opaque-white-start"],
  [19, "opaque-white-end"],
  [20, "opaque-black-start"],
  [39, "opaque-black-end"],
  [40, "opaque-mixed-high-z-index-start"],
  [59, "opaque-mixed-high-z-index-end"],
] as const;

export type SceneThemeCheckpoint = Readonly<{
  section: "intro" | "body" | "outro";
  sceneFrame: number;
  frame: number;
  purpose: string;
  referenceCase: ReferenceCase;
}>;

const outroStart = SCENE_THEME_PROOF.introFrames + SCENE_THEME_PROOF.bodyFrames;

export const SCENE_THEME_CHECKPOINTS: readonly SceneThemeCheckpoint[] = [
  ...INTRO_CHECKPOINTS.map(([sceneFrame, purpose]) => ({
    section: "intro" as const,
    sceneFrame,
    frame: sceneFrame,
    purpose,
    referenceCase: "six-mixed" as const,
  })),
  ...DECORATION_STRESS_CHECKPOINTS.map(([sceneFrame, purpose]) => ({
    section: "body" as const,
    sceneFrame,
    frame: SCENE_THEME_PROOF.introFrames + sceneFrame,
    purpose,
    referenceCase: "six-mixed" as const,
  })),
  ...OUTRO_CHECKPOINTS.map(([sceneFrame, purpose]) => ({
    section: "outro" as const,
    sceneFrame,
    frame: outroStart + sceneFrame,
    purpose,
    referenceCase: "six-mixed" as const,
  })),
  ...(["none", "one-long"] as const).flatMap((referenceCase) =>
    ([88, 104, 119] as const).map((sceneFrame) => ({
      section: "outro" as const,
      sceneFrame,
      frame: outroStart + sceneFrame,
      purpose: "reference-layout-and-fade",
      referenceCase,
    })),
  ),
];

export const checkpointFileName = (checkpoint: SceneThemeCheckpoint) =>
  `${checkpoint.section}-${String(checkpoint.sceneFrame).padStart(3, "0")}-${checkpoint.referenceCase}.png`;
