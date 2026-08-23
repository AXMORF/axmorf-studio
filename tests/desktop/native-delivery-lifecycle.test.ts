import assert from "node:assert/strict";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { createWorkspaceDeliveryLifecycle as createOrdinaryLifecycle } from "../../desktop/engine/workspace-delivery-lifecycle";
import { createWorkspaceDeliveryLifecycle as createNativeLifecycle } from "../../scripts/desktop/native-delivery-lifecycle";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";
import type { WorkspaceDeliveryListenerEvent } from "../../scripts/project-production/adapters/workspace-remotion-renderer";

const waitForFile = async (path: string) => {
  for (let index = 0; index < 100; index += 1) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise<void>((resolvePromise) =>
        setTimeout(resolvePromise, 5),
      );
    }
  }
  throw new Error(`Timed out waiting for ${path}.`);
};

const fixture = async (context: test.TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-native-delivery-lifecycle-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workspaceRoot = join(root, "workspace");
  const applicationSupportRoot = join(root, "application-support");
  const runtimeResources = join(root, "runtime-pack");
  const cacheRoot = join(root, "cache");
  await Promise.all(
    [workspaceRoot, applicationSupportRoot, runtimeResources, cacheRoot].map(
      (path) => mkdir(path, { recursive: true }),
    ),
  );
  const locations = createWorkspaceProductionLocations({
    workspaceRoot,
    applicationSupportRoot,
    runtimeResources,
    cacheRoot,
  });
  const controller = new AbortController();
  const event: WorkspaceDeliveryListenerEvent = {
    locations,
    storyId: "story-native",
    host: "127.0.0.1",
    port: 43123,
    signal: controller.signal,
  };
  return {
    controller,
    event,
    gateRoot: join(workspaceRoot, ".rsp/native-gate"),
    workspaceRoot,
  };
};

const writeAction = async (
  gateRoot: string,
  value: Readonly<{ sequence: number; action: "continue" | "fail" }>,
) => {
  const temporary = join(gateRoot, "action.tmp");
  await writeFile(temporary, `${JSON.stringify(value)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  await rename(temporary, join(gateRoot, "action"));
};

test("ordinary Workspace Delivery lifecycle immediately continues without native gate surface", async () => {
  const [source, engineBuild] = await Promise.all([
    readFile("desktop/engine/workspace-delivery-lifecycle.ts", "utf8"),
    readFile("vite.desktop.engine.config.ts", "utf8"),
  ]);
  assert.equal(source.includes("native-gate"), false);
  assert.match(engineBuild, /\.\/workspace-delivery-lifecycle/u);
  assert.match(engineBuild, /scripts\/desktop\/native-delivery-lifecycle\.ts/u);
  const lifecycle = createOrdinaryLifecycle();
  const root = await mkdtemp(join(tmpdir(), "rsp-ordinary-lifecycle-"));
  try {
    const controller = new AbortController();
    const event = {
      locations: createWorkspaceProductionLocations({
        workspaceRoot: join(root, "workspace"),
        applicationSupportRoot: join(root, "app-support"),
        runtimeResources: join(root, "runtime"),
        cacheRoot: join(root, "cache"),
      }),
      storyId: "ordinary",
      host: "127.0.0.1" as const,
      port: 40123,
      signal: controller.signal,
    };
    assert.equal(await lifecycle.onListenerReady(event), "continue");
    await lifecycle.onListenerClosed(event);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native lifecycle publishes sequenced ready and closed evidence atomically", async (context) => {
  const { event, gateRoot } = await fixture(context);
  const lifecycle = createNativeLifecycle();
  const ready = lifecycle.onListenerReady(event);
  const readyPath = join(gateRoot, "listener-ready.json");
  await waitForFile(readyPath);
  assert.deepEqual(JSON.parse(await readFile(readyPath, "utf8")), {
    storyId: "story-native",
    host: "127.0.0.1",
    port: 43123,
    sequence: 1,
  });
  await writeAction(gateRoot, { sequence: 1, action: "continue" });
  assert.equal(await ready, "continue");
  await lifecycle.onListenerClosed(event);
  assert.deepEqual(
    JSON.parse(await readFile(join(gateRoot, "listener-closed.json"), "utf8")),
    {
      storyId: "story-native",
      host: "127.0.0.1",
      port: 43123,
      sequence: 1,
      closed: true,
    },
  );
  await assert.rejects(access(readyPath), { code: "ENOENT" });
  await assert.rejects(access(join(gateRoot, "action")), { code: "ENOENT" });

  const secondEvent = { ...event, port: 43124 };
  const second = lifecycle.onListenerReady(secondEvent);
  await waitForFile(readyPath);
  await writeAction(gateRoot, { sequence: 2, action: "fail" });
  assert.equal(await second, "fail");
  await lifecycle.onListenerClosed(secondEvent);
  assert.equal(
    JSON.parse(await readFile(join(gateRoot, "listener-closed.json"), "utf8"))
      .sequence,
    2,
  );
});

test("native lifecycle rejects stale actions, unsafe gate paths, and aborts", async (context) => {
  const stale = await fixture(context);
  const staleLifecycle = createNativeLifecycle();
  const waiting = staleLifecycle.onListenerReady(stale.event);
  await waitForFile(join(stale.gateRoot, "listener-ready.json"));
  await writeAction(stale.gateRoot, { sequence: 2, action: "continue" });
  await assert.rejects(waiting, /sequence/u);
  await staleLifecycle.onListenerClosed(stale.event);

  const aborted = await fixture(context);
  const abortLifecycle = createNativeLifecycle();
  const abortedWaiting = abortLifecycle.onListenerReady(aborted.event);
  const abortedAssertion = assert.rejects(abortedWaiting, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, "AbortError");
    assert.equal((error as NodeJS.ErrnoException).code, "ABORT_ERR");
    return true;
  });
  await waitForFile(join(aborted.gateRoot, "listener-ready.json"));
  aborted.controller.abort();
  await abortedAssertion;
  await abortLifecycle.onListenerClosed(aborted.event);

  const unsafe = await fixture(context);
  await mkdir(dirname(unsafe.gateRoot), { recursive: true });
  await chmod(dirname(unsafe.gateRoot), 0o700);
  await symlink(tmpdir(), unsafe.gateRoot, "dir");
  const unsafeLifecycle = createNativeLifecycle();
  await assert.rejects(
    () => unsafeLifecycle.onListenerReady(unsafe.event),
    /real directory|symbolic/u,
  );
  await unsafeLifecycle.onListenerClosed(unsafe.event);
});
