import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

import type { ProductionLocations } from "../project-production/application/production-locations";

export type ProjectStorageLocations = Readonly<{
  kind: "repository" | "workspace";
  projectSourceRoot: string;
  projectMediaRoot: string;
  catalogProjectionPath: string;
  registryProjectionPath: string;
}>;

const absolute = (path: string, label: string) => {
  if (!isAbsolute(path)) throw new Error(`${label} must be absolute.`);
  return resolve(path);
};

export const createWorkspaceProjectStorageLocations = (
  locations: ProductionLocations,
): ProjectStorageLocations => {
  if (locations.layoutKind !== "workspace") {
    throw new Error("Workspace Project storage requires Workspace locations.");
  }
  return Object.freeze({
    kind: "workspace",
    projectSourceRoot: absolute(
      locations.projectSourceRoot,
      "Workspace Project source root",
    ),
    projectMediaRoot: absolute(
      locations.projectMediaRoot,
      "Workspace Project media root",
    ),
    catalogProjectionPath: join(
      locations.sourceCurrentRoot,
      "../resource-catalog.generated.json",
    ),
    registryProjectionPath: join(
      locations.sourceCurrentRoot,
      "../project-registry.generated.ts",
    ),
  });
};

const normalizedSegments = (logicalPath: string) => {
  if (
    logicalPath.includes("\\") ||
    normalize(logicalPath).split(sep).join("/") !== logicalPath
  ) {
    throw new Error("Project logical path must be normalized.");
  }
  const segments = logicalPath.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Project logical path is unsafe.");
  }
  return segments;
};

const contained = (root: string, candidate: string) => {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
};

export const resolveProjectOwnedLogicalPath = ({
  storage,
  logicalPath,
}: {
  readonly storage: ProjectStorageLocations;
  readonly logicalPath: string;
}) => {
  const segments = normalizedSegments(logicalPath);
  const prefix = segments.slice(0, 2).join("/");
  const root =
    prefix === "src/projects"
      ? storage.projectSourceRoot
      : prefix === "public/projects"
        ? storage.projectMediaRoot
        : null;
  if (root === null || segments.length < 4) {
    throw new Error("Logical path is not Project-owned.");
  }
  const destination = join(root, ...segments.slice(2));
  if (!contained(root, destination)) {
    throw new Error("Project logical path escapes its ownership root.");
  }
  return destination;
};

export const projectSourceLogicalPath = (
  storyId: string,
  relativePath: string,
) => `src/projects/${storyId}/${relativePath}`;

export const projectMediaLogicalPath = (
  storyId: string,
  relativePath: string,
) => `public/projects/${storyId}/${relativePath}`;
