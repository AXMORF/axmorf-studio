#!/usr/bin/env bash
set -Eeuo pipefail

trap 'status=$?; printf "desktop-native-gate-failed:line=%s:command=%s:exit=%s\n" "$LINENO" "$BASH_COMMAND" "$status" >&2; exit "$status"' ERR

architecture=""
expected_commit=""
evidence_root=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --architecture)
      architecture=${2:?--architecture value is required}
      shift 2
      ;;
    --expected-commit)
      expected_commit=${2:?--expected-commit value is required}
      shift 2
      ;;
    --evidence-root)
      evidence_root=${2:?--evidence-root value is required}
      shift 2
      ;;
    *)
      echo "desktop-native-gate-option-invalid:$1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$architecture" || -z "$expected_commit" || -z "$evidence_root" ]]; then
  echo "desktop-native-gate-options-required" >&2
  exit 1
fi

repository_root=$(git rev-parse --show-toplevel)
host_node=$(command -v node)
architecture_evidence="$repository_root/scripts/desktop/native-architecture-evidence.ts"
actual_commit=$(git rev-parse HEAD)
if [[ "$actual_commit" != "$expected_commit" ]]; then
  echo "desktop-native-gate-commit-mismatch" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "desktop-native-gate-tracked-worktree-dirty" >&2
  exit 1
fi
if [[ -e "$evidence_root" ]] && \
  find "$evidence_root" -mindepth 1 -print -quit | grep -q .; then
  echo "desktop-native-gate-evidence-root-not-empty" >&2
  exit 1
fi
mkdir -p "$evidence_root"

target_json=$("$host_node" --import tsx "$architecture_evidence" describe \
  --architecture "$architecture")
forge_output=$("$host_node" -p \
  'JSON.parse(process.argv[1]).forgeOutputDirectory' "$target_json")
app_path="$repository_root/out/$forge_output/AXMORF Studio.app"

printf '%s\n' \
  "{\"contractVersion\":\"desktop-native-gate-source-v1\",\"exactCommit\":\"$actual_commit\",\"architecture\":\"$architecture\",\"trackedWorktreeClean\":true}" \
  >"$evidence_root/source.json"

npm run desktop:check

npm run desktop:package -- --architecture "$architecture" \
  >"$evidence_root/ordinary-package.log"
if grep -R -F 'desktop-native-test-pcm-v3' out; then
  echo "desktop-native-test-provider-leaked-into-ordinary-package" >&2
  exit 1
fi
if grep -R -F 'desktop-native-command-failure-v1' out; then
  echo "desktop-native-command-diagnostic-leaked-into-ordinary-package" >&2
  exit 1
fi
if grep -R -F 'Native Delivery action sequence does not match.' out; then
  echo "desktop-native-delivery-lifecycle-leaked-into-ordinary-package" >&2
  exit 1
fi
tail -n 1 "$evidence_root/ordinary-package.log" \
  >"$evidence_root/ordinary-package-inventory.json"

AXMORF_DESKTOP_NATIVE_GATE_BUILD=1 \
  npm run desktop:package -- --architecture "$architecture" \
  >"$evidence_root/gate-package.log"
grep -R -Fq 'desktop-native-test-pcm-v3' out
grep -R -Fq 'desktop-native-command-failure-v1' out
grep -R -Fq 'Native Delivery action sequence does not match.' out
tail -n 1 "$evidence_root/gate-package.log" \
  >"$evidence_root/gate-package-inventory.json"

bash "$repository_root/scripts/desktop/native-gate-runner.sh" \
  "$app_path" "$evidence_root" "$repository_root" "$architecture"

"$host_node" -e '
  const fs = require("fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const required = [
    "sourceCurrent",
    "nativeProductionEvidence",
    "deterministicFixture",
    "offlineRuntimeTested",
    "deliveryBuilt",
    "manualDeliveryTested",
    "automaticDeliveryTested",
    "failureCleanupTested",
    "quitCleanupTested",
    "loopbackListenerVerified",
    "processCleanupVerified",
    "sessionCleanupVerified",
    "stagingCleanupVerified",
    "reopen",
  ];
  if (
    value.contractVersion !== "desktop-native-runner-v2" ||
    value.status !== "native-evidence-complete" ||
    value.architecture !== process.argv[2] ||
    required.some((key) => value[key] !== true) ||
    value.externalCreativeAgentTested !== false ||
    value.hostToolsRequiredAtRuntime !== false ||
    value.fixtureOrDeliveryUploaded !== false
  ) process.exit(1);
' "$evidence_root/runner-summary.json" "$architecture"

npm run typecheck
npm run lint
npm run docs:check-links
npm run check:static
npm run compositions
npm run check
git diff --check
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "desktop-native-gate-source-drifted" >&2
  exit 1
fi

if find "$evidence_root" -type f \( \
  -name 'video.mp4' -o \
  -name 'cover-4x3.png' -o \
  -name 'cover-3x4.png' \
\) -print -quit | grep -q .; then
  echo "desktop-native-delivery-media-leaked-into-evidence" >&2
  exit 1
fi
if find "$evidence_root" -type f -iname '*token*' \
  -print -quit | grep -q .; then
  echo "desktop-native-token-file-leaked-into-evidence" >&2
  exit 1
fi
if find "$evidence_root" -type f ! -name '*.png' -print0 | \
  xargs -0 grep -El \
    'Bearer [A-Fa-f0-9]{32,}|visible-editable-token|voice_profile' \
    >/dev/null; then
  echo "desktop-native-evidence-redaction-failed" >&2
  exit 1
fi
if grep -R -Fq "$repository_root" "$evidence_root"; then
  echo "desktop-native-repository-path-leaked-into-evidence" >&2
  exit 1
fi

printf '%s\n' \
  '{"contractVersion":"desktop-native-repository-gate-v1","desktopCheck":true,"typecheck":true,"lint":true,"docs":true,"checkStatic":true,"compositions":true,"fullCheck":true,"diffCheck":true,"trackedWorktreeClean":true,"evidenceRedacted":true}' \
  >"$evidence_root/repository-gate.json"
