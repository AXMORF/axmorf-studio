import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  watch,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import type {
  WorkspaceDeliveryLifecyclePort,
  WorkspaceDeliveryListenerEvent,
} from "../project-production/adapters/workspace-remotion-renderer";

const MAXIMUM_GATE_JSON_BYTES = 4 * 1024;
const READY_FILE = "listener-ready.json" as const;
const ACTION_FILE = "action" as const;
const CLOSED_FILE = "listener-closed.json" as const;

type GateIdentity = Readonly<{
  storyId: string;
  host: "127.0.0.1";
  port: number;
  sequence: number;
}>;

const contained = (root: string, candidate: string) => {
  const value = relative(root, candidate);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`);
};

const inspectRealDirectory = async (path: string, label: string) => {
  const resolved = resolve(path);
  const metadata = await lstat(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symbolic link.`);
  }
  if ((await realpath(resolved)) !== resolved) {
    throw new Error(`${label} must have a canonical real parent chain.`);
  }
  return resolved;
};

const ensurePrivateDirectory = async (path: string, label: string) => {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const resolved = await inspectRealDirectory(path, label);
  const metadata = await lstat(resolved);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} must be owner-only.`);
  }
  return resolved;
};

const workspaceRootFromEvent = async (
  event: WorkspaceDeliveryListenerEvent,
) => {
  if (event.locations.layoutKind !== "workspace") {
    throw new Error("Native Delivery lifecycle requires Workspace locations.");
  }
  const workspaceRoot = resolve(dirname(event.locations.projectSourceRoot));
  if (
    event.locations.projectSourceRoot !== join(workspaceRoot, "projects") ||
    event.locations.projectMediaRoot !== join(workspaceRoot, "media") ||
    event.locations.taskWorkspaceRoot !== join(workspaceRoot, ".rsp/work") ||
    event.locations.artifactStoreRoot !==
      join(workspaceRoot, ".rsp/artifacts") ||
    event.locations.attemptStoreRoot !== join(workspaceRoot, ".rsp/attempts") ||
    event.locations.sourceCurrentRoot !==
      join(workspaceRoot, ".rsp/current/source") ||
    event.locations.deliveryRoot !== join(workspaceRoot, "deliveries") ||
    event.locations.operationLockRoot !== join(workspaceRoot, ".rsp/locks")
  ) {
    throw new Error(
      "Native Delivery lifecycle locations are not Workspace-bound.",
    );
  }
  await inspectRealDirectory(workspaceRoot, "Native Delivery Workspace root");
  const rspRoot = await ensurePrivateDirectory(
    join(workspaceRoot, ".rsp"),
    "Native Delivery private root",
  );
  const gateRoot = await ensurePrivateDirectory(
    join(rspRoot, "native-gate"),
    "Native Delivery gate root",
  );
  if (!contained(workspaceRoot, gateRoot) || !contained(rspRoot, gateRoot)) {
    throw new Error("Native Delivery gate escaped the Workspace.");
  }
  return gateRoot;
};

const strictObject = (value: unknown, keys: readonly string[]) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const readBoundedRegularJson = async (path: string, label: string) => {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symbolic file.`);
  }
  if ((before.mode & 0o077) !== 0) {
    throw new Error(`${label} must be owner-only.`);
  }
  if (before.size === 0 || before.size > MAXIMUM_GATE_JSON_BYTES) {
    throw new Error(`${label} exceeds its bounded JSON contract.`);
  }
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    bytes.byteLength !== before.size
  ) {
    throw new Error(`${label} changed during validation.`);
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error(`${label} must be strict UTF-8 JSON.`);
  }
};

const removeRegularIfPresent = async (path: string, label: string) => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${label} must be a regular non-symbolic file.`);
    }
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

const atomicWriteJson = async ({
  gateRoot,
  fileName,
  sequence,
  value,
}: {
  readonly gateRoot: string;
  readonly fileName: string;
  readonly sequence: number;
  readonly value: unknown;
}) => {
  const target = resolve(gateRoot, fileName);
  const temporary = resolve(
    gateRoot,
    `.${fileName}.${process.pid}.${sequence}.tmp`,
  );
  if (!contained(gateRoot, target) || !contained(gateRoot, temporary)) {
    throw new Error("Native Delivery evidence path escaped its gate root.");
  }
  const bytes = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(bytes) > MAXIMUM_GATE_JSON_BYTES) {
    throw new Error(
      "Native Delivery evidence exceeds its bounded JSON contract.",
    );
  }
  try {
    try {
      const existing = await lstat(target);
      if (!existing.isFile() || existing.isSymbolicLink()) {
        throw new Error(
          "Native Delivery evidence target must be a regular file.",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(temporary, bytes, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, target);
    const written = await lstat(target);
    if (
      !written.isFile() ||
      written.isSymbolicLink() ||
      (written.mode & 0o077) !== 0
    ) {
      throw new Error("Native Delivery evidence atomic write is unsafe.");
    }
  } catch (error) {
    await removeRegularIfPresent(
      temporary,
      "Native Delivery temporary evidence",
    );
    throw error;
  }
};

const parseAction = (value: unknown, sequence: number) => {
  if (!strictObject(value, ["sequence", "action"])) {
    throw new Error("Native Delivery action has an invalid JSON shape.");
  }
  const action = value as Readonly<{
    sequence?: unknown;
    action?: unknown;
  }>;
  if (action.sequence !== sequence) {
    throw new Error("Native Delivery action sequence does not match.");
  }
  if (action.action !== "continue" && action.action !== "fail") {
    throw new Error("Native Delivery action decision is invalid.");
  }
  return action.action;
};

const readAction = async (path: string, sequence: number) => {
  try {
    return parseAction(
      await readBoundedRegularJson(path, "Native Delivery action"),
      sequence,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertIdentity = (
  event: WorkspaceDeliveryListenerEvent,
  sequence: number,
) => {
  if (
    event.host !== "127.0.0.1" ||
    !Number.isInteger(event.port) ||
    event.port <= 0 ||
    event.port > 65_535 ||
    event.storyId.length === 0 ||
    event.storyId.length > 160 ||
    event.storyId.includes("/") ||
    event.storyId.includes("\\") ||
    !Number.isSafeInteger(sequence) ||
    sequence <= 0
  ) {
    throw new Error("Native Delivery listener identity is invalid.");
  }
  return {
    storyId: event.storyId,
    host: event.host,
    port: event.port,
    sequence,
  } satisfies GateIdentity;
};

const assertEvidenceSequence = async (
  path: string,
  sequence: number,
  label: string,
) => {
  try {
    const value = await readBoundedRegularJson(path, label);
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      (value as { sequence?: unknown }).sequence !== sequence
    ) {
      throw new Error(`${label} sequence does not match.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  return true;
};

export const createWorkspaceDeliveryLifecycle =
  (): WorkspaceDeliveryLifecyclePort => {
    let nextSequence = 0;
    let active: Readonly<{
      event: WorkspaceDeliveryListenerEvent;
      gateRoot: string;
      identity: GateIdentity;
    }> | null = null;
    const failedBeforeActivation = new WeakSet<object>();

    return Object.freeze({
      onListenerReady: async (event) => {
        if (active !== null) {
          failedBeforeActivation.add(event);
          throw new Error(
            "Native Delivery listener lifecycle is already active.",
          );
        }
        nextSequence += 1;
        let identity: GateIdentity;
        let gateRoot: string;
        try {
          identity = assertIdentity(event, nextSequence);
          if (event.signal.aborted) {
            throw new Error("Native Delivery listener lifecycle was aborted.");
          }
          gateRoot = await workspaceRootFromEvent(event);
        } catch (error) {
          failedBeforeActivation.add(event);
          throw error;
        }
        const readyPath = join(gateRoot, READY_FILE);
        const actionPath = join(gateRoot, ACTION_FILE);
        await removeRegularIfPresent(
          actionPath,
          "Stale Native Delivery action",
        );
        await removeRegularIfPresent(
          readyPath,
          "Stale Native Delivery ready evidence",
        );
        const changes = watch(gateRoot, {
          persistent: true,
          signal: event.signal,
        });
        const iterator = changes[Symbol.asyncIterator]();
        active = { event, gateRoot, identity };
        try {
          await atomicWriteJson({
            gateRoot,
            fileName: READY_FILE,
            sequence: identity.sequence,
            value: identity,
          });
          while (true) {
            const decision = await readAction(actionPath, identity.sequence);
            if (decision !== null) return decision;
            const change = await iterator.next();
            if (change.done) {
              throw new Error("Native Delivery action watcher closed.");
            }
          }
        } finally {
          await iterator.return?.();
        }
      },
      onListenerClosed: async (event) => {
        if (failedBeforeActivation.delete(event)) return;
        if (active === null || active.event !== event) {
          throw new Error("Native Delivery closed listener is not active.");
        }
        const { gateRoot, identity } = active;
        await atomicWriteJson({
          gateRoot,
          fileName: CLOSED_FILE,
          sequence: identity.sequence,
          value: { ...identity, closed: true },
        });
        await removeRegularIfPresent(
          join(gateRoot, ACTION_FILE),
          "Native Delivery action",
        );
        const readyPath = join(gateRoot, READY_FILE);
        if (
          await assertEvidenceSequence(
            readyPath,
            identity.sequence,
            "Native Delivery ready evidence",
          )
        ) {
          await removeRegularIfPresent(
            readyPath,
            "Native Delivery ready evidence",
          );
        }
        active = null;
      },
    });
  };
