import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { App, BrowserWindow } from "electron";

import type { DesktopShellController } from "./shell-controller";
import type { DesktopMediaProtocol } from "./media-protocol";
import { TRUSTED_SHELL_WEB_PREFERENCES } from "../contracts/security-policy";
import type { PrivateConfigCrypto } from "../adapters/private-config-store";
import { buildProducerConfig } from "../../src/contracts";
import { createDesktopPrivateConfig } from "../contracts/settings";
import { createDesktopSettingsSnapshot } from "../application/manage-settings";
import { DesktopDarwinArchitectureSchema } from "../configuration/darwin-target";

const NATIVE_GATE_PRODUCER_CONFIG = buildProducerConfig({
  schemaVersion: 4,
  contractVersion: "producer-config-v4",
  renderDefaults: {
    width: 1080,
    height: 1920,
    fps: 30,
    locale: "zh-CN",
  },
  readability: { edgeInsetPx: 90 },
  sceneDefaults: {
    introSceneTemplateId: "axmorf-brand-reveal-v1",
    outroSceneTemplateId: "axmorf-source-follow-v1",
  },
  audioDefaults: { globalBgm: null },
  publishingCollections: [
    {
      id: "ai-workflow",
      name: "Native gate",
      description: "Gate-only publishing collection without credentials.",
    },
  ],
  tts: {
    defaultProviderId: "native-gate-edge",
    defaultVoiceProfileId: "native-gate-voice",
    speech: { rate: 1, targetLoudnessLufs: -16 },
    providers: [
      {
        id: "native-gate-edge",
        kind: "edge-tts",
        service: "microsoft-edge-read-aloud",
        name: "Native gate schema provider",
        connection: { timeoutMs: 1_000 },
        modelId: "edge-read-aloud",
        voiceProfiles: [
          {
            id: "native-gate-voice",
            name: "Native gate voice",
            voiceId: "zh-CN-XiaoxiaoNeural",
            locale: "zh-CN",
          },
        ],
      },
    ],
  },
});
const NATIVE_GATE_SETTINGS = createDesktopSettingsSnapshot({
  privateConfig: createDesktopPrivateConfig({
    producerConfig: NATIVE_GATE_PRODUCER_CONFIG,
  }),
});

export type NativeSmokeOptions = Readonly<{
  homeRoot: string;
  outputRoot: string;
  selection: "default" | "custom" | "reopen";
  userDataRoot: string;
  workspaceRoot: string;
}>;

export type NativeSmokeStartupStage =
  | "main-loaded"
  | "lifecycle-create-runtime"
  | "recovery-read-start"
  | "recovery-read-complete"
  | "bootstrap-start"
  | "bootstrap-complete"
  | "window-load-start"
  | "window-load-complete"
  | "runtime-created"
  | "lifecycle-ready"
  | "native-smoke-started";

const NATIVE_GATE_CONFIG_KEY = createHash("sha256")
  .update("axmorf-desktop-native-gate-private-config-v1", "utf8")
  .digest();

// The hosted native gate has no credentials and cannot depend on an
// interactive login Keychain prompt. This test-only crypto port still drives
// the real owner-only, atomic Application Support store and is compiled out of
// ordinary packages with the rest of the native harness.
export const createNativeSmokePrivateConfigCrypto = (): PrivateConfigCrypto =>
  ({
    available: () => true,
    encrypt: (plaintext) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", NATIVE_GATE_CONFIG_KEY, iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([
        Buffer.from([1]),
        iv,
        cipher.getAuthTag(),
        encrypted,
      ]);
    },
    decrypt: (ciphertext) => {
      const bytes = Buffer.from(ciphertext);
      if (bytes.byteLength < 29 || bytes[0] !== 1) {
        throw new Error("desktop-native-smoke-private-config-invalid");
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        NATIVE_GATE_CONFIG_KEY,
        bytes.subarray(1, 13),
      );
      decipher.setAuthTag(bytes.subarray(13, 29));
      return Buffer.concat([
        decipher.update(bytes.subarray(29)),
        decipher.final(),
      ]).toString("utf8");
    },
  }) satisfies PrivateConfigCrypto;

export const writeNativeSmokeStartupStage = async ({
  options,
  stage,
}: {
  readonly options: NativeSmokeOptions;
  readonly stage: NativeSmokeStartupStage;
}) => {
  await mkdir(options.outputRoot, { recursive: true });
  await writeFile(
    join(options.outputRoot, "startup-stage.json"),
    `${JSON.stringify({
      exactCommit: process.env.GITHUB_SHA ?? "local-unverified",
      stage,
    })}\n`,
    { mode: 0o600 },
  );
};

export const writeNativeSmokeFailure = async ({
  error,
  options,
}: {
  readonly error: unknown;
  readonly options: NativeSmokeOptions;
}) => {
  await mkdir(options.outputRoot, { recursive: true });
  const raw = error instanceof Error ? error.message : "native-smoke-failed";
  const redacted = [
    options.outputRoot,
    options.workspaceRoot,
    options.userDataRoot,
    options.homeRoot,
  ].reduce(
    (message, privateRoot) => message.replaceAll(privateRoot, "<private-root>"),
    raw,
  );
  await writeFile(
    join(options.outputRoot, "native-failure.json"),
    `${JSON.stringify({ code: "desktop-native-smoke-failed", message: redacted })}\n`,
    { mode: 0o600 },
  );
};

export const writeNativeSmokeEngineDiagnostic = async ({
  code,
  options,
  stderr,
}: {
  readonly code: number;
  readonly options: NativeSmokeOptions;
  readonly stderr: string;
}) => {
  await mkdir(options.outputRoot, { recursive: true });
  const redacted = [
    options.outputRoot,
    options.workspaceRoot,
    options.userDataRoot,
    options.homeRoot,
  ].reduce(
    (message, privateRoot) => message.replaceAll(privateRoot, "<private-root>"),
    stderr.slice(0, 16_384),
  );
  await writeFile(
    join(options.outputRoot, "engine-diagnostic.json"),
    `${JSON.stringify({ code, stderr: redacted })}\n`,
    { mode: 0o600 },
  );
};

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
  if (env.AXMORF_DESKTOP_NATIVE_GATE !== "1") return null;
  if (
    !isPackaged ||
    platform !== "darwin" ||
    !DesktopDarwinArchitectureSchema.safeParse(arch).success
  ) {
    throw new Error("desktop-native-smoke-host-invalid");
  }
  const outputRoot = env.AXMORF_DESKTOP_SMOKE_OUTPUT;
  const homeRoot = env.AXMORF_DESKTOP_SMOKE_HOME;
  const userDataRoot = env.AXMORF_DESKTOP_SMOKE_USER_DATA;
  const workspaceRoot = env.AXMORF_DESKTOP_SMOKE_WORKSPACE;
  const selection = env.AXMORF_DESKTOP_SMOKE_SELECTION;
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

const workspaceSelectionProbeSource = `(() => new Promise(async (resolve, reject) => {
  try {
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const until = async (predicate, label, timeout = 90000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(100);
      }
      throw new Error("renderer-timeout:" + label);
    };
    let state = await window.axmorfStudio.getAppState();
    if (state.status !== "ready") {
      await until(
        () =>
          Array.from(document.querySelectorAll("button")).some((button) =>
            button.textContent?.includes("确认或选择 Workspace"),
          ),
        "workspace-choice",
      );
      const choice = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("确认或选择 Workspace"),
      );
      if (choice === undefined) throw new Error("renderer-workspace-choice-missing");
      choice.click();
    }
    const workspaceDeadline = Date.now() + 90000;
    while (Date.now() < workspaceDeadline) {
      state = await window.axmorfStudio.getAppState();
      if (state.status === "fatal") {
        throw new Error("renderer-workspace-fatal:" + (state.error ?? "unknown"));
      }
      if (state.status === "ready") {
        resolve(true);
        return;
      }
      await sleep(100);
    }
    throw new Error("renderer-timeout:workspace-ready");
  } catch (error) {
    reject(error);
  }
}))()`;

const settingsProbeSource = `(() => new Promise(async (resolve, reject) => {
  try {
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const until = async (predicate, label, timeout = 90000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(100);
      }
      throw new Error("renderer-timeout:" + label);
    };
    const before = await window.axmorfStudio.getSettings();
    const result = await window.axmorfStudio.saveSettings({
      schemaVersion: 1,
      config: ${JSON.stringify(NATIVE_GATE_SETTINGS.config)},
      executionPreferences: before.executionPreferences,
      deliveryPolicy: "manual",
      clearedSecrets: [],
    });
    if (!result.ok) {
      throw new Error("renderer-settings-save-failed:" + result.error.code);
    }
    await until(async () => (await window.axmorfStudio.getAppState()).status === "ready", "settings-engine-restart");
    const after = await window.axmorfStudio.getSettings();
    await until(
      () => Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "配置",
      ),
      "settings-navigation",
    );
    const settingsButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "配置",
    );
    if (settingsButton === undefined) throw new Error("renderer-settings-navigation-missing");
    settingsButton.click();
    await until(() => document.querySelector(".desktop-settings") !== null, "settings-page");
    const providerButton = Array.from(document.querySelectorAll(".settings-navigation button")).find(
      (button) => button.textContent?.includes("Provider 与声线"),
    );
    if (providerButton === undefined) throw new Error("renderer-provider-form-navigation-missing");
    providerButton.click();
    await until(
      () => Array.from(document.querySelectorAll(".config-section h2")).some((heading) => heading.textContent?.includes("TTS 默认策略")),
      "provider-form",
    );
    const text = document.body.textContent ?? "";
    resolve({
      initialStatus: before.status,
      savedStatus: after.status,
      providerId: after.config.tts.defaultProviderId,
      providerFormVisible: text.includes("TTS 默认策略") && text.includes("Native gate schema provider"),
      rawJsonEditorAbsent: !text.includes("完整 ProducerConfig JSON") && !text.includes("providerConfigJson"),
      secretValuesAbsent: !text.includes("local-private-token") && !text.includes("cloud-private-key"),
      encryptedAuthorityVisible: text.includes("macOS encrypted private config"),
    });
  } catch (error) {
    reject(error);
  }
}))()`;

const returnToPreviewProbeSource = `(() => new Promise(async (resolve, reject) => {
  try {
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const deadline = Date.now() + 90000;
    const preview = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Preview",
    );
    if (preview === undefined) throw new Error("renderer-preview-navigation-missing");
    preview.click();
    while (Date.now() < deadline) {
      if (document.querySelector(".edit-suite") !== null) {
        resolve(true);
        return;
      }
      await sleep(100);
    }
    throw new Error("renderer-timeout:preview-page");
  } catch (error) {
    reject(error);
  }
}))()`;

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
    if (playbackRequired) {
      probeStage = "selection";
      selectionControl.value = stateBeforeSelection.catalog.entries[0].storyId;
      selectionControl.dispatchEvent(new Event("change", {bubbles: true}));
      await sleep(100);
    }
    const state = await window.axmorfStudio.getAppState();
    if (state.status !== "ready" || state.catalog.entries.length !== 1) {
      throw new Error("renderer-catalog-selection-failed");
    }
    // Selection refreshes the signed media ticket and intentionally remounts
    // the player. Probe the current node, never the detached pre-selection one.
    const video = document.querySelector("video");
    if (video === null) throw new Error("renderer-video-after-selection-missing");
    let probeStage = "initial-load";
    const mediaErrors = [];
    video.addEventListener("error", () => {
      mediaErrors.push({
        stage: probeStage,
        code: video.error?.code ?? null,
        message: video.error?.message ?? null,
        networkState: video.networkState,
        readyState: video.readyState,
      });
    });
    probeStage = "metadata";
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
        () => !video.seeking && video.readyState >= 2,
        "seeked-data-" + clamped,
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
    const lastScene = selected.timeline.scenes[selected.timeline.scenes.length - 1];
    if (lastScene === undefined) {
      throw new Error("renderer-timeline-scenes-missing");
    }
    let positions = null;
    let playedTime = null;
    if (playbackRequired) {
      probeStage = "playback";
      const playbackStartTime = video.currentTime;
      let playbackRejection = null;
      void video.play().catch((error) => {
        playbackRejection = error instanceof Error ? error.name : "playback-rejected";
      });
      await until(
        () => video.currentTime > playbackStartTime + 0.05 || playbackRejection !== null,
        "video-play",
        30000,
      );
      if (playbackRejection !== null) {
        throw new Error("renderer-video-play-rejected:" + playbackRejection);
      }
      playedTime = video.currentTime;
      video.pause();
      probeStage = "seek";
      positions = {
        first: await seek(0),
        firstSceneStart: await seek(selected.timeline.scenes[0].startFrame),
        boundary: await seek(boundary),
        lastSceneFrame: await seek(lastScene.endFrame - 1),
        last: await seek(selected.frameCount - 1),
      };
      await seek(boundary);
    }
    let popupDenied = null;
    let externalNavigationDenied = null;
    let permissionState = null;
    if (playbackRequired) {
      probeStage = "popup";
      popupDenied = window.open("https://example.com/phase-b-popup") === null;
      probeStage = "navigation";
      const beforeNavigation = location.href;
      const navigation = document.createElement("a");
      navigation.href = "https://example.com/phase-b-navigation";
      navigation.textContent = "blocked navigation";
      document.body.append(navigation);
      navigation.click();
      await sleep(250);
      externalNavigationDenied = location.href === beforeNavigation;
      probeStage = "download";
      const download = document.createElement("a");
      download.href = "data:text/plain,blocked";
      download.download = "phase-b-download.txt";
      document.body.append(download);
      download.click();
      await sleep(250);
      probeStage = "permission";
      try {
        permissionState = (await navigator.permissions.query({name: "geolocation"})).state;
      } catch {
        permissionState = "rejected";
      }
    }
    probeStage = "settle";
    await sleep(500);
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
        errorCode: video.error?.code ?? null,
        errorMessage: video.error?.message ?? null,
        mediaErrors,
        playerError: document.querySelector(".player-error")?.textContent ?? null,
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
        securityTested: playbackRequired,
        nodeGlobalsAbsent: ["require", "process", "Buffer", "module"].every((name) => typeof window[name] === "undefined"),
        popupDenied,
        externalNavigationDenied,
        permissionState,
      },
    });
  } catch (error) {
    reject(error);
  }
}))()`;

const fileExists = async (path: string) => {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

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
    await window.webContents.executeJavaScript(
      workspaceSelectionProbeSource,
      true,
    );
    const settings = (await window.webContents.executeJavaScript(
      settingsProbeSource,
      true,
    )) as {
      initialStatus: string;
      savedStatus: string;
      providerId: string;
      providerFormVisible: boolean;
      rawJsonEditorAbsent: boolean;
      secretValuesAbsent: boolean;
      encryptedAuthorityVisible: boolean;
    };
    if (
      settings.savedStatus !== "ready" ||
      settings.providerId !== "native-gate-edge" ||
      !settings.providerFormVisible ||
      !settings.rawJsonEditorAbsent ||
      !settings.secretValuesAbsent ||
      !settings.encryptedAuthorityVisible
    ) {
      throw new Error("desktop-native-smoke-settings-gate-failed");
    }
    const settingsScreenshot = await window.webContents.capturePage();
    await writeFile(
      join(options.outputRoot, "desktop-settings.png"),
      settingsScreenshot.toPNG(),
    );
    await writeFile(
      join(options.outputRoot, "settings-probe.json"),
      `${JSON.stringify({
        exactCommit: process.env.GITHUB_SHA ?? "local-unverified",
        settings,
      }, null, 2)}\n`,
      { mode: 0o600 },
    );
    await window.webContents.executeJavaScript(returnToPreviewProbeSource, true);
    await writeFile(join(options.outputRoot, "app-ready"), "ready\n", {
      mode: 0o600,
    });
    await waitFor(
      () => fileExists(join(options.outputRoot, "delivery-ready")),
      "runner-delivery",
      3_600_000,
    );
    await controller.refreshPreviewCatalog();
    const renderer = (await window.webContents.executeJavaScript(
      rendererProbeSource(true),
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
        errorCode: number | null;
        errorMessage: string | null;
        mediaErrors: ReadonlyArray<{
          stage: string;
          code: number | null;
          message: string | null;
          networkState: number;
          readyState: number;
        }>;
        playerError: string | null;
        playbackRequired: boolean;
        playedTime: number | null;
        positions: null | {
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
        securityTested: boolean;
        nodeGlobalsAbsent: boolean;
        popupDenied: boolean | null;
        externalNavigationDenied: boolean | null;
        permissionState: string | null;
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
    requireRenderer(renderer.state.productionAvailable, "desktop-production");
    requireRenderer(renderer.state.deliveryAvailable, "desktop-delivery");
    requireRenderer(!renderer.state.distributionReady, "desktop-distribution");
    requireRenderer(
      renderer.state.runtimePackAvailable,
      "desktop-runtime-pack",
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
    requireRenderer(renderer.media.errorCode === null, "media-error");
    requireRenderer(renderer.media.playerError === null, "player-error");
    requireRenderer(renderer.media.playbackRequired, "playback-requirement");
    requireRenderer(
      renderer.media.playedTime !== null && renderer.media.playedTime > 0,
      "playback-result",
    );
    requireRenderer(renderer.media.positions !== null, "seek-requirement");
    requireRenderer(
      renderer.timeline.sceneCount === 4,
      `scene-track:${renderer.timeline.sceneCount}:expected-4`,
    );
    requireRenderer(
      renderer.timeline.narrationCount === 3,
      `narration-track:${renderer.timeline.narrationCount}:expected-3`,
    );
    requireRenderer(
      renderer.timeline.captionCount === 2,
      `caption-track:${renderer.timeline.captionCount}:expected-2`,
    );
    if (renderer.media.positions !== null) {
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
    }
    requireRenderer(renderer.security.nodeGlobalsAbsent, "node-api");
    requireRenderer(renderer.security.securityTested, "security-requirement");
    if (renderer.security.securityTested) {
      requireRenderer(renderer.security.popupDenied === true, "popup");
      requireRenderer(
        renderer.security.externalNavigationDenied === true,
        "external-navigation",
      );
      requireRenderer(
        renderer.security.permissionState === "denied",
        "permission",
      );
    } else {
      requireRenderer(renderer.security.popupDenied === null, "popup-skipped");
      requireRenderer(
        renderer.security.externalNavigationDenied === null,
        "external-navigation-skipped",
      );
      requireRenderer(
        renderer.security.permissionState === null,
        "permission-skipped",
      );
    }
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
      contractVersion: "desktop-native-evidence-v2",
      status: "native-delivery-and-preview-verified",
      sourceCurrent: true,
      deliveryBuilt: true,
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
      settings,
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
    await waitFor(
      async () =>
        (await fileExists(join(options.outputRoot, "continue"))) ||
        (await fileExists(join(options.outputRoot, "request-quit"))),
      "runner-directive",
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
    if (await fileExists(join(options.outputRoot, "request-quit"))) {
      await writeFile(
        join(options.outputRoot, "quit-request-observed"),
        "observed\n",
        { mode: 0o600 },
      );
      app.quit();
      return;
    }
    app.quit();
  } catch (error) {
    await writeNativeSmokeFailure({ error, options });
    await controller.shutdown().catch(() => undefined);
    app.exit(1);
  }
};
