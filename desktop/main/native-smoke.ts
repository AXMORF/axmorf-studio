import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { App, BrowserWindow } from "electron";

import type { DesktopShellController } from "./shell-controller";
import type { DesktopMediaProtocol } from "./media-protocol";
import { TRUSTED_SHELL_WEB_PREFERENCES } from "../contracts/security-policy";

export type NativeSmokeOptions = Readonly<{
  homeRoot: string;
  outputRoot: string;
  selection: "default" | "custom" | "reopen";
  userDataRoot: string;
  workspaceRoot: string;
}>;

export const resolveNativeSmokeOptions = ({
  isPackaged,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
}: {
  readonly isPackaged: boolean;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  readonly env?: NodeJS.ProcessEnv;
}): NativeSmokeOptions | null => {
  if (env.AXMORF_PHASE_A_NATIVE_GATE !== "1") return null;
  if (!isPackaged || platform !== "darwin" || arch !== "arm64") {
    throw new Error("desktop-native-smoke-host-invalid");
  }
  const outputRoot = env.AXMORF_PHASE_A_SMOKE_OUTPUT;
  const homeRoot = env.AXMORF_PHASE_A_SMOKE_HOME;
  const userDataRoot = env.AXMORF_PHASE_A_SMOKE_USER_DATA;
  const workspaceRoot = env.AXMORF_PHASE_A_SMOKE_WORKSPACE;
  const selection = env.AXMORF_PHASE_A_SMOKE_SELECTION;
  if (
    homeRoot === undefined ||
    homeRoot === "" ||
    outputRoot === undefined ||
    outputRoot === "" ||
    userDataRoot === undefined ||
    userDataRoot === "" ||
    workspaceRoot === undefined ||
    workspaceRoot === "" ||
    (selection !== "default" &&
      selection !== "custom" &&
      selection !== "reopen")
  ) {
    throw new Error("desktop-native-smoke-paths-required");
  }
  return {
    homeRoot,
    outputRoot,
    selection,
    userDataRoot,
    workspaceRoot,
  };
};

const waitFor = async (
  predicate: () => Promise<boolean> | boolean,
  label: string,
  timeoutMs = 90_000,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`desktop-native-smoke-timeout:${label}`);
};

const responseSummary = async (response: Response) => ({
  status: response.status,
  contentLength: response.headers.get("content-length"),
  contentRange: response.headers.get("content-range"),
  acceptRanges: response.headers.get("accept-ranges"),
  bodyBytes:
    response.body === null ? 0 : (await response.arrayBuffer()).byteLength,
});

const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;

const rendererProbeSource = (playbackRequired: boolean) =>
  `(() => new Promise(async (resolve, reject) => {
  try {
    const playbackRequired = ${playbackRequired ? "true" : "false"};
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const until = async (predicate, label, timeout = 90000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(100);
      }
      throw new Error("renderer-timeout:" + label);
    };
    await until(
      () =>
        document.querySelector("video") !== null ||
        Array.from(document.querySelectorAll("button")).some((button) =>
          button.textContent?.includes("确认或选择 Workspace"),
        ),
      "workspace-choice",
    );
    if (document.querySelector("video") === null) {
      const choice = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("确认或选择 Workspace"),
      );
      if (choice === undefined) throw new Error("renderer-workspace-choice-missing");
      choice.click();
    }
    await until(() => document.querySelector("video") !== null, "video-element");
    const selectionControl = document.querySelector("select");
    if (selectionControl === null) throw new Error("renderer-preview-selection-missing");
    const stateBeforeSelection = await window.axmorfStudio.getAppState();
    if (
      stateBeforeSelection.status !== "ready" ||
      stateBeforeSelection.catalog.entries.length !== 1
    ) {
      throw new Error("renderer-catalog-not-ready");
    }
    selectionControl.value = stateBeforeSelection.catalog.entries[0].storyId;
    selectionControl.dispatchEvent(new Event("change", {bubbles: true}));
    await sleep(100);
    const state = await window.axmorfStudio.getAppState();
    if (state.status !== "ready" || state.catalog.entries.length !== 1) {
      throw new Error("renderer-catalog-selection-failed");
    }
    const video = document.querySelector("video");
    await until(() => video.readyState >= 1 && Number.isFinite(video.duration), "video-metadata");
    const selected = state.catalog.entries[0];
    const seek = async (frame) => {
      const clamped = Math.min(selected.frameCount - 1, Math.max(0, frame));
      const target = (clamped + 0.25) / selected.fps;
      video.currentTime = target;
      await until(
        () => Math.abs(video.currentTime - target) < 0.15,
        "seek-" + clamped,
      );
      await until(
        () =>
          (
            document.querySelector('[aria-label="当前播放位置"]')
              ?.textContent ?? ""
          ).includes("F" + clamped + " /"),
        "playhead-" + clamped,
      );
      return {
        currentTime: video.currentTime,
        playhead: document.querySelector('[aria-label="当前播放位置"]')?.textContent ?? "",
        activeScene: document.querySelector(".scene-segment.active")?.textContent ?? null,
      };
    };
    const boundary = selected.timeline.scenes[1].startFrame;
    const positions = {
      first: await seek(0),
      firstSceneStart: await seek(selected.timeline.scenes[0].startFrame),
      boundary: await seek(boundary),
      lastSceneFrame: await seek(selected.timeline.scenes[1].endFrame - 1),
      last: await seek(selected.frameCount - 1),
    };
    await seek(0);
    let playedTime = null;
    if (playbackRequired) {
      await Promise.race([
        video.play(),
        new Promise((_, rejectPlayback) =>
          setTimeout(
            () => rejectPlayback(new Error("renderer-timeout:video-play")),
            30000,
          ),
        ),
      ]);
      await sleep(800);
      playedTime = video.currentTime;
      video.pause();
    }
    const popup = window.open("https://example.com/phase-a-popup");
    const beforeNavigation = location.href;
    const navigation = document.createElement("a");
    navigation.href = "https://example.com/phase-a-navigation";
    navigation.textContent = "blocked navigation";
    document.body.append(navigation);
    navigation.click();
    await sleep(250);
    const download = document.createElement("a");
    download.href = "data:text/plain,blocked";
    download.download = "phase-a-download.txt";
    document.body.append(download);
    download.click();
    await sleep(250);
    let permissionState = "unavailable";
    try {
      permissionState = (await navigator.permissions.query({name: "geolocation"})).state;
    } catch {
      permissionState = "rejected";
    }
    resolve({
      state: {
        status: state.status,
        selectedStoryId: state.selectedStoryId,
        selectionControlValue: selectionControl.value,
        entryCount: state.catalog.entries.length,
        productionAvailable: state.productionAvailable,
        deliveryAvailable: state.deliveryAvailable,
        distributionReady: state.distributionReady,
        runtimePackAvailable: state.runtimePackAvailable,
      },
      media: {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        playbackRequired,
        playedTime,
        positions,
      },
      timeline: {
        sceneCount: document.querySelectorAll(".scene-segment").length,
        narrationCount: document.querySelectorAll(".narration-segment").length,
        captionCount: document.querySelectorAll(".caption-segment").length,
        boundaryFrame: boundary,
      },
      security: {
        nodeGlobalsAbsent: ["require", "process", "Buffer", "module"].every((name) => typeof window[name] === "undefined"),
        popupDenied: popup === null,
        externalNavigationDenied: location.href === beforeNavigation,
        permissionState,
      },
    });
  } catch (error) {
    reject(error);
  }
}))()`;

export const runPackagedNativeSmoke = async ({
  app,
  window,
  controller,
  media,
  options,
}: {
  readonly app: App;
  readonly window: BrowserWindow;
  readonly controller: DesktopShellController;
  readonly media: DesktopMediaProtocol;
  readonly options: NativeSmokeOptions;
}) => {
  await mkdir(options.outputRoot, { recursive: true });
  let downloadAttempted = false;
  let secondInstanceFocused = false;
  window.webContents.session.once("will-download", () => {
    downloadAttempted = true;
  });
  try {
    await waitFor(
      () => !window.webContents.isLoadingMainFrame(),
      "renderer-load",
    );
    const renderer = (await window.webContents.executeJavaScript(
      rendererProbeSource(options.selection === "default"),
      true,
    )) as {
      state: {
        status: string;
        selectedStoryId: string | null;
        selectionControlValue: string;
        entryCount: number;
        productionAvailable: boolean;
        deliveryAvailable: boolean;
        distributionReady: boolean;
        runtimePackAvailable: boolean;
      };
      media: {
        readyState: number;
        videoWidth: number;
        videoHeight: number;
        duration: number;
        playbackRequired: boolean;
        playedTime: number | null;
        positions: {
          first: {
            currentTime: number;
            playhead: string;
            activeScene: string | null;
          };
          firstSceneStart: {
            currentTime: number;
            playhead: string;
            activeScene: string | null;
          };
          boundary: {
            currentTime: number;
            playhead: string;
            activeScene: string | null;
          };
          lastSceneFrame: {
            currentTime: number;
            playhead: string;
            activeScene: string | null;
          };
          last: {
            currentTime: number;
            playhead: string;
            activeScene: string | null;
          };
        };
      };
      timeline: {
        sceneCount: number;
        narrationCount: number;
        captionCount: number;
        boundaryFrame: number;
      };
      security: {
        nodeGlobalsAbsent: boolean;
        popupDenied: boolean;
        externalNavigationDenied: boolean;
        permissionState: string;
      };
    };
    if (!downloadAttempted) {
      window.webContents.downloadURL("data:text/plain,blocked-native-download");
    }
    await waitFor(() => downloadAttempted, "download-policy");
    const state = controller.getState();
    if (state.status !== "ready" || state.catalog.entries.length !== 1) {
      throw new Error("desktop-native-smoke-state-invalid");
    }
    const entry = state.catalog.entries[0]!;
    const rendererGateFailures: string[] = [];
    const requireRenderer = (condition: boolean, label: string) => {
      if (!condition) rendererGateFailures.push(label);
    };
    requireRenderer(renderer.state.status === "ready", "state-status");
    requireRenderer(
      renderer.state.selectedStoryId === entry.storyId,
      "selected-story",
    );
    requireRenderer(
      renderer.state.selectionControlValue === entry.storyId,
      "selection-control",
    );
    requireRenderer(renderer.state.entryCount === 1, "entry-count");
    requireRenderer(!renderer.state.productionAvailable, "phase-b-production");
    requireRenderer(!renderer.state.deliveryAvailable, "phase-b-delivery");
    requireRenderer(!renderer.state.distributionReady, "phase-b-distribution");
    requireRenderer(
      !renderer.state.runtimePackAvailable,
      "phase-b-runtime-pack",
    );
    requireRenderer(
      renderer.media.readyState >=
        (renderer.media.playbackRequired ? HAVE_CURRENT_DATA : HAVE_METADATA),
      "media-ready-state",
    );
    requireRenderer(renderer.media.videoWidth === entry.width, "media-width");
    requireRenderer(
      renderer.media.videoHeight === entry.height,
      "media-height",
    );
    requireRenderer(
      renderer.media.playbackRequired === (options.selection === "default"),
      "playback-requirement",
    );
    requireRenderer(
      options.selection === "default"
        ? renderer.media.playedTime !== null && renderer.media.playedTime > 0
        : renderer.media.playedTime === null,
      "playback-result",
    );
    requireRenderer(renderer.timeline.sceneCount === 2, "scene-track");
    requireRenderer(renderer.timeline.narrationCount === 3, "narration-track");
    requireRenderer(renderer.timeline.captionCount === 2, "caption-track");
    requireRenderer(
      renderer.media.positions.first.activeScene === null,
      "leading-pause",
    );
    requireRenderer(
      renderer.media.positions.firstSceneStart.activeScene !== null,
      "first-scene-start",
    );
    requireRenderer(
      renderer.media.positions.boundary.activeScene !== null,
      "scene-boundary",
    );
    requireRenderer(
      renderer.media.positions.firstSceneStart.activeScene !==
        renderer.media.positions.boundary.activeScene,
      "scene-boundary-transition",
    );
    requireRenderer(
      renderer.media.positions.lastSceneFrame.activeScene !== null,
      "last-scene-frame",
    );
    requireRenderer(
      renderer.media.positions.last.activeScene === null,
      "trailing-pause",
    );
    requireRenderer(renderer.security.nodeGlobalsAbsent, "node-api");
    requireRenderer(renderer.security.popupDenied, "popup");
    requireRenderer(
      renderer.security.externalNavigationDenied,
      "external-navigation",
    );
    requireRenderer(
      renderer.security.permissionState === "denied",
      "permission",
    );
    await writeFile(
      join(options.outputRoot, "renderer-probe.json"),
      `${JSON.stringify(
        {
          exactCommit: process.env.GITHUB_SHA ?? "local-unverified",
          capturedAt: new Date().toISOString(),
          selection: options.selection,
          renderer,
          gateFailures: rendererGateFailures,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    if (rendererGateFailures.length > 0) {
      throw new Error(
        `desktop-native-smoke-renderer-gate-failed:${rendererGateFailures.join(",")}`,
      );
    }
    const url = entry.videoUrl;
    const [head, openRange, suffixRange, invalidRange, multiRange] =
      await Promise.all([
        media.handleRequest(new Request(url, { method: "HEAD" })),
        media.handleRequest(
          new Request(url, { headers: { range: "bytes=0-127" } }),
        ),
        media.handleRequest(
          new Request(url, { headers: { range: "bytes=-128" } }),
        ),
        media.handleRequest(
          new Request(url, { headers: { range: "bytes=999999999-" } }),
        ),
        media.handleRequest(
          new Request(url, { headers: { range: "bytes=0-1,3-4" } }),
        ),
      ]);
    const invalidUrls = {
      arbitraryPath: await media.handleRequest(
        new Request(`${url}/../../private/token`),
      ),
      staleBuild: await media.handleRequest(
        new Request(
          url.replace(entry.deliveryBuildId, `delivery-${"0".repeat(64)}`),
        ),
      ),
      query: await media.handleRequest(new Request(`${url}?path=/tmp/private`)),
      hash: await media.handleRequest(new Request(`${url}#private`)),
      method: await media.handleRequest(new Request(url, { method: "POST" })),
    };
    const summaries = {
      head: await responseSummary(head),
      openRange: await responseSummary(openRange),
      suffixRange: await responseSummary(suffixRange),
      invalidRange: await responseSummary(invalidRange),
      multiRange: await responseSummary(multiRange),
    };
    if (
      summaries.head.status !== 200 ||
      summaries.head.bodyBytes !== 0 ||
      summaries.openRange.status !== 206 ||
      summaries.openRange.bodyBytes !== 128 ||
      summaries.suffixRange.status !== 206 ||
      summaries.suffixRange.bodyBytes !== 128 ||
      summaries.invalidRange.status !== 416 ||
      summaries.multiRange.status !== 416 ||
      invalidUrls.arbitraryPath.status !== 404 ||
      invalidUrls.staleBuild.status !== 404 ||
      invalidUrls.query.status !== 404 ||
      invalidUrls.hash.status !== 404 ||
      invalidUrls.method.status !== 405
    ) {
      throw new Error("desktop-native-smoke-media-gate-failed");
    }
    const screenshot = await window.webContents.capturePage();
    await writeFile(
      join(options.outputRoot, "preview-player.png"),
      screenshot.toPNG(),
    );
    const report = {
      schemaVersion: 1,
      contractVersion: "desktop-phase-a-native-evidence-v1",
      exactCommit: process.env.GITHUB_SHA ?? "local-unverified",
      capturedAt: new Date().toISOString(),
      selection: options.selection,
      host: {
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
      },
      renderer,
      mediaProtocol: {
        ...summaries,
        arbitraryPathStatus: invalidUrls.arbitraryPath.status,
        staleBuildStatus: invalidUrls.staleBuild.status,
        queryStatus: invalidUrls.query.status,
        hashStatus: invalidUrls.hash.status,
        methodStatus: invalidUrls.method.status,
      },
      security: {
        downloadDenied: downloadAttempted,
        expectedWebPreferences: TRUSTED_SHELL_WEB_PREFERENCES,
      },
    };
    await writeFile(
      join(options.outputRoot, "native-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
    window.once("focus", () => {
      secondInstanceFocused = true;
    });
    window.hide();
    await writeFile(join(options.outputRoot, "app-ready"), "ready\n", {
      mode: 0o600,
    });
    await waitFor(
      async () => {
        try {
          await readFile(join(options.outputRoot, "continue"));
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw error;
        }
      },
      "runner-continue",
      300_000,
    );
    await writeFile(
      join(options.outputRoot, "lifecycle.json"),
      `${JSON.stringify({
        secondInstanceFocused,
        windowVisibleAfterSecondInstance: window.isVisible(),
      })}\n`,
      { mode: 0o600 },
    );
    app.quit();
  } catch (error) {
    const raw = error instanceof Error ? error.message : "native-smoke-failed";
    const redacted = raw
      .replaceAll(options.outputRoot, "<evidence-root>")
      .replaceAll(options.workspaceRoot, "<workspace-root>");
    await writeFile(
      join(options.outputRoot, "native-failure.json"),
      `${JSON.stringify({ code: "desktop-native-smoke-failed", message: redacted })}\n`,
      { mode: 0o600 },
    );
    await controller.shutdown().catch(() => undefined);
    app.exit(1);
  }
};
