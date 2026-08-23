import { createServer } from "node:net";
import {
  type IncomingMessage,
  Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { runMediaProcessWithEnvironment } from "../../shared/media-process";
import type { ProcessRunner } from "../../shared/process";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "../domain/production-locations";
import {
  inspectProjectCover,
  inspectProjectVideo,
  type renderProjectCover,
  type renderProjectVideo,
} from "./media";

const REMOTION_RENDERER_VERSION = "4.0.489" as const;
const VIDEO_ENTRY_NAME = "desktop-delivery-video-entry.tsx" as const;

type WorkspaceDeliveryRequestListener = (
  request: IncomingMessage,
  response: ServerResponse,
) => void;

type BundleOptions = Readonly<{
  entryPoint: string;
  rootDir: string;
  outDir: string;
  publicDir: string;
  enableCaching: false;
  symlinkPublicDir: false;
  keyboardShortcutsEnabled: false;
  askAIEnabled: false;
  interactivityEnabled: false;
  experimentalClientSideRenderingEnabled: false;
  ignoreRegisterRootWarning: false;
  rspack: false;
  onProgress: (progress: number) => void;
  onDirectoryCreated: (directory: string) => void;
  onPublicDirCopyProgress: (bytes: number) => void;
  onSymlinkDetected: (path: string) => void;
  webpackOverride: (
    configuration: Readonly<Record<string, unknown>>,
  ) => unknown;
}>;

type RendererOptions = Readonly<{
  serveUrl: string;
  id: string;
  port: number;
  inputProps: Readonly<Record<string, unknown>>;
  browserExecutable: string;
  binariesDirectory: string;
  logLevel: "error";
  chromeMode: "headless-shell";
  puppeteerInstance: WorkspaceRemotionBrowser;
}>;

type CancelSignal = (callback: () => void) => void;

type WorkspaceRemotionBrowser = Readonly<{
  close: (options: Readonly<{ silent: true }>) => Promise<void>;
}>;

const cleanupWorkspaceRemotionScope = async ({
  browser,
  server,
  listenerClosed,
}: Readonly<{
  browser: WorkspaceRemotionBrowser | null;
  server: HttpServer | null;
  listenerClosed: Promise<void>;
}>) => {
  const cleanupResults = await Promise.allSettled([
    browser?.close({ silent: true }) ?? Promise.resolve(),
    (async () => {
      if (server?.listening) {
        await new Promise<void>((resolvePromise) =>
          server.close(() => resolvePromise()),
        );
      }
      await listenerClosed;
    })(),
  ]);
  const cleanupFailure = cleanupResults.find(
    (result) => result.status === "rejected",
  );
  if (cleanupFailure?.status === "rejected") {
    throw cleanupFailure.reason;
  }
};

type WorkspaceVideoConfig = Readonly<{
  id: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  props: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}>;

export type WorkspaceRemotionToolchain = Readonly<{
  openBrowser: (
    browser: "chrome",
    options: Readonly<{
      browserExecutable: string;
      chromeMode: "headless-shell";
      logLevel: "error";
    }>,
  ) => Promise<WorkspaceRemotionBrowser>;
  bundle: (options: BundleOptions) => Promise<string>;
  selectComposition: (
    options: RendererOptions,
  ) => Promise<WorkspaceVideoConfig>;
  renderMedia: (
    options: RendererOptions &
      Readonly<{
        composition: WorkspaceVideoConfig;
        outputLocation: string;
        codec: "h264";
        audioCodec: "aac";
        pixelFormat: "yuv420p";
        overwrite: true;
        cancelSignal: CancelSignal;
      }>,
  ) => Promise<unknown>;
  renderStill: (
    options: RendererOptions &
      Readonly<{
        composition: WorkspaceVideoConfig;
        output: string;
        imageFormat: "png";
        overwrite: true;
        cancelSignal: CancelSignal;
      }>,
  ) => Promise<unknown>;
  makeCancelSignal: () => Readonly<{
    cancelSignal: CancelSignal;
    cancel: () => void;
  }>;
  portConfig: {
    getPortConfig: (preferIpv4?: boolean) => Readonly<{
      host: string;
      hostsToTry: readonly string[];
    }>;
  };
}>;

type WorkspaceRemotionRendererDependencies = Readonly<{
  loadToolchain?: (
    runtimePackRoot: string,
  ) => Promise<WorkspaceRemotionToolchain>;
}>;

const contained = (root: string, candidate: string) => {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
};

const isAllowedWorkspaceDeliveryRequest = (
  request: IncomingMessage,
  port: number,
) => {
  if (request.url === undefined) return false;
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url, `http://127.0.0.1:${port}`);
  } catch {
    return false;
  }
  if (!requestUrl.pathname.startsWith("/proxy")) return true;
  if (
    requestUrl.pathname !== "/proxy" ||
    (request.method !== "GET" && request.method !== "OPTIONS")
  ) {
    return false;
  }
  const sources = requestUrl.searchParams.getAll("src");
  if (sources.length !== 1 || sources[0] === "") return false;
  let source: URL;
  try {
    source = new URL(sources[0]);
  } catch {
    return false;
  }
  return (
    source.protocol === "http:" &&
    (source.hostname === "localhost" || source.hostname === "127.0.0.1") &&
    source.port === String(port) &&
    source.username === "" &&
    source.password === ""
  );
};

const assertRegularFile = async (path: string, label: string) => {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symbolic file.`);
  }
  return metadata;
};

const assertRealDirectory = async (path: string, label: string) => {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory.`);
  }
  if ((await realpath(path)) !== resolve(path)) {
    throw new Error(`${label} must be canonical.`);
  }
};

const copyRegularTree = async ({
  source,
  destination,
  label,
}: {
  readonly source: string;
  readonly destination: string;
  readonly label: string;
}) => {
  await assertRealDirectory(source, label);
  await mkdir(destination, { recursive: true });
  await assertRealDirectory(destination, `${label} destination`);
  for (const entry of (await readdir(source, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const input = join(source, entry.name);
    const output = join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`${label} cannot contain symbolic links.`);
    }
    if (entry.isDirectory()) {
      await copyRegularTree({ source: input, destination: output, label });
    } else if (entry.isFile()) {
      await assertRegularFile(input, label);
      await copyFile(input, output);
      await assertRegularFile(output, `${label} copy`);
    } else {
      throw new Error(`${label} cannot contain special files.`);
    }
  }
};

const readPackageVersion = async (packageRoot: string) => {
  const packagePath = join(packageRoot, "package.json");
  await assertRegularFile(packagePath, "Runtime Pack package manifest");
  const raw = JSON.parse(await readFile(packagePath, "utf8")) as {
    readonly version?: unknown;
  };
  if (raw.version !== REMOTION_RENDERER_VERSION) {
    throw new Error("Runtime Pack Remotion tooling version is incompatible.");
  }
};

const resolveRuntimeModule = async ({
  runtimePackRoot,
  requireFromRuntime,
  name,
}: {
  readonly runtimePackRoot: string;
  readonly requireFromRuntime: NodeJS.Require;
  readonly name: string;
}) => {
  const packageJson = requireFromRuntime.resolve(`${name}/package.json`);
  const packageRoot = dirname(packageJson);
  const modulesRoot = join(runtimePackRoot, "node_modules");
  if (!contained(modulesRoot, packageRoot)) {
    throw new Error(
      "Runtime Pack module resolution escaped its immutable root.",
    );
  }
  await assertRealDirectory(packageRoot, `Runtime Pack ${name}`);
  await readPackageVersion(packageRoot);
  return packageRoot;
};

const loadWorkspaceRemotionToolchain = async (
  runtimePackRoot: string,
): Promise<WorkspaceRemotionToolchain> => {
  await assertRealDirectory(runtimePackRoot, "Runtime Pack root");
  const requireFromRuntime = createRequire(
    join(runtimePackRoot, "workspace-remotion-loader.cjs"),
  );
  const [bundlerRoot, rendererRoot] = await Promise.all([
    resolveRuntimeModule({
      runtimePackRoot,
      requireFromRuntime,
      name: "@remotion/bundler",
    }),
    resolveRuntimeModule({
      runtimePackRoot,
      requireFromRuntime,
      name: "@remotion/renderer",
    }),
  ]);
  const bundlerEntry = requireFromRuntime.resolve("@remotion/bundler");
  const rendererEntry = requireFromRuntime.resolve("@remotion/renderer");
  for (const [entry, root] of [
    [bundlerEntry, bundlerRoot],
    [rendererEntry, rendererRoot],
  ] as const) {
    if (!contained(root, entry)) {
      throw new Error("Runtime Pack tooling entry escaped its package root.");
    }
    await assertRegularFile(entry, "Runtime Pack tooling entry");
  }
  const bundler = requireFromRuntime(bundlerEntry) as {
    readonly bundle?: WorkspaceRemotionToolchain["bundle"];
  };
  const renderer = requireFromRuntime(rendererEntry) as Partial<
    Pick<
      WorkspaceRemotionToolchain,
      | "openBrowser"
      | "selectComposition"
      | "renderMedia"
      | "renderStill"
      | "makeCancelSignal"
    >
  >;
  const portConfigPath = join(rendererRoot, "dist/port-config.js");
  await assertRegularFile(
    portConfigPath,
    "Runtime Pack Remotion private port adapter",
  );
  const portConfig = requireFromRuntime(
    portConfigPath,
  ) as WorkspaceRemotionToolchain["portConfig"];
  if (
    typeof bundler.bundle !== "function" ||
    typeof renderer.openBrowser !== "function" ||
    typeof renderer.selectComposition !== "function" ||
    typeof renderer.renderMedia !== "function" ||
    typeof renderer.renderStill !== "function" ||
    typeof renderer.makeCancelSignal !== "function" ||
    typeof portConfig.getPortConfig !== "function"
  ) {
    throw new Error("Runtime Pack Remotion tooling surface is incomplete.");
  }
  return {
    openBrowser: renderer.openBrowser,
    bundle: bundler.bundle,
    selectComposition: renderer.selectComposition,
    renderMedia: renderer.renderMedia,
    renderStill: renderer.renderStill,
    makeCancelSignal: renderer.makeCancelSignal,
    portConfig,
  };
};

const reserveRandomLoopbackPort = async () => {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(
      { host: "127.0.0.1", port: 0, exclusive: true },
      resolvePromise,
    );
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Temporary Remotion port did not bind IPv4 loopback.");
  }
  if (address.address !== "127.0.0.1" || address.port <= 0) {
    server.close();
    throw new Error("Temporary Remotion port escaped IPv4 loopback.");
  }
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) =>
      error === undefined ? resolvePromise() : reject(error),
    ),
  );
  return address.port;
};

const renderVideoEntry = (
  storyId: string,
) => `import {Composition, registerRoot} from "remotion";
import ProjectComposition, {productionNarrativeCompositionMetadata as metadata} from "./projects/${storyId}/Composition";

const DeliveryRoot = () => <Composition {...metadata} component={ProjectComposition} />;
registerRoot(DeliveryRoot);
`;

const createEmbeddedProcessRunner =
  (runtime: RuntimeExecutionResources): ProcessRunner =>
  (command, args) => {
    const executable =
      command === "ffmpeg"
        ? runtime.ffmpegExecutable
        : command === "ffprobe"
          ? runtime.ffprobeExecutable
          : command;
    return runMediaProcessWithEnvironment(executable, args, {
      DYLD_LIBRARY_PATH: runtime.binariesDirectory,
    });
  };

const assertBoundAuthority = ({
  expectedLocations,
  expectedRuntime,
  locations,
  runtime,
}: {
  readonly expectedLocations: ProductionLocations;
  readonly expectedRuntime: RuntimeExecutionResources;
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
}) => {
  for (const key of Object.keys(expectedLocations) as Array<
    keyof ProductionLocations
  >) {
    if (locations[key] !== expectedLocations[key]) {
      throw new Error(
        "Workspace Delivery locations changed after composition.",
      );
    }
  }
  for (const key of Object.keys(expectedRuntime) as Array<
    keyof RuntimeExecutionResources
  >) {
    if (runtime[key] !== expectedRuntime[key]) {
      throw new Error("Workspace Delivery runtime changed after composition.");
    }
  }
};

export type WorkspaceDeliveryListenerEvent = Readonly<{
  locations: ProductionLocations;
  storyId: string;
  host: "127.0.0.1";
  port: number;
  signal: AbortSignal;
}>;

export type WorkspaceDeliveryLifecyclePort = Readonly<{
  onListenerReady: (
    event: WorkspaceDeliveryListenerEvent,
  ) => Promise<"continue" | "fail">;
  onListenerClosed: (event: WorkspaceDeliveryListenerEvent) => Promise<void>;
}>;

export type WorkspaceRemotionRenderPorts = Readonly<{
  renderVideo: typeof renderProjectVideo;
  renderCover: typeof renderProjectCover;
  inspectVideo: typeof inspectProjectVideo;
  inspectCover: typeof inspectProjectCover;
}>;

export type WorkspaceRemotionRenderExecution = <T>(input: {
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly projectId: string;
  readonly run: (ports: WorkspaceRemotionRenderPorts) => Promise<T>;
}) => Promise<T>;

export type WorkspaceRemotionRenderer = Readonly<{
  execute: WorkspaceRemotionRenderExecution;
  shutdown: () => Promise<void>;
}>;

export const createWorkspaceRemotionRenderer = ({
  locations,
  runtime,
  lifecycle,
  dependencies = {},
}: {
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly lifecycle: WorkspaceDeliveryLifecyclePort;
  readonly dependencies?: WorkspaceRemotionRendererDependencies;
}): WorkspaceRemotionRenderer => {
  if (locations.layoutKind !== "workspace") {
    throw new Error(
      "Workspace Remotion renderer requires Workspace locations.",
    );
  }
  const loadToolchain =
    dependencies.loadToolchain ?? loadWorkspaceRemotionToolchain;
  const activeCancels = new Set<() => void>();
  const activeAbortControllers = new Set<AbortController>();
  const activeScopeSettlements = new Set<Promise<void>>();
  let stopped = false;
  let activeBuild = false;
  let activeBuildSettlement: Promise<void> | null = null;

  const shutdown = async () => {
    stopped = true;
    for (const controller of [...activeAbortControllers]) controller.abort();
    for (const cancel of [...activeCancels]) cancel();
    const buildSettlement = activeBuildSettlement;
    await Promise.all([
      ...activeScopeSettlements,
      ...(buildSettlement === null ? [] : [buildSettlement]),
    ]);
  };

  const execute: WorkspaceRemotionRenderExecution = async (input) => {
    if (stopped) throw new Error("Workspace Delivery runtime is stopped.");
    if (activeBuild)
      throw new Error("Workspace Delivery runtime is already active.");
    assertBoundAuthority({
      expectedLocations: locations,
      expectedRuntime: runtime,
      locations: input.locations,
      runtime: input.runtime,
    });
    activeBuild = true;
    let resolveBuildSettlement: (() => void) | undefined;
    const buildSettlement = new Promise<void>((resolvePromise) => {
      resolveBuildSettlement = resolvePromise;
    });
    activeBuildSettlement = buildSettlement;
    let stagingRoot: string | null = null;
    let stagingPromise: Promise<string> | null = null;
    let toolchainPromise: Promise<WorkspaceRemotionToolchain> | null = null;
    const bundlePromises = new Map<"video" | "cover", Promise<string>>();
    const embeddedProcess = createEmbeddedProcessRunner(runtime);
    try {
      const ensureStaging = async () => {
        if (stagingPromise !== null) return stagingPromise;
        stagingPromise = (async () => {
          await mkdir(locations.disposableBuildRoot, { recursive: true });
          await assertRealDirectory(
            locations.disposableBuildRoot,
            "Workspace disposable build root",
          );
          const created = await mkdtemp(
            join(locations.disposableBuildRoot, "workspace-delivery-"),
          );
          stagingRoot = created;
          await assertRealDirectory(created, "Workspace Delivery staging root");
          await copyRegularTree({
            source: join(locations.runtimeResources, "source"),
            destination: created,
            label: "Runtime Pack immutable source",
          });
          const projectDestination = join(
            created,
            "src/projects",
            input.projectId,
          );
          try {
            await lstat(projectDestination);
            throw new Error(
              "Runtime Pack source unexpectedly contains the Workspace Project.",
            );
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          await copyRegularTree({
            source: join(locations.projectSourceRoot, input.projectId),
            destination: projectDestination,
            label: "Workspace current Project source",
          });
          const registrySource = join(
            locations.sourceCurrentRoot,
            "../project-registry.generated.ts",
          );
          await assertRegularFile(
            registrySource,
            "Workspace current ProjectRegistry",
          );
          await copyFile(
            registrySource,
            join(created, "src/projects/project-registry.generated.ts"),
          );
          await copyRegularTree({
            source: join(locations.runtimeResources, "shared-assets"),
            destination: join(created, "public/assets"),
            label: "Runtime Pack shared assets",
          });
          await copyRegularTree({
            source: join(locations.projectMediaRoot, input.projectId),
            destination: join(created, "public/projects", input.projectId),
            label: "Workspace current Project media",
          });
          await writeFile(
            join(created, "src", VIDEO_ENTRY_NAME),
            renderVideoEntry(input.projectId),
            { flag: "wx" },
          );
          return created;
        })();
        return stagingPromise;
      };
      const getToolchain = () => {
        toolchainPromise ??= loadToolchain(locations.runtimeResources);
        return toolchainPromise;
      };
      const bundleEntry = (
        kind: "video" | "cover",
        entryPoint: (root: string) => string,
      ) => {
        const current = bundlePromises.get(kind);
        if (current !== undefined) return current;
        const pending = Promise.all([ensureStaging(), getToolchain()]).then(
          async ([root, toolchain]) => {
            const outDir = join(root, `.remotion-bundle/${kind}`);
            const moduleRoot = join(locations.runtimeResources, "node_modules");
            return toolchain.bundle({
              entryPoint: entryPoint(root),
              rootDir: root,
              outDir,
              publicDir: "public",
              enableCaching: false,
              symlinkPublicDir: false,
              keyboardShortcutsEnabled: false,
              askAIEnabled: false,
              interactivityEnabled: false,
              experimentalClientSideRenderingEnabled: false,
              ignoreRegisterRootWarning: false,
              rspack: false,
              onProgress: () => undefined,
              onDirectoryCreated: () => undefined,
              onPublicDirCopyProgress: () => undefined,
              onSymlinkDetected: (path) => {
                throw new Error(
                  `Workspace Delivery bundle rejected symlink: ${path}.`,
                );
              },
              webpackOverride: (configuration) => {
                const resolveConfiguration =
                  configuration.resolve !== null &&
                  typeof configuration.resolve === "object" &&
                  !Array.isArray(configuration.resolve)
                    ? (configuration.resolve as Record<string, unknown>)
                    : {};
                const currentModules = Array.isArray(
                  resolveConfiguration.modules,
                )
                  ? resolveConfiguration.modules.filter(
                      (value): value is string => typeof value === "string",
                    )
                  : [];
                return {
                  ...configuration,
                  resolve: {
                    ...resolveConfiguration,
                    modules: [moduleRoot, ...currentModules],
                  },
                };
              },
            });
          },
        );
        bundlePromises.set(kind, pending);
        return pending;
      };
      const withLoopback = async <T>(
        run: (
          toolchain: WorkspaceRemotionToolchain,
          port: number,
          cancelSignal: CancelSignal,
          browser: WorkspaceRemotionBrowser,
        ) => Promise<T>,
      ) => {
        if (stopped) throw new Error("Workspace Delivery runtime is stopped.");
        const toolchain = await getToolchain();
        if (stopped) throw new Error("Workspace Delivery runtime is stopped.");
        const originalPortConfig = toolchain.portConfig.getPortConfig;
        const cancellation = toolchain.makeCancelSignal();
        const lifecycleAbort = new AbortController();
        let resolveScopeSettlement: (() => void) | undefined;
        const scopeSettlement = new Promise<void>((resolvePromise) => {
          resolveScopeSettlement = resolvePromise;
        });
        activeCancels.add(cancellation.cancel);
        activeAbortControllers.add(lifecycleAbort);
        activeScopeSettlements.add(scopeSettlement);
        const originalListen = HttpServer.prototype.listen;
        let browser: WorkspaceRemotionBrowser | null = null;
        let matchingServer: HttpServer | null = null;
        const matchingServerRestorers: Array<() => void> = [];
        let listenerClosed: Promise<void> = Promise.resolve();
        try {
          const port = await reserveRandomLoopbackPort();
          if (stopped)
            throw new Error("Workspace Delivery runtime is stopped.");
          toolchain.portConfig.getPortConfig = () => ({
            host: "127.0.0.1",
            hostsToTry: ["127.0.0.1"],
          });
          HttpServer.prototype.listen = function (
            this: HttpServer,
            ...args: readonly unknown[]
          ) {
            const options =
              args[0] !== null &&
              typeof args[0] === "object" &&
              !Array.isArray(args[0])
                ? (args[0] as Readonly<Record<string, unknown>>)
                : null;
            if (options?.host !== "127.0.0.1" || options.port !== port) {
              return Reflect.apply(originalListen, this, args as never);
            }
            if (matchingServer !== null) {
              throw new Error(
                "Workspace Delivery opened duplicate matching HTTP listeners.",
              );
            }
            // The exact-version listener adapter must retain the Server receiver
            // while the prototype method is restored in the enclosing finally.
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const server = this;
            matchingServer = server;
            const originalEmit = server.emit;
            const requestListeners = server.listeners("request");
            if (requestListeners.length !== 1) {
              throw new Error(
                "Workspace Delivery requires exactly one HTTP request listener.",
              );
            }
            const originalRequestListener =
              requestListeners[0] as WorkspaceDeliveryRequestListener;
            let requestListenerRestored = false;
            const guardedRequestListener: WorkspaceDeliveryRequestListener = (
              request,
              response,
            ) => {
              if (!isAllowedWorkspaceDeliveryRequest(request, port)) {
                response.statusCode = 404;
                response.setHeader("cache-control", "no-store");
                response.end();
                return;
              }
              Reflect.apply(originalRequestListener, server, [
                request,
                response,
              ]);
            };
            const restoreRequestListener = () => {
              if (requestListenerRestored) return;
              requestListenerRestored = true;
              server.removeListener("request", guardedRequestListener);
              if (
                !server.listeners("request").includes(originalRequestListener)
              ) {
                server.on("request", originalRequestListener);
              }
            };
            matchingServerRestorers.push(restoreRequestListener);
            server.removeAllListeners("request");
            server.on("request", guardedRequestListener);
            let emitRestored = false;
            const restoreEmit = () => {
              if (emitRestored) return;
              emitRestored = true;
              server.emit = originalEmit;
            };
            matchingServerRestorers.push(restoreEmit);
            const event: WorkspaceDeliveryListenerEvent = {
              locations,
              storyId: input.projectId,
              host: "127.0.0.1",
              port,
              signal: lifecycleAbort.signal,
            };
            let listeningEventReleased = false;
            let closed = false;
            let rejecting = false;
            let resolveClosed: (() => void) | undefined;
            let rejectClosed: ((error: unknown) => void) | undefined;
            listenerClosed = new Promise<void>(
              (resolvePromise, rejectPromise) => {
                resolveClosed = resolvePromise;
                rejectClosed = rejectPromise;
              },
            );
            const emitOriginal = (
              eventName: string | symbol,
              eventArgs: readonly unknown[],
            ) =>
              Reflect.apply(originalEmit, server, [
                eventName,
                ...eventArgs,
              ]) as boolean;
            const rejectListener = (cause: unknown) => {
              if (closed || rejecting) return;
              rejecting = true;
              const failure = new Error(
                "Workspace Delivery loopback listener was rejected.",
                { cause },
              );
              const emitFailure = () => emitOriginal("error", [failure]);
              if (server.listening) server.close(emitFailure);
              else queueMicrotask(emitFailure);
            };
            const onAbort = () =>
              rejectListener(new Error("Workspace Delivery was cancelled."));
            lifecycleAbort.signal.addEventListener("abort", onAbort, {
              once: true,
            });
            server.once("close", () => {
              closed = true;
              lifecycleAbort.signal.removeEventListener("abort", onAbort);
              restoreRequestListener();
              restoreEmit();
              void lifecycle.onListenerClosed(event).then(
                () => resolveClosed?.(),
                (error) => rejectClosed?.(error),
              );
            });
            server.emit = ((
              eventName: string | symbol,
              ...eventArgs: readonly unknown[]
            ) => {
              if (eventName !== "listening" || listeningEventReleased) {
                return emitOriginal(eventName, eventArgs);
              }
              void lifecycle
                .onListenerReady(event)
                .then((decision) => {
                  if (
                    decision !== "continue" ||
                    lifecycleAbort.signal.aborted
                  ) {
                    rejectListener(
                      new Error(
                        "Workspace Delivery listener lifecycle failed.",
                      ),
                    );
                    return;
                  }
                  listeningEventReleased = true;
                  emitOriginal(eventName, eventArgs);
                })
                .catch(rejectListener);
              return true;
            }) as typeof server.emit;
            return Reflect.apply(originalListen, server, args as never);
          } as typeof HttpServer.prototype.listen;
          browser = await toolchain.openBrowser("chrome", {
            browserExecutable: runtime.browserExecutable,
            chromeMode: "headless-shell",
            logLevel: "error",
          });
          return await run(
            toolchain,
            port,
            cancellation.cancelSignal,
            browser,
          );
        } finally {
          try {
            lifecycleAbort.abort();
            cancellation.cancel();
            const server = matchingServer as HttpServer | null;
            await cleanupWorkspaceRemotionScope({
              browser,
              server,
              listenerClosed,
            });
          } finally {
            for (const restore of matchingServerRestorers) restore();
            activeCancels.delete(cancellation.cancel);
            activeAbortControllers.delete(lifecycleAbort);
            HttpServer.prototype.listen = originalListen;
            toolchain.portConfig.getPortConfig = originalPortConfig;
            activeScopeSettlements.delete(scopeSettlement);
            resolveScopeSettlement?.();
          }
        }
      };
      const commonRendererOptions = (
        serveUrl: string,
        id: string,
        port: number,
        browser: WorkspaceRemotionBrowser,
      ) => ({
        serveUrl,
        id,
        port,
        inputProps: { projectId: input.projectId },
        browserExecutable: runtime.browserExecutable,
        binariesDirectory: runtime.binariesDirectory,
        logLevel: "error" as const,
        chromeMode: "headless-shell" as const,
        puppeteerInstance: browser,
      });
      const select = (serveUrl: string, id: string) =>
        withLoopback((toolchain, port, _cancelSignal, browser) =>
          toolchain.selectComposition(
            commonRendererOptions(serveUrl, id, port, browser),
          ),
        );
      const renderVideo = async ({
        compositionId,
        outputPath,
      }: {
        readonly compositionId: string;
        readonly outputPath: string;
      }) => {
        const serveUrl = await bundleEntry("video", (root) =>
          join(root, "src", VIDEO_ENTRY_NAME),
        );
        const composition = await select(serveUrl, compositionId);
        await withLoopback((toolchain, port, cancelSignal, browser) =>
          toolchain.renderMedia({
            ...commonRendererOptions(serveUrl, compositionId, port, browser),
            composition,
            outputLocation: outputPath,
            codec: "h264",
            audioCodec: "aac",
            pixelFormat: "yuv420p",
            overwrite: true,
            cancelSignal,
          }),
        );
      };
      const renderCover = async ({
        compositionId,
        outputPath,
      }: {
        readonly compositionId: string;
        readonly outputPath: string;
      }) => {
        const serveUrl = await bundleEntry("cover", (root) =>
          join(
            root,
            "src/projects",
            input.projectId,
            "delivery/cover/index.ts",
          ),
        );
        const composition = await select(serveUrl, compositionId);
        await withLoopback((toolchain, port, cancelSignal, browser) =>
          toolchain.renderStill({
            ...commonRendererOptions(serveUrl, compositionId, port, browser),
            composition,
            output: outputPath,
            imageFormat: "png",
            overwrite: true,
            cancelSignal,
          }),
        );
      };
      return await input.run({
        renderVideo: renderVideo as typeof renderProjectVideo,
        renderCover: renderCover as typeof renderProjectCover,
        inspectVideo: (inspectInput) =>
          inspectProjectVideo({
            ...inspectInput,
            runProcess: embeddedProcess,
          }),
        inspectCover: (inspectInput) =>
          inspectProjectCover({
            ...inspectInput,
            runProcess: embeddedProcess,
          }),
      });
    } finally {
      try {
        for (const cancel of [...activeCancels]) cancel();
        activeBuild = false;
        if (stagingRoot !== null) {
          await (contained(locations.disposableBuildRoot, stagingRoot)
            ? rm(stagingRoot, { recursive: true, force: true })
            : Promise.reject(
                new Error(
                  "Workspace Delivery staging cleanup escaped cache root.",
                ),
              ));
        }
      } finally {
        if (activeBuildSettlement === buildSettlement) {
          activeBuildSettlement = null;
        }
        resolveBuildSettlement?.();
      }
    }
  };

  return Object.freeze({ execute, shutdown });
};
