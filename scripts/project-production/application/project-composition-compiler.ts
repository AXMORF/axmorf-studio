import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { StoryIdSchema } from "../../../src/contracts";
import { compileTypeScriptImportGraph } from "./typescript-compile";
import type { ProductionLocations } from "./production-locations";

type CompositionSourceLocations = Pick<
  ProductionLocations,
  "layoutKind" | "projectSourceRoot" | "runtimeResources"
>;

const collectProjectVirtualSources = async ({
  sourceRoot,
  virtualRoot,
  current = sourceRoot,
}: {
  readonly sourceRoot: string;
  readonly virtualRoot: string;
  readonly current?: string;
}): Promise<Readonly<Record<string, string>>> => {
  const entries = await readdir(current, { withFileTypes: true });
  const sources: Record<string, string> = {};
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const source = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("Project compile source cannot contain symlinks.");
    }
    if (entry.isDirectory()) {
      Object.assign(
        sources,
        await collectProjectVirtualSources({
          sourceRoot,
          virtualRoot,
          current: source,
        }),
      );
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        "Project compile source must contain only regular files.",
      );
    }
    sources[join(virtualRoot, relative(sourceRoot, source))] = await readFile(
      source,
      "utf8",
    );
  }
  return sources;
};

export const compileTargetProjectComposition = async ({
  locations,
  storyId: rawStoryId,
}: {
  readonly locations: CompositionSourceLocations;
  readonly storyId: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const relativeCompositionPath = `src/projects/${storyId}/Composition.tsx`;
  const projectRoot = join(locations.projectSourceRoot, storyId);
  const compositionPath = join(projectRoot, "Composition.tsx");
  const metadata = await lstat(compositionPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Target Project Composition must be a regular file.");
  }
  if (locations.layoutKind === "repository") {
    compileTypeScriptImportGraph({
      rootDir: locations.runtimeResources,
      rootPath: compositionPath,
      typescriptLibRoot: join(
        locations.runtimeResources,
        "node_modules/typescript/lib",
      ),
      label: "Target Project Composition TypeScript compile",
    });
  } else {
    const virtualProjectRoot = join(
      locations.runtimeResources,
      "source/src/projects",
      storyId,
    );
    compileTypeScriptImportGraph({
      rootDir: join(locations.runtimeResources, "source"),
      rootPath: join(virtualProjectRoot, "Composition.tsx"),
      typescriptLibRoot: join(
        locations.runtimeResources,
        "node_modules/typescript/lib",
      ),
      label: "Target Project Composition TypeScript compile",
      virtualSources: await collectProjectVirtualSources({
        sourceRoot: projectRoot,
        virtualRoot: virtualProjectRoot,
      }),
    });
  }
  return { storyId, compositionPath: relativeCompositionPath } as const;
};
