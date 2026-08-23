import assert from "node:assert/strict";
import {
  createServer,
  get as httpGet,
  type IncomingMessage,
  request as httpRequest,
  Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { createConnection } from "node:net";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  createRuntimeExecutionResources,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import { createWorkspaceRemotionDeliveryRuntime } from "../../scripts/project-production/application/workspace-remotion-delivery";
import type { WorkspaceRemotionToolchain } from "../../scripts/project-production/adapters/workspace-remotion-renderer";

const fixture = async (context: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "workspace-remotion-renderer-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workspaceRoot = join(root, "workspace");
  const runtimeRoot = join(root, "runtime-pack");
  const supportRoot = join(root, "support");
  const cacheRoot = join(root, "cache");
  const storyId = "story-example";
  await Promise.all([
    mkdir(join(runtimeRoot, "source/src/projects"), { recursive: true }),
    mkdir(join(runtimeRoot, "shared-assets/library"), { recursive: true }),
    mkdir(join(runtimeRoot, "bin"), { recursive: true }),
    mkdir(join(runtimeRoot, "browser"), { recursive: true }),
    mkdir(join(workspaceRoot, "projects", storyId, "delivery/cover"), {
      recursive: true,
    }),
    mkdir(join(workspaceRoot, "media", storyId), { recursive: true }),
    mkdir(join(workspaceRoot, ".rsp/current"), { recursive: true }),
    mkdir(supportRoot, { recursive: true }),
    mkdir(cacheRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(runtimeRoot, "source/package.json"), '{"private":true}\n'),
    writeFile(
      join(runtimeRoot, "source/src/index.ts"),
      'import {registerRoot} from "remotion"; registerRoot(() => null);\n',
    ),
    writeFile(
      join(runtimeRoot, "source/src/projects/project-registry.generated.ts"),
      "export const projectRegistry = [];\n",
    ),
    writeFile(
      join(runtimeRoot, "shared-assets/library/shared.txt"),
      "shared\n",
    ),
    writeFile(
      join(workspaceRoot, "projects", storyId, "Composition.tsx"),
      "export const productionNarrativeCompositionMetadata = {id: 'StoryExample', durationInFrames: 30, fps: 30, width: 1080, height: 1920, defaultProps: {projectId: 'story-example'}}; export default () => null;\n",
    ),
    writeFile(
      join(workspaceRoot, "projects", storyId, "delivery/cover/index.ts"),
      'import {registerRoot} from "remotion"; registerRoot(() => null);\n',
    ),
    writeFile(join(workspaceRoot, "media", storyId, "media.bin"), "media\n"),
    writeFile(
      join(workspaceRoot, ".rsp/current/project-registry.generated.ts"),
      "export const projectRegistry = ['workspace-current'];\n",
    ),
    writeFile(join(runtimeRoot, "bin/ffmpeg"), "ffmpeg\n"),
    writeFile(join(runtimeRoot, "bin/ffprobe"), "ffprobe\n"),
    writeFile(join(runtimeRoot, "browser/headless"), "browser\n"),
  ]);
  const locations = createWorkspaceProductionLocations({
    workspaceRoot,
    applicationSupportRoot: supportRoot,
    runtimeResources: runtimeRoot,
    cacheRoot,
  });
  const runtime = createRuntimeExecutionResources({
    rendererRuntimeFingerprint: `sha256:${"a".repeat(64)}`,
    browserExecutable: join(runtimeRoot, "browser/headless"),
    binariesDirectory: join(runtimeRoot, "bin"),
    ffmpegExecutable: join(runtimeRoot, "bin/ffmpeg"),
    ffprobeExecutable: join(runtimeRoot, "bin/ffprobe"),
  });
  return { root, storyId, locations, runtime, cacheRoot } as const;
};

const listenOnce = async (host: string, port: number) => {
  const server = createServer((_request, response) => response.end("ok"));
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host, port }, resolve);
    });
    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, "string");
    if (typeof address !== "string" && address !== null) {
      assert.equal(address.address, "127.0.0.1");
      assert.equal(address.port, port);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ||
        (error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING"
          ? resolve()
          : reject(error),
      ),
    );
  }
};

const assertConnectable = (host: string, port: number) =>
  new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", reject);
  });

const requestLoopback = ({
  port,
  path,
  method = "GET",
}: {
  readonly port: number;
  readonly path: string;
  readonly method?: string;
}) =>
  new Promise<Readonly<{ statusCode: number; body: string }>>(
    (resolvePromise, reject) => {
      const request = httpRequest(
        { host: "127.0.0.1", port, path, method },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.once("end", () =>
            resolvePromise({
              statusCode: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      request.once("error", reject);
      request.end();
    },
  );

test("Workspace Remotion renderer confines proxy requests to the current loopback listener", async (context) => {
  const value = await fixture(context);
  const originalListen = HttpServer.prototype.listen;
  const originalPortConfig: WorkspaceRemotionToolchain["portConfig"]["getPortConfig"] =
    () => ({
      host: "0.0.0.0",
      hostsToTry: ["0.0.0.0"],
    });
  const portConfig = { getPortConfig: originalPortConfig };
  let sentinelHits = 0;
  const sentinel = createServer((_request, response) => {
    sentinelHits += 1;
    response.end("sentinel-secret");
  });
  await new Promise<void>((resolve, reject) => {
    sentinel.once("error", reject);
    sentinel.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  context.after(
    () =>
      new Promise<void>((resolve, reject) =>
        sentinel.close((error) =>
          error === undefined ||
          (error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING"
            ? resolve()
            : reject(error),
        ),
      ),
  );
  const sentinelAddress = sentinel.address();
  assert.notEqual(sentinelAddress, null);
  assert.notEqual(typeof sentinelAddress, "string");
  if (sentinelAddress === null || typeof sentinelAddress === "string") {
    throw new Error("Sentinel listener did not expose a TCP port.");
  }
  const originalHandlerRequests: string[] = [];
  let requestListenerRestored = false;
  const requestPrepare = async () => ({}) as never;
  const requestVerifyMaterialized = async () => undefined;
  const toolchain: WorkspaceRemotionToolchain = {
    bundle: async ({ rootDir }) => join(rootDir, ".bundle"),
    selectComposition: async ({ id, port }) => {
      const originalRequestListener = (
        request: IncomingMessage,
        response: ServerResponse,
      ) => {
        originalHandlerRequests.push(
          `${request.method ?? "GET"} ${request.url}`,
        );
        const requestUrl = new URL(
          request.url ?? "/",
          `http://127.0.0.1:${port}`,
        );
        if (requestUrl.pathname !== "/proxy") {
          response.end("static-current");
          return;
        }
        const source = requestUrl.searchParams.get("src");
        if (source === null) {
          response.statusCode = 400;
          response.end();
          return;
        }
        const proxyRequest = httpGet(source, (proxyResponse) => {
          response.statusCode = proxyResponse.statusCode ?? 500;
          proxyResponse.pipe(response);
        });
        proxyRequest.once("error", (error) => {
          response.destroy(error);
        });
      };
      const server = createServer(originalRequestListener);
      try {
        const config = portConfig.getPortConfig(false);
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen({ host: config.host, port }, resolve);
        });

        const staticResponse = await requestLoopback({
          port,
          path: `/projects/${value.storyId}/media.bin`,
        });
        assert.equal(staticResponse.statusCode, 200);
        assert.equal(staticResponse.body, "static-current");

        const allowedSource = encodeURIComponent(
          `http://localhost:${port}/projects/${value.storyId}/media.bin`,
        );
        const allowedResponse = await requestLoopback({
          port,
          path: `/proxy?src=${allowedSource}&time=0`,
        });
        assert.equal(allowedResponse.statusCode, 200);
        assert.equal(allowedResponse.body, "static-current");

        const forbiddenSource = encodeURIComponent(
          `http://127.0.0.1:${sentinelAddress.port}/secret`,
        );
        for (const request of [
          { path: `/proxy?src=${forbiddenSource}`, method: "GET" },
          {
            path: `/proxy?src=${encodeURIComponent(
              "http://example.com/secret",
            )}`,
            method: "OPTIONS",
          },
          {
            path: `/proxy?src=${encodeURIComponent(
              `https://localhost:${port}/secret`,
            )}`,
            method: "GET",
          },
          {
            path: `/proxy?src=${allowedSource}&src=${allowedSource}`,
            method: "GET",
          },
          {
            path: `/proxy?src=${encodeURIComponent(
              `http://user:pass@127.0.0.1:${port}/secret`,
            )}`,
            method: "GET",
          },
          { path: "/proxy?src=not-a-url", method: "GET" },
        ] as const) {
          const requestsBefore = originalHandlerRequests.length;
          const response = await requestLoopback({
            port,
            path: request.path,
            method: request.method,
          });
          assert.equal(response.statusCode, 404);
          assert.equal(originalHandlerRequests.length, requestsBefore);
          assert.equal(sentinelHits, 0);
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) =>
            error === undefined ||
            (error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING"
              ? resolve()
              : reject(error),
          ),
        );
        requestListenerRestored =
          server.listeners("request").length === 1 &&
          server.listeners("request")[0] === originalRequestListener;
      }
      return {
        id,
        durationInFrames: 30,
        fps: 30,
        width: 1080,
        height: 1920,
        props: { projectId: value.storyId },
      };
    },
    renderMedia: async ({ outputLocation }) => {
      await writeFile(outputLocation, "video\n");
    },
    renderStill: async () => undefined,
    makeCancelSignal: () => ({
      cancelSignal: () => undefined,
      cancel: () => undefined,
    }),
    portConfig,
  };
  const delivery = createWorkspaceRemotionDeliveryRuntime({
    locations: value.locations,
    runtime: value.runtime,
    lifecycle: {
      onListenerReady: async () => "continue",
      onListenerClosed: async () => undefined,
    },
    dependencies: {
      loadToolchain: async () => toolchain,
      buildDelivery: async (input, ports) => {
        assert.equal(ports.prepare, requestPrepare);
        assert.equal(ports.verifyMaterialized, requestVerifyMaterialized);
        assert.deepEqual(Object.keys(ports).sort(), [
          "inspectCover",
          "inspectVideo",
          "prepare",
          "renderCover",
          "renderVideo",
          "verifyMaterialized",
        ]);
        await ports.renderVideo({
          rootDir: input.locations.runtimeResources,
          compositionId: "StoryExample",
          outputPath: join(value.root, "video.mp4"),
          browserExecutable: input.runtime.browserExecutable,
          binariesDirectory: input.runtime.binariesDirectory,
        });
        return {
          projectId: value.storyId,
          deliveryBuildId: `delivery-${"b".repeat(64)}`,
          status: "project-production-complete",
          noOp: false,
          deliveryPath: `deliveries/${value.storyId}`,
          reused: { video: false, cover4x3: false, cover3x4: false },
        } as never;
      },
    },
  });

  await delivery.build({
    locations: value.locations,
    runtime: value.runtime,
    projectId: value.storyId,
    revisionId: `revision-${"c".repeat(64)}`,
    sourceCurrentId: `source-current-${"d".repeat(64)}`,
    config: {} as never,
    dependencies: {
      prepare: requestPrepare,
      verifyMaterialized: requestVerifyMaterialized,
    },
  });

  assert.ok(
    originalHandlerRequests.some((request) =>
      request.startsWith("GET /proxy?"),
    ),
  );
  assert.equal(sentinelHits, 0);
  assert.equal(requestListenerRestored, true);
  assert.equal(portConfig.getPortConfig, originalPortConfig);
  assert.equal(HttpServer.prototype.listen, originalListen);
  assert.deepEqual(await readdir(value.cacheRoot), []);
});

test("Workspace Remotion renderer stages exact Workspace inputs and only binds temporary IPv4 loopback ports", async (context) => {
  const value = await fixture(context);
  const observedPorts: number[] = [];
  const readyPorts: number[] = [];
  const closedPorts: number[] = [];
  const originalListen = HttpServer.prototype.listen;
  const originalPortConfig: WorkspaceRemotionToolchain["portConfig"]["getPortConfig"] =
    () => ({
      host: "0.0.0.0",
      hostsToTry: ["0.0.0.0"],
    });
  const portConfig = { getPortConfig: originalPortConfig };
  const bundles: Array<Record<string, unknown>> = [];
  const exercise = async (port: number) => {
    const config = portConfig.getPortConfig(false);
    assert.deepEqual(config, {
      host: "127.0.0.1",
      hostsToTry: ["127.0.0.1"],
    });
    observedPorts.push(port);
    await listenOnce(config.host, port);
  };
  const toolchain: WorkspaceRemotionToolchain = {
    bundle: async (options) => {
      bundles.push(options as Record<string, unknown>);
      assert.equal(options.enableCaching, false);
      assert.equal(options.keyboardShortcutsEnabled, false);
      assert.equal(options.askAIEnabled, false);
      assert.equal(options.interactivityEnabled, false);
      assert.equal(options.symlinkPublicDir, false);
      const buildRoot = options.rootDir;
      assert.equal(
        await readFile(
          join(buildRoot, "shared-assets/library/shared.txt"),
          "utf8",
        ).catch(() => null),
        null,
      );
      assert.equal(
        await readFile(
          join(buildRoot, "public/assets/library/shared.txt"),
          "utf8",
        ),
        "shared\n",
      );
      assert.equal(
        await readFile(
          join(buildRoot, `public/projects/${value.storyId}/media.bin`),
          "utf8",
        ),
        "media\n",
      );
      assert.match(
        await readFile(
          join(buildRoot, "src/projects/project-registry.generated.ts"),
          "utf8",
        ),
        /workspace-current/u,
      );
      assert.match(
        await readFile(
          join(buildRoot, `src/projects/${value.storyId}/Composition.tsx`),
          "utf8",
        ),
        /productionNarrativeCompositionMetadata/u,
      );
      return join(buildRoot, `.bundle-${bundles.length}`);
    },
    selectComposition: async ({ id, port }) => {
      await exercise(port);
      return {
        id,
        durationInFrames: 30,
        fps: 30,
        width: 1080,
        height: 1920,
        props: { projectId: value.storyId },
      };
    },
    renderMedia: async ({ outputLocation, port }) => {
      await exercise(port);
      await writeFile(outputLocation, "video\n");
    },
    renderStill: async ({ output, port }) => {
      await exercise(port);
      await writeFile(output, "cover\n");
    },
    makeCancelSignal: () => ({
      cancelSignal: () => undefined,
      cancel: () => undefined,
    }),
    portConfig,
  };
  const delivery = createWorkspaceRemotionDeliveryRuntime({
    locations: value.locations,
    runtime: value.runtime,
    lifecycle: {
      onListenerReady: async (event) => {
        assert.equal(event.host, "127.0.0.1");
        assert.equal(event.storyId, value.storyId);
        assert.equal(event.signal.aborted, false);
        await assertConnectable(event.host, event.port);
        readyPorts.push(event.port);
        return "continue";
      },
      onListenerClosed: async (event) => {
        closedPorts.push(event.port);
      },
    },
    dependencies: {
      loadToolchain: async () => toolchain,
      buildDelivery: async (input, ports) => {
        const video = join(value.root, "video.mp4");
        const cover4x3 = join(value.root, "cover-4x3.png");
        const cover3x4 = join(value.root, "cover-3x4.png");
        await ports.renderVideo({
          rootDir: input.locations.runtimeResources,
          compositionId: "StoryExample",
          outputPath: video,
          browserExecutable: input.runtime.browserExecutable,
          binariesDirectory: input.runtime.binariesDirectory,
        });
        await ports.renderCover({
          rootDir: input.locations.runtimeResources,
          projectId: value.storyId,
          compositionId: "StoryExampleDeliveryCover4x3V2",
          outputPath: cover4x3,
          browserExecutable: input.runtime.browserExecutable,
          binariesDirectory: input.runtime.binariesDirectory,
        });
        await ports.renderCover({
          rootDir: input.locations.runtimeResources,
          projectId: value.storyId,
          compositionId: "StoryExampleDeliveryCover3x4V2",
          outputPath: cover3x4,
          browserExecutable: input.runtime.browserExecutable,
          binariesDirectory: input.runtime.binariesDirectory,
        });
        return {
          projectId: value.storyId,
          deliveryBuildId: `delivery-${"b".repeat(64)}`,
          status: "project-production-complete",
          noOp: false,
          deliveryPath: `deliveries/${value.storyId}`,
          reused: { video: false, cover4x3: false, cover3x4: false },
        } as never;
      },
    },
  });

  await delivery.build({
    locations: value.locations,
    runtime: value.runtime,
    projectId: value.storyId,
    revisionId: `revision-${"c".repeat(64)}`,
    sourceCurrentId: `source-current-${"d".repeat(64)}`,
    config: {} as never,
  });

  assert.equal(bundles.length, 2);
  assert.equal(observedPorts.length, 6);
  assert.ok(observedPorts.every((port) => port > 0));
  assert.deepEqual(readyPorts, observedPorts);
  assert.deepEqual(closedPorts, observedPorts);
  assert.equal(portConfig.getPortConfig, originalPortConfig);
  assert.equal(HttpServer.prototype.listen, originalListen);
  for (const port of observedPorts) await listenOnce("127.0.0.1", port);
  assert.deepEqual(await readdir(value.cacheRoot), []);
});

test("Workspace Remotion renderer restores the private port adapter and removes staging after failure", async (context) => {
  const value = await fixture(context);
  const originalPortConfig: WorkspaceRemotionToolchain["portConfig"]["getPortConfig"] =
    () => ({
      host: "::",
      hostsToTry: ["::"],
    });
  const portConfig = { getPortConfig: originalPortConfig };
  const toolchain: WorkspaceRemotionToolchain = {
    bundle: async ({ rootDir }) => join(rootDir, ".bundle"),
    selectComposition: async ({ id }) => ({
      id,
      durationInFrames: 30,
      fps: 30,
      width: 1080,
      height: 1920,
      props: { projectId: value.storyId },
    }),
    renderMedia: async ({ port }) => {
      const config = portConfig.getPortConfig(false);
      assert.equal(config.host, "127.0.0.1");
      await listenOnce(config.host, port);
      throw new Error("fixture-render-failure");
    },
    renderStill: async () => undefined,
    makeCancelSignal: () => ({
      cancelSignal: () => undefined,
      cancel: () => undefined,
    }),
    portConfig,
  };
  const delivery = createWorkspaceRemotionDeliveryRuntime({
    locations: value.locations,
    runtime: value.runtime,
    lifecycle: {
      onListenerReady: async () => "continue",
      onListenerClosed: async () => undefined,
    },
    dependencies: {
      loadToolchain: async () => toolchain,
      buildDelivery: async (input, ports) => {
        await ports.renderVideo({
          rootDir: input.locations.runtimeResources,
          compositionId: "StoryExample",
          outputPath: join(value.root, "failed.mp4"),
          browserExecutable: input.runtime.browserExecutable,
          binariesDirectory: input.runtime.binariesDirectory,
        });
        throw new Error("unreachable");
      },
    },
  });

  await assert.rejects(
    delivery.build({
      locations: value.locations,
      runtime: value.runtime,
      projectId: value.storyId,
      revisionId: `revision-${"c".repeat(64)}`,
      sourceCurrentId: `source-current-${"d".repeat(64)}`,
      config: {} as never,
    }),
    /fixture-render-failure/u,
  );
  assert.equal(portConfig.getPortConfig, originalPortConfig);
  assert.deepEqual(await readdir(value.cacheRoot), []);
  await delivery.shutdown();
});

test("Workspace Remotion renderer fails closed after lifecycle rejects an actually listening socket", async (context) => {
  const value = await fixture(context);
  const originalListen = HttpServer.prototype.listen;
  const originalPortConfig: WorkspaceRemotionToolchain["portConfig"]["getPortConfig"] =
    () => ({
      host: "0.0.0.0",
      hostsToTry: ["0.0.0.0"],
    });
  const portConfig = { getPortConfig: originalPortConfig };
  const ready: number[] = [];
  const closed: number[] = [];
  const toolchain: WorkspaceRemotionToolchain = {
    bundle: async ({ rootDir }) => join(rootDir, ".bundle"),
    selectComposition: async ({ id, port }) => {
      const config = portConfig.getPortConfig(false);
      await listenOnce(config.host, port);
      return {
        id,
        durationInFrames: 30,
        fps: 30,
        width: 1080,
        height: 1920,
        props: { projectId: value.storyId },
      };
    },
    renderMedia: async () => undefined,
    renderStill: async () => undefined,
    makeCancelSignal: () => ({
      cancelSignal: () => undefined,
      cancel: () => undefined,
    }),
    portConfig,
  };
  const delivery = createWorkspaceRemotionDeliveryRuntime({
    locations: value.locations,
    runtime: value.runtime,
    lifecycle: {
      onListenerReady: async (event) => {
        await assertConnectable(event.host, event.port);
        ready.push(event.port);
        return "fail";
      },
      onListenerClosed: async (event) => {
        closed.push(event.port);
      },
    },
    dependencies: {
      loadToolchain: async () => toolchain,
      buildDelivery: async (input, ports) => {
        await ports.renderVideo({
          rootDir: input.locations.runtimeResources,
          compositionId: "StoryExample",
          outputPath: join(value.root, "rejected.mp4"),
          browserExecutable: input.runtime.browserExecutable,
          binariesDirectory: input.runtime.binariesDirectory,
        });
        throw new Error("unreachable");
      },
    },
  });

  await assert.rejects(
    delivery.build({
      locations: value.locations,
      runtime: value.runtime,
      projectId: value.storyId,
      revisionId: `revision-${"c".repeat(64)}`,
      sourceCurrentId: `source-current-${"d".repeat(64)}`,
      config: {} as never,
    }),
    /loopback listener was rejected/u,
  );
  assert.equal(ready.length, 1);
  assert.deepEqual(closed, ready);
  assert.equal(portConfig.getPortConfig, originalPortConfig);
  assert.equal(HttpServer.prototype.listen, originalListen);
  assert.deepEqual(await readdir(value.cacheRoot), []);
});

test("Workspace Remotion renderer shutdown aborts a listener before lifecycle release and restores globals", async (context) => {
  const value = await fixture(context);
  const originalListen = HttpServer.prototype.listen;
  const originalPortConfig: WorkspaceRemotionToolchain["portConfig"]["getPortConfig"] =
    () => ({
      host: "::",
      hostsToTry: ["::"],
    });
  const portConfig = { getPortConfig: originalPortConfig };
  let readyResolve: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  let closedPort: number | null = null;
  const toolchain: WorkspaceRemotionToolchain = {
    bundle: async ({ rootDir }) => join(rootDir, ".bundle"),
    selectComposition: async ({ id, port }) => {
      const config = portConfig.getPortConfig(false);
      await listenOnce(config.host, port);
      return {
        id,
        durationInFrames: 30,
        fps: 30,
        width: 1080,
        height: 1920,
        props: { projectId: value.storyId },
      };
    },
    renderMedia: async () => undefined,
    renderStill: async () => undefined,
    makeCancelSignal: () => ({
      cancelSignal: () => undefined,
      cancel: () => undefined,
    }),
    portConfig,
  };
  const delivery = createWorkspaceRemotionDeliveryRuntime({
    locations: value.locations,
    runtime: value.runtime,
    lifecycle: {
      onListenerReady: async (event) => {
        await assertConnectable(event.host, event.port);
        readyResolve?.();
        return new Promise<"continue">((resolve) =>
          event.signal.addEventListener("abort", () => resolve("continue"), {
            once: true,
          }),
        );
      },
      onListenerClosed: async (event) => {
        closedPort = event.port;
      },
    },
    dependencies: {
      loadToolchain: async () => toolchain,
      buildDelivery: async (input, ports) => {
        await ports.renderVideo({
          rootDir: input.locations.runtimeResources,
          compositionId: "StoryExample",
          outputPath: join(value.root, "cancelled.mp4"),
          browserExecutable: input.runtime.browserExecutable,
          binariesDirectory: input.runtime.binariesDirectory,
        });
        throw new Error("unreachable");
      },
    },
  });
  const building = assert.rejects(
    delivery.build({
      locations: value.locations,
      runtime: value.runtime,
      projectId: value.storyId,
      revisionId: `revision-${"c".repeat(64)}`,
      sourceCurrentId: `source-current-${"d".repeat(64)}`,
      config: {} as never,
    }),
    /loopback listener was rejected/u,
  );
  await ready;
  await delivery.shutdown();
  assert.notEqual(closedPort, null);
  assert.equal(portConfig.getPortConfig, originalPortConfig);
  assert.equal(HttpServer.prototype.listen, originalListen);
  assert.deepEqual(await readdir(value.cacheRoot), []);
  await building;
});
