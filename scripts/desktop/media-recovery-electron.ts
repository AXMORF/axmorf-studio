import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { app, ipcMain, protocol } from "electron";

import { createDesktopSettingsSnapshot } from "../../desktop/application/manage-settings";
import {
  DESKTOP_MEDIA_SCHEME,
  parsePreviewVideoUrl,
  PreviewCatalogSchema,
} from "../../desktop/contracts/preview";
import { createDesktopWindow } from "../../desktop/main/create-window";
import {
  DesktopMediaProtocol,
  registerDesktopMediaProtocol,
} from "../../desktop/main/media-protocol";
import { rendererRecoveryProbeSource } from "../../desktop/main/native-smoke";
import { registerDesktopShellIpc } from "../../desktop/main/register-ipc";
import {
  DesktopShellController,
  type DesktopEngineSnapshot,
} from "../../desktop/main/shell-controller";

const execFileAsync = promisify(execFile);
const storyId = "desktop-media-recovery";
const revisionId = `revision-${"b".repeat(64)}`;
const deliveryBuildId = `delivery-${"c".repeat(64)}`;
const runtimePackId = `runtime-pack-${"d".repeat(64)}`;
const evidenceRoot = resolve(
  process.env.AXMORF_DESKTOP_MEDIA_RECOVERY_EVIDENCE ??
    join(tmpdir(), "axmorf-media-recovery-electron-evidence"),
);

protocol.registerSchemesAsPrivileged([
  {
    scheme: DESKTOP_MEDIA_SCHEME,
    privileges: {
      secure: true,
      stream: true,
      standard: false,
      bypassCSP: false,
      allowServiceWorkers: false,
      supportFetchAPI: false,
      corsEnabled: false,
      codeCache: false,
      allowExtensions: false,
    },
  },
]);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const createFixture = async (workspaceRoot: string) => {
  const deliveryRoot = join(workspaceRoot, "deliveries", storyId);
  const videoPath = join(deliveryRoot, "video.mp4");
  await mkdir(deliveryRoot, { recursive: true });
  await execFileAsync(
    process.env.FFMPEG_EXECUTABLE ?? "ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-y",
      videoPath,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const bytes = await readFile(videoPath);
  const catalog = PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-preview-catalog-v1",
    entries: [
      {
        storyId,
        revisionId,
        deliveryBuildId,
        compositionId: "DesktopMediaRecovery",
        title: "Desktop media recovery",
        width: 640,
        height: 360,
        fps: 30,
        frameCount: 90,
        video: {
          checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          sizeBytes: bytes.byteLength,
        },
        timeline: {
          durationInFrames: 90,
          leadInFrames: 0,
          tailFrames: 0,
          narrationStartFrame: 0,
          scenes: [
            {
              kind: "narrated-scene",
              meaningId: "recovery",
              label: "Recovery",
              startFrame: 0,
              endFrame: 90,
            },
          ],
          narration: [
            {
              kind: "chunk",
              chunkId: "recovery-one",
              meaningId: "recovery",
              text: "Recovery",
              startFrame: 0,
              endFrame: 90,
            },
          ],
          captions: [
            {
              chunkId: "recovery-one",
              meaningId: "recovery",
              text: "Recovery",
              startFrame: 0,
              endFrame: 90,
            },
          ],
        },
      },
    ],
    unavailable: [],
  });
  const snapshot: DesktopEngineSnapshot = {
    catalog,
    previewCatalog: {
      state: "ready",
      entryCount: 1,
      unavailableCount: 0,
      failureCode: null,
    },
    projects: [
      {
        storyId: catalog.entries[0]!.storyId,
        title: "Desktop media recovery",
        source: "current",
        delivery: "current",
        invalidation: [],
      },
    ],
    productionProgress: [],
    activeWork: null,
    runtimePack: {
      runtimePackId,
      architecture: process.arch === "arm64" ? "arm64" : "x64",
    },
    agentIntegration: "ready",
    provider: "unknown",
    deliveryAvailable: true,
    deliveryBlocker: null,
  };
  return { bytes, snapshot };
};

const waitForPlayer = (
  timeoutMs = 30_000,
) => `(() => new Promise((resolve, reject) => {
  const deadline = Date.now() + ${timeoutMs};
  const check = () => {
    const video = document.querySelector("video");
    if (video !== null && video.readyState >= 2) {
      resolve({readyState: video.readyState, src: video.getAttribute("src")});
      return;
    }
    if (Date.now() >= deadline) {
      reject(new Error("electron-media-recovery-initial-player-timeout"));
      return;
    }
    setTimeout(check, 50);
  };
  check();
}))()`;

const run = async () => {
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "axmorf-media-recovery-workspace-"),
  );
  let controller: DesktopShellController | null = null;
  let disposeIpc: (() => void) | null = null;
  let unregisterMedia: (() => void) | null = null;
  let window: Awaited<ReturnType<typeof createDesktopWindow>>["window"] | null =
    null;
  try {
    await mkdir(evidenceRoot, { recursive: true });
    const fixture = await createFixture(workspaceRoot);
    let catalogRefreshCount = 0;
    const media = new DesktopMediaProtocol();
    unregisterMedia = registerDesktopMediaProtocol({ protocol, media });
    controller = new DesktopShellController({
      defaultWorkspaceRoot: workspaceRoot,
      workspace: {
        loadSelectedRoot: async () => workspaceRoot,
        chooseInitialRoot: async () => workspaceRoot,
        persistInitialRoot: async (root) => root,
        chooseMigrationTarget: async () => null,
        migrateRoot: async () => {
          throw new Error("electron-media-recovery-migration-unexpected");
        },
        showInFileManager: async () => undefined,
      },
      settings: {
        get: async () => createDesktopSettingsSnapshot({ privateConfig: null }),
        save: async () => {
          throw new Error("electron-media-recovery-settings-unexpected");
        },
      },
      engine: {
        start: async () => fixture.snapshot,
        refreshPreviewCatalog: async () => {
          catalogRefreshCount += 1;
          return fixture.snapshot;
        },
        buildDelivery: async () => fixture.snapshot,
        deleteProject: async () => fixture.snapshot,
        subscribe: () => () => undefined,
        stop: async () => undefined,
      },
      media,
    });
    const initialState = await controller.bootstrap();
    const initialEntry = initialState.catalog.entries[0]!;
    const shellDocumentUrl = pathToFileURL(
      resolve(".vite/renderer/main_window/index.html"),
    ).href;
    const desktopWindow = await createDesktopWindow({ shellDocumentUrl });
    window = desktopWindow.window;
    disposeIpc = registerDesktopShellIpc({
      ipcMain,
      trustedSenderRules: desktopWindow.trustedSenderRules,
      controller,
    });
    await window.webContents.executeJavaScript(waitForPlayer(), true);
    const rendererProcessBefore = window.webContents.getOSProcessId();

    const inFlightResponse = await media.handleRequest(
      new Request(initialEntry.videoUrl, { headers: { range: "bytes=0-" } }),
    );
    if (inFlightResponse.status !== 206 || inFlightResponse.body === null) {
      throw new Error("electron-media-recovery-range-missing");
    }
    const inFlightLength = Number(
      inFlightResponse.headers.get("content-length"),
    );
    if (!Number.isSafeInteger(inFlightLength) || inFlightLength <= 64 * 1024) {
      throw new Error("electron-media-recovery-range-too-small");
    }
    const reader = inFlightResponse.body.getReader();
    const first = await reader.read();
    if (first.done || first.value === undefined) {
      throw new Error("electron-media-recovery-range-empty");
    }

    const rendererRecovery = (await window.webContents.executeJavaScript(
      rendererRecoveryProbeSource,
      true,
    )) as {
      storyId: string;
      deliveryBuildIdBefore: string;
      deliveryBuildIdAfter: string;
      failedRequestUrl: string;
      failureErrorCode: number | null;
      videoUrlBefore: string;
      videoUrlAfter: string;
      mediaEvents: readonly string[];
      readyState: number;
      playedTime: number;
      playerError: string | null;
      sameRendererProcess: boolean;
    };

    let inFlightBytes = first.value.byteLength;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      inFlightBytes += chunk.value.byteLength;
    }
    const recoveredState = controller.getState();
    const recoveredEntry = recoveredState.catalog.entries[0]!;
    const [oldRequest, newRequest] = await Promise.all([
      media.handleRequest(new Request(initialEntry.videoUrl)),
      media.handleRequest(
        new Request(recoveredEntry.videoUrl, { method: "HEAD" }),
      ),
    ]);
    const rendererProcessAfter = window.webContents.getOSProcessId();
    const checks = {
      appProcessStable: rendererProcessBefore === rendererProcessAfter,
      catalogRefreshNotUsed: catalogRefreshCount === 0,
      deliveryIdentityStable:
        initialEntry.deliveryBuildId === recoveredEntry.deliveryBuildId &&
        rendererRecovery.deliveryBuildIdBefore ===
          rendererRecovery.deliveryBuildIdAfter,
      requestNonceRotated:
        parsePreviewVideoUrl(initialEntry.videoUrl)?.requestNonce !==
        parsePreviewVideoUrl(recoveredEntry.videoUrl)?.requestNonce,
      oldTicketRevoked: oldRequest.status === 404,
      newTicketReady: newRequest.status === 200,
      concurrentRangeCompleted: inFlightBytes === inFlightLength,
      realMediaFailure:
        rendererRecovery.failedRequestUrl !== initialEntry.videoUrl &&
        rendererRecovery.failureErrorCode !== null,
      loadedMetadata: rendererRecovery.mediaEvents.includes("loadedmetadata"),
      canPlay: rendererRecovery.mediaEvents.includes("canplay"),
      playbackAdvanced: rendererRecovery.playedTime > 0,
      playerErrorCleared: rendererRecovery.playerError === null,
    };
    if (Object.values(checks).some((value) => !value)) {
      throw new Error(
        `electron-media-recovery-check-failed:${Object.entries(checks)
          .filter(([, passed]) => !passed)
          .map(([name]) => name)
          .join(",")}`,
      );
    }
    const screenshotPath = join(evidenceRoot, "media-recovery.png");
    const evidencePath = join(evidenceRoot, "media-recovery.json");
    const screenshot = await window.webContents.capturePage();
    await writeFile(screenshotPath, screenshot.toPNG());
    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          contractVersion: "desktop-media-recovery-electron-v1",
          status: "passed",
          host: {
            platform: process.platform,
            architecture: process.arch,
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
          },
          appProcess: {
            mainPid: process.pid,
            rendererPidBefore: rendererProcessBefore,
            rendererPidAfter: rendererProcessAfter,
          },
          identity: {
            storyId: recoveredEntry.storyId,
            deliveryBuildId: recoveredEntry.deliveryBuildId,
            requestNonceBefore: parsePreviewVideoUrl(initialEntry.videoUrl)
              ?.requestNonce,
            requestNonceAfter: parsePreviewVideoUrl(recoveredEntry.videoUrl)
              ?.requestNonce,
          },
          media: {
            events: rendererRecovery.mediaEvents,
            failureErrorCode: rendererRecovery.failureErrorCode,
            readyState: rendererRecovery.readyState,
            playedTime: rendererRecovery.playedTime,
            oldRequestStatus: oldRequest.status,
            newRequestStatus: newRequest.status,
            inFlightBytes,
            inFlightLength,
            fixtureBytes: fixture.bytes.byteLength,
          },
          checks,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    process.stdout.write(
      `${JSON.stringify({
        status: "passed",
        evidencePath,
        screenshotPath,
        checks,
      })}\n`,
    );
  } finally {
    window?.destroy();
    disposeIpc?.();
    if (controller !== null) await controller.shutdown().catch(() => undefined);
    unregisterMedia?.();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
};

void app
  .whenReady()
  .then(run)
  .then(
    () => app.exit(0),
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      app.exit(1);
    },
  );
