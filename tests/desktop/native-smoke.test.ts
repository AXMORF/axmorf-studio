import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { getDesktopDarwinTarget } from "../../desktop/configuration/darwin-target";
import {
  createNativeSmokePrivateConfigCrypto,
  resolveNativeSmokeOptions,
  writeNativeSmokeFailure,
  writeNativeSmokeEngineDiagnostic,
  writeNativeSmokeStartupStage,
} from "../../desktop/main/native-smoke";
import {
  NarrationPreparationReceiptSchema,
  NarrationSpecSchema,
  ProjectCreateInputSchema,
  RenderSpecSchema,
  serializeCanonicalJson,
} from "../../src/contracts";
import { prepareDesktopNativeTestNarration } from "../../scripts/desktop/native-test-provider";
import { recordWorkspaceCommandFailure } from "../../scripts/desktop/native-command-diagnostic";
import { resolveProducerNarrationInspection } from "../../scripts/config/narration-execution";
import { resolveNarrationMediaLogicalPath } from "../../scripts/narration/production-paths";
import {
  createRuntimeExecutionResources,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import { createDesktopNativeProjectInput } from "../../scripts/desktop/native-fixture";
import { desktopProducerConfigFixture } from "./producer-config-fixture";

const require = createRequire(import.meta.url);

const resolveTestCompositorRoot = () =>
  dirname(
    require.resolve(
      process.platform === "darwin"
        ? getDesktopDarwinTarget(process.arch).compositorPackageJson
        : "@remotion/compositor-linux-x64-gnu/package.json",
    ),
  );

test("native fixture starts at the public project-create boundary", () => {
  const input = ProjectCreateInputSchema.parse(
    createDesktopNativeProjectInput(),
  );
  assert.equal(input.storyId, "desktop-native-fixture");
  assert.equal(input.story.beats.length, 2);
  assert.equal(input.sceneTemplates, undefined);
});

test("native test provider writes the source-local narration preparation receipt", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "desktop-native-provider-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workspaceRoot = join(root, "workspace");
  const applicationSupportRoot = join(root, "support");
  const runtimeResources = join(root, "runtime");
  const cacheRoot = join(root, "cache");
  const locations = createWorkspaceProductionLocations({
    workspaceRoot,
    applicationSupportRoot,
    runtimeResources,
    cacheRoot,
  });
  const input = ProjectCreateInputSchema.parse(
    createDesktopNativeProjectInput(),
  );
  const config = desktopProducerConfigFixture;
  const narration = NarrationSpecSchema.parse({
    schemaVersion: 2,
    voiceProfileId: config.tts.defaultVoiceProfileId,
    mode: "voice-clone",
  });
  const render = RenderSpecSchema.parse({
    schemaVersion: 1,
    compositionId: input.render.compositionId,
    leadInFrames: input.render.leadInFrames,
    tailFrames: input.render.tailFrames,
    ...config.renderDefaults,
    output: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels: input.render.audioChannels,
    },
  });
  const sourceRoot = join(locations.projectSourceRoot, input.storyId);
  await Promise.all([
    mkdir(sourceRoot, { recursive: true }),
    mkdir(join(locations.projectMediaRoot, input.storyId), { recursive: true }),
    mkdir(applicationSupportRoot, { recursive: true }),
    mkdir(runtimeResources, { recursive: true }),
    mkdir(cacheRoot, { recursive: true }),
  ]);
  await Promise.all(
    [
      ["story.json", input.story],
      ["narration.json", narration],
      ["render.json", render],
    ].map(([name, value]) =>
      writeFile(
        join(sourceRoot, String(name)),
        `${serializeCanonicalJson(value)}\n`,
      ),
    ),
  );

  const prepared = await prepareDesktopNativeTestNarration({
    locations,
    runtime: createRuntimeExecutionResources({
      rendererRuntimeFingerprint: `sha256:${"1".repeat(64)}`,
      browserExecutable: join(runtimeResources, "browser"),
      binariesDirectory: resolveTestCompositorRoot(),
      ffmpegExecutable: join(resolveTestCompositorRoot(), "ffmpeg"),
      ffprobeExecutable: join(resolveTestCompositorRoot(), "ffprobe"),
    }),
    config,
    projectId: input.storyId,
  });
  const receipt = NarrationPreparationReceiptSchema.parse(
    JSON.parse(
      await readFile(
        join(sourceRoot, "generated/narration-preparation.generated.json"),
        "utf8",
      ),
    ),
  );
  assert.equal(
    receipt.generationInputFingerprint,
    prepared.sealedNarration.generationInputFingerprint,
  );
  assert.equal(
    receipt.providerAttemptFingerprint,
    prepared.providerAttemptFingerprint,
  );
  const inspection = await resolveProducerNarrationInspection({
    config,
    privateConfigRoot: locations.providerMaterialRoot,
    narration,
  });
  assert.equal(
    prepared.providerAttemptFingerprint,
    inspection.providerAttemptFingerprint,
  );
  assert.equal(
    receipt.sealedNarrationFingerprint,
    prepared.sealedNarration.sealedNarrationFingerprint,
  );
  assert.deepEqual(receipt.masteringPolicy, prepared.masteringPolicy);
  assert.deepEqual(
    await readFile(
      resolveNarrationMediaLogicalPath({
        locations,
        storyId: input.storyId,
        logicalPath: prepared.masteredNarration.outputAudio.localPath,
      }),
    ),
    prepared.masteredAudioBytes,
  );
  await assert.rejects(
    readFile(
      join(
        locations.projectMediaRoot,
        input.storyId,
        "narration-mastered/complete.wav",
      ),
    ),
  );
});

test("native smoke activation is packaged native macOS only for either supported architecture", () => {
  assert.equal(
    resolveNativeSmokeOptions({
      isPackaged: true,
      platform: "darwin",
      arch: "arm64",
      env: {},
    }),
    null,
  );
  assert.deepEqual(
    resolveNativeSmokeOptions({
      isPackaged: true,
      platform: "darwin",
      arch: "arm64",
      env: {
        AXMORF_DESKTOP_NATIVE_GATE: "1",
        AXMORF_DESKTOP_SMOKE_HOME: "/tmp/home",
        AXMORF_DESKTOP_SMOKE_OUTPUT: "/tmp/evidence",
        AXMORF_DESKTOP_SMOKE_SELECTION: "custom",
        AXMORF_DESKTOP_SMOKE_USER_DATA: "/tmp/user-data",
        AXMORF_DESKTOP_SMOKE_WORKSPACE: "/tmp/workspace",
      },
    }),
    {
      homeRoot: "/tmp/home",
      outputRoot: "/tmp/evidence",
      selection: "custom",
      userDataRoot: "/tmp/user-data",
      workspaceRoot: "/tmp/workspace",
    },
  );
  assert.deepEqual(
    resolveNativeSmokeOptions({
      isPackaged: true,
      platform: "darwin",
      arch: "x64",
      env: {
        AXMORF_DESKTOP_NATIVE_GATE: "1",
        AXMORF_DESKTOP_SMOKE_HOME: "/tmp/home",
        AXMORF_DESKTOP_SMOKE_OUTPUT: "/tmp/evidence",
        AXMORF_DESKTOP_SMOKE_SELECTION: "custom",
        AXMORF_DESKTOP_SMOKE_USER_DATA: "/tmp/user-data",
        AXMORF_DESKTOP_SMOKE_WORKSPACE: "/tmp/workspace",
      },
    }),
    {
      homeRoot: "/tmp/home",
      outputRoot: "/tmp/evidence",
      selection: "custom",
      userDataRoot: "/tmp/user-data",
      workspaceRoot: "/tmp/workspace",
    },
  );
  for (const input of [
    { isPackaged: false, platform: "darwin" as const, arch: "arm64" },
    { isPackaged: true, platform: "linux" as const, arch: "arm64" },
    { isPackaged: true, platform: "darwin" as const, arch: "ia32" },
  ]) {
    assert.throws(
      () =>
        resolveNativeSmokeOptions({
          ...input,
          env: {
            AXMORF_DESKTOP_NATIVE_GATE: "1",
            AXMORF_DESKTOP_SMOKE_HOME: "/tmp/home",
            AXMORF_DESKTOP_SMOKE_OUTPUT: "/tmp/evidence",
            AXMORF_DESKTOP_SMOKE_SELECTION: "custom",
            AXMORF_DESKTOP_SMOKE_USER_DATA: "/tmp/user-data",
            AXMORF_DESKTOP_SMOKE_WORKSPACE: "/tmp/workspace",
          },
        }),
      /desktop-native-smoke-host-invalid/u,
    );
  }
});

test("native smoke records redacted failures before runtime bootstrap", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-native-failure-"));
  const options = {
    homeRoot: join(root, "home"),
    outputRoot: join(root, "evidence"),
    selection: "custom" as const,
    userDataRoot: join(root, "user-data"),
    workspaceRoot: join(root, "workspace"),
  };
  try {
    await writeNativeSmokeFailure({
      error: new Error(`bootstrap failed in ${options.workspaceRoot}`),
      options,
    });
    const failure = await readFile(
      join(options.outputRoot, "native-failure.json"),
      "utf8",
    );
    assert.deepEqual(JSON.parse(failure), {
      code: "desktop-native-smoke-failed",
      message: "bootstrap failed in <private-root>",
    });
    assert.doesNotMatch(failure, new RegExp(root, "u"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native smoke records the last packaged startup stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-native-stage-"));
  const options = {
    homeRoot: join(root, "home"),
    outputRoot: join(root, "evidence"),
    selection: "custom" as const,
    userDataRoot: join(root, "user-data"),
    workspaceRoot: join(root, "workspace"),
  };
  try {
    await writeNativeSmokeStartupStage({
      options,
      stage: "window-load-start",
    });
    const stage = JSON.parse(
      await readFile(join(options.outputRoot, "startup-stage.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(stage.stage, "window-load-start");
    assert.equal(typeof stage.exactCommit, "string");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native smoke private config crypto is authenticated and credential-free", () => {
  const crypto = createNativeSmokePrivateConfigCrypto();
  const plaintext = JSON.stringify({ provider: "native-gate-no-credentials" });
  const encrypted = crypto.encrypt(plaintext);
  assert.equal(crypto.available(), true);
  assert.notEqual(Buffer.from(encrypted).toString("utf8"), plaintext);
  assert.equal(crypto.decrypt(encrypted), plaintext);
  const tampered = Uint8Array.from(encrypted);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => crypto.decrypt(tampered));
});

test("native smoke redacts bounded Engine diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-native-engine-"));
  const options = {
    homeRoot: join(root, "home"),
    outputRoot: join(root, "evidence"),
    selection: "custom" as const,
    userDataRoot: join(root, "user-data"),
    workspaceRoot: join(root, "workspace"),
  };
  try {
    await writeNativeSmokeEngineDiagnostic({
      code: 1,
      options,
      stderr: `load failed at ${options.workspaceRoot}`,
    });
    const diagnostic = await readFile(
      join(options.outputRoot, "engine-diagnostic.json"),
      "utf8",
    );
    assert.deepEqual(JSON.parse(diagnostic), {
      code: 1,
      stderr: "load failed at <private-root>",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native command failures are bounded and redact the Workspace root", async (context) => {
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "desktop-native-command-"),
  );
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await recordWorkspaceCommandFailure({
    workspaceRoot,
    command: "continue",
    storyId: "desktop-native-fixture",
    error: new Error(`compile failed under ${workspaceRoot}`),
  });
  const diagnostic = JSON.parse(
    await readFile(
      join(workspaceRoot, ".rsp/native-gate/command-failure.json"),
      "utf8",
    ),
  );
  assert.deepEqual(diagnostic, {
    contractVersion: "desktop-native-command-failure-v1",
    command: "continue",
    storyId: "desktop-native-fixture",
    message: "compile failed under <workspace-root>",
  });
});

test("native gate workflow remains manual-only and runs one gate on both native architectures", async () => {
  const [dispatchWorkflow, workflow, gate] = await Promise.all([
    readFile(".github/workflows/desktop-phase-b-native-gate.yml", "utf8"),
    readFile(".github/workflows/desktop-phase-c-native-gate.yml", "utf8"),
    readFile("scripts/desktop/native-gate.sh", "utf8"),
  ]);
  assert.match(dispatchWorkflow, /^on:\n {2}workflow_dispatch:\s*$/mu);
  assert.match(
    dispatchWorkflow,
    /uses: \.\/\.github\/workflows\/desktop-phase-d-unsigned-dmg\.yml/u,
  );
  assert.doesNotMatch(
    dispatchWorkflow,
    /pull_request:|push:|release:|publishers?:/u,
  );
  assert.match(workflow, /^on:\n {2}workflow_dispatch:\s*$/mu);
  assert.match(workflow, /^ {2}workflow_call:\s*$/mu);
  assert.match(workflow, /architecture: arm64[\s\S]*runner: macos-15/u);
  assert.match(workflow, /architecture: x64[\s\S]*runner: macos-15-intel/u);
  assert.match(workflow, /runs-on: \$\{\{ matrix\.runner \}\}/u);
  assert.match(workflow, /actions\/setup-node@v4/u);
  assert.match(workflow, /node-version: 22\.23\.1/u);
  assert.match(workflow, /npm ci/u);
  assert.match(workflow, /scripts\/desktop\/native-gate\.sh/u);
  assert.match(workflow, /--architecture "\$\{\{ matrix\.architecture \}\}"/u);
  assert.match(workflow, /--expected-commit "\$GITHUB_SHA"/u);
  assert.match(gate, /scripts\/desktop\/native-gate-runner\.sh/u);
  assert.match(gate, /npm run desktop:package -- --architecture/u);
  assert.match(gate, /AXMORF_DESKTOP_NATIVE_GATE_BUILD=1/u);
  assert.match(gate, /grep -R -Fq 'desktop-native-test-pcm-v3' out/u);
  assert.match(gate, /grep -R -Fq 'desktop-native-command-failure-v1' out/u);
  assert.match(gate, /Native Delivery action sequence does not match\./u);
  assert.match(gate, /manualDeliveryTested/u);
  assert.match(gate, /automaticDeliveryTested/u);
  assert.match(gate, /loopbackListenerVerified/u);
  assert.match(gate, /sessionCleanupVerified/u);
  assert.match(gate, /stagingCleanupVerified/u);
  assert.match(gate, /externalCreativeAgentTested !== false/u);
  assert.match(gate, /hostToolsRequiredAtRuntime !== false/u);
  assert.match(gate, /npm run check/u);
  assert.match(gate, /git diff --check/u);
  assert.match(workflow, /find "\$EVIDENCE_ROOT" -type f/u);
  assert.match(workflow, /id: evidence-redaction/u);
  assert.match(workflow, /-iname '\*token\*'/u);
  assert.match(
    workflow,
    /if: \$\{\{ always\(\) && steps\.evidence-redaction\.outcome == 'success' \}\}/u,
  );
  assert.match(workflow, /path: \$\{\{ env\.EVIDENCE_ROOT \}\}/u);
  assert.doesNotMatch(workflow, /pull_request:|push:|release:|publishers?:/u);
  assert.doesNotMatch(workflow, /Delivery blocker/u);
  assert.doesNotMatch(workflow, /path:.*FIXTURE_ROOT/u);
});

test("ordinary Desktop builds compile the native harness off", async () => {
  const [config, engineConfig, entry, provider] = await Promise.all([
    readFile("vite.desktop.main.config.ts", "utf8"),
    readFile("vite.desktop.engine.config.ts", "utf8"),
    readFile("desktop/main/entry.ts", "utf8"),
    readFile("scripts/desktop/native-test-provider.ts", "utf8"),
  ]);
  assert.match(
    config,
    /process\.env\.AXMORF_DESKTOP_NATIVE_GATE_BUILD === "1"/u,
  );
  assert.match(entry, /from "\.\/native-smoke-port"/u);
  assert.match(config, /desktop\/main\/native-smoke-disabled\.ts/u);
  assert.match(config, /desktop\/main\/native-smoke\.ts/u);
  assert.doesNotMatch(entry, /native-test-provider/u);
  assert.match(entry, /if \(nativeSmoke !== null\) return true;/u);
  assert.match(entry, /dialog\.showMessageBox/u);
  assert.doesNotMatch(entry, /ensureNativeSmokeProducerConfig/u);
  assert.match(entry, /createNativeSmokePrivateConfigCrypto/u);
  assert.match(config, /desktop\/main\/native-smoke-disabled\.ts/u);
  assert.match(
    engineConfig,
    /process\.env\.AXMORF_DESKTOP_NATIVE_GATE_BUILD === "1"/u,
  );
  assert.match(engineConfig, /find: "\.\/workspace-narration-port"/u);
  assert.match(engineConfig, /scripts\/desktop\/native-test-provider\.ts/u);
  assert.match(
    engineConfig,
    /scripts\/desktop\/native-command-diagnostic\.ts/u,
  );
  assert.match(engineConfig, /name: "desktop-prettier-cjs-entry"/u);
  assert.match(engineConfig, /__prettierCreateRequire\(__filename\)/u);
  assert.match(provider, /export const prepareWorkspaceNarration/u);
  assert.match(provider, /desktop-native-test-pcm-v3/u);
  assert.match(provider, /normalizeProviderAudio/u);
});

test("native smoke drives real manual and automatic Delivery with network cleanup evidence", async () => {
  const [nativeSmoke, renderer, runner, architectureEvidence, nativeFixture] =
    await Promise.all([
      readFile("desktop/main/native-smoke.ts", "utf8"),
      readFile("desktop/renderer/App.tsx", "utf8"),
      readFile("scripts/desktop/native-gate-runner.sh", "utf8"),
      readFile("scripts/desktop/native-architecture-evidence.ts", "utf8"),
      readFile("scripts/desktop/native-fixture.ts", "utf8"),
    ]);
  assert.match(nativeSmoke, /choice\.click\(\)/u);
  assert.match(nativeSmoke, /window\.axmorfStudio\.saveSettings/u);
  assert.match(nativeSmoke, /settings-engine-restart/u);
  assert.match(nativeSmoke, /providerFormVisible/u);
  assert.match(nativeSmoke, /rawJsonEditorAbsent/u);
  assert.match(nativeSmoke, /desktop-settings\.png/u);
  assert.match(nativeSmoke, /settings-probe\.json/u);
  assert.match(
    nativeSmoke,
    /executeJavaScript\(\s*workspaceSelectionProbeSource,[\s\S]*writeFile\(join\(options\.outputRoot, "app-ready"\)/u,
  );
  assert.match(nativeSmoke, /renderer-workspace-fatal:/u);
  assert.match(nativeSmoke, /if \(state\.status === "ready"\)/u);
  assert.match(nativeSmoke, /selectionControl\.dispatchEvent/u);
  assert.match(nativeSmoke, /selectionControlValue/u);
  assert.match(nativeSmoke, /\(clamped \+ 0\.25\) \/ selected\.fps/u);
  assert.match(nativeSmoke, /"playhead-" \+ clamped/u);
  assert.doesNotMatch(
    nativeSmoke,
    /const state = await window\.axmorfStudio\.chooseInitialWorkspace\(\)/u,
  );
  assert.match(runner, /native-failure\.json/u);
  assert.match(runner, /command-failure\.json/u);
  assert.match(runner, /desktop-native-attempt-terminal-v1/u);
  assert.match(runner, /if "\$@" >"\$output\.stdout" 2>"\$output\.stderr"; then/u);
  assert.doesNotMatch(runner, /set \+e/u);
  assert.match(runner, /attempt-terminal\.json/u);
  assert.match(runner, /terminalDiagnosticCode/u);
  assert.match(runner, /app_process_running "\$app_pid"/u);
  assert.match(runner, /native-architecture-evidence\.ts/u);
  assert.match(runner, /expected_architecture/u);
  for (const label of [
    "electron-app",
    "renderer-browser",
    "ffmpeg",
    "ffprobe",
    "node",
    "rsp-sea",
    "remotion-compositor",
  ]) {
    assert.match(architectureEvidence, new RegExp(`"${label}"`, "u"));
  }
  assert.match(architectureEvidence, /\/usr\/bin\/lipo/u);
  assert.match(architectureEvidence, /\/usr\/bin\/file/u);
  assert.match(architectureEvidence, /rspSeaInjected: true/u);
  assert.match(architectureEvidence, /runtimeNodeSeaCapable: true/u);
  assert.match(runner, /\.rsp\/bin\/rsp/u);
  assert.match(runner, /schema project-create/u);
  assert.match(runner, /schema asset-import/u);
  assert.match(runner, /project create-context/u);
  assert.match(runner, /project validate/u);
  assert.match(runner, /project-create-valid/u);
  assert.match(runner, /project create/u);
  assert.match(runner, /project-create-wrapper-reject/u);
  assert.match(runner, /rsp-project-create-wrapper-forbidden/u);
  assert.match(runner, /inspect --project desktop-native-fixture/u);
  assert.match(runner, /prepare --project desktop-native-fixture/u);
  assert.match(runner, /task finalize/u);
  assert.match(runner, /task check/u);
  assert.match(runner, /task commit/u);
  assert.match(nativeFixture, /inputs\/task-contract\.json/u);
  assert.match(nativeFixture, /TaskExecutionContractSchema/u);
  assert.doesNotMatch(nativeFixture, /buildSceneVisualPlan/u);
  assert.doesNotMatch(nativeFixture, /createGlobalVisualPlan/u);
  assert.match(runner, /inspect-after-tasks\.json/u);
  assert.match(runner, /delivery build/u);
  assert.match(runner, /assert_exact_delivery/u);
  assert.match(runner, /DYLD_LIBRARY_PATH="\$runtime_bin"/u);
  assert.match(runner, /-err_detect explode -count_frames/u);
  assert.match(runner, /cover-4x3-probe\.json/u);
  assert.match(runner, /cover-3x4-probe\.json/u);
  assert.doesNotMatch(runner, /-f null -/u);
  assert.match(runner, /\.rsp\/current\/source\/desktop-native-fixture\.json/u);
  assert.match(runner, /drive_production manual[\s\S]*manual/u);
  assert.match(runner, /drive_production automatic[\s\S]*automatic/u);
  assert.match(runner, /native-network-evidence\.ts/u);
  assert.match(runner, /manual-delivery/u);
  assert.match(runner, /automatic-delivery/u);
  assert.match(runner, /failure-delivery/u);
  assert.match(runner, /quit-delivery/u);
  assert.match(runner, /idle-after/u);
  assert.match(runner, /assert_session_cleanup/u);
  assert.match(runner, /session_root\/rsp\.sock/u);
  assert.match(runner, /operationLocksEmpty/u);
  assert.match(runner, /assert_disposable_staging_cleanup/u);
  assert.match(runner, /workspace-delivery-\*/u);
  assert.match(runner, /remainingDisposableBuildDirectories/u);
  assert.match(
    runner,
    /write_native_delivery_action[\s\S]*"\$NATIVE_LISTENER_SEQUENCE" fail/u,
  );
  assert.match(runner, /request-quit/u);
  assert.match(runner, /run_second_instance_probe/u);
  assert.match(runner, /HOME="\$home_root"/u);
  assert.match(runner, /AXMORF_DESKTOP_SMOKE_USER_DATA="\$user_data_root"/u);
  assert.match(runner, /AXMORF_DESKTOP_SMOKE_WORKSPACE="\$workspace_root"/u);
  assert.match(runner, /PATH="\$runtime_host_tools_path"/u);
  assert.match(runner, /offlineRuntimeTested: true/u);
  assert.match(runner, /externalCreativeAgentTested: false/u);
  assert.match(runner, /desktop-native-second-instance-timeout/u);
  assert.match(runner, /second-instance\.json/u);
  assert.doesNotMatch(
    runner,
    /"\$app_executable" --desktop-native-second-instance >\/dev\/null 2>&1 \|\| true/u,
  );
  assert.match(nativeSmoke, /request-quit/u);
  assert.match(nativeSmoke, /quit-request-observed/u);
  assert.match(nativeSmoke, /"video-play",\s*30000/u);
  assert.match(nativeSmoke, /rendererProbeSource\(true\)/u);
  assert.match(nativeSmoke, /playbackRequired/u);
  assert.match(nativeSmoke, /HAVE_CURRENT_DATA : HAVE_METADATA/u);
  assert.match(nativeSmoke, /playerError === null/u);
  assert.match(nativeSmoke, /!video\.seeking && video\.readyState >= 2/u);
  assert.match(nativeSmoke, /stage: probeStage/u);
  assert.match(nativeSmoke, /errorMessage/u);
  assert.match(nativeSmoke, /securityTested: playbackRequired/u);
  assert.match(nativeSmoke, /security-requirement/u);
  assert.match(nativeSmoke, /renderer\.media\.positions !== null/u);
  assert.match(nativeSmoke, /renderer-probe\.json/u);
  assert.match(nativeSmoke, /gateFailures: rendererGateFailures/u);
  assert.match(nativeSmoke, /rendererGateFailures\.join\(","\)/u);
  assert.match(renderer, /preload="auto"/u);
  assert.doesNotMatch(renderer, /preload="metadata"/u);
  assert.doesNotMatch(runner, /implementation-blocked-remotion-zero-tcp/u);
  assert.doesNotMatch(runner, /delivery-blocked/u);
  assert.match(runner, /network-samples\.jsonl/u);
  assert.match(runner, /listener-closed-/u);
  assert.match(runner, /process-cleanup/u);
  assert.match(runner, /listener-request-surface\.json/u);
  assert.match(runner, /\/private\/producer-config\.json/u);
  assert.match(runner, /\/\.rsp\/session\/token/u);
  assert.match(
    runner,
    /saved_token="\$gate_runtime_root\/\$label-session-token\.backup"/u,
  );
  assert.doesNotMatch(runner, /output_root\/session-token\.backup/u);
  assert.match(runner, /trap cleanup_gate_runtime_root EXIT/u);
  assert.match(runner, /rm -rf -- "\$gate_runtime_root"/u);
  assert.match(runner, /\/settings/u);
  assert.match(runner, /\/api/u);
  assert.match(runner, /127\.0\.0\.1:1\/native-sentinel/u);
  assert.match(
    runner,
    /if \[\[ "\$label" = "manual-1" \]\]; then[\s\S]*assert_native_listener_request_surface/u,
  );
});
