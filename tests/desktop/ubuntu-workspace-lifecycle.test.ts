import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  cp,
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  buildProducerConfig,
  ProjectCreateInputSchema,
} from "../../src/contracts";
import {
  createDesktopNativeProjectInput,
  executeDesktopNativeAgentTasks,
} from "../../scripts/desktop/native-fixture";
import { listDesktopRuntimeSourcePaths } from "../../scripts/desktop/build-runtime-pack";
import { prepareDesktopNativeTestNarration } from "../../scripts/desktop/native-test-provider";
import {
  createRuntimeExecutionResources,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import { createWorkspaceProductionController } from "../../scripts/project-production/application/workspace-production-controller";
import { createWorkspaceRemotionDeliveryRuntime } from "../../scripts/project-production/application/workspace-remotion-delivery";
import type { WorkspaceRemotionToolchain } from "../../scripts/project-production/adapters/workspace-remotion-renderer";

const checkoutRoot = resolve(import.meta.dirname, "../..");
const requireFromCheckout = createRequire(import.meta.url);
const enabled =
  process.platform === "linux" &&
  process.arch === "x64" &&
  process.env.AXMORF_UBUNTU_WORKSPACE_E2E === "1";

const decodeMonoPcmWindow = async ({
  ffmpeg,
  video,
  startSeconds,
  durationSeconds,
}: {
  readonly ffmpeg: string;
  readonly video: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}) =>
  new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const child = spawn(
      ffmpeg,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(startSeconds),
        "-t",
        String(durationSeconds),
        "-i",
        video,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-acodec",
        "pcm_s16le",
        "-f",
        "wav",
        "-",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(
            `Audio window decode failed: ${Buffer.concat(stderr).toString("utf8")}`,
          ),
        );
        return;
      }
      resolvePromise(Buffer.concat(stdout));
    });
  });

const wavPcmPeak = (wav: Buffer) => {
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      let peak = 0;
      for (let index = offset + 8; index + 1 < wav.length; index += 2) {
        peak = Math.max(peak, Math.abs(wav.readInt16LE(index)));
      }
      return peak;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error("Decoded audio window is not a PCM WAV.");
};

const config = buildProducerConfig({
  schemaVersion: 4,
  contractVersion: "producer-config-v4",
  renderDefaults: { width: 540, height: 960, fps: 30, locale: "zh-CN" },
  readability: { edgeInsetPx: 45 },
  sceneDefaults: {
    introSceneTemplateId: "axmorf-brand-reveal-v1",
    outroSceneTemplateId: "axmorf-source-follow-v1",
  },
  audioDefaults: { globalBgm: null },
  publishingCollections: [
    {
      id: "ai-workflow",
      name: "Ubuntu Workspace gate",
      description: "Deterministic packaged-Workspace lifecycle proof.",
    },
  ],
  tts: {
    defaultProviderId: "ubuntu-gate-edge",
    defaultVoiceProfileId: "ubuntu-gate-voice",
    speech: { rate: 1, targetLoudnessLufs: -16 },
    providers: [
      {
        id: "ubuntu-gate-edge",
        kind: "edge-tts",
        service: "microsoft-edge-read-aloud",
        name: "Ubuntu deterministic gate",
        connection: { timeoutMs: 1_000 },
        modelId: "edge-read-aloud",
        voiceProfiles: [
          {
            id: "ubuntu-gate-voice",
            name: "Ubuntu gate voice",
            voiceId: "zh-CN-XiaoxiaoNeural",
            locale: "zh-CN",
          },
        ],
      },
    ],
  },
});

const loadHostToolchain = (): WorkspaceRemotionToolchain => {
  const bundler = requireFromCheckout("@remotion/bundler") as {
    readonly bundle: WorkspaceRemotionToolchain["bundle"];
  };
  const renderer = requireFromCheckout("@remotion/renderer") as Pick<
    WorkspaceRemotionToolchain,
    | "openBrowser"
    | "selectComposition"
    | "renderMedia"
    | "renderStill"
    | "makeCancelSignal"
  >;
  const rendererRoot = dirname(
    requireFromCheckout.resolve("@remotion/renderer/package.json"),
  );
  const portConfig = requireFromCheckout(
    join(rendererRoot, "dist/port-config.js"),
  ) as WorkspaceRemotionToolchain["portConfig"];
  return {
    ...renderer,
    portConfig,
    bundle: (options) =>
      bundler.bundle({
        ...options,
        webpackOverride: (configuration) => {
          const configured = options.webpackOverride(configuration) as Record<
            string,
            unknown
          >;
          const resolution =
            configured.resolve !== null &&
            typeof configured.resolve === "object" &&
            !Array.isArray(configured.resolve)
              ? (configured.resolve as Record<string, unknown>)
              : {};
          const modules = Array.isArray(resolution.modules)
            ? resolution.modules.filter(
                (value): value is string => typeof value === "string",
              )
            : [];
          return {
            ...configured,
            resolve: {
              ...resolution,
              modules: [join(checkoutRoot, "node_modules"), ...modules],
            },
          };
        },
      }),
  };
};

const installRuntimeExecutable = async (source: string, destination: string) => {
  await mkdir(dirname(destination), { recursive: true });
  try {
    await link(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await copyFile(source, destination);
  }
};

test(
  "Ubuntu runs the complete Workspace lifecycle with both built-in Scene templates",
  { skip: enabled ? false : "Ubuntu Workspace gate is opt-in." },
  async (context) => {
    const root = await mkdtemp(join(tmpdir(), "rsp-ubuntu-workspace-gate-"));
    context.after(() => rm(root, { recursive: true, force: true }));
    const workspaceRoot = join(root, "workspace");
    const runtimeRoot = join(root, "runtime-pack");
    const supportRoot = join(root, "support");
    const cacheRoot = join(root, "cache");
    await Promise.all([
      mkdir(join(workspaceRoot, "projects"), { recursive: true }),
      mkdir(join(workspaceRoot, "media"), { recursive: true }),
      mkdir(join(workspaceRoot, ".rsp/current"), { recursive: true }),
      mkdir(join(workspaceRoot, ".rsp/work"), { recursive: true }),
      mkdir(join(workspaceRoot, "deliveries"), { recursive: true }),
      mkdir(supportRoot, { recursive: true }),
      mkdir(cacheRoot, { recursive: true }),
      mkdir(join(runtimeRoot, "source"), { recursive: true }),
    ]);
    await Promise.all([
      cp(
        join(checkoutRoot, "desktop/resources/workspace-integration/assets"),
        join(runtimeRoot, "shared-assets"),
        { recursive: true },
      ),
    ]);
    for (const relativePath of listDesktopRuntimeSourcePaths()) {
      const destination = join(runtimeRoot, "source", relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(checkoutRoot, relativePath), destination, {
        recursive: true,
      });
    }
    await symlink(
      join(checkoutRoot, "node_modules"),
      join(runtimeRoot, "node_modules"),
      "dir",
    );

    const renderer = requireFromCheckout("@remotion/renderer") as {
      readonly ensureBrowser: (input: {
        readonly chromeMode: "headless-shell";
        readonly logLevel: "error";
      }) => Promise<Readonly<{ type: string; path?: string }>>;
    };
    const browser = await renderer.ensureBrowser({
      chromeMode: "headless-shell",
      logLevel: "error",
    });
    if (browser.path === undefined) {
      throw new Error("Ubuntu gate browser is unavailable.");
    }
    const compositorRoot = dirname(
      requireFromCheckout.resolve(
        "@remotion/compositor-linux-x64-gnu/package.json",
      ),
    );
    const runtimeBrowser = join(runtimeRoot, "browser/headless");
    const runtimeFfmpeg = join(runtimeRoot, "bin/ffmpeg");
    const runtimeFfprobe = join(runtimeRoot, "bin/ffprobe");
    const compositorRuntimeFiles = (await readdir(compositorRoot)).filter(
      (name) => name === "remotion" || /^lib.+\.so$/u.test(name),
    );
    await Promise.all([
      installRuntimeExecutable(browser.path, runtimeBrowser),
      installRuntimeExecutable(join(compositorRoot, "ffmpeg"), runtimeFfmpeg),
      installRuntimeExecutable(
        join(compositorRoot, "ffprobe"),
        runtimeFfprobe,
      ),
      ...compositorRuntimeFiles.map((name) =>
        installRuntimeExecutable(
          join(compositorRoot, name),
          join(runtimeRoot, "bin", name),
        ),
      ),
    ]);
    const locations = createWorkspaceProductionLocations({
      workspaceRoot,
      applicationSupportRoot: supportRoot,
      runtimeResources: runtimeRoot,
      cacheRoot,
    });
    const runtime = createRuntimeExecutionResources({
      rendererRuntimeFingerprint: `sha256:${"b".repeat(64)}`,
      browserExecutable: runtimeBrowser,
      binariesDirectory: join(runtimeRoot, "bin"),
      ffmpegExecutable: runtimeFfmpeg,
      ffprobeExecutable: runtimeFfprobe,
    });
    const delivery = createWorkspaceRemotionDeliveryRuntime({
      locations,
      runtime,
      lifecycle: {
        onListenerReady: async () => "continue",
        onListenerClosed: async () => undefined,
      },
      dependencies: { loadToolchain: async () => loadHostToolchain() },
    });
    let narrationFailure: unknown;
    const controller = await createWorkspaceProductionController({
      locations,
      runtime,
      delivery,
      loadProducerConfig: async () => config,
      providerReadiness: "ready",
      prepareNarration: async (input) => {
        try {
          return await prepareDesktopNativeTestNarration(input);
        } catch (error) {
          narrationFailure = error;
          throw error;
        }
      },
    });
    context.after(() => controller.shutdown());

    const createInput = ProjectCreateInputSchema.parse(
      createDesktopNativeProjectInput(),
    );
    assert.equal(createInput.sceneTemplates, undefined);
    const created = (await controller.createProject(createInput)) as {
      readonly status: string;
      readonly copiedSceneMeaningIds: readonly string[];
    };
    assert.equal(created.status, "project-created");
    assert.deepEqual(created.copiedSceneMeaningIds, [
      "configured-intro-scene",
      "configured-outro-scene",
    ]);

    const prepare = controller.prepare(createInput.storyId, "automatic");
    const preparation = (await prepare.catch((error: unknown) => {
      if (narrationFailure !== undefined) throw narrationFailure;
      if (error instanceof Error && error.cause !== undefined) {
        throw error.cause;
      }
      throw error;
    })) as {
      readonly status: string;
      readonly revisionId: string;
      readonly attemptId: string;
      readonly dirtyAgentTasks: readonly Readonly<{
        taskRevision: string;
        taskKind: string;
      }>[];
    };
    assert.equal(preparation.status, "project-production-prepared");
    await executeDesktopNativeAgentTasks({ workspaceRoot, preparation });
    for (const task of preparation.dirtyAgentTasks) {
      await controller.finalizeTask(task.taskRevision);
      await controller.checkTask(task.taskRevision);
      await controller.commitTask(task.taskRevision, preparation.attemptId);
    }
    const terminal = (await controller.continueProduction({
      projectId: createInput.storyId,
      revisionId: preparation.revisionId,
      attemptId: preparation.attemptId,
      deliveryPolicy: "automatic",
    })) as { readonly status: string };
    assert.equal(terminal.status, "project-production-complete");

    const deliveryRoot = join(
      workspaceRoot,
      "deliveries",
      createInput.storyId,
    );
    assert.deepEqual((await readdir(deliveryRoot)).sort(), [
      "cover-3x4.png",
      "cover-4x3.png",
      "publish.json",
      "video.mp4",
    ]);
    for (const file of [
      "cover-3x4.png",
      "cover-4x3.png",
      "publish.json",
      "video.mp4",
    ]) {
      assert.ok((await stat(join(deliveryRoot, file))).size > 0);
    }
    const publish = JSON.parse(
      await readFile(join(deliveryRoot, "publish.json"), "utf8"),
    ) as {
      readonly storyId?: unknown;
      readonly fps?: unknown;
      readonly artifacts?: {
        readonly video?: { readonly media?: { readonly frameCount?: unknown } };
      };
    };
    assert.equal(publish.storyId, createInput.storyId);
    assert.equal(publish.fps, 30);
    const frameCount = publish.artifacts?.video?.media?.frameCount;
    assert.equal(typeof frameCount, "number");
    const introSound = JSON.parse(
      await readFile(
        join(
          workspaceRoot,
          "projects",
          createInput.storyId,
          "scenes/configured-intro-scene/sound-plan.json",
        ),
        "utf8",
      ),
    ) as { readonly contributions?: readonly unknown[] };
    const outroSound = JSON.parse(
      await readFile(
        join(
          workspaceRoot,
          "projects",
          createInput.storyId,
          "scenes/configured-outro-scene/sound-plan.json",
        ),
        "utf8",
      ),
    ) as { readonly contributions?: readonly unknown[] };
    assert.equal(introSound.contributions?.length, 1);
    assert.equal(outroSound.contributions?.length, 1);
    const video = join(deliveryRoot, "video.mp4");
    const introPcm = await decodeMonoPcmWindow({
      ffmpeg: runtimeFfmpeg,
      video,
      startSeconds: 0,
      durationSeconds: 1,
    });
    const outroPcm = await decodeMonoPcmWindow({
      ffmpeg: runtimeFfmpeg,
      video,
      startSeconds: (frameCount as number) / 30 - 8,
      durationSeconds: 1,
    });
    assert.ok(wavPcmPeak(introPcm) > 500, "intro template audio is silent");
    assert.ok(wavPcmPeak(outroPcm) > 500, "outro template audio is silent");
  },
);
