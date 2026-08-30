import { randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  PositiveIntegerSchema,
  ProducerLogicalPathSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import { inspectArtifact, resolveArtifactPath } from "./artifact-store";
import { checksumBytes } from "./project-input-snapshot";

type Replacement = Readonly<{
  kind: "directory" | "file";
  target: string;
  staging: string;
  backup: string;
}>;

type MaterializationDependencies = Readonly<{
  beforePromote?: (input: {
    readonly index: number;
    readonly target: string;
  }) => Promise<void>;
}>;

export type AdditionalSceneFileManifest = ReadonlyMap<
  string,
  ReadonlyMap<string, Readonly<{ checksum: string; sizeBytes: number }>>
>;

const state = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertContainedDirectory = async ({
  rootDir,
  directory,
}: {
  readonly rootDir: string;
  readonly directory: string;
}) => {
  const root = resolve(rootDir);
  const target = resolve(directory);
  const relativeTarget = relative(root, target);
  if (
    isAbsolute(relativeTarget) ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`)
  ) {
    throw new Error("Materialization parent escapes the repository.");
  }

  const rootMetadata = await state(root);
  if (
    rootMetadata === null ||
    rootMetadata.isSymbolicLink() ||
    !rootMetadata.isDirectory()
  ) {
    throw new Error("Materialization repository root is unsafe.");
  }
  const parts = relativeTarget === "" ? [] : relativeTarget.split(sep);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    const metadata = await state(current);
    if (metadata === null) return;
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("Materialization parent is unsafe.");
    }
  }
};

const assertLivePath = async ({
  rootDir,
  kind,
  target,
}: {
  readonly rootDir: string;
  readonly kind: Replacement["kind"];
  readonly target: string;
}) => {
  await assertContainedDirectory({ rootDir, directory: dirname(target) });
  await assertTargetType(kind, target);
};

const ensureContainedDirectory = async ({
  rootDir,
  directory,
}: {
  readonly rootDir: string;
  readonly directory: string;
}) => {
  await assertContainedDirectory({ rootDir, directory });
  await mkdir(directory, { recursive: true });
  await assertContainedDirectory({ rootDir, directory });
};

const assertTargetType = async (kind: Replacement["kind"], target: string) => {
  const metadata = await state(target);
  if (metadata === null) return;
  if (
    metadata.isSymbolicLink() ||
    (kind === "directory" ? !metadata.isDirectory() : !metadata.isFile())
  ) {
    throw new Error("Materialization target is unsafe.");
  }
};

const removeReplacementPath = async (
  rootDir: string,
  replacement: Replacement,
  path: string,
) => {
  await assertContainedDirectory({ rootDir, directory: dirname(path) });
  await assertTargetType(replacement.kind, path);
  await rm(path, {
    recursive: replacement.kind === "directory",
    force: true,
  });
};

const promoteReplacements = async (
  rootDir: string,
  replacements: readonly Replacement[],
  dependencies: MaterializationDependencies,
) => {
  for (const replacement of replacements) {
    await assertLivePath({
      rootDir,
      kind: replacement.kind,
      target: replacement.target,
    });
    const staging = await lstat(replacement.staging);
    if (
      staging.isSymbolicLink() ||
      (replacement.kind === "directory"
        ? !staging.isDirectory()
        : !staging.isFile())
    ) {
      throw new Error("Materialization staging is unsafe.");
    }
    if ((await state(replacement.backup)) !== null) {
      throw new Error("Materialization backup path already exists.");
    }
  }

  const touched: Replacement[] = [];
  try {
    for (const [index, replacement] of replacements.entries()) {
      await dependencies.beforePromote?.({ index, target: replacement.target });
      await assertLivePath({
        rootDir,
        kind: replacement.kind,
        target: replacement.target,
      });
      if ((await state(replacement.backup)) !== null) {
        throw new Error("Materialization backup path already exists.");
      }
      if ((await state(replacement.target)) !== null) {
        await rename(replacement.target, replacement.backup);
      }
      touched.push(replacement);
      await rename(replacement.staging, replacement.target);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const replacement of [...touched].reverse()) {
      try {
        await assertLivePath({
          rootDir,
          kind: replacement.kind,
          target: replacement.target,
        });
        if ((await state(replacement.target)) !== null) {
          await removeReplacementPath(rootDir, replacement, replacement.target);
        }
        if ((await state(replacement.backup)) !== null) {
          await rename(replacement.backup, replacement.target);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Materialization rollback failed.",
      );
    }
    throw error;
  }

  for (const replacement of replacements) {
    await removeReplacementPath(rootDir, replacement, replacement.backup);
  }
};

const copyArtifactPrefix = async ({
  artifactRoot,
  attestation,
  prefix,
  staging,
}: {
  readonly artifactRoot: string;
  readonly attestation: ArtifactAttestation;
  readonly prefix: "src/" | "public/";
  readonly staging: string;
}) => {
  await mkdir(staging);
  for (const output of attestation.outputManifest.filter(({ logicalPath }) =>
    logicalPath.startsWith(prefix),
  )) {
    const relativePath = output.logicalPath.slice(prefix.length);
    const destination = join(staging, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(artifactRoot, "files", output.logicalPath), destination, {
      errorOnExist: true,
      force: false,
    });
  }
};

const listRegularFiles = async (
  root: string,
  directory = root,
): Promise<readonly string[]> => {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Materialized owner root is unsafe.");
  }
  const files: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error("Materialized owner root contains a non-regular entry.");
    }
    if (entry.isDirectory())
      files.push(...(await listRegularFiles(root, path)));
    else files.push(relative(root, path).split(sep).join("/"));
  }
  return files.sort();
};

const assertExactDirectory = async ({
  rootDir,
  directory,
  expected,
}: {
  readonly rootDir: string;
  readonly directory: string;
  readonly expected: ReadonlyMap<
    string,
    { readonly checksum: string; readonly sizeBytes: number }
  >;
}) => {
  await assertLivePath({ rootDir, kind: "directory", target: directory });
  const actual = await listRegularFiles(directory);
  const paths = [...expected.keys()].sort();
  if (
    actual.length !== paths.length ||
    actual.some((path, index) => path !== paths[index])
  ) {
    throw new Error("Materialized owner exact file set drifted.");
  }
  for (const path of paths) {
    const bytes = Uint8Array.from(await readFile(join(directory, path)));
    const manifest = expected.get(path);
    if (
      manifest === undefined ||
      bytes.byteLength !== manifest.sizeBytes ||
      checksumBytes(bytes) !== manifest.checksum
    ) {
      throw new Error("Materialized owner checksum drifted.");
    }
  }
};

const assertArtifactBinding = async ({
  rootDir,
  task,
  attestation,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly attestation: ArtifactAttestation;
}) => {
  const current = await inspectArtifact({ rootDir, task });
  if (current?.artifactFingerprint !== attestation.artifactFingerprint) {
    throw new Error("Artifact changed before materialization.");
  }
};

export const verifyMaterializedOwnerArtifacts = async ({
  rootDir,
  projectId: rawProjectId,
  artifacts,
  sceneTaskInputs,
  additionalSceneFiles = new Map(),
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly artifacts: readonly Readonly<{
    task: ProducerTaskSpec;
    attestation: ArtifactAttestation;
  }>[];
  readonly sceneTaskInputs: ReadonlyMap<string, unknown>;
  readonly additionalSceneFiles?: AdditionalSceneFileManifest;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const sceneMeaningIds = new Set<string>(
    artifacts.flatMap(({ task }) =>
      (task.taskKind === "scene-owner" || task.taskKind === "scene-template") &&
      task.semanticId !== null
        ? [task.semanticId]
        : [],
    ),
  );
  for (const meaningId of additionalSceneFiles.keys()) {
    if (!sceneMeaningIds.has(meaningId)) {
      throw new Error(
        "Additional Scene file manifest belongs to an unknown Scene.",
      );
    }
  }
  for (const { task, attestation } of artifacts) {
    if (task.storyId !== projectId)
      throw new Error("Artifact belongs to another Project.");
    await assertArtifactBinding({ rootDir, task, attestation });
    const sourceOutputs = new Map<
      string,
      { readonly checksum: string; readonly sizeBytes: number }
    >(
      attestation.outputManifest
        .filter(({ logicalPath }) => logicalPath.startsWith("src/"))
        .map((output) => [output.logicalPath.slice(4), output] as const),
    );
    if (task.taskKind === "scene-owner" || task.taskKind === "scene-template") {
      if (task.semanticId === null)
        throw new Error("Scene artifact is missing semantic identity.");
      const input = sceneTaskInputs.get(task.semanticId);
      if (input === undefined)
        throw new Error("Scene task input is missing during verification.");
      const bytes = new TextEncoder().encode(
        `${serializeCanonicalJson(input)}\n`,
      );
      sourceOutputs.set("task-input.generated.json", {
        checksum: checksumBytes(bytes),
        sizeBytes: bytes.byteLength,
      });
      for (const [rawLogicalPath, rawManifest] of additionalSceneFiles.get(
        task.semanticId,
      ) ?? []) {
        const logicalPath = ProducerLogicalPathSchema.parse(rawLogicalPath);
        if (sourceOutputs.has(logicalPath)) {
          throw new Error(
            "Additional Scene file conflicts with an artifact-owned path.",
          );
        }
        sourceOutputs.set(logicalPath, {
          checksum: Sha256DigestSchema.parse(rawManifest.checksum),
          sizeBytes: PositiveIntegerSchema.parse(rawManifest.sizeBytes),
        });
      }
      await assertExactDirectory({
        rootDir,
        directory: join(
          rootDir,
          "src/projects",
          projectId,
          "scenes",
          task.semanticId,
        ),
        expected: sourceOutputs,
      });
      const publicOutputs = new Map<
        string,
        { readonly checksum: string; readonly sizeBytes: number }
      >(
        attestation.outputManifest
          .filter(({ logicalPath }) => logicalPath.startsWith("public/"))
          .map((output) => [output.logicalPath.slice(7), output] as const),
      );
      await assertExactDirectory({
        rootDir,
        directory: join(
          rootDir,
          "public/projects",
          projectId,
          "scenes",
          task.semanticId,
        ),
        expected: publicOutputs,
      });
    } else if (task.taskKind === "global-visual-owner") {
      await assertExactDirectory({
        rootDir,
        directory: join(rootDir, "src/projects", projectId, "global-visual"),
        expected: sourceOutputs,
      });
      const plan = attestation.outputManifest.find(
        ({ logicalPath }) => logicalPath === "project/global-visual-plan.json",
      );
      if (plan === undefined)
        throw new Error("GlobalVisual artifact plan is missing.");
      const target = join(
        rootDir,
        "src/projects",
        projectId,
        "global-visual-plan.json",
      );
      await assertLivePath({ rootDir, kind: "file", target });
      const bytes = Uint8Array.from(await readFile(target));
      if (
        bytes.byteLength !== plan.sizeBytes ||
        checksumBytes(bytes) !== plan.checksum
      ) {
        throw new Error("Materialized GlobalVisual plan checksum drifted.");
      }
    } else if (task.taskKind === "cover-owner") {
      await assertExactDirectory({
        rootDir,
        directory: join(rootDir, "src/projects", projectId, "delivery/cover"),
        expected: sourceOutputs,
      });
    }
  }
};

export const materializeOwnerArtifacts = async ({
  rootDir,
  projectId: rawProjectId,
  artifacts,
  sceneTaskInputs,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly artifacts: readonly Readonly<{
    task: ProducerTaskSpec;
    attestation: ArtifactAttestation;
  }>[];
  readonly sceneTaskInputs: ReadonlyMap<string, unknown>;
  readonly dependencies?: MaterializationDependencies;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const replacements: Replacement[] = [];
  const suffix = randomUUID();
  const targets = new Set<string>();

  const liveTargets: {
    readonly kind: Replacement["kind"];
    readonly target: string;
  }[] = [];
  for (const { task, attestation } of artifacts) {
    if (task.storyId !== projectId)
      throw new Error("Artifact belongs to another Project.");
    await assertArtifactBinding({ rootDir, task, attestation });
    if (task.taskKind === "scene-owner" || task.taskKind === "scene-template") {
      if (task.semanticId === null)
        throw new Error("Scene artifact is missing semantic identity.");
      if (!sceneTaskInputs.has(task.semanticId)) {
        throw new Error("Scene task input is missing during materialization.");
      }
      liveTargets.push(
        {
          kind: "directory",
          target: join(
            rootDir,
            "src/projects",
            projectId,
            "scenes",
            task.semanticId,
          ),
        },
        {
          kind: "directory",
          target: join(
            rootDir,
            "public/projects",
            projectId,
            "scenes",
            task.semanticId,
          ),
        },
      );
    } else if (task.taskKind === "global-visual-owner") {
      if (
        !attestation.outputManifest.some(
          ({ logicalPath }) =>
            logicalPath === "project/global-visual-plan.json",
        )
      ) {
        throw new Error("GlobalVisual artifact plan is missing.");
      }
      liveTargets.push(
        {
          kind: "directory",
          target: join(rootDir, "src/projects", projectId, "global-visual"),
        },
        {
          kind: "file",
          target: join(
            rootDir,
            "src/projects",
            projectId,
            "global-visual-plan.json",
          ),
        },
      );
    } else if (task.taskKind === "cover-owner") {
      liveTargets.push({
        kind: "directory",
        target: join(rootDir, "src/projects", projectId, "delivery/cover"),
      });
    }
  }
  const preflightTargets = new Set<string>();
  for (const liveTarget of liveTargets) {
    if (preflightTargets.has(liveTarget.target)) {
      throw new Error("Materialization target is duplicated.");
    }
    preflightTargets.add(liveTarget.target);
    await assertLivePath({ rootDir, ...liveTarget });
  }

  for (const { task, attestation } of artifacts) {
    if (task.storyId !== projectId)
      throw new Error("Artifact belongs to another Project.");
    await assertArtifactBinding({ rootDir, task, attestation });
    const artifactRoot = resolveArtifactPath({
      rootDir,
      storyId: task.storyId,
      taskKind: task.taskKind,
      taskRevision: task.taskRevision,
    });
    const addDirectory = async (target: string, prefix: "src/" | "public/") => {
      if (targets.has(target))
        throw new Error("Materialization target is duplicated.");
      targets.add(target);
      await ensureContainedDirectory({ rootDir, directory: dirname(target) });
      const staging = `${target}.producer-staging-${suffix}`;
      if (
        (await state(staging)) !== null ||
        (await state(`${target}.producer-backup-${suffix}`)) !== null
      ) {
        throw new Error("Materialization temporary path already exists.");
      }
      await copyArtifactPrefix({ artifactRoot, attestation, prefix, staging });
      replacements.push({
        kind: "directory",
        target,
        staging,
        backup: `${target}.producer-backup-${suffix}`,
      });
      return staging;
    };

    if (task.taskKind === "scene-owner" || task.taskKind === "scene-template") {
      if (task.semanticId === null)
        throw new Error("Scene artifact is missing semantic identity.");
      const sceneRoot = join(
        rootDir,
        "src/projects",
        projectId,
        "scenes",
        task.semanticId,
      );
      const staging = await addDirectory(sceneRoot, "src/");
      const taskInput = sceneTaskInputs.get(task.semanticId);
      if (taskInput === undefined)
        throw new Error("Scene task input is missing during materialization.");
      await writeFile(
        join(staging, "task-input.generated.json"),
        `${serializeCanonicalJson(taskInput)}\n`,
        { flag: "wx" },
      );
      await addDirectory(
        join(rootDir, "public/projects", projectId, "scenes", task.semanticId),
        "public/",
      );
    } else if (task.taskKind === "global-visual-owner") {
      await addDirectory(
        join(rootDir, "src/projects", projectId, "global-visual"),
        "src/",
      );
      const output = attestation.outputManifest.find(
        ({ logicalPath }) => logicalPath === "project/global-visual-plan.json",
      );
      if (output === undefined)
        throw new Error("GlobalVisual artifact plan is missing.");
      const target = join(
        rootDir,
        "src/projects",
        projectId,
        "global-visual-plan.json",
      );
      if (targets.has(target))
        throw new Error("Materialization target is duplicated.");
      targets.add(target);
      const staging = `${target}.producer-staging-${suffix}`;
      await ensureContainedDirectory({ rootDir, directory: dirname(target) });
      if (
        (await state(staging)) !== null ||
        (await state(`${target}.producer-backup-${suffix}`)) !== null
      ) {
        throw new Error("Materialization temporary path already exists.");
      }
      await cp(join(artifactRoot, "files", output.logicalPath), staging, {
        errorOnExist: true,
        force: false,
      });
      replacements.push({
        kind: "file",
        target,
        staging,
        backup: `${target}.producer-backup-${suffix}`,
      });
    } else if (task.taskKind === "cover-owner") {
      await addDirectory(
        join(rootDir, "src/projects", projectId, "delivery/cover"),
        "src/",
      );
    }
  }

  try {
    await promoteReplacements(rootDir, replacements, dependencies);
  } finally {
    for (const replacement of replacements) {
      await removeReplacementPath(rootDir, replacement, replacement.staging);
    }
  }
  await verifyMaterializedOwnerArtifacts({
    rootDir,
    projectId,
    artifacts,
    sceneTaskInputs,
  });
};
