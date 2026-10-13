import { ResourceCapabilityDescriptorSchema } from "../../contracts";
import { capabilityAuthoringGuides } from "./capability-guides";

const common = {
  schemaVersion: 1,
  status: "approved",
  allowedUse: "runtime-approved",
} as const;

export const WORKSPACE_REMOTION_FACADE_PATH =
  "src/runtime/capabilities.ts" as const;

const declarations = [
  {
    id: "capability.camera",
    useCases: [
      "depth and occlusion 分层视差",
      "full-bleed push and pan 全幅推拉摇镜",
      "spatial relationships 3D 空间",
      "subject tracking 镜头跟随",
    ],
    title: "Camera",
    description: "2D, layered and 3D cameras for authored subjects",
    tags: ["camera", "shared"],
    exportName: "ProducerCamera2D",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.chart",
    useCases: ["quantitative comparison 数据对比", "trend over time 趋势变化"],
    title: "Chart primitives",
    description: "Approved chart rendering entrypoint",
    tags: ["chart", "shared"],
    exportName: "LineChart",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.effects",
    useCases: ["print and paper texture 印刷纸纹", "subject material 材质"],
    title: "Effects",
    description: "Approved effect preset resolver",
    tags: ["effects", "shared"],
    exportName: "getProducerEffectPreset",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.layout",
    useCases: ["parallel facts 并列信息"],
    title: "Layout primitives",
    description: "Approved composition layout entrypoint",
    tags: ["layout", "shared"],
    exportName: "CalloutGrid",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.media",
    useCases: [
      "approved footage 本地视频",
      "authored illustration 插画",
      "local animation 动画素材",
    ],
    title: "Local media",
    description: "Approved repository-local video entrypoint",
    tags: ["media", "shared"],
    exportName: "ProducerLocalVideo",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.motion",
    useCases: [
      "continuous action 连续动作",
      "gather and transform 汇聚变形",
      "semantic timing 语义节奏",
    ],
    title: "Content-driven object motion",
    description:
      "Narration-aligned object-state motion and optional treatments",
    tags: ["motion", "shared"],
    exportName: "ProducerMotionTreatment",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.visual-components",
    useCases: [
      "authored transition 内容转场",
      "material grain 颗粒材质",
      "software interface 软件界面 终端 代码",
      "typography 文字动画",
    ],
    title: "Visual components",
    description: "Approved visual component entrypoint",
    tags: ["shared", "visual-components"],
    exportName: "AnimatedText",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.sound",
    useCases: ["audible semantic events 事件音效"],
    title: "Scene sound library",
    description: "Approved verified local sound resolver",
    tags: ["shared", "sound"],
    exportName: "getProducerSoundLibrary",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.transitions",
    useCases: ["motivated shot changes 镜头衔接"],
    title: "Transitions",
    description: "Approved visual transition preset resolver",
    tags: ["shared", "transitions"],
    exportName: "getProducerTransitionPreset",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
] as const;

export const capabilityDescriptorDeclarations = declarations.map(
  (declaration) =>
    ResourceCapabilityDescriptorSchema.parse({
      ...common,
      ...declaration,
      kind: "capability",
      authoring: capabilityAuthoringGuides[declaration.id],
      authority: {
        kind: "repository-file",
        repositoryPath: declaration.sourceFile,
      },
    }),
);

export const WORKSPACE_CAPABILITY_FACADE_SOURCE = `export {
${[
  ...new Set(
    Object.values(capabilityAuthoringGuides).flatMap((guide) => guide.exports),
  ),
]
  .sort()
  .map((name) => `  ${name},`)
  .join("\n")}
} from "@axmorf/studio/remotion";
`;
