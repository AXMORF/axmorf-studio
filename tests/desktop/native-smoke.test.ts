import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveNativeSmokeOptions } from "../../desktop/main/native-smoke";
import { ProjectCreateInputSchema } from "../../src/contracts";
import { createDesktopNativeProjectInput } from "../../scripts/desktop/native-fixture";

test("native fixture starts at the public project-create boundary", () => {
  const input = ProjectCreateInputSchema.parse(
    createDesktopNativeProjectInput(),
  );
  assert.equal(input.storyId, "desktop-native-fixture");
  assert.equal(input.story.beats.length, 2);
  assert.deepEqual(input.sceneTemplates, {
    introSceneTemplateId: null,
    outroSceneTemplateId: null,
  });
});

test("native smoke activation is packaged Apple Silicon CI only", () => {
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
        AXMORF_PHASE_B_NATIVE_GATE: "1",
        AXMORF_PHASE_B_SMOKE_HOME: "/tmp/home",
        AXMORF_PHASE_B_SMOKE_OUTPUT: "/tmp/evidence",
        AXMORF_PHASE_B_SMOKE_SELECTION: "custom",
        AXMORF_PHASE_B_SMOKE_USER_DATA: "/tmp/user-data",
        AXMORF_PHASE_B_SMOKE_WORKSPACE: "/tmp/workspace",
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
    { isPackaged: true, platform: "darwin" as const, arch: "x64" },
  ]) {
    assert.throws(
      () =>
        resolveNativeSmokeOptions({
          ...input,
          env: {
            AXMORF_PHASE_B_NATIVE_GATE: "1",
            AXMORF_PHASE_B_SMOKE_HOME: "/tmp/home",
            AXMORF_PHASE_B_SMOKE_OUTPUT: "/tmp/evidence",
            AXMORF_PHASE_B_SMOKE_SELECTION: "custom",
            AXMORF_PHASE_B_SMOKE_USER_DATA: "/tmp/user-data",
            AXMORF_PHASE_B_SMOKE_WORKSPACE: "/tmp/workspace",
          },
        }),
      /desktop-native-smoke-host-invalid/u,
    );
  }
});

test("native gate workflow is manual-only to dispatch and uploads evidence only", async () => {
  const workflow = await readFile(
    ".github/workflows/desktop-phase-b-native-gate.yml",
    "utf8",
  );
  assert.match(workflow, /^on:\n {2}workflow_dispatch:\s*$/mu);
  assert.match(workflow, /runs-on: macos-15/u);
  assert.match(workflow, /test "\$\(uname -m\)" = arm64/u);
  assert.match(workflow, /npm ci/u);
  assert.match(workflow, /scripts\/desktop\/native-gate-runner\.sh/u);
  assert.match(workflow, /npm run desktop:package/u);
  assert.match(workflow, /AXMORF_PHASE_B_NATIVE_GATE_BUILD=1/u);
  assert.match(workflow, /grep -R -Fq 'desktop-native-test-pcm-v1' out/u);
  assert.match(
    workflow,
    /Native Delivery action sequence does not match\./u,
  );
  assert.match(workflow, /manualDeliveryTested/u);
  assert.match(workflow, /automaticDeliveryTested/u);
  assert.match(workflow, /loopbackListenerVerified/u);
  assert.match(workflow, /sessionCleanupVerified/u);
  assert.match(workflow, /stagingCleanupVerified/u);
  assert.match(workflow, /find "\$EVIDENCE_ROOT" -type f/u);
  assert.match(workflow, /id: evidence-redaction/u);
  assert.match(workflow, /-iname '\*token\*'/u);
  assert.match(
    workflow,
    /if: \$\{\{ always\(\) && steps\.evidence-redaction\.outcome == 'success' \}\}/u,
  );
  assert.match(workflow, /npm run check/u);
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
    /process\.env\.AXMORF_PHASE_B_NATIVE_GATE_BUILD === "1"/u,
  );
  assert.match(entry, /from "\.\/native-smoke-port"/u);
  assert.match(config, /desktop\/main\/native-smoke-disabled\.ts/u);
  assert.match(config, /desktop\/main\/native-smoke\.ts/u);
  assert.doesNotMatch(entry, /native-test-provider/u);
  assert.match(entry, /await ensureNativeSmokeProducerConfig/u);
  assert.match(
    engineConfig,
    /process\.env\.AXMORF_PHASE_B_NATIVE_GATE_BUILD === "1"/u,
  );
  assert.match(engineConfig, /find: "\.\/workspace-narration-port"/u);
  assert.match(engineConfig, /scripts\/desktop\/native-test-provider\.ts/u);
  assert.match(provider, /export const prepareWorkspaceNarration/u);
  assert.match(provider, /desktop-native-test-pcm-v1/u);
});

test("native smoke drives real manual and automatic Delivery with network cleanup evidence", async () => {
  const [nativeSmoke, renderer, runner] = await Promise.all([
    readFile("desktop/main/native-smoke.ts", "utf8"),
    readFile("desktop/renderer/App.tsx", "utf8"),
    readFile("scripts/desktop/native-gate-runner.sh", "utf8"),
  ]);
  assert.match(nativeSmoke, /choice\.click\(\)/u);
  assert.match(nativeSmoke, /selectionControl\.dispatchEvent/u);
  assert.match(nativeSmoke, /selectionControlValue/u);
  assert.match(nativeSmoke, /\(clamped \+ 0\.25\) \/ selected\.fps/u);
  assert.match(nativeSmoke, /"playhead-" \+ clamped/u);
  assert.doesNotMatch(
    nativeSmoke,
    /const state = await window\.axmorfStudio\.chooseInitialWorkspace\(\)/u,
  );
  assert.match(runner, /native-failure\.json/u);
  assert.match(runner, /app_process_running "\$app_pid"/u);
  assert.match(runner, /desktop-phase-b-native-gate-requires-darwin-arm64/u);
  assert.match(runner, /\.rsp\/bin\/rsp/u);
  assert.match(runner, /project create/u);
  assert.match(runner, /inspect --project desktop-native-fixture/u);
  assert.match(runner, /prepare --project desktop-native-fixture/u);
  assert.match(runner, /task check/u);
  assert.match(runner, /task commit/u);
  assert.match(runner, /delivery build/u);
  assert.match(runner, /assert_exact_delivery/u);
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
