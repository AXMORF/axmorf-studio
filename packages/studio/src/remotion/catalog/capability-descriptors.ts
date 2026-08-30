import { ResourceCapabilityDescriptorSchema } from "../../contracts";

const common = {
  schemaVersion: 1,
  status: "approved",
  useCases: ["scene authoring"],
  allowedUse: "runtime-approved",
} as const;

export const WORKSPACE_REMOTION_FACADE_PATH =
  "src/runtime/capabilities.ts" as const;

export const WORKSPACE_CAPABILITY_FACADE_SOURCE = `export {
  AnimatedText,
  CalloutGrid,
  LineChart,
  ProducerCamera2D,
  ProducerLocalVideo,
  ProducerMotionTreatment,
  getProducerEffectPreset,
  getProducerSoundLibrary,
  getProducerTransitionPreset,
} from "@axmorf/studio/remotion";
`;

const declarations = [
  {
    id: "capability.camera",
    title: "Camera",
    description: "Approved 2D camera staging entrypoint",
    tags: ["camera", "shared"],
    exportName: "ProducerCamera2D",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.chart",
    title: "Chart primitives",
    description: "Approved chart rendering entrypoint",
    tags: ["chart", "shared"],
    exportName: "LineChart",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.effects",
    title: "Effects",
    description: "Approved effect preset resolver",
    tags: ["effects", "shared"],
    exportName: "getProducerEffectPreset",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.layout",
    title: "Layout primitives",
    description: "Approved composition layout entrypoint",
    tags: ["layout", "shared"],
    exportName: "CalloutGrid",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.media",
    title: "Local media",
    description: "Approved repository-local video entrypoint",
    tags: ["media", "shared"],
    exportName: "ProducerLocalVideo",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.motion",
    title: "Motion treatments",
    description: "Approved frame-driven motion treatment entrypoint",
    tags: ["motion", "shared"],
    exportName: "ProducerMotionTreatment",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.visual-components",
    title: "Visual components",
    description: "Approved visual component entrypoint",
    tags: ["shared", "visual-components"],
    exportName: "AnimatedText",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.sound",
    title: "Scene sound library",
    description: "Approved verified local sound resolver",
    tags: ["shared", "sound"],
    exportName: "getProducerSoundLibrary",
    sourceFile: WORKSPACE_REMOTION_FACADE_PATH,
  },
  {
    id: "capability.transitions",
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
      authority: {
        kind: "repository-file",
        repositoryPath: declaration.sourceFile,
      },
    }),
);
