import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  readDesktopCompatibilityManifest,
  verifyRuntimePack,
} from "../../desktop/adapters/runtime-pack-filesystem";
import { startRspDoctorServer } from "../../desktop/adapters/rsp-socket";
import { readWorkspaceActiveProduction } from "../../desktop/adapters/workspace-migration-filesystem";
import { buildWorkspacePreviewCatalog } from "../../desktop/adapters/workspace-preview-catalog";
import { initializeWorkspace } from "../../desktop/application/initialize-workspace";
import {
  DoctorResponseSchema,
  EngineToMainMessageSchema,
  RSP_PROTOCOL_VERSION,
  type DoctorResponse,
  type EngineToMainMessage,
} from "../../desktop/contracts/protocol";
import {
  buildDesktopCompatibilityManifest,
  createRendererRuntimeFingerprint,
} from "../../desktop/contracts/runtime-pack";
import {
  createEngineController,
  type EngineDependencies,
  type EngineMessageEvent,
} from "../../desktop/engine/entry";
import { buildRuntimePack } from "../../desktop/adapters/runtime-pack-filesystem";
import { createRuntimeExecutionResources } from "../project-production/application/production-locations";
import {
  createWorkspaceProductionController,
} from "../project-production/application/workspace-production-controller";
import { buildProducerConfig } from "../../src/contracts";

const execFileAsync = promisify(execFile);
const checkoutRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const producerConfig = buildProducerConfig({
  schemaVersion: 4,
  contractVersion: "producer-config-v4",
  renderDefaults: { width: 1920, height: 1080, fps: 30, locale: "zh-CN" },
  readability: { edgeInsetPx: 64 },
  sceneDefaults: { introSceneTemplateId: null, outroSceneTemplateId: null },
  publishingCollections: [
    { id: "default", name: "Default", description: "Default" },
  ],
  tts: {
    defaultProviderId: "edge",
    defaultVoiceProfileId: "zh-cn-xiaoxiao",
    speech: { rate: 1, targetLoudnessLufs: -16 },
    providers: [
      {
        id: "edge",
        kind: "edge-tts",
        service: "microsoft-edge-read-aloud",
        name: "Edge",
        connection: { timeoutMs: 1_000 },
        modelId: "edge-read-aloud",
        voiceProfiles: [
          {
            id: "zh-cn-xiaoxiao",
            name: "Voice",
            voiceId: "zh-CN-XiaoxiaoNeural",
            locale: "zh-CN",
          },
        ],
      },
    ],
  },
});

const run = async (command: string, args: readonly string[]) => {
  await execFileAsync(command, [...args], {
    cwd: checkoutRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
};

const buildRspSea = async (temporaryRoot: string) => {
  await run(join(checkoutRoot, "node_modules/.bin/vite"), [
    "build",
    "--config",
    "vite.desktop.rsp.config.ts",
  ]);
  const bundle = join(checkoutRoot, ".vite/rsp/rsp-sea.cjs");
  const blob = join(temporaryRoot, "rsp.blob");
  const config = join(temporaryRoot, "sea-config.json");
  const executable = join(temporaryRoot, "rsp");
  await writeFile(
    config,
    `${JSON.stringify({
      main: bundle,
      output: blob,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
    })}\n`,
    { mode: 0o600 },
  );
  await run(process.execPath, ["--experimental-sea-config", config]);
  await copyFile(process.execPath, executable);
  await chmod(executable, 0o755);
  if (process.platform === "darwin") {
    await run("codesign", ["--remove-signature", executable]);
  }
  await run(join(checkoutRoot, "node_modules/.bin/postject"), [
    executable,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ...(process.platform === "darwin"
      ? ["--macho-segment-name", "NODE_SEA"]
      : []),
  ]);
  return executable;
};

const installIntegrationResources = async (appResourcesRoot: string) => {
  const sourceRoot = join(
    checkoutRoot,
    "desktop/resources/workspace-integration",
  );
  const targetRoot = join(appResourcesRoot, "workspace-integration");
  const resources = [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "skills/remotion-story-producer-video/SKILL.md",
    "hermes/INSTALL_PROMPT.md",
  ] as const;
  for (const relativePath of resources) {
    const target = join(targetRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourceRoot, relativePath), target);
  }
};

const buildFixtureAppResources = async ({
  appResourcesRoot,
  temporaryRoot,
}: {
  readonly appResourcesRoot: string;
  readonly temporaryRoot: string;
}) => {
  await mkdir(appResourcesRoot, { recursive: true });
  await installIntegrationResources(appResourcesRoot);
  const rsp = await buildRspSea(temporaryRoot);
  const runtimePackRoot = join(appResourcesRoot, "runtime-pack");
  const manifest = await buildRuntimePack({
    outputRoot: runtimePackRoot,
    architecture: "arm64",
    remotionPackages: [
      { name: "@remotion/bundler", version: "4.0.489" },
      { name: "@remotion/renderer", version: "4.0.489" },
      { name: "@remotion/studio", version: "4.0.489" },
      { name: "@remotion/studio-shared", version: "4.0.489" },
      { name: "remotion", version: "4.0.489" },
    ],
    binaries: {
      rendererBrowser: {
        source: process.execPath,
        relativePath: "bin/browser",
        version: "host-functional-fixture",
      },
      ffmpeg: {
        source: process.execPath,
        relativePath: "bin/ffmpeg",
        version: "host-functional-fixture",
      },
      ffprobe: {
        source: process.execPath,
        relativePath: "bin/ffprobe",
        version: "host-functional-fixture",
      },
      node: {
        source: process.execPath,
        relativePath: "bin/node",
        version: process.version,
      },
      rspClient: {
        source: rsp,
        relativePath: "bin/rsp",
        version: RSP_PROTOCOL_VERSION,
      },
    },
    additionalFiles: [
      ...[
        "@remotion/bundler",
        "@remotion/renderer",
        "@remotion/studio",
        "@remotion/studio-shared",
      ].map((name) => ({
        source: join(checkoutRoot, "node_modules", name, "package.json"),
        relativePath: `node_modules/${name}/package.json`,
      })),
      {
        source: join(checkoutRoot, "node_modules/remotion/package.json"),
        relativePath: "node_modules/remotion/package.json",
      },
    ],
  });
  const compatibility = buildDesktopCompatibilityManifest({
    appVersion: "0.1.0-smoke",
    runtimePack: manifest,
  });
  await writeFile(
    join(appResourcesRoot, "compatibility.json"),
    `${JSON.stringify(compatibility, null, 2)}\n`,
    { mode: 0o644 },
  );
  return { manifest, runtimePackRoot };
};

const tokenEvent = ({
  workspaceRoot,
  appResourcesRoot,
  applicationSupportRoot,
  cacheRoot,
  expiresAt,
  token,
}: {
  readonly workspaceRoot: string;
  readonly appResourcesRoot: string;
  readonly applicationSupportRoot: string;
  readonly cacheRoot: string;
  readonly expiresAt: string;
  readonly token: Uint8Array;
}): EngineMessageEvent => {
  let listener: ((event: MessageEvent<unknown>) => void) | undefined;
  let closed = false;
  return {
    data: {
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: "integration-initialize",
      type: "initialize",
      workspaceRoot,
      appResourcesRoot,
      applicationSupportRoot,
      cacheRoot,
      appPid: process.pid,
      sessionExpiresAt: expiresAt,
    },
    ports: [
      {
        on: (_type, nextListener) => {
          listener = nextListener;
        },
        off: () => {
          listener = undefined;
        },
        start: () => {
          queueMicrotask(() => {
            if (!closed) {
              listener?.({
                data: { token, producerConfig, provider: "ready" },
              } as MessageEvent<unknown>);
            }
          });
        },
        close: () => {
          closed = true;
        },
      },
    ],
  };
};

const findExecutable = async (name: string) => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory === "") continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue exact PATH discovery without invoking a shell.
    }
  }
  return null;
};

type HermesEvidence =
  | Readonly<{
      status: "invoked";
      code: "hermes-cli-invoked-workspace-proof-pending";
      versionLine: string;
    }>
  | Readonly<{
      status: "pending";
      code: "hermes-cli-unavailable" | "hermes-cli-invocation-failed";
    }>;

const invokeHermesCli = async (): Promise<HermesEvidence> => {
  const executable = await findExecutable("hermes");
  if (executable === null) {
    return { status: "pending", code: "hermes-cli-unavailable" };
  }
  try {
    const invocation = await execFileAsync(executable, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    });
    const versionLine = `${invocation.stdout}${invocation.stderr}`
      .trim()
      .split(/\r?\n/u)[0];
    if (versionLine === undefined || versionLine === "") {
      return { status: "pending", code: "hermes-cli-invocation-failed" };
    }
    return {
      status: "invoked",
      code: "hermes-cli-invoked-workspace-proof-pending",
      versionLine,
    };
  } catch {
    return { status: "pending", code: "hermes-cli-invocation-failed" };
  }
};

export type DesktopIntegrationSmokeResult = Readonly<{
  evidenceClass: "host-functional-fixture";
  nativeProductionEvidence: false;
  workspaceInitialized: true;
  managedDiscovery: "codex-compatible";
  rspPackaging: "self-contained-sea";
  rspExitCode: 0;
  doctor: DoctorResponse;
  hermes: HermesEvidence;
  sessionCleaned: true;
}>;

export const runDesktopIntegrationSmoke =
  async (): Promise<DesktopIntegrationSmokeResult> => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "axmorf-desktop-smoke-"));
    const workspaceRoot = join(fixtureRoot, "AXMORF Studio");
    const appResourcesRoot = join(fixtureRoot, "app-resources");
    const applicationSupportRoot = join(fixtureRoot, "app-support");
    const cacheRoot = join(fixtureRoot, "cache");
    const messages: EngineToMainMessage[] = [];
    let controller: ReturnType<typeof createEngineController> | undefined;
    try {
      await Promise.all([
        mkdir(applicationSupportRoot, { recursive: true }),
        mkdir(cacheRoot, { recursive: true }),
      ]);
      const { manifest, runtimePackRoot } = await buildFixtureAppResources({
        appResourcesRoot,
        temporaryRoot: fixtureRoot,
      });
      const dependencies: EngineDependencies = {
        initializeWorkspace,
        verifyRuntimePack: (options) =>
          verifyRuntimePack({
            ...options,
            expectedArchitecture: "arm64",
            expectedPlatform: "darwin",
          }),
        readCompatibility: readDesktopCompatibilityManifest,
        resolveRuntime: async () =>
          createRuntimeExecutionResources({
            rendererRuntimeFingerprint:
              createRendererRuntimeFingerprint(manifest),
            browserExecutable: join(runtimePackRoot, "bin/browser"),
            binariesDirectory: join(runtimePackRoot, "bin"),
            ffmpegExecutable: join(runtimePackRoot, "bin/ffmpeg"),
            ffprobeExecutable: join(runtimePackRoot, "bin/ffprobe"),
          }),
        buildPreviewCatalog: buildWorkspacePreviewCatalog,
        createCommandRuntime: async ({
          locations,
          runtime,
          workspaceRoot: initializedWorkspaceRoot,
          config,
          provider,
        }) => {
          const [production, activeWork] = await Promise.all([
            createWorkspaceProductionController({
              locations,
              runtime,
              delivery: {
                build: async () => {
                  throw new Error("host-functional-fixture-has-no-native-media");
                },
                shutdown: async () => undefined,
              },
              loadProducerConfig: async () => config,
              providerReadiness: provider,
            }),
            readWorkspaceActiveProduction(initializedWorkspaceRoot),
          ]);
          return {
            activeWork,
            deliveryAvailable: true,
            deliveryBlocker: null,
            shutdown: production.shutdown,
            executeCommand: (request) => production.execute(request),
          };
        },
        startRspDoctorServer,
        homeDirectory: () => fixtureRoot,
        enginePid: () => process.pid,
        tokenTimeoutMs: 5_000,
      };
      controller = createEngineController({
        parentPort: {
          postMessage: (message) => {
            messages.push(EngineToMainMessageSchema.parse(message));
          },
        },
        dependencies,
      });
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      await controller.handleMessageEvent(
        tokenEvent({
          workspaceRoot,
          appResourcesRoot,
          applicationSupportRoot,
          cacheRoot,
          expiresAt,
          token: randomBytes(32),
        }),
      );
      assert.deepEqual(
        messages.map(({ type }) => type),
        ["initialized", "doctor-state"],
        JSON.stringify(messages),
      );

      const [agents, skill, hermesPrompt] = await Promise.all([
        readFile(join(workspaceRoot, "AGENTS.md"), "utf8"),
        readFile(
          join(
            workspaceRoot,
            ".agents/skills/remotion-story-producer-video/SKILL.md",
          ),
          "utf8",
        ),
        readFile(join(workspaceRoot, ".rsp/hermes/INSTALL_PROMPT.md"), "utf8"),
      ]);
      for (const discovery of [agents, skill, hermesPrompt]) {
        assert.match(discovery, /\.\/\.rsp\/bin\/rsp doctor/u);
        assert.doesNotMatch(
          discovery,
          /npm run|rsp-client\.cjs|repositoryMode/iu,
        );
      }

      const rspPath = join(workspaceRoot, ".rsp/bin/rsp");
      const execution = await execFileAsync(rspPath, ["doctor"], {
        cwd: workspaceRoot,
        encoding: "utf8",
        env: {},
        maxBuffer: 1024 * 1024,
        timeout: 10_000,
      });
      const doctor = DoctorResponseSchema.parse(JSON.parse(execution.stdout));
      assert.equal(execution.stderr, "");
      assert.equal(doctor.adapterMode, "workspace");
      assert.equal(doctor.runtimePackMode, "embedded");
      assert.equal(
        doctor.network.controlPlane,
        "authenticated-unix-domain-socket-only",
      );
      assert.equal(doctor.network.persistentTcpListeners, false);
      assert.equal(doctor.network.deliveryBuildListener.host, "127.0.0.1");
      assert.equal(doctor.productionAvailable, true);
      assert.equal(doctor.deliveryAvailable, true);
      assert.equal(doctor.deliveryBlocker, null);
      assert.equal(doctor.provider, "ready");
      assert.equal(doctor.runtimePackAvailable, true);
      assert.equal(doctor.distributionReady, false);
      assert.equal(doctor.runtimePack.runtimePackId, manifest.runtimePackId);

      const hermes = await invokeHermesCli();
      await controller.handleMessageEvent({
        data: {
          protocolVersion: RSP_PROTOCOL_VERSION,
          requestId: "integration-shutdown",
          type: "shutdown",
        },
      });
      assert.equal(messages.at(-1)?.type, "stopped");
      for (const ownedPath of ["session.json", "token", "rsp.sock"]) {
        await assert.rejects(
          access(join(workspaceRoot, ".rsp/session", ownedPath)),
          { code: "ENOENT" },
        );
      }
      return {
        evidenceClass: "host-functional-fixture",
        nativeProductionEvidence: false,
        workspaceInitialized: true,
        managedDiscovery: "codex-compatible",
        rspPackaging: "self-contained-sea",
        rspExitCode: 0,
        doctor,
        hermes,
        sessionCleaned: true,
      };
    } finally {
      await controller?.stopOwnedResources();
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  };

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void runDesktopIntegrationSmoke()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Desktop integration smoke failed."}\n`,
      );
      process.exitCode = 1;
    });
}
