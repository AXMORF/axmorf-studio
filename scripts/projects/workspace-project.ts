import { lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  ProjectAssetManifestSchema,
  ProducerConfigSchema,
  RenderSpecSchema,
  StoryIdSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  type ProducerConfig,
} from "../../src/contracts";
import {
  ProjectCreateInputSchema,
  computeProjectCreateInputFingerprint,
} from "../../src/contracts/project-create";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "../project-production/application/production-locations";
import { acquireRepositoryOperationLock } from "../shared/repository-operation-lock";
import {
  generateWorkspaceProjectResourceCatalog,
  generateWorkspaceResourceCatalog,
} from "../catalog/generate";
import { createWorkspaceProjectStorageLocations } from "./project-locations";
import { generateProjectRegistry } from "../registry/generate";
import {
  WORKSPACE_PENDING_SCENE_AUTHORING,
  commitWorkspaceProjectCreate,
  prepareWorkspaceProjectCreate,
  verifyWorkspaceProjectCreation,
} from "./workspace-project-create";
import { assertWorkspaceOwnedDirectoryChain } from "./workspace-owned-root";
import { readProjectSourceRoot } from "./root";
export { importWorkspaceProjectAsset } from "./workspace-project-asset";

type Metadata = Awaited<ReturnType<typeof lstat>> | null;

const metadata = async (path: string): Promise<Metadata> => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertWorkspaceLocations = (locations: ProductionLocations) => {
  if (locations.layoutKind !== "workspace") {
    throw new Error(
      "Workspace Project operation requires Workspace locations.",
    );
  }
};

const readRegularJson = async (path: string, label: string) => {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a regular non-symbolic file.`);
  }
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error(`${label} changed while being read.`);
  }
  return JSON.parse(bytes.toString("utf8")) as unknown;
};

const assertOwnedDeletionTarget = ({
  root,
  path,
}: {
  readonly root: string;
  readonly path: string;
}) => {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  const scope = relative(resolvedRoot, resolvedPath);
  if (scope === "" || scope === ".." || scope.startsWith(`..${sep}`)) {
    throw new Error("Workspace Project deletion target escapes its root.");
  }
};

export const readWorkspaceProjectContext = async ({
  locations,
  projectId: rawProjectId,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
}) => {
  assertWorkspaceLocations(locations);
  const projectId = StoryIdSchema.parse(rawProjectId);
  const root = join(locations.projectSourceRoot, projectId);
  await Promise.all([
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectSourceRoot,
      targetDirectory: root,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectMediaRoot,
      targetDirectory: join(locations.projectMediaRoot, projectId),
    }),
  ]);
  const state = await lstat(root);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error("Workspace Project root must be a real directory.");
  }
  const [story, render, visualStyle, assets, catalog] = await Promise.all([
    readRegularJson(join(root, "story.json"), "Workspace StorySpec").then(
      StorySpecSchema.parse,
    ),
    readRegularJson(join(root, "render.json"), "Workspace RenderSpec").then(
      RenderSpecSchema.parse,
    ),
    readRegularJson(
      join(root, "visual-style.json"),
      "Workspace VisualStyleSpec",
    ).then(VisualStyleSpecSchema.parse),
    readRegularJson(
      join(root, "assets.manifest.json"),
      "Workspace ProjectAssetManifest",
    ).then(ProjectAssetManifestSchema.parse),
    generateWorkspaceProjectResourceCatalog({
      locations,
      projectId,
      mode: "check",
    }).then(({ catalog }) => catalog),
  ]);
  if (
    story.storyId !== projectId ||
    visualStyle.storyId !== projectId ||
    assets.projectId !== projectId
  ) {
    throw new Error("Workspace Project context identity is stale.");
  }
  return {
    storyId: projectId,
    story,
    render,
    visualStyle,
    assets,
    catalog,
  } as const;
};

export const listWorkspaceProjects = async ({
  locations,
}: {
  readonly locations: ProductionLocations;
}) => {
  assertWorkspaceLocations(locations);
  const entries = await readProjectSourceRoot(locations.projectSourceRoot);
  const projectIds: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error("Workspace Project list contains a symbolic entry.");
    }
    if (!entry.isDirectory()) continue;
    projectIds.push(StoryIdSchema.parse(entry.name));
  }
  return {
    status: "workspace-project-list" as const,
    projectIds: projectIds.sort((left, right) => left.localeCompare(right)),
  };
};

const ownedTargets = ({
  locations,
  projectId,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
}) =>
  [
    {
      root: locations.projectSourceRoot,
      path: join(locations.projectSourceRoot, projectId),
      logicalPath: `projects/${projectId}`,
      kind: "directory",
    },
    {
      root: locations.projectMediaRoot,
      path: join(locations.projectMediaRoot, projectId),
      logicalPath: `media/${projectId}`,
      kind: "directory",
    },
    {
      root: locations.taskWorkspaceRoot,
      path: join(locations.taskWorkspaceRoot, projectId),
      logicalPath: `.rsp/work/${projectId}`,
      kind: "directory",
    },
    {
      root: locations.artifactStoreRoot,
      path: join(locations.artifactStoreRoot, projectId),
      logicalPath: `.rsp/artifacts/${projectId}`,
      kind: "directory",
    },
    {
      root: locations.attemptStoreRoot,
      path: join(locations.attemptStoreRoot, projectId),
      logicalPath: `.rsp/attempts/${projectId}`,
      kind: "directory",
    },
    {
      root: locations.sourceCurrentRoot,
      path: join(locations.sourceCurrentRoot, `${projectId}.json`),
      logicalPath: `.rsp/current/source/${projectId}.json`,
      kind: "file",
    },
    {
      root: locations.deliveryRoot,
      path: join(locations.deliveryRoot, projectId),
      logicalPath: `deliveries/${projectId}`,
      kind: "directory",
    },
    {
      root: join(dirname(locations.taskWorkspaceRoot), "revisions"),
      path: join(dirname(locations.taskWorkspaceRoot), "revisions", projectId),
      logicalPath: `.rsp/revisions/${projectId}`,
      kind: "directory",
    },
    {
      root: join(locations.disposableBuildRoot, "revision-candidates"),
      path: join(
        locations.disposableBuildRoot,
        "revision-candidates",
        projectId,
      ),
      logicalPath: `disposable-build/revision-candidates/${projectId}`,
      kind: "directory",
    },
    {
      root: join(locations.evidenceRoot, "revision-candidates"),
      path: join(locations.evidenceRoot, "revision-candidates", projectId),
      logicalPath: `evidence/revision-candidates/${projectId}`,
      kind: "directory",
    },
    {
      root: locations.disposableBuildRoot,
      path: join(locations.disposableBuildRoot, projectId),
      logicalPath: `disposable-build/${projectId}`,
      kind: "directory",
    },
    {
      root: locations.evidenceRoot,
      path: join(locations.evidenceRoot, projectId),
      logicalPath: `evidence/${projectId}`,
      kind: "directory",
    },
  ] as const;

export const deleteWorkspaceProject = async ({
  locations,
  projectId: rawProjectId,
  remove = (path: string) => rm(path, { recursive: true }),
  projections = {
    prepublish: () =>
      generateProjectRegistry({
        storage: createWorkspaceProjectStorageLocations(locations),
        mode: "write",
        excludeProjectIds: [StoryIdSchema.parse(rawProjectId)],
      }).then(() => undefined),
    regenerate: async () => {
      const [catalog, registry] = await Promise.all([
        generateWorkspaceResourceCatalog({ locations, mode: "write" }),
        generateProjectRegistry({
          storage: createWorkspaceProjectStorageLocations(locations),
          mode: "write",
        }),
      ]);
      return {
        catalogEntryCount: catalog.entryCount,
        projectEntryCount: registry.entryCount,
      };
    },
  },
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly remove?: (path: string) => Promise<void>;
  readonly projections?: Readonly<{
    prepublish: () => Promise<void>;
    regenerate: () => Promise<
      Readonly<{
        catalogEntryCount: number;
        projectEntryCount: number;
      }>
    >;
  }>;
}) => {
  assertWorkspaceLocations(locations);
  const projectId = StoryIdSchema.parse(rawProjectId);
  const lockRoot = locations.operationLockRoot;
  await assertWorkspaceOwnedDirectoryChain({
    locations,
    ownedRoot: lockRoot,
    allowMissingOwnedRoot: true,
  });
  await mkdir(lockRoot, { recursive: true });
  await assertWorkspaceOwnedDirectoryChain({ locations, ownedRoot: lockRoot });
  const lock = await acquireRepositoryOperationLock({
    rootDir: lockRoot,
    ownerId: "workspace-project-delete",
  });
  try {
    const candidates = ownedTargets({ locations, projectId });
    const targets: Array<(typeof candidates)[number]> = [];
    for (const candidate of candidates) {
      const { path, root, kind } = candidate;
      assertOwnedDeletionTarget({ root, path });
      await assertWorkspaceOwnedDirectoryChain({
        locations,
        ownedRoot: root,
        targetDirectory: kind === "directory" ? path : root,
        allowMissingOwnedRoot: true,
        allowMissingTarget: true,
      });
      const rootState = await metadata(root);
      if (
        rootState !== null &&
        (rootState.isSymbolicLink() || !rootState.isDirectory())
      ) {
        throw new Error("Workspace Project ownership root is unsafe.");
      }
      const state = await metadata(path);
      if (state === null) continue;
      if (state.isSymbolicLink()) {
        throw new Error("Workspace Project deletion target is symbolic.");
      }
      if (
        (kind === "directory" && !state.isDirectory()) ||
        (kind === "file" && !state.isFile())
      ) {
        throw new Error("Workspace Project deletion target has a stale kind.");
      }
      targets.push(candidate);
    }
    if (targets.length === 0) {
      throw new Error(
        `No Workspace Project-owned data found for: ${projectId}.`,
      );
    }
    await projections.prepublish();
    let removalStarted = false;
    try {
      for (const target of targets) {
        await assertWorkspaceOwnedDirectoryChain({
          locations,
          ownedRoot: target.root,
          targetDirectory:
            target.kind === "directory" ? target.path : target.root,
          allowMissingTarget: target.kind === "directory",
        });
        await remove(target.path);
        removalStarted = true;
      }
      const generated = await projections.regenerate();
      for (const target of targets) {
        if ((await metadata(target.path)) !== null) {
          throw new Error("Workspace Project deletion target still exists.");
        }
      }
      return {
        deletionVersion: 2,
        deletedProjectIds: [projectId],
        deletedPaths: targets
          .map(({ logicalPath }) => logicalPath)
          .sort((left, right) => left.localeCompare(right)),
        ...generated,
      } as const;
    } catch (error) {
      if (removalStarted) {
        await projections.regenerate().catch(() => undefined);
        throw new Error(
          "Workspace Project bytes were removed but projections did not converge.",
          { cause: error },
        );
      }
      await projections.regenerate().catch(() => undefined);
      throw error;
    }
  } finally {
    await lock.release();
  }
};

export const createWorkspaceProject = async ({
  locations,
  runtime,
  config: rawConfig,
  input: rawInput,
}: {
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly config: ProducerConfig;
  readonly input: unknown;
}) => {
  assertWorkspaceLocations(locations);
  const input = ProjectCreateInputSchema.parse(rawInput);
  const config = ProducerConfigSchema.parse(rawConfig);
  const sourceTarget = join(locations.projectSourceRoot, input.storyId);
  const mediaTarget = join(locations.projectMediaRoot, input.storyId);
  await Promise.all([
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectSourceRoot,
      targetDirectory: sourceTarget,
      allowMissingTarget: true,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectMediaRoot,
      targetDirectory: mediaTarget,
      allowMissingTarget: true,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.taskWorkspaceRoot,
      allowMissingOwnedRoot: true,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.operationLockRoot,
      allowMissingOwnedRoot: true,
    }),
  ]);
  const runtimeRoot = locations.runtimeResources;
  const resolvedRuntimeRoot = resolve(runtimeRoot);
  for (const [path, kind] of [
    [runtimeRoot, "directory"],
    [join(runtimeRoot, "source"), "directory"],
    [join(runtimeRoot, "shared-assets"), "directory"],
    [runtime.browserExecutable, "file"],
    [runtime.binariesDirectory, "directory"],
    [runtime.ffmpegExecutable, "file"],
    [runtime.ffprobeExecutable, "file"],
  ] as const) {
    const resolvedPath = resolve(path);
    const scope = relative(resolvedRuntimeRoot, resolvedPath);
    if (
      resolvedPath !== resolvedRuntimeRoot &&
      (scope === ".." || scope.startsWith(`..${sep}`))
    ) {
      throw new Error(
        "Workspace Project create Runtime Pack path escapes its authority.",
      );
    }
    const state = await lstat(resolvedPath);
    if (
      state.isSymbolicLink() ||
      (kind === "file" ? !state.isFile() : !state.isDirectory())
    ) {
      throw new Error(
        "Workspace Project create Runtime Pack authority is unsafe.",
      );
    }
  }
  const lockRoot = locations.operationLockRoot;
  await mkdir(lockRoot, { recursive: true });
  await assertWorkspaceOwnedDirectoryChain({ locations, ownedRoot: lockRoot });
  const lock = await acquireRepositoryOperationLock({
    rootDir: lockRoot,
    ownerId: "workspace-project-create",
  });
  let stagingRoot: string | null = null;
  try {
    await Promise.all([
      assertWorkspaceOwnedDirectoryChain({
        locations,
        ownedRoot: locations.projectSourceRoot,
        targetDirectory: sourceTarget,
        allowMissingTarget: true,
      }),
      assertWorkspaceOwnedDirectoryChain({
        locations,
        ownedRoot: locations.projectMediaRoot,
        targetDirectory: mediaTarget,
        allowMissingTarget: true,
      }),
    ]);
    const [sourceState, mediaState] = await Promise.all([
      metadata(sourceTarget),
      metadata(mediaTarget),
    ]);
    if ((sourceState === null) !== (mediaState === null)) {
      throw new Error("Workspace Project create target is partial.");
    }
    const existing = sourceState !== null && mediaState !== null;
    if (existing) {
      if (
        sourceState.isSymbolicLink() ||
        mediaState.isSymbolicLink() ||
        !sourceState.isDirectory() ||
        !mediaState.isDirectory()
      ) {
        throw new Error("Workspace Project create target is unsafe.");
      }
    }
    await mkdir(locations.taskWorkspaceRoot, { recursive: true });
    await assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.taskWorkspaceRoot,
    });
    stagingRoot = await mkdtemp(
      join(locations.taskWorkspaceRoot, ".project-create-"),
    );
    const prepared = await prepareWorkspaceProjectCreate({
      locations,
      stagingRoot,
      input,
      config,
    });
    if (existing) {
      const current = await verifyWorkspaceProjectCreation({
        locations,
        projectId: input.storyId,
        expectedInputFingerprint: computeProjectCreateInputFingerprint(input),
        expectedCreationIdentity: prepared.receipt.creationIdentity,
        expectedCatalogBytes: prepared.aggregateCatalogBytes,
      });
      return {
        status: "project-create-current",
        storyId: input.storyId,
        sourceState: "configured-authoring",
        creationIdentity: current.creationIdentity,
        writtenLogicalPaths: [],
        pendingAuthoringRequirements: [WORKSPACE_PENDING_SCENE_AUTHORING],
        nextAction: "prepare-narration",
      } as const;
    }
    await commitWorkspaceProjectCreate({
      locations,
      projectId: input.storyId,
      prepared,
      verify: async () => {
        await verifyWorkspaceProjectCreation({
          locations,
          projectId: input.storyId,
          expectedInputFingerprint: prepared.receipt.inputFingerprint,
          expectedCreationIdentity: prepared.receipt.creationIdentity,
          expectedCatalogBytes: prepared.aggregateCatalogBytes,
        });
      },
    });
    return {
      status: "project-created",
      storyId: input.storyId,
      sourceState: "configured-authoring",
      creationIdentity: prepared.receipt.creationIdentity,
      writtenLogicalPaths: [
        ...prepared.receipt.files.map(({ logicalPath }) => logicalPath),
        `src/projects/${input.storyId}/production/project-create.json`,
        "src/remotion/catalog/resource-catalog.generated.json",
      ].sort((left, right) => left.localeCompare(right)),
      pendingAuthoringRequirements: [WORKSPACE_PENDING_SCENE_AUTHORING],
      nextAction: "prepare-narration",
      requirementsFingerprint: prepared.requirementsFingerprint,
      publishingIntentFingerprint: prepared.publishingIntentFingerprint,
      pendingAuthoringFingerprint: prepared.pendingAuthoringFingerprint,
      copiedSceneMeaningIds: prepared.copiedSceneMeaningIds,
    } as const;
  } finally {
    if (stagingRoot !== null)
      await rm(stagingRoot, { recursive: true, force: true });
    await lock.release();
  }
};
