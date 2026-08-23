import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

import type { ProductionLocations } from "../domain/production-locations";

export {
  createRuntimeExecutionResources,
  type ProductionLayoutKind,
  type ProductionLocations,
  type RuntimeExecutionResources,
} from "../domain/production-locations";

const absolute = (value: string, label: string) => {
  if (!isAbsolute(value)) throw new Error(`${label} must be absolute.`);
  return resolve(value);
};

const overlaps = (left: string, right: string) => {
  const fromLeft = relative(left, right);
  const fromRight = relative(right, left);
  const contained = (value: string) =>
    value === "" || (value !== ".." && !value.startsWith(`..${sep}`));
  return contained(fromLeft) || contained(fromRight);
};

export const createProductionLocations = (
  raw: ProductionLocations,
): ProductionLocations => {
  const locations = {
    layoutKind: raw.layoutKind,
    projectSourceRoot: absolute(raw.projectSourceRoot, "Project source root"),
    projectMediaRoot: absolute(raw.projectMediaRoot, "Project media root"),
    taskWorkspaceRoot: absolute(raw.taskWorkspaceRoot, "Task workspace root"),
    artifactStoreRoot: absolute(raw.artifactStoreRoot, "Artifact store root"),
    attemptStoreRoot: absolute(raw.attemptStoreRoot, "Attempt store root"),
    sourceCurrentRoot: absolute(raw.sourceCurrentRoot, "Source current root"),
    deliveryRoot: absolute(raw.deliveryRoot, "Delivery root"),
    privateConfigRoot: absolute(raw.privateConfigRoot, "Private config root"),
    providerMaterialRoot: absolute(
      raw.providerMaterialRoot,
      "Provider material root",
    ),
    runtimeResources: absolute(raw.runtimeResources, "Runtime resources"),
    disposableBuildRoot: absolute(
      raw.disposableBuildRoot,
      "Disposable build root",
    ),
    evidenceRoot: absolute(raw.evidenceRoot, "Evidence root"),
    operationLockRoot: absolute(raw.operationLockRoot, "Operation lock root"),
  } as const;
  if (locations.layoutKind === "workspace") {
    if (locations.providerMaterialRoot !== locations.privateConfigRoot) {
      throw new Error(
        "Workspace provider material must remain in Application Support.",
      );
    }
    const workspaceOwned = [
      locations.projectSourceRoot,
      locations.projectMediaRoot,
      locations.taskWorkspaceRoot,
      locations.artifactStoreRoot,
      locations.attemptStoreRoot,
      locations.sourceCurrentRoot,
      locations.deliveryRoot,
      locations.operationLockRoot,
    ];
    const privateOwned = [
      locations.runtimeResources,
      locations.privateConfigRoot,
      locations.disposableBuildRoot,
    ];
    for (const [index, left] of workspaceOwned.entries()) {
      for (const right of workspaceOwned.slice(index + 1)) {
        if (overlaps(left, right)) {
          throw new Error("Workspace production roots must not overlap.");
        }
      }
      for (const right of privateOwned) {
        if (overlaps(left, right)) {
          throw new Error("Workspace and private production roots overlap.");
        }
      }
    }
    for (const [index, left] of privateOwned.entries()) {
      for (const right of privateOwned.slice(index + 1)) {
        if (overlaps(left, right)) {
          throw new Error("Private production roots must not overlap.");
        }
      }
    }
  }
  return Object.freeze(locations);
};

export const createRepositoryProductionLocations = ({
  repositoryRoot,
}: {
  readonly repositoryRoot: string;
}) => {
  const root = absolute(repositoryRoot, "Repository root");
  return createProductionLocations({
    layoutKind: "repository",
    projectSourceRoot: join(root, "src/projects"),
    projectMediaRoot: join(root, "public/projects"),
    taskWorkspaceRoot: join(root, ".producer-work"),
    artifactStoreRoot: join(root, ".producer-artifacts"),
    attemptStoreRoot: join(root, ".producer-attempts"),
    sourceCurrentRoot: join(root, ".producer-current/source"),
    deliveryRoot: join(root, "deliveries"),
    privateConfigRoot: join(root, "private"),
    providerMaterialRoot: root,
    runtimeResources: root,
    disposableBuildRoot: join(root, "out/.producer-build"),
    evidenceRoot: join(root, "out"),
    operationLockRoot: join(root, ".producer-locks"),
  });
};

export const createWorkspaceProductionLocations = ({
  workspaceRoot,
  applicationSupportRoot,
  runtimeResources,
  cacheRoot,
}: {
  readonly workspaceRoot: string;
  readonly applicationSupportRoot: string;
  readonly runtimeResources: string;
  readonly cacheRoot: string;
}) => {
  const root = absolute(workspaceRoot, "Workspace root");
  const appSupport = absolute(
    applicationSupportRoot,
    "Application Support root",
  );
  const runtime = absolute(runtimeResources, "Runtime resources");
  const cache = absolute(cacheRoot, "Cache root");
  for (const externalRoot of [appSupport, runtime, cache]) {
    if (overlaps(root, externalRoot)) {
      throw new Error("Workspace and external production roots overlap.");
    }
  }
  return createProductionLocations({
    layoutKind: "workspace",
    projectSourceRoot: join(root, "projects"),
    projectMediaRoot: join(root, "media"),
    taskWorkspaceRoot: join(root, ".rsp/work"),
    artifactStoreRoot: join(root, ".rsp/artifacts"),
    attemptStoreRoot: join(root, ".rsp/attempts"),
    sourceCurrentRoot: join(root, ".rsp/current/source"),
    deliveryRoot: join(root, "deliveries"),
    privateConfigRoot: appSupport,
    providerMaterialRoot: appSupport,
    runtimeResources: runtime,
    disposableBuildRoot: cache,
    evidenceRoot: join(cache, "evidence"),
    operationLockRoot: join(root, ".rsp/locks"),
  });
};

const isContained = (root: string, candidate: string) => {
  const result = relative(root, candidate);
  return result !== "" && result !== ".." && !result.startsWith(`..${sep}`);
};

export const resolveTaskLogicalOutput = ({
  locations,
  storyId,
  logicalPath,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly logicalPath: string;
}) => {
  const normalized = normalize(logicalPath).split(sep).join("/");
  if (normalized !== logicalPath || logicalPath.includes("\\")) {
    throw new Error("Task logical path must be normalized.");
  }
  const [scope, ...segments] = logicalPath.split("/");
  if (
    (scope !== "project" && scope !== "public") ||
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Task logical path has an unsupported scope.");
  }
  const root =
    scope === "project"
      ? join(locations.projectSourceRoot, storyId)
      : join(locations.projectMediaRoot, storyId);
  const destination = join(root, ...segments);
  if (!isContained(root, destination)) {
    throw new Error("Task logical path escapes its ownership root.");
  }
  return destination;
};
