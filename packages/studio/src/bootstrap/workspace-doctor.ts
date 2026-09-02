import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { ProducerConfigSchema, ResourceCatalogSchema } from "../contracts";
import { resolvePackageBinCommand } from "../process/resolve-package-bin";
import {
  loadRuntimePolicyManifest,
  resolveRuntimeResources,
} from "../runtime/runtime-resources";

const REQUIRED_DIRECTORIES = [
  "private",
  "src/projects",
  "public/projects",
  ".narration-work",
  ".producer-work",
  ".producer-artifacts",
  ".producer-attempts",
  "out",
  "deliveries",
] as const;

const REQUIRED_FILES = [
  "private/producer.config.json",
  "public/assets/axmorf-shared/brand/axmorf-mark.svg",
  "public/assets/axmorf-shared/audio/music/axmorf-closing-pulse-v1.wav",
  "public/assets/axmorf-shared/audio/sound-effects/axmorf-cinematic-impact-v1.wav",
  "src/index.ts",
  "src/projects/project-registry.generated.ts",
  "src/remotion/catalog/assets.manifest.json",
  "src/remotion/catalog/resource-catalog.generated.json",
  "src/remotion/catalog/scene-template-audio.defaults.json",
  "src/remotion/catalog/scene-template-audio.generated.json",
] as const;

const assertEntry = async (
  rootDir: string,
  relativePath: string,
  kind: "directory" | "file",
) => {
  const metadata = await lstat(join(rootDir, relativePath));
  const valid =
    kind === "directory" ? metadata.isDirectory() : metadata.isFile();
  if (!valid || metadata.isSymbolicLink()) {
    throw new Error(
      `Workspace ${relativePath} must be a regular ${kind} and cannot be a symbolic link.`,
    );
  }
};

export const inspectWorkspaceReadiness = async (rootDir: string) => {
  await Promise.all([
    ...REQUIRED_DIRECTORIES.map((path) =>
      assertEntry(rootDir, path, "directory"),
    ),
    ...REQUIRED_FILES.map((path) => assertEntry(rootDir, path, "file")),
  ]);
  const runtimeResources = await resolveRuntimeResources();
  const [config, catalog] = await Promise.all([
    readFile(join(rootDir, "private/producer.config.json"), "utf8"),
    readFile(
      join(rootDir, "src/remotion/catalog/resource-catalog.generated.json"),
      "utf8",
    ),
  ]);
  await Promise.all([
    loadRuntimePolicyManifest(runtimeResources),
    resolvePackageBinCommand({
      workspaceRoot: rootDir,
      packageName: "@remotion/cli",
      binName: "remotion",
    }),
  ]);
  ProducerConfigSchema.parse(JSON.parse(config) as unknown);
  ResourceCatalogSchema.parse(JSON.parse(catalog) as unknown);
  return {
    status: "workspace-ready" as const,
    workspaceVersion: 1 as const,
    checks: {
      layout: "pass" as const,
      runtimeResources: "pass" as const,
      remotionCli: "pass" as const,
      producerConfig: "pass" as const,
      resourceCatalog: "pass" as const,
    },
  };
};
