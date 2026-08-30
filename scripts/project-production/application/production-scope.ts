import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { ProjectRevisionCandidateIdSchema } from "../../../packages/studio/src/contracts/project-revision";
import { StoryIdSchema } from "../../../packages/studio/src/contracts/primitives";
import {
  PROJECT_REVISION_STORAGE_DIRECTORY,
  createLiveProjectProductionScope,
  type ProductionScope,
  type ProjectRevisionProductionScope,
} from "../domain/production-scope";

export {
  PROJECT_REVISION_STORAGE_DIRECTORY,
  createLiveProjectProductionScope,
  type LiveProjectProductionScope,
  type ProductionScope,
  type ProjectRevisionProductionScope,
} from "../domain/production-scope";

export const resolveProductionScope = ({
  rootDir,
  storyId,
  candidateId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly candidateId?: string;
}): ProductionScope =>
  candidateId === undefined
    ? createLiveProjectProductionScope({ rootDir, storyId })
    : createProjectRevisionProductionScope({ rootDir, storyId, candidateId });

export const productionScopeRoutingArguments = (scope: ProductionScope) =>
  scope.kind === "live-project"
    ? ({} as const)
    : ({ candidateId: scope.candidateId } as const);

export const productionScopeLogicalPath = (
  scope: ProductionScope,
  absolutePath: string,
) => {
  const logical = relative(scope.repositoryRoot, resolve(absolutePath))
    .split(sep)
    .join("/");
  if (
    logical === "" ||
    logical === ".." ||
    logical.startsWith("../") ||
    isAbsolute(logical)
  ) {
    throw new Error("Production-owned path escapes the repository.");
  }
  return logical;
};

const assertStrictDescendant = ({
  root,
  candidate,
  label,
}: {
  readonly root: string;
  readonly candidate: string;
  readonly label: string;
}) => {
  const fromRoot = relative(resolve(root), resolve(candidate));
  if (
    fromRoot === "" ||
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`)
  ) {
    throw new Error(`${label} must stay below its fixed root.`);
  }
  return resolve(candidate);
};

const parseContainedRelativePath = (value: string) => {
  if (
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(
      "Project revision scope paths must be contained POSIX-relative paths.",
    );
  }
  return value.split("/");
};

export const resolveProjectRevisionOwnedPath = ({
  scope,
  relativePath,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly relativePath: string;
}) =>
  assertStrictDescendant({
    root: scope.candidateRoot,
    candidate: join(
      scope.candidateRoot,
      ...parseContainedRelativePath(relativePath),
    ),
    label: "Project revision owned path",
  });

export const assertProjectRevisionOwnedPath = ({
  scope,
  path,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly path: string;
}) =>
  assertStrictDescendant({
    root: scope.candidateRoot,
    candidate: path,
    label: "Project revision owned path",
  });

export const createProjectRevisionProductionScope = ({
  rootDir,
  storyId: rawStoryId,
  candidateId: rawCandidateId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly candidateId: string;
}): ProjectRevisionProductionScope => {
  const repositoryRoot = resolve(rootDir);
  const storyId = StoryIdSchema.parse(rawStoryId);
  const candidateId = ProjectRevisionCandidateIdSchema.parse(rawCandidateId);
  const candidateRoot = assertStrictDescendant({
    root: repositoryRoot,
    candidate: join(
      repositoryRoot,
      PROJECT_REVISION_STORAGE_DIRECTORY,
      storyId,
      candidateId,
    ),
    label: "Project revision candidate root",
  });
  const definitionRoot = join(candidateRoot, "definition");
  const isolatedRoot = join(candidateRoot, "scope");
  return {
    kind: "project-revision-candidate",
    repositoryRoot,
    storyId,
    candidateId,
    candidateRoot,
    definitionRoot,
    baseSnapshotRoot: join(definitionRoot, "base"),
    isolatedRoot,
    projectSourceRoot: join(isolatedRoot, "src", "projects"),
    projectPublicRoot: join(isolatedRoot, "public", "projects"),
    narrationWorkRoot: join(isolatedRoot, ".narration-work"),
    producerWorkRoot: join(isolatedRoot, ".producer-work"),
    producerAttemptsRoot: join(isolatedRoot, ".producer-attempts"),
    outputRoot: join(isolatedRoot, "out"),
    deliveryRoot: join(isolatedRoot, "deliveries"),
    shared: {
      runtimeRoot: repositoryRoot,
      privateConfigRoot: join(repositoryRoot, "private"),
      operationLockPath: join(repositoryRoot, ".project-operation.lock"),
      producerArtifactRoot: join(repositoryRoot, ".producer-artifacts"),
    },
  };
};
