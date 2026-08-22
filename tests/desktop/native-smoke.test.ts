import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveNativeSmokeOptions } from "../../desktop/main/native-smoke";

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
        AXMORF_PHASE_A_NATIVE_GATE: "1",
        AXMORF_PHASE_A_SMOKE_HOME: "/tmp/home",
        AXMORF_PHASE_A_SMOKE_OUTPUT: "/tmp/evidence",
        AXMORF_PHASE_A_SMOKE_SELECTION: "custom",
        AXMORF_PHASE_A_SMOKE_USER_DATA: "/tmp/user-data",
        AXMORF_PHASE_A_SMOKE_WORKSPACE: "/tmp/workspace",
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
            AXMORF_PHASE_A_NATIVE_GATE: "1",
            AXMORF_PHASE_A_SMOKE_HOME: "/tmp/home",
            AXMORF_PHASE_A_SMOKE_OUTPUT: "/tmp/evidence",
            AXMORF_PHASE_A_SMOKE_SELECTION: "custom",
            AXMORF_PHASE_A_SMOKE_USER_DATA: "/tmp/user-data",
            AXMORF_PHASE_A_SMOKE_WORKSPACE: "/tmp/workspace",
          },
        }),
      /desktop-native-smoke-host-invalid/u,
    );
  }
});

test("native gate workflow is manual-only, arm64 and uploads evidence only", async () => {
  const workflow = await readFile(
    ".github/workflows/desktop-phase-a-native-gate.yml",
    "utf8",
  );
  assert.match(workflow, /^on:\n {2}workflow_dispatch:\s*$/mu);
  assert.match(workflow, /runs-on: macos-15/u);
  assert.match(workflow, /test "\$\(uname -m\)" = arm64/u);
  assert.match(workflow, /npm ci/u);
  assert.match(workflow, /npm run desktop:native-fixture/u);
  assert.match(workflow, /npm run desktop:package/u);
  assert.match(workflow, /AXMORF_PHASE_A_NATIVE_GATE_BUILD=1/u);
  assert.match(workflow, /npm run check/u);
  assert.match(workflow, /path: \$\{\{ env\.EVIDENCE_ROOT \}\}/u);
  assert.doesNotMatch(workflow, /pull_request:|push:|release:|publishers?:/u);
  assert.doesNotMatch(workflow, /path:.*FIXTURE_ROOT/u);
});

test("ordinary Desktop builds compile the native harness off", async () => {
  const config = await readFile("vite.desktop.main.config.ts", "utf8");
  const entry = await readFile("desktop/main/entry.ts", "utf8");
  assert.match(
    config,
    /process\.env\.AXMORF_PHASE_A_NATIVE_GATE_BUILD === "1"/u,
  );
  assert.match(entry, /from "\.\/native-smoke-port"/u);
  assert.match(config, /desktop\/main\/native-smoke-disabled\.ts/u);
  assert.match(config, /desktop\/main\/native-smoke\.ts/u);
});

test("native smoke drives the renderer UI and fails fast on app startup errors", async () => {
  const [nativeSmoke, runner] = await Promise.all([
    readFile("desktop/main/native-smoke.ts", "utf8"),
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
  assert.match(runner, /kill -0 "\$app_pid"/u);
  assert.match(runner, /createHash\("sha256"\).*digest\("hex"\)/u);
  assert.doesNotMatch(runner, /const checksum = "sha256:"/u);
  assert.match(runner, /JSON\.parse\(fs\.readFileSync\(process\.argv\[1\]/u);
  assert.doesNotMatch(runner, /grep -Fxq "\$expected_code"/u);
});
