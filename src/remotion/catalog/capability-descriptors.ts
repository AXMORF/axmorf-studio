import { ResourceCapabilityDescriptorSchema } from "../../contracts";

const common = {
  schemaVersion: 1,
  status: "approved",
  useCases: ["scene authoring"],
  allowedUse: "runtime-approved",
} as const;

const declarations = [
  {
    id: "capability.camera",
    title: "Camera",
    description: "Approved 2D camera staging entrypoint",
    tags: ["camera", "shared"],
    exportName: "ProducerCamera2D",
    sourceFile: "src/remotion/capabilities/camera/index.ts",
  },
  {
    id: "capability.chart",
    title: "Chart primitives",
    description: "Approved chart rendering entrypoint",
    tags: ["chart", "shared"],
    exportName: "LineChart",
    sourceFile: "src/remotion/capabilities/primitives/index.ts",
  },
  {
    id: "capability.effects",
    title: "Effects",
    description: "Approved effect preset resolver",
    tags: ["effects", "shared"],
    exportName: "getProducerEffectPreset",
    sourceFile: "src/remotion/capabilities/effects/index.ts",
  },
  {
    id: "capability.layout",
    title: "Layout primitives",
    description: "Approved composition layout entrypoint",
    tags: ["layout", "shared"],
    exportName: "CalloutGrid",
    sourceFile: "src/remotion/capabilities/primitives/index.ts",
  },
  {
    id: "capability.media",
    title: "Local media",
    description: "Approved repository-local video entrypoint",
    tags: ["media", "shared"],
    exportName: "ProducerLocalVideo",
    sourceFile: "src/remotion/capabilities/media/index.ts",
  },
  {
    id: "capability.motion",
    title: "Motion treatments",
    description: "Approved frame-driven motion treatment entrypoint",
    tags: ["motion", "shared"],
    exportName: "ProducerMotionTreatment",
    sourceFile: "src/remotion/capabilities/motion/index.ts",
  },
  {
    id: "capability.primitives",
    title: "Visual primitives",
    description: "Approved visual primitive entrypoint",
    tags: ["primitives", "shared"],
    exportName: "AnimatedText",
    sourceFile: "src/remotion/capabilities/primitives/index.ts",
  },
  {
    id: "capability.sound",
    title: "Scene sound library",
    description: "Approved verified local sound resolver",
    tags: ["shared", "sound"],
    exportName: "getProducerSoundLibrary",
    sourceFile: "src/remotion/capabilities/sound/index.ts",
  },
  {
    id: "capability.transitions",
    title: "Transitions",
    description: "Approved visual transition preset resolver",
    tags: ["shared", "transitions"],
    exportName: "getProducerTransitionPreset",
    sourceFile: "src/remotion/capabilities/transitions/index.ts",
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
