#!/usr/bin/env bash
set -euo pipefail

architecture=""
expected_commit=""
app_version=""
dmg_path=""
ordinary_app=""
native_evidence_root=""
output_root=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --architecture) architecture=${2:?}; shift 2 ;;
    --expected-commit) expected_commit=${2:?}; shift 2 ;;
    --app-version) app_version=${2:?}; shift 2 ;;
    --dmg) dmg_path=${2:?}; shift 2 ;;
    --ordinary-app) ordinary_app=${2:?}; shift 2 ;;
    --native-evidence-root) native_evidence_root=${2:?}; shift 2 ;;
    --output-root) output_root=${2:?}; shift 2 ;;
    *) echo "desktop-unsigned-dmg-option-invalid:$1" >&2; exit 1 ;;
  esac
done

if [[
  -z "$architecture" ||
  -z "$expected_commit" ||
  -z "$app_version" ||
  -z "$dmg_path" ||
  -z "$ordinary_app" ||
  -z "$native_evidence_root" ||
  -z "$output_root"
]]; then
  echo "desktop-unsigned-dmg-options-required" >&2
  exit 1
fi
if [[ "${AXMORF_DESKTOP_NATIVE_GATE_BUILD:-}" == "1" ]]; then
  echo "desktop-unsigned-dmg-native-gate-build-forbidden" >&2
  exit 1
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "desktop-unsigned-dmg-native-macos-required" >&2
  exit 1
fi

repository_root=$(git rev-parse --show-toplevel)
host_node=$(command -v node)
architecture_evidence="$repository_root/scripts/desktop/native-architecture-evidence.ts"
network_evidence="$repository_root/scripts/desktop/native-network-evidence.ts"
if [[ "$(git rev-parse HEAD)" != "$expected_commit" ]]; then
  echo "desktop-unsigned-dmg-commit-mismatch" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "desktop-unsigned-dmg-tracked-worktree-dirty" >&2
  exit 1
fi
for path in \
  "$dmg_path" \
  "$ordinary_app/Contents/MacOS/AXMORF Studio" \
  "$native_evidence_root/source.json" \
  "$native_evidence_root/runner-summary.json" \
  "$native_evidence_root/repository-gate.json"; do
  if [[ ! -e "$path" || -L "$path" ]]; then
    echo "desktop-unsigned-dmg-input-invalid" >&2
    exit 1
  fi
done
if [[ -e "$output_root" ]] && find "$output_root" -mindepth 1 -print -quit | grep -q .; then
  echo "desktop-unsigned-dmg-output-root-not-empty" >&2
  exit 1
fi
mkdir -p "$output_root"

verification_runtime_root=$(mktemp -d "${TMPDIR:-/tmp}/axmorf-unsigned-dmg.XXXXXX")
case "$verification_runtime_root" in
  "${TMPDIR:-/tmp}"/axmorf-unsigned-dmg.*) ;;
  *) echo "desktop-unsigned-dmg-temp-root-invalid" >&2; exit 1 ;;
esac
mount_root="$verification_runtime_root/mount"
applications_root="$verification_runtime_root/Applications"
empty_path="$verification_runtime_root/no-host-tools"
first_home="$verification_runtime_root/first-run-home"
doctor_home="$verification_runtime_root/doctor-home"
doctor_workspace="$verification_runtime_root/doctor-workspace"
window_probe="$verification_runtime_root/window-probe"
mounted=false

cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_root" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf -- "$verification_runtime_root"
}
trap cleanup EXIT
mkdir -p "$mount_root" "$applications_root" "$empty_path" "$first_home" "$doctor_home"

/usr/bin/xcrun swiftc "$repository_root/scripts/desktop/window-probe.swift" \
  -o "$window_probe"

app_running() {
  local pid=$1
  local state
  state=$(ps -p "$pid" -o stat= 2>/dev/null | tr -d ' ') || return 1
  [[ -n "$state" && "$state" != Z* ]]
}

wait_for_window() {
  local pid=$1
  local remaining=300
  while [[ $remaining -gt 0 ]]; do
    app_running "$pid" || return 1
    if [[ "$($window_probe "$pid")" -ge 1 ]]; then
      return 0
    fi
    sleep 0.2
    remaining=$((remaining - 1))
  done
  return 1
}

quit_app() {
  local pid=$1
  /usr/bin/osascript -e 'tell application id "com.axmorf.studio" to quit' >/dev/null
  local remaining=300
  while app_running "$pid" && [[ $remaining -gt 0 ]]; do
    sleep 0.1
    remaining=$((remaining - 1))
  done
  if app_running "$pid"; then
    echo "desktop-unsigned-dmg-app-quit-timeout" >&2
    return 1
  fi
  wait "$pid"
}

launch_ordinary_app() {
  local home_root=$1
  local executable=$2
  local log_path=$3
  env \
    HOME="$home_root" \
    PATH="$empty_path" \
    TMPDIR="$verification_runtime_root" \
    "$executable" >"$log_path" 2>&1 &
  LAUNCHED_PID=$!
  wait_for_window "$LAUNCHED_PID"
}

hdiutil verify "$dmg_path" >"$output_root/hdiutil-verify.txt"
hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$mount_root" \
  >"$output_root/hdiutil-attach.txt"
mounted=true
mounted_app="$mount_root/AXMORF Studio.app"
if [[ ! -d "$mounted_app" || -L "$mounted_app" ]]; then
  echo "desktop-unsigned-dmg-mounted-app-invalid" >&2
  exit 1
fi
if [[ ! -L "$mount_root/Applications" || "$(readlink "$mount_root/Applications")" != "/Applications" ]]; then
  echo "desktop-unsigned-dmg-applications-link-invalid" >&2
  exit 1
fi
if [[ "$(find "$mount_root" -mindepth 1 -maxdepth 1 -name '*.app' -type d | wc -l | tr -d ' ')" != "1" ]]; then
  echo "desktop-unsigned-dmg-app-inventory-invalid" >&2
  exit 1
fi

for marker in \
  desktop-native-test-pcm-v3 \
  desktop-native-command-failure-v1 \
  'Native Delivery action sequence does not match.'; do
  if grep -R -Fq "$marker" "$mounted_app"; then
    echo "desktop-unsigned-dmg-native-harness-leaked:$marker" >&2
    exit 1
  fi
done

"$host_node" --import tsx "$architecture_evidence" assert-package \
  --architecture "$architecture" \
  --app "$mounted_app" \
  --output "$output_root/mounted-native-identity.json"
npm run desktop:runtime:check -- \
  --runtime-pack "$mounted_app/Contents/Resources/runtime-pack" \
  --architecture "$architecture" \
  >"$output_root/mounted-runtime-check.json"

/usr/bin/ditto "$mounted_app" "$applications_root/AXMORF Studio.app"
installed_app="$applications_root/AXMORF Studio.app"
"$host_node" --import tsx "$architecture_evidence" assert-package \
  --architecture "$architecture" \
  --app "$installed_app" \
  --output "$output_root/installed-native-identity.json"
hdiutil detach "$mount_root" -quiet
mounted=false

info_plist="$installed_app/Contents/Info.plist"
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info_plist")" != "com.axmorf.studio" ]]; then
  echo "desktop-unsigned-dmg-bundle-id-invalid" >&2
  exit 1
fi
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist")" != "$app_version" ]]; then
  echo "desktop-unsigned-dmg-app-version-invalid" >&2
  exit 1
fi
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$info_plist")" != "13.0" ]]; then
  echo "desktop-unsigned-dmg-minimum-macos-invalid" >&2
  exit 1
fi

set +e
/usr/sbin/spctl -a -t exec -vv "$installed_app" \
  >"$output_root/spctl.stdout" 2>"$output_root/spctl.stderr"
spctl_exit=$?
set -e
if [[ $spctl_exit -eq 0 ]]; then
  echo "desktop-unsigned-dmg-unexpected-gatekeeper-acceptance" >&2
  exit 1
fi
/usr/bin/codesign -dv --verbose=4 "$installed_app" \
  >"$output_root/codesign.stdout" 2>"$output_root/codesign.stderr" || true
if grep -Eq '^Authority=|^TeamIdentifier=[A-Z0-9]+' "$output_root/codesign.stderr"; then
  echo "desktop-unsigned-dmg-developer-id-signature-forbidden" >&2
  exit 1
fi

installed_executable="$installed_app/Contents/MacOS/AXMORF Studio"
launch_ordinary_app "$first_home" "$installed_executable" "$output_root/first-run.log"
first_pid=$LAUNCHED_PID
test ! -e "$first_home/Library/Application Support/com.axmorf.studio/preferences.json"
quit_app "$first_pid"

"$host_node" --import tsx "$repository_root/scripts/desktop/prepare-installer-smoke.ts" \
  --home "$doctor_home" \
  --workspace "$doctor_workspace" \
  >"$output_root/doctor-preference.json"
launch_ordinary_app "$doctor_home" "$installed_executable" "$output_root/doctor-launch.log"
doctor_pid=$LAUNCHED_PID
printf '%s\n' idle >"$output_root/network-phase"
"$host_node" --import tsx "$network_evidence" monitor \
  --root-pid "$doctor_pid" \
  --phase-file "$output_root/network-phase" \
  --stop-file "$output_root/network-stop" \
  --output "$output_root/network-samples.jsonl" &
network_pid=$!
sleep 1

rsp="$doctor_workspace/.rsp/bin/rsp"
remaining=600
while [[ (! -x "$rsp" || ! -S "$doctor_workspace/.rsp/session/rsp.sock") && $remaining -gt 0 ]]; do
  app_running "$doctor_pid" || break
  sleep 0.2
  remaining=$((remaining - 1))
done
if [[ ! -x "$rsp" || ! -S "$doctor_workspace/.rsp/session/rsp.sock" ]]; then
  echo "desktop-unsigned-dmg-doctor-session-unavailable" >&2
  exit 1
fi
env HOME="$doctor_home" PATH="$empty_path" TMPDIR="$verification_runtime_root" \
  "$rsp" doctor >"$output_root/doctor.json"
"$host_node" -e '
  const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (
    value.protocolVersion !== "rsp-local-v2" ||
    value.adapterMode !== "workspace" ||
    value.runtimePackMode !== "embedded" ||
    value.runtimePack?.architecture !== process.argv[2] ||
    value.runtimePackAvailable !== true ||
    value.productionAvailable !== true ||
    value.deliveryAvailable !== true ||
    value.distributionReady !== false ||
    value.previewCatalog?.state !== "ready" ||
    value.previewCatalog?.entryCount !== 0
  ) process.exit(1);
' "$output_root/doctor.json" "$architecture"

quit_app "$doctor_pid"
sleep 1
printf '%s\n' stop >"$output_root/network-stop"
wait "$network_pid"
"$host_node" --import tsx "$network_evidence" assert-idle \
  --input "$output_root/network-samples.jsonl" \
  >"$output_root/network-summary.json"
"$host_node" --import tsx "$network_evidence" assert-process-cleanup \
  --input "$output_root/network-samples.jsonl" \
  >"$output_root/process-cleanup.json"
for path in \
  "$doctor_workspace/.rsp/session/rsp.sock" \
  "$doctor_workspace/.rsp/session/session.json" \
  "$doctor_workspace/.rsp/session/token"; do
  test ! -e "$path"
done
if [[ -d "$doctor_workspace/.rsp/locks" ]] && \
  find "$doctor_workspace/.rsp/locks" -mindepth 1 -print -quit | grep -q .; then
  echo "desktop-unsigned-dmg-operation-lock-cleanup-incomplete" >&2
  exit 1
fi
if find "$doctor_home/Library/Caches/com.axmorf.studio" \
  -mindepth 1 -maxdepth 1 -name 'workspace-delivery-*' -print -quit \
  2>/dev/null | grep -q .; then
  echo "desktop-unsigned-dmg-staging-cleanup-incomplete" >&2
  exit 1
fi

runtime_pack_id=$("$host_node" -p \
  'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).runtimePackId' \
  "$output_root/installed-native-identity.json")
"$host_node" -e '
  const fs = require("fs");
  const output = {
    contractVersion: "desktop-unsigned-installer-verification-v1",
    architecture: process.argv[2],
    appVersion: process.argv[3],
    exactCommit: process.argv[4],
    runtimePackId: process.argv[5],
    ordinaryProductionPackage: true,
    nativeProductionGate: true,
    mountedDmg: true,
    isolatedApplicationsCopy: true,
    firstRun: true,
    doctor: true,
    previewLaunch: true,
    hostToolsRequiredAtRuntime: false,
    cleanup: true,
    developerIdSigned: false,
    notarized: false,
    publicReleasePublished: false,
  };
  fs.writeFileSync(process.argv[1], `${JSON.stringify(output, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
' "$output_root/installer-verification.json" "$architecture" "$app_version" \
  "$expected_commit" "$runtime_pack_id"
