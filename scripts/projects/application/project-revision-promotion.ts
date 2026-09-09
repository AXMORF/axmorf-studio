import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  DeliveryBuildIdSchema,
  ProductionRevisionIdSchema,
  StoryIdSchema,
  serializeCanonicalJson,
  type DeliveryPublish,
  type ProductionRevision,
} from "@axmorf/studio/contracts";
import { generateResourceCatalog } from "../../catalog/generate";
import { generateProjectRegistry } from "../../registry/generate";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import { inspectCurrentDelivery } from "../../project-production/adapters/current-delivery-inspection";
import {
  buildCurrentProductionRevision,
  readCurrentProductionRevision,
} from "../../project-production/application/current-revision";
import { loadProjectProductionInputs } from "../../project-production/application/load-inputs";
import type { RuntimePolicyManifest } from "../../../packages/studio/src/runtime/policy-manifest";
import {
  assertProjectRevisionOwnedPath,
  createProjectRevisionProductionScope,
  type ProjectRevisionProductionScope,
} from "../../project-production/application/production-scope";
import {
  copyProjectRevisionRegularTree,
  inspectProjectRevisionCandidateDefinition,
  inspectProjectRevisionRegularTree,
} from "./project-revision-candidate-store";

const DELIVERY_FILE_NAMES = [
  "cover-3x4.png",
  "cover-4x3.png",
  "publish.json",
  "video.mp4",
] as const;

export const PROJECT_REVISION_PROMOTION_CHECKPOINTS = [
  "lock-acquired",
  "staging-complete",
  "source-installed",
  "public-installed",
  "narration-installed",
  "delivery-installed",
  "projections-regenerated",
  "verification-complete",
] as const;

export type ProjectRevisionPromotionCheckpoint =
  (typeof PROJECT_REVISION_PROMOTION_CHECKPOINTS)[number];

export type ProjectRevisionPromotionDelivery = Readonly<
  Pick<DeliveryPublish, "storyId" | "revisionId" | "deliveryBuildId">
>;

export type ProjectRevisionPromotionInput = Readonly<{
  rootDir: string;
  storyId: string;
  candidateId: string;
  expectedRevisionId: string;
  expectedDeliveryBuildId: string;
  runtimePolicyManifest?: RuntimePolicyManifest;
}>;

type ProjectionResult = Readonly<{
  catalogEntryCount: number;
  projectEntryCount: number;
}>;

export type ProjectRevisionPromotionDependencies = Readonly<{
  inspectDelivery?: (input: {
    readonly rootDir: string;
    readonly runtimeRootDir: string;
    readonly storyId: string;
  }) => Promise<ProjectRevisionPromotionDelivery | null>;
  readRevision?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly runtimePolicyManifest?: RuntimePolicyManifest;
  }) => Promise<Pick<ProductionRevision, "revisionId">>;
  readCandidateRevision?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly scope: ProjectRevisionProductionScope;
    readonly runtimePolicyManifest?: RuntimePolicyManifest;
  }) => Promise<Pick<ProductionRevision, "revisionId">>;
  regenerateProjections?: (rootDir: string) => Promise<ProjectionResult>;
  checkpoint?: (
    checkpoint: ProjectRevisionPromotionCheckpoint,
  ) => Promise<void>;
}>;

type PathState = Awaited<ReturnType<typeof lstat>> | null;
type TreeSnapshot = Awaited<
  ReturnType<typeof inspectProjectRevisionRegularTree>
>;

type CandidateState = Readonly<{
  source: TreeSnapshot;
  public: TreeSnapshot;
  narration: TreeSnapshot;
  delivery: TreeSnapshot;
}>;

type PromotionDirectorySlot = {
  readonly name: "source" | "public" | "narration" | "delivery";
  readonly live: string;
  readonly staging: string;
  readonly backup: string;
  backedUp: boolean;
  installed: boolean;
};

type PromotionFileSlot = {
  readonly name: "catalog" | "registry";
  readonly live: string;
  readonly backup: string;
  readonly discarded: string;
  prepared: boolean;
  backedUp: boolean;
};

const pathState = async (path: string): Promise<PathState> => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertContained = ({
  root,
  path,
  label,
}: {
  readonly root: string;
  readonly path: string;
  readonly label: string;
}) => {
  const fromRoot = relative(resolve(root), resolve(path));
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`${label} escapes its fixed root.`);
  }
};

const assertRealDirectory = async (path: string, label: string) => {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
};

const assertRegularFileIfPresent = async (path: string, label: string) => {
  const state = await pathState(path);
  if (state !== null && (state.isSymbolicLink() || !state.isFile())) {
    throw new Error(`${label} must be a regular file when present.`);
  }
  return state !== null;
};

const assertDirectoryChain = async ({
  root,
  target,
  label,
}: {
  readonly root: string;
  readonly target: string;
  readonly label: string;
}) => {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  assertContained({ root: resolvedRoot, path: resolvedTarget, label });
  await assertRealDirectory(resolvedRoot, "Project revision repository root");
  let current = resolvedRoot;
  for (const segment of relative(resolvedRoot, resolvedTarget)
    .split(sep)
    .filter(Boolean)) {
    current = join(current, segment);
    await assertRealDirectory(current, label);
  }
};

const sameTree = (left: TreeSnapshot, right: TreeSnapshot) =>
  serializeCanonicalJson(left) === serializeCanonicalJson(right);

const assertSameTree = (
  actual: TreeSnapshot,
  expected: TreeSnapshot,
  label: string,
) => {
  if (!sameTree(actual, expected)) {
    throw new Error(`${label} bytes do not match the expected revision.`);
  }
};

const assertExactDeliveryFiles = async (directory: string) => {
  await assertRealDirectory(directory, "Project revision delivery root");
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort();
  if (
    names.length !== DELIVERY_FILE_NAMES.length ||
    names.some((name, index) => name !== DELIVERY_FILE_NAMES[index]) ||
    entries.some((entry) => entry.isSymbolicLink() || !entry.isFile())
  ) {
    throw new Error(
      "Project revision delivery must contain exactly four regular files.",
    );
  }
  for (const name of DELIVERY_FILE_NAMES) {
    const state = await lstat(join(directory, name));
    if (state.isSymbolicLink() || !state.isFile()) {
      throw new Error(
        "Project revision delivery must contain exactly four regular files.",
      );
    }
  }
};

const defaultInspectDelivery: NonNullable<
  ProjectRevisionPromotionDependencies["inspectDelivery"]
> = async ({ rootDir, runtimeRootDir, storyId }) => {
  const delivery = await inspectCurrentDelivery({
    rootDir,
    runtimeRootDir,
    storyId,
  });
  return delivery === null
    ? null
    : {
        storyId: delivery.storyId,
        revisionId: delivery.revisionId,
        deliveryBuildId: delivery.deliveryBuildId,
      };
};

const defaultRegenerateProjections = async (
  rootDir: string,
): Promise<ProjectionResult> => {
  const catalog = await generateResourceCatalog({ rootDir, mode: "write" });
  const registry = await generateProjectRegistry({ rootDir, mode: "write" });
  return {
    catalogEntryCount: catalog.entryCount,
    projectEntryCount: registry.entryCount,
  };
};

const defaultReadCandidateRevision: NonNullable<
  ProjectRevisionPromotionDependencies["readCandidateRevision"]
> = async ({ rootDir, projectId, scope, runtimePolicyManifest }) =>
  buildCurrentProductionRevision(
    await loadProjectProductionInputs({
      rootDir,
      projectId,
      scope,
      runtimePolicyManifest,
    }),
  );

const resolveDependencies = (
  dependencies: ProjectRevisionPromotionDependencies,
  runtimePolicyManifest?: RuntimePolicyManifest,
) => ({
  inspectDelivery: dependencies.inspectDelivery ?? defaultInspectDelivery,
  readRevision: (
    input: Parameters<
      NonNullable<ProjectRevisionPromotionDependencies["readRevision"]>
    >[0],
  ) =>
    (dependencies.readRevision ?? readCurrentProductionRevision)({
      ...input,
      ...(runtimePolicyManifest === undefined ? {} : { runtimePolicyManifest }),
    }),
  readCandidateRevision: (
    input: Parameters<
      NonNullable<ProjectRevisionPromotionDependencies["readCandidateRevision"]>
    >[0],
  ) =>
    (dependencies.readCandidateRevision ?? defaultReadCandidateRevision)({
      ...input,
      ...(runtimePolicyManifest === undefined ? {} : { runtimePolicyManifest }),
    }),
  regenerateProjections:
    dependencies.regenerateProjections ?? defaultRegenerateProjections,
  checkpoint: dependencies.checkpoint ?? (async () => undefined),
});

const inspectDeliveryTuple = async ({
  rootDir,
  runtimeRootDir,
  storyId,
  deliveryDirectory,
  inspectDelivery,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir: string;
  readonly storyId: string;
  readonly deliveryDirectory: string;
  readonly inspectDelivery: NonNullable<
    ProjectRevisionPromotionDependencies["inspectDelivery"]
  >;
}) => {
  await assertExactDeliveryFiles(deliveryDirectory);
  const delivery = await inspectDelivery({ rootDir, runtimeRootDir, storyId });
  if (delivery === null) {
    throw new Error("Project revision delivery is missing.");
  }
  if (delivery.storyId !== storyId) {
    throw new Error("Project revision delivery Project identity is stale.");
  }
  return delivery;
};

const assertExpectedTuple = ({
  delivery,
  expectedRevisionId,
  expectedDeliveryBuildId,
  label,
}: {
  readonly delivery: ProjectRevisionPromotionDelivery;
  readonly expectedRevisionId: string;
  readonly expectedDeliveryBuildId: string;
  readonly label: string;
}) => {
  if (
    delivery.revisionId !== expectedRevisionId ||
    delivery.deliveryBuildId !== expectedDeliveryBuildId
  ) {
    throw new Error(`${label} does not match the expected revision tuple.`);
  }
};

const candidatePaths = (scope: ProjectRevisionProductionScope) => ({
  source: join(scope.projectSourceRoot, scope.storyId),
  public: join(scope.projectPublicRoot, scope.storyId),
  narration: join(scope.narrationWorkRoot, scope.storyId),
  delivery: join(scope.deliveryRoot, scope.storyId),
});

const livePaths = (scope: ProjectRevisionProductionScope) => ({
  source: join(scope.repositoryRoot, "src", "projects", scope.storyId),
  public: join(scope.repositoryRoot, "public", "projects", scope.storyId),
  narration: join(scope.repositoryRoot, ".narration-work", scope.storyId),
  delivery: join(scope.repositoryRoot, "deliveries", scope.storyId),
});

const inspectCandidate = async ({
  scope,
  expectedRevisionId,
  expectedDeliveryBuildId,
  inspectDelivery,
  readCandidateRevision,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly expectedRevisionId: string;
  readonly expectedDeliveryBuildId: string;
  readonly inspectDelivery: NonNullable<
    ProjectRevisionPromotionDependencies["inspectDelivery"]
  >;
  readonly readCandidateRevision: NonNullable<
    ProjectRevisionPromotionDependencies["readCandidateRevision"]
  >;
}) => {
  const record = await inspectProjectRevisionCandidateDefinition({ scope });
  const paths = candidatePaths(scope);
  for (const path of Object.values(paths)) {
    assertProjectRevisionOwnedPath({ scope, path });
  }
  const delivery = await inspectDeliveryTuple({
    rootDir: scope.isolatedRoot,
    runtimeRootDir: scope.repositoryRoot,
    storyId: scope.storyId,
    deliveryDirectory: paths.delivery,
    inspectDelivery,
  });
  assertExpectedTuple({
    delivery,
    expectedRevisionId,
    expectedDeliveryBuildId,
    label: "Candidate delivery",
  });
  const state = {
    source: await inspectProjectRevisionRegularTree(paths.source),
    public: await inspectProjectRevisionRegularTree(paths.public),
    narration: await inspectProjectRevisionRegularTree(paths.narration),
    delivery: await inspectProjectRevisionRegularTree(paths.delivery),
  } as const;
  const revision = await readCandidateRevision({
    rootDir: scope.repositoryRoot,
    projectId: scope.storyId,
    scope,
  });
  if (revision.revisionId !== expectedRevisionId) {
    throw new Error(
      "Candidate source does not match the expected ProductionRevision.",
    );
  }
  return { record, paths, state } as const;
};

const assertCandidateUnchanged = (
  before: CandidateState,
  after: CandidateState,
) => {
  assertSameTree(after.source, before.source, "Candidate source");
  assertSameTree(after.public, before.public, "Candidate public tree");
  assertSameTree(after.narration, before.narration, "Candidate narration");
  assertSameTree(after.delivery, before.delivery, "Candidate delivery");
};

const snapshotForBaseScope = async ({
  scope,
  snapshotScope,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly snapshotScope: "delivery" | "narration" | "public" | "source";
}) => {
  const paths = livePaths(scope);
  return inspectProjectRevisionRegularTree(paths[snapshotScope]);
};

const inspectLive = async ({
  scope,
  candidate,
  expectedRevisionId,
  expectedDeliveryBuildId,
  inspectDelivery,
  readRevision,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly candidate: Awaited<ReturnType<typeof inspectCandidate>>;
  readonly expectedRevisionId: string;
  readonly expectedDeliveryBuildId: string;
  readonly inspectDelivery: NonNullable<
    ProjectRevisionPromotionDependencies["inspectDelivery"]
  >;
  readonly readRevision: NonNullable<
    ProjectRevisionPromotionDependencies["readRevision"]
  >;
}) => {
  const paths = livePaths(scope);
  const delivery = await inspectDeliveryTuple({
    rootDir: scope.repositoryRoot,
    runtimeRootDir: scope.repositoryRoot,
    storyId: scope.storyId,
    deliveryDirectory: paths.delivery,
    inspectDelivery,
  });
  const source = await inspectProjectRevisionRegularTree(paths.source);
  const publicTree = await inspectProjectRevisionRegularTree(paths.public);
  const narration = await inspectProjectRevisionRegularTree(paths.narration);
  const deliveryTree = await inspectProjectRevisionRegularTree(paths.delivery);
  const revision = await readRevision({
    rootDir: scope.repositoryRoot,
    projectId: scope.storyId,
  });

  if (
    revision.revisionId === expectedRevisionId &&
    delivery.revisionId === expectedRevisionId &&
    delivery.deliveryBuildId === expectedDeliveryBuildId
  ) {
    assertSameTree(source, candidate.state.source, "Current source");
    assertSameTree(publicTree, candidate.state.public, "Current public tree");
    assertSameTree(narration, candidate.state.narration, "Current narration");
    assertSameTree(deliveryTree, candidate.state.delivery, "Current delivery");
    return { kind: "current" } as const;
  }

  const { input, baseSnapshot } = candidate.record;
  if (
    revision.revisionId !== input.baseRevisionId ||
    delivery.revisionId !== input.baseRevisionId ||
    delivery.deliveryBuildId !== input.baseDeliveryBuildId
  ) {
    throw new Error("Live Project no longer matches the candidate base tuple.");
  }
  for (const expectedTree of baseSnapshot.trees) {
    const actualTree =
      expectedTree.scope === "source"
        ? source
        : expectedTree.scope === "public"
          ? publicTree
          : expectedTree.scope === "delivery"
            ? deliveryTree
            : expectedTree.scope === "narration"
              ? narration
              : await snapshotForBaseScope({
                  scope,
                  snapshotScope: expectedTree.scope,
                });
    assertSameTree(
      actualTree,
      expectedTree.entries,
      `Live ${expectedTree.scope} base snapshot`,
    );
  }
  return { kind: "base" } as const;
};

const installDirectorySlot = async (slot: PromotionDirectorySlot) => {
  await assertRealDirectory(slot.live, `Live ${slot.name}`);
  await rename(slot.live, slot.backup);
  slot.backedUp = true;
  await rename(slot.staging, slot.live);
  slot.installed = true;
};

const backupProjection = async (slot: PromotionFileSlot) => {
  const exists = await assertRegularFileIfPresent(
    slot.live,
    `Live ${slot.name}`,
  );
  slot.prepared = true;
  if (exists) {
    await rename(slot.live, slot.backup);
    slot.backedUp = true;
  }
};

const rollbackDirectorySlot = async (slot: PromotionDirectorySlot) => {
  if (slot.installed) {
    await assertRealDirectory(slot.live, `Promoted ${slot.name}`);
    await rename(slot.live, slot.staging);
    slot.installed = false;
  }
  if (slot.backedUp) {
    await assertRealDirectory(slot.backup, `Backed-up ${slot.name}`);
    await rename(slot.backup, slot.live);
    slot.backedUp = false;
  }
};

const rollbackProjection = async (slot: PromotionFileSlot) => {
  if (!slot.prepared) return;
  if (await assertRegularFileIfPresent(slot.live, `Promoted ${slot.name}`)) {
    await rename(slot.live, slot.discarded);
  }
  if (slot.backedUp) {
    await assertRegularFileIfPresent(slot.backup, `Backed-up ${slot.name}`);
    await rename(slot.backup, slot.live);
    slot.backedUp = false;
  }
};

const createSuccessTuple = ({
  status,
  scope,
  expectedRevisionId,
  expectedDeliveryBuildId,
}: {
  readonly status: "project-revision-promoted" | "project-revision-current";
  readonly scope: ProjectRevisionProductionScope;
  readonly expectedRevisionId: string;
  readonly expectedDeliveryBuildId: string;
}) => ({
  status,
  storyId: scope.storyId,
  candidateId: scope.candidateId,
  revisionId: expectedRevisionId,
  deliveryBuildId: expectedDeliveryBuildId,
});

type ProjectRevisionPromotionResult = ReturnType<typeof createSuccessTuple> &
  Partial<ProjectionResult> &
  Readonly<{ cleanupPending?: true }>;

export const promoteProjectRevisionCandidate = async (
  rawInput: ProjectRevisionPromotionInput,
  rawDependencies: ProjectRevisionPromotionDependencies = {},
) => {
  const rootDir = resolve(rawInput.rootDir);
  const storyId = StoryIdSchema.parse(rawInput.storyId);
  const expectedRevisionId = ProductionRevisionIdSchema.parse(
    rawInput.expectedRevisionId,
  );
  const expectedDeliveryBuildId = DeliveryBuildIdSchema.parse(
    rawInput.expectedDeliveryBuildId,
  );
  const scope = createProjectRevisionProductionScope({
    rootDir,
    storyId,
    candidateId: rawInput.candidateId,
  });
  await assertRealDirectory(rootDir, "Project revision repository root");
  const dependencies = resolveDependencies(
    rawDependencies,
    rawInput.runtimePolicyManifest,
  );
  const candidateBeforeLock = await inspectCandidate({
    scope,
    expectedRevisionId,
    expectedDeliveryBuildId,
    inspectDelivery: dependencies.inspectDelivery,
    readCandidateRevision: dependencies.readCandidateRevision,
  });
  await inspectLive({
    scope,
    candidate: candidateBeforeLock,
    expectedRevisionId,
    expectedDeliveryBuildId,
    inspectDelivery: dependencies.inspectDelivery,
    readRevision: dependencies.readRevision,
  });

  const lock = await acquireRepositoryOperationLock({
    rootDir,
    ownerId: "project-revision-promote",
  });
  let result: ProjectRevisionPromotionResult | undefined;
  let operationError: unknown;
  let transactionRoot: string | undefined;
  const directorySlots: PromotionDirectorySlot[] = [];
  const projectionSlots: PromotionFileSlot[] = [];
  let mutationStarted = false;
  try {
    await dependencies.checkpoint("lock-acquired");
    const candidate = await inspectCandidate({
      scope,
      expectedRevisionId,
      expectedDeliveryBuildId,
      inspectDelivery: dependencies.inspectDelivery,
      readCandidateRevision: dependencies.readCandidateRevision,
    });
    assertCandidateUnchanged(candidateBeforeLock.state, candidate.state);
    const live = await inspectLive({
      scope,
      candidate,
      expectedRevisionId,
      expectedDeliveryBuildId,
      inspectDelivery: dependencies.inspectDelivery,
      readRevision: dependencies.readRevision,
    });
    if (live.kind === "current") {
      result = createSuccessTuple({
        status: "project-revision-current",
        scope,
        expectedRevisionId,
        expectedDeliveryBuildId,
      });
    } else {
      transactionRoot = join(scope.candidateRoot, `.promotion-${randomUUID()}`);
      assertProjectRevisionOwnedPath({ scope, path: transactionRoot });
      await mkdir(transactionRoot);
      const stagingRoot = join(transactionRoot, "staging");
      const backupRoot = join(transactionRoot, "backup");
      const discardRoot = join(transactionRoot, "discarded");
      await Promise.all([
        mkdir(stagingRoot),
        mkdir(backupRoot),
        mkdir(discardRoot),
      ]);
      const candidatePathsForPromotion = candidate.paths;
      const livePathsForPromotion = livePaths(scope);
      for (const name of [
        "source",
        "public",
        "narration",
        "delivery",
      ] as const) {
        const staging = join(stagingRoot, name);
        const copied = await copyProjectRevisionRegularTree({
          sourceRoot: candidatePathsForPromotion[name],
          destinationRoot: staging,
        });
        assertSameTree(copied, candidate.state[name], `Staged ${name}`);
        directorySlots.push({
          name,
          live: livePathsForPromotion[name],
          staging,
          backup: join(backupRoot, name),
          backedUp: false,
          installed: false,
        });
      }
      const candidateAfterCopy = await inspectCandidate({
        scope,
        expectedRevisionId,
        expectedDeliveryBuildId,
        inspectDelivery: dependencies.inspectDelivery,
        readCandidateRevision: dependencies.readCandidateRevision,
      });
      assertCandidateUnchanged(candidate.state, candidateAfterCopy.state);
      await dependencies.checkpoint("staging-complete");

      const projectionDefinitions = [
        {
          name: "catalog" as const,
          live: join(
            rootDir,
            "src/remotion/catalog/resource-catalog.generated.json",
          ),
        },
        {
          name: "registry" as const,
          live: join(rootDir, "src/projects/project-registry.generated.ts"),
        },
      ];
      for (const definition of projectionDefinitions) {
        assertContained({
          root: rootDir,
          path: definition.live,
          label: `Project revision ${definition.name}`,
        });
        await assertDirectoryChain({
          root: rootDir,
          target: dirname(definition.live),
          label: `Project revision ${definition.name} parent`,
        });
        projectionSlots.push({
          ...definition,
          backup: join(backupRoot, definition.name),
          discarded: join(discardRoot, definition.name),
          prepared: false,
          backedUp: false,
        });
      }

      mutationStarted = true;
      for (const slot of directorySlots) {
        await installDirectorySlot(slot);
        await dependencies.checkpoint(`${slot.name}-installed`);
      }
      for (const slot of projectionSlots) await backupProjection(slot);
      const projection = await dependencies.regenerateProjections(rootDir);
      await dependencies.checkpoint("projections-regenerated");

      const verifiedCandidate = await inspectCandidate({
        scope,
        expectedRevisionId,
        expectedDeliveryBuildId,
        inspectDelivery: dependencies.inspectDelivery,
        readCandidateRevision: dependencies.readCandidateRevision,
      });
      assertCandidateUnchanged(candidate.state, verifiedCandidate.state);
      const verifiedLive = await inspectLive({
        scope,
        candidate: verifiedCandidate,
        expectedRevisionId,
        expectedDeliveryBuildId,
        inspectDelivery: dependencies.inspectDelivery,
        readRevision: dependencies.readRevision,
      });
      if (verifiedLive.kind !== "current") {
        throw new Error("Promoted Project did not become current.");
      }
      for (const slot of projectionSlots) {
        if (!(await assertRegularFileIfPresent(slot.live, slot.name))) {
          throw new Error(`Project revision ${slot.name} was not regenerated.`);
        }
      }
      await dependencies.checkpoint("verification-complete");
      result = {
        ...createSuccessTuple({
          status: "project-revision-promoted",
          scope,
          expectedRevisionId,
          expectedDeliveryBuildId,
        }),
        ...projection,
      };
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (mutationStarted) {
      for (const slot of [...projectionSlots].reverse()) {
        await rollbackProjection(slot).catch((rollbackError: unknown) => {
          rollbackErrors.push(rollbackError);
        });
      }
      for (const slot of [...directorySlots].reverse()) {
        await rollbackDirectorySlot(slot).catch((rollbackError: unknown) => {
          rollbackErrors.push(rollbackError);
        });
      }
    }
    if (rollbackErrors.length === 0) {
      operationError = error;
    } else {
      operationError = new AggregateError(
        [error, ...rollbackErrors],
        "Project revision promotion failed and rollback was incomplete.",
      );
    }
  }

  if (
    operationError === undefined &&
    result !== undefined &&
    transactionRoot !== undefined
  ) {
    try {
      await rm(transactionRoot, { recursive: true, force: true });
    } catch {
      // Promotion is already committed and verified. The candidate-owned
      // transaction is safe to retain and an idempotent retry remains valid.
      result = { ...result, cleanupPending: true };
    }
  }

  let releaseError: unknown;
  await lock.release().catch((error: unknown) => {
    releaseError = error;
  });
  if (operationError !== undefined || releaseError !== undefined) {
    const errors = [operationError, releaseError].filter(
      (error) => error !== undefined,
    );
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, "Project revision promotion failed.");
  }
  if (result === undefined) {
    throw new Error("Project revision promotion produced no result.");
  }
  return result;
};
