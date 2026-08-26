import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  StoryIdSchema,
  buildSceneOriginalityBaseline,
} from "../../../src/contracts";
import type { ProductionLocations } from "../../project-production/application/production-locations";
import { fingerprintSceneRendererSource } from "../../project-production/domain/scene-originality";

const metadata = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const readRegularSource = async (path: string) => {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error("Historical Scene Renderer must be a regular file.");
  }
  const source = await readFile(path, "utf8");
  const after = await lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error("Historical Scene Renderer changed while being read.");
  }
  return source;
};

export const snapshotWorkspaceSceneOriginalityBaseline = async ({
  locations,
  projectId: rawProjectId,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
}) => {
  if (locations.layoutKind !== "workspace") {
    throw new Error("Scene originality snapshots require Workspace locations.");
  }
  const projectId = StoryIdSchema.parse(rawProjectId);
  const rootState = await metadata(locations.projectSourceRoot);
  if (rootState === null) {
    return buildSceneOriginalityBaseline({
      storyId: projectId,
      rendererFingerprints: [],
    });
  }
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
    throw new Error("Workspace Project source root is unsafe.");
  }
  const rendererFingerprints = new Set<
    ReturnType<typeof fingerprintSceneRendererSource>
  >();
  for (const projectEntry of (
    await readdir(locations.projectSourceRoot, { withFileTypes: true })
  ).sort((left, right) => left.name.localeCompare(right.name))) {
    if (projectEntry.isSymbolicLink()) {
      throw new Error("Workspace Project source contains a symbolic entry.");
    }
    if (!projectEntry.isDirectory()) continue;
    const historicalProjectId = StoryIdSchema.parse(projectEntry.name);
    if (historicalProjectId === projectId) continue;
    const scenesRoot = join(
      locations.projectSourceRoot,
      historicalProjectId,
      "scenes",
    );
    const scenesState = await metadata(scenesRoot);
    if (scenesState === null) continue;
    if (scenesState.isSymbolicLink() || !scenesState.isDirectory()) {
      throw new Error("Historical Scene root is unsafe.");
    }
    for (const sceneEntry of (
      await readdir(scenesRoot, { withFileTypes: true })
    ).sort((left, right) => left.name.localeCompare(right.name))) {
      if (sceneEntry.isSymbolicLink()) {
        throw new Error("Historical Scene root contains a symbolic entry.");
      }
      if (!sceneEntry.isDirectory()) continue;
      const rendererPath = join(scenesRoot, sceneEntry.name, "Renderer.tsx");
      const rendererState = await metadata(rendererPath);
      if (rendererState === null) continue;
      rendererFingerprints.add(
        fingerprintSceneRendererSource(
          await readRegularSource(rendererPath),
        ),
      );
    }
  }
  return buildSceneOriginalityBaseline({
    storyId: projectId,
    rendererFingerprints: [...rendererFingerprints].sort((left, right) =>
      left.localeCompare(right),
    ),
  });
};
