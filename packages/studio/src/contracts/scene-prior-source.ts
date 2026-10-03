import { z } from "zod";

import { computeUtf8Checksum, createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { ProducerLogicalPathSchema } from "./producer-task";
import { SceneProductionBriefItemSchema } from "./authoring-briefs";

export const SCENE_PRIOR_SOURCE_PATH =
  "production/scene-prior-source.json" as const;
export const SCENE_PRIOR_SOURCE_INPUT_ID = "prior-scene-source" as const;

const ScenePriorSourceFileSchema = z
  .object({
    path: ProducerLogicalPathSchema,
    role: z.enum(["source", "declaration", "license", "lineage"]),
    content: z.string(),
    checksum: Sha256DigestSchema,
    sizeBytes: z.number().int().nonnegative().safe(),
  })
  .strict()
  .superRefine((file, context) => {
    if (
      file.checksum !== computeUtf8Checksum(file.content) ||
      file.sizeBytes !== new TextEncoder().encode(file.content).byteLength
    ) {
      context.addIssue({
        code: "custom",
        message: "Prior Scene file bytes are stale.",
        path: ["checksum"],
      });
    }
    if ((file.role === "source") !== /\.(?:ts|tsx)$/u.test(file.path)) {
      context.addIssue({
        code: "custom",
        message:
          "Prior Scene source files must be TS or TSX, including declarations.",
        path: ["role"],
      });
    }
  })
  .readonly();

const ScenePriorSourceIdentitySchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("scene-prior-source-v1"),
    storyId: StoryIdSchema,
    meaningId: MeaningIdSchema,
    brief: SceneProductionBriefItemSchema,
    rendererSourceFingerprint: Sha256DigestSchema,
    scenePackageFingerprint: Sha256DigestSchema,
    files: z.array(ScenePriorSourceFileSchema).min(1).readonly(),
  })
  .strict();

const fingerprint = (
  identity: z.infer<typeof ScenePriorSourceIdentitySchema>,
) =>
  createFingerprint({
    namespace: "scene-prior-source",
    version: 1,
    value: identity,
  });

export const ScenePriorSourceSchema = ScenePriorSourceIdentitySchema.extend({
  priorSourceFingerprint: Sha256DigestSchema,
})
  .superRefine((snapshot, context) => {
    if (snapshot.brief.meaningId !== snapshot.meaningId)
      context.addIssue({
        code: "custom",
        message: "Prior Scene brief must belong to its meaning.",
        path: ["brief"],
      });
    const paths = snapshot.files.map(({ path }) => path);
    const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));
    if (
      new Set(paths).size !== paths.length ||
      paths.some((path, index) => path !== sortedPaths[index]) ||
      !snapshot.files.some(
        ({ path, role }) => path === "Renderer.tsx" && role === "source",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Prior Scene files must be sorted, unique and contain the Renderer.",
        path: ["files"],
      });
    }
    const { priorSourceFingerprint, ...identity } = snapshot;
    if (priorSourceFingerprint !== fingerprint(identity)) {
      context.addIssue({
        code: "custom",
        message: "Prior Scene source fingerprint is stale.",
        path: ["priorSourceFingerprint"],
      });
    }
  })
  .readonly();

export const buildScenePriorSource = (rawInput: unknown) => {
  const identity = ScenePriorSourceIdentitySchema.parse({
    ...(rawInput as object),
    schemaVersion: 1,
    contractVersion: "scene-prior-source-v1",
  });
  return ScenePriorSourceSchema.parse({
    ...identity,
    priorSourceFingerprint: fingerprint(identity),
  });
};

export const ScenePriorSourceIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("scene-prior-source-index-v1"),
    storyId: StoryIdSchema,
    scenes: z.array(ScenePriorSourceSchema).max(256).readonly(),
  })
  .strict()
  .superRefine((index, context) => {
    const ids = index.scenes.map(({ meaningId }) => meaningId);
    const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id, position) => id !== sortedIds[position]) ||
      index.scenes.some((scene) => scene.storyId !== index.storyId)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Prior Scene index must contain sorted unique Project-owned Scenes.",
        path: ["scenes"],
      });
    }
  })
  .readonly();

export type ScenePriorSource = z.infer<typeof ScenePriorSourceSchema>;

export const scenePriorSourceOutputFiles = (source: ScenePriorSource) =>
  source.files.filter(
    ({ path }) =>
      ![
        "task-input.generated.json",
        "generated/scene-package.generated.json",
      ].includes(path),
  );
