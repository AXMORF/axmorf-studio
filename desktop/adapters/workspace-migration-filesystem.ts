import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";

import {
  ExecutionAttemptEventSchema,
  ExecutionAttemptSchema,
  StoryIdSchema,
} from "../../src/contracts";

import {
  WorkspaceMigrationRecordSchema,
  type WorkspaceMigrationRecord,
} from "../contracts/workspace";
import {
  ActiveWorkSummarySchema,
  type DoctorResponse,
} from "../contracts/protocol";
import {
  serializeWorkspaceJson,
  syncWorkspaceDirectory,
  writeWorkspaceFileAtomic,
} from "./workspace-filesystem";

const JOURNAL_FILE_NAME = "migration.json" as const;
const MigrationIdSchema = z.string().uuid();

const optionalMetadata = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertRealDirectory = async (path: string, label: string) => {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
};

export const readWorkspaceActiveProduction = async (
  workspaceRoot: string,
): Promise<DoctorResponse["activeWork"]> => {
  const attemptsRoot = join(resolve(workspaceRoot), ".rsp/attempts");
  const attemptsMetadata = await optionalMetadata(attemptsRoot);
  if (attemptsMetadata === null) return null;
  if (attemptsMetadata.isSymbolicLink() || !attemptsMetadata.isDirectory()) {
    throw new Error("Workspace attempt store must be a real directory.");
  }
  const active: NonNullable<DoctorResponse["activeWork"]>[] = [];
  const storyEntries = await readdir(attemptsRoot, { withFileTypes: true });
  for (const storyEntry of storyEntries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (storyEntry.isSymbolicLink() || !storyEntry.isDirectory()) {
      throw new Error("Workspace attempt story entry is unsafe.");
    }
    const storyId = StoryIdSchema.parse(storyEntry.name);
    const storyRoot = join(attemptsRoot, storyId);
    await assertRealDirectory(storyRoot, "Workspace attempt story");
    const attemptEntries = await readdir(storyRoot, { withFileTypes: true });
    for (const attemptEntry of attemptEntries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (
        attemptEntry.isSymbolicLink() ||
        !attemptEntry.isDirectory() ||
        !/^[0-9a-f-]{36}$/iu.test(attemptEntry.name)
      ) {
        throw new Error("Workspace attempt entry is unsafe.");
      }
      const attemptRoot = join(storyRoot, attemptEntry.name);
      await assertRealDirectory(attemptRoot, "Workspace attempt");
      const attemptPath = join(attemptRoot, "attempt.json");
      const attemptMetadata = await lstat(attemptPath);
      if (attemptMetadata.isSymbolicLink() || !attemptMetadata.isFile()) {
        throw new Error("Workspace attempt record is unsafe.");
      }
      const attempt = ExecutionAttemptSchema.parse(
        JSON.parse(await readFile(attemptPath, "utf8")),
      );
      if (
        attempt.storyId !== storyId ||
        attempt.attemptId !== attemptEntry.name
      ) {
        throw new Error("Workspace attempt identity is cross-bound.");
      }
      const eventsRoot = join(attemptRoot, "events");
      await assertRealDirectory(eventsRoot, "Workspace attempt events");
      const eventEntries = (
        await readdir(eventsRoot, { withFileTypes: true })
      ).sort((left, right) => left.name.localeCompare(right.name));
      let terminalCount = 0;
      for (const eventEntry of eventEntries) {
        if (
          eventEntry.isSymbolicLink() ||
          !eventEntry.isFile() ||
          !eventEntry.name.endsWith(".json")
        ) {
          throw new Error("Workspace attempt event entry is unsafe.");
        }
        const event = ExecutionAttemptEventSchema.parse(
          JSON.parse(await readFile(join(eventsRoot, eventEntry.name), "utf8")),
        );
        if (
          event.storyId !== storyId ||
          event.attemptId !== attempt.attemptId ||
          event.revisionId !== attempt.revisionId
        ) {
          throw new Error("Workspace attempt event identity is cross-bound.");
        }
        if (event.eventKind === "attempt-terminal") terminalCount += 1;
      }
      if (terminalCount > 1) {
        throw new Error("Workspace attempt has conflicting terminals.");
      }
      if (terminalCount === 0) {
        active.push(
          ActiveWorkSummarySchema.parse({
            storyId,
            kind: "production",
            attemptId: attempt.attemptId,
            phase:
              attempt.state === "converging"
                ? "continuing-production"
                : "awaiting-task-terminals",
          }),
        );
      }
    }
  }
  if (active.length > 1) {
    throw new Error("Workspace has multiple active production attempts.");
  }
  return active[0] ?? null;
};

export const workspaceHasActiveProduction = async (workspaceRoot: string) =>
  (await readWorkspaceActiveProduction(workspaceRoot)) !== null ||
  (await workspaceHasActiveDelivery(workspaceRoot));

const assertSafeOptionalDirectory = async (path: string, label: string) => {
  const metadata = await optionalMetadata(path);
  if (metadata === null) return false;
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
  return true;
};

const workspaceHasActiveDelivery = async (workspaceRoot: string) => {
  const root = resolve(workspaceRoot);
  await assertRealDirectory(root, "Workspace");
  await assertRealDirectory(join(root, ".rsp"), "Workspace control root");
  const locksRoot = join(root, ".rsp/locks");
  await assertSafeOptionalDirectory(locksRoot, "Workspace production locks");
  const lockPath = join(locksRoot, ".project-operation.lock");
  const lock = await optionalMetadata(lockPath);
  if (lock !== null) {
    if (
      lock.isSymbolicLink() ||
      !lock.isFile() ||
      (lock.mode & 0o777) !== 0o600
    ) {
      throw new Error("Workspace production lock is unsafe.");
    }
    return true;
  }
  const deliveriesRoot = join(root, "deliveries");
  if (!(await assertSafeOptionalDirectory(deliveriesRoot, "Delivery root"))) {
    return false;
  }
  const deliveryStagingRoot = join(deliveriesRoot, ".staging");
  if (
    !(await assertSafeOptionalDirectory(
      deliveryStagingRoot,
      "Delivery staging root",
    ))
  ) {
    return false;
  }
  const stagingRoot = join(deliveryStagingRoot, "project-production");
  if (!(await assertSafeOptionalDirectory(stagingRoot, "Delivery staging"))) {
    return false;
  }
  const projects = await readdir(stagingRoot, { withFileTypes: true });
  for (const project of projects) {
    if (project.isSymbolicLink() || !project.isDirectory()) {
      throw new Error("Delivery staging entry is unsafe.");
    }
    const projectRoot = join(stagingRoot, project.name);
    await assertRealDirectory(projectRoot, "Delivery staging Project");
    if ((await readdir(projectRoot)).length > 0) return true;
  }
  return false;
};

const assertOwnedMigrationDirectory = ({
  parentRoot,
  migrationRoot,
}: {
  readonly parentRoot: string;
  readonly migrationRoot: string;
}) => {
  const parent = resolve(parentRoot);
  const candidate = resolve(migrationRoot);
  if (
    dirname(candidate) !== parent ||
    !basename(candidate).startsWith(".axmorf-workspace-migration-")
  ) {
    throw new Error("Workspace migration journal path is not owned.");
  }
  return candidate;
};

export const createWorkspaceMigrationJournal = async ({
  parentRoot,
  migrationId = randomUUID(),
}: {
  readonly parentRoot: string;
  readonly migrationId?: string;
}) => {
  const parsedMigrationId = MigrationIdSchema.parse(migrationId);
  const migrationRoot = join(
    resolve(parentRoot),
    `.axmorf-workspace-migration-${parsedMigrationId}`,
  );
  assertOwnedMigrationDirectory({ parentRoot, migrationRoot });
  await mkdir(migrationRoot, { mode: 0o700 });
  await chmod(migrationRoot, 0o700);
  return { migrationId, migrationRoot } as const;
};

const assertMigrationRecordOwnership = ({
  parentRoot,
  migrationRoot,
  record,
}: {
  readonly parentRoot: string;
  readonly migrationRoot: string;
  readonly record: WorkspaceMigrationRecord;
}) => {
  const journalLeaf = `.axmorf-workspace-migration-${record.migrationId}`;
  const stagingLeaf = `.axmorf-workspace-staging-${record.migrationId}`;
  if (
    dirname(resolve(migrationRoot)) !== resolve(parentRoot) ||
    basename(resolve(migrationRoot)) !== journalLeaf ||
    record.stagingLeafName !== stagingLeaf
  ) {
    throw new Error("Workspace migration journal identity is inconsistent.");
  }
  if (record.kind === "workspace-root-move") {
    if (record.preservedLeafName !== null) {
      throw new Error("Workspace root migration cannot own a preserved path.");
    }
    return record;
  }
  if (
    record.sourceLeafName !== record.targetLeafName ||
    record.preservedLeafName !==
      `.axmorf-workspace-preserved-${record.migrationId}`
  ) {
    throw new Error("In-place Workspace migration identity is inconsistent.");
  }
  return record;
};

export const writeWorkspaceMigrationJournal = async ({
  parentRoot,
  migrationRoot,
  record,
}: {
  readonly parentRoot: string;
  readonly migrationRoot: string;
  readonly record: WorkspaceMigrationRecord;
}) => {
  const ownedRoot = assertOwnedMigrationDirectory({
    parentRoot,
    migrationRoot,
  });
  const parsed = WorkspaceMigrationRecordSchema.parse(record);
  assertMigrationRecordOwnership({
    parentRoot,
    migrationRoot: ownedRoot,
    record: parsed,
  });
  await writeWorkspaceFileAtomic({
    destination: join(ownedRoot, JOURNAL_FILE_NAME),
    bytes: Buffer.from(serializeWorkspaceJson(parsed), "utf8"),
    mode: 0o600,
    replace: true,
  });
};

export const readWorkspaceMigrationJournal = async ({
  parentRoot,
  migrationRoot,
}: {
  readonly parentRoot: string;
  readonly migrationRoot: string;
}) => {
  const ownedRoot = assertOwnedMigrationDirectory({
    parentRoot,
    migrationRoot,
  });
  const journalPath = join(ownedRoot, JOURNAL_FILE_NAME);
  const metadata = await lstat(journalPath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    throw new Error("Workspace migration journal is unsafe.");
  }
  return assertMigrationRecordOwnership({
    parentRoot,
    migrationRoot: ownedRoot,
    record: WorkspaceMigrationRecordSchema.parse(
      JSON.parse(await readFile(journalPath, "utf8")),
    ),
  });
};

export const removeWorkspaceMigrationJournal = async ({
  parentRoot,
  migrationRoot,
}: {
  readonly parentRoot: string;
  readonly migrationRoot: string;
}) => {
  const ownedRoot = assertOwnedMigrationDirectory({
    parentRoot,
    migrationRoot,
  });
  await readWorkspaceMigrationJournal({
    parentRoot,
    migrationRoot: ownedRoot,
  });
  await rm(ownedRoot, { recursive: true, force: true });
  await syncWorkspaceDirectory(resolve(parentRoot));
};

export const moveWorkspaceMigrationPath = async ({
  parentRoot,
  sourceRoot,
  destinationRoot,
}: {
  readonly parentRoot: string;
  readonly sourceRoot: string;
  readonly destinationRoot: string;
}) => {
  const parent = resolve(parentRoot);
  if (
    dirname(resolve(sourceRoot)) !== parent ||
    dirname(resolve(destinationRoot)) !== parent
  ) {
    throw new Error("Workspace migration switch must stay within one parent.");
  }
  await rename(sourceRoot, destinationRoot);
  await syncWorkspaceDirectory(parent);
};
