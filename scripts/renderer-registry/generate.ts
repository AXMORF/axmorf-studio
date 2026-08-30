import { buildRendererRegistry } from "./domain";
import {
  writeOrCheckRendererRegistry,
  type RendererRegistryMode,
} from "./project-files";

export const generateRendererRegistry = async ({
  mode,
  destination,
  ...input
}: {
  readonly mode: RendererRegistryMode;
  readonly destination: string;
  readonly rootDir: string;
  readonly projectId: unknown;
  readonly coverage: unknown;
  readonly packages: readonly unknown[];
}) => {
  const registry = await buildRendererRegistry(input);
  if (registry === null) return null;
  await writeOrCheckRendererRegistry({
    destination,
    source: registry.source,
    mode,
  });
  return registry;
};

export const generateRendererRegistryFromProjectFiles = async ({
  rootDir,
  projectId,
  mode,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly mode: RendererRegistryMode;
}) => {
  const projectRoot = join(rootDir, "src/projects", projectId);
  const coverage = SceneCoverageMapSchema.parse(
    await readJsonFile(
      join(projectRoot, "generated/scene-coverage.generated.json"),
    ),
  );
  const ready = coverage.entries.filter((entry) => entry.status === "ready");
  const packages = await Promise.all(
    ready.map((entry) =>
      readJsonFile(
        join(
          projectRoot,
          "scenes",
          entry.meaningId,
          "generated/scene-package.generated.json",
        ),
      ),
    ),
  );
  return generateRendererRegistry({
    mode,
    destination: join(projectRoot, "renderer-registry.generated.ts"),
    rootDir,
    projectId,
    coverage,
    packages,
  });
};
import { join } from "node:path";

import { SceneCoverageMapSchema } from "@axmorf/studio/contracts";
import { readJsonFile } from "../scene-package/project-files";
