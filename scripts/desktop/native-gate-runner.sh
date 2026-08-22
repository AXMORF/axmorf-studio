#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "desktop-native-gate-host-invalid" >&2
  exit 1
fi

app_path=${1:?packaged .app path is required}
evidence_root=${2:?evidence root is required}
app_executable="$app_path/Contents/MacOS/AXMORF Studio"
if [[ ! -x "$app_executable" ]]; then
  echo "desktop-native-gate-app-missing" >&2
  exit 1
fi

mkdir -p "$evidence_root"

wait_for_app_ready() {
  local path=$1
  local failure_path=$2
  local app_pid=$3
  local remaining=900
  while [[ ! -f "$path" && $remaining -gt 0 ]]; do
    if [[ -f "$failure_path" ]] || ! kill -0 "$app_pid" 2>/dev/null; then
      return 1
    fi
    sleep 1
    remaining=$((remaining - 1))
  done
  [[ -f "$path" ]]
}

process_tree() {
  local root_pid=$1
  local pending=("$root_pid")
  local result=()
  while [[ ${#pending[@]} -gt 0 ]]; do
    local pid=${pending[0]}
    pending=("${pending[@]:1}")
    result+=("$pid")
    while IFS= read -r child; do
      [[ -n "$child" ]] && pending+=("$child")
    done < <(pgrep -P "$pid" || true)
  done
  printf '%s\n' "${result[@]}"
}

assert_rsp_failure() {
  local expected_exit=$1
  local expected_code=$2
  local output=$3
  shift 3
  set +e
  "$@" >"$output.stdout" 2>"$output.stderr"
  local actual_exit=$?
  set -e
  [[ $actual_exit -eq $expected_exit ]]
  grep -Fxq "$expected_code" "$output.stderr"
  [[ ! -s "$output.stdout" ]]
}

run_app() {
  local label=$1
  local home_root=$2
  local workspace_root=$3
  local second_instance=$4
  local selection=$5
  local output_root="$evidence_root/$label"
  local user_data_root="$home_root/Library/Application Support/com.axmorf.studio"
  local app_log
  app_log=$(mktemp -t axmorf-native-app-log.XXXXXX)
  mkdir -p "$home_root" "$workspace_root" "$output_root" "$user_data_root"
  env \
    HOME="$home_root" \
    AXMORF_PHASE_A_NATIVE_GATE=1 \
    AXMORF_PHASE_A_SMOKE_HOME="$home_root" \
    AXMORF_PHASE_A_SMOKE_OUTPUT="$output_root" \
    AXMORF_PHASE_A_SMOKE_SELECTION="$selection" \
    AXMORF_PHASE_A_SMOKE_USER_DATA="$user_data_root" \
    AXMORF_PHASE_A_SMOKE_WORKSPACE="$workspace_root" \
    GITHUB_SHA="${GITHUB_SHA:-local-unverified}" \
    "$app_executable" >"$app_log" 2>&1 &
  local app_pid=$!
  if ! wait_for_app_ready \
    "$output_root/app-ready" \
    "$output_root/native-failure.json" \
    "$app_pid"; then
    sed -n '1,80p' "$output_root/native-failure.json" >&2 2>/dev/null || true
    sed -E 's#/(Users|private|var)/[^ ]+#<redacted-path>#g' "$app_log" >&2 || true
    return 1
  fi
  kill -0 "$app_pid"

  owned_pids=()
  while IFS= read -r owned_pid; do
    [[ -n "$owned_pid" ]] && owned_pids+=("$owned_pid")
  done < <(process_tree "$app_pid")
  : >"$output_root/process-tree.txt"
  : >"$output_root/tcp-listeners.txt"
  for pid in "${owned_pids[@]}"; do
    ps -p "$pid" -o pid=,ppid=,comm= >>"$output_root/process-tree.txt"
    lsof -nP -a -p "$pid" -iTCP -sTCP:LISTEN >>"$output_root/tcp-listeners.txt" || true
  done
  [[ ! -s "$output_root/tcp-listeners.txt" ]]

  local rsp="$workspace_root/.rsp/bin/rsp"
  "$rsp" doctor >"$output_root/doctor-success.json"
  grep -Fq '"desktopTcpListeners":false' "$output_root/doctor-success.json"
  if grep -Eqi 'bearer|authorization|token|private/|provider' "$output_root/doctor-success.json"; then
    echo "desktop-native-gate-doctor-redaction-failed" >&2
    return 1
  fi
  test "$(stat -f '%Lp' "$workspace_root/.rsp/workspace.json")" = 600
  test "$(stat -f '%Lp' "$workspace_root/.rsp/managed-files.json")" = 600
  node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const ledger = JSON.parse(fs.readFileSync(path.join(root, ".rsp/managed-files.json"), "utf8"));
    for (const file of ledger.files) {
      const target = path.join(root, file.path);
      const checksum = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
      if (checksum !== file.sha256 || (fs.statSync(target).mode & 0o777) !== file.mode) process.exit(1);
    }
    process.stdout.write(JSON.stringify({workspaceContract: "green", managedFileCount: ledger.files.length}) + "\n");
  ' "$workspace_root" >"$output_root/workspace-integrity.json"

  local session_root="$workspace_root/.rsp/session"
  local credential_backup session_backup
  credential_backup=$(mktemp -t axmorf-token-backup.XXXXXX)
  session_backup=$(mktemp -t axmorf-session-backup.XXXXXX)
  cp "$session_root/token" "$credential_backup"
  cp "$session_root/session.json" "$session_backup"
  chmod 600 "$credential_backup" "$session_backup"
  printf '%064d\n' 0 >"$session_root/token"
  chmod 600 "$session_root/token"
  assert_rsp_failure 4 rsp-unauthorized "$output_root/doctor-wrong-token" "$rsp" doctor
  cp "$credential_backup" "$session_root/token"
  chmod 600 "$session_root/token"

  node -e 'const fs=require("fs"); const p=process.argv[1]; const v=JSON.parse(fs.readFileSync(p,"utf8")); v.expiresAt="2000-01-01T00:00:00.000Z"; fs.writeFileSync(p, JSON.stringify(v)+"\n", {mode:0o600});' "$session_root/session.json"
  assert_rsp_failure 1 rsp-app-unavailable "$output_root/doctor-expired-session" "$rsp" doctor
  cp "$session_backup" "$session_root/session.json"
  chmod 600 "$session_root/session.json"

  mv "$session_root/session.json" "$session_root/session.native-smoke-backup"
  assert_rsp_failure 1 rsp-app-unavailable "$output_root/doctor-missing-session" "$rsp" doctor
  mv "$session_root/session.native-smoke-backup" "$session_root/session.json"

  if [[ "$second_instance" == "yes" ]]; then
    env \
      HOME="$home_root" \
      AXMORF_PHASE_A_NATIVE_GATE=1 \
      AXMORF_PHASE_A_SMOKE_HOME="$home_root" \
      AXMORF_PHASE_A_SMOKE_OUTPUT="$output_root" \
      AXMORF_PHASE_A_SMOKE_SELECTION="$selection" \
      AXMORF_PHASE_A_SMOKE_USER_DATA="$user_data_root" \
      AXMORF_PHASE_A_SMOKE_WORKSPACE="$workspace_root" \
      "$app_executable" >/dev/null 2>&1 &
    local second_pid=$!
    local remaining=60
    while kill -0 "$second_pid" 2>/dev/null && [[ $remaining -gt 0 ]]; do
      sleep 1
      remaining=$((remaining - 1))
    done
    [[ $remaining -gt 0 ]]
    kill -0 "$app_pid"
  fi

  printf 'continue\n' >"$output_root/continue"
  wait "$app_pid"
  [[ ! -e "$session_root/rsp.sock" ]]
  [[ ! -e "$session_root/session.json" ]]
  [[ ! -e "$session_root/token" ]]
  for pid in "${owned_pids[@]:1}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "desktop-native-gate-orphan-process:$pid" >&2
      return 1
    fi
  done
  assert_rsp_failure 1 rsp-app-unavailable "$output_root/doctor-app-offline" "$rsp" doctor
  rm -f "$credential_backup" "$session_backup" "$app_log"
}

default_home="$RUNNER_TEMP/axmorf-native-default-home"
default_workspace="$default_home/Movies/AXMORF Studio"
custom_home="$RUNNER_TEMP/axmorf-native-custom-home"
custom_workspace="$RUNNER_TEMP/axmorf-native-custom-workspace"

run_app default-selection "$default_home" "$default_workspace" yes default
grep -Fq '"secondInstanceFocused":true' "$evidence_root/default-selection/lifecycle.json"
grep -Fq '"windowVisibleAfterSecondInstance":true' "$evidence_root/default-selection/lifecycle.json"
run_app custom-selection "$custom_home" "$custom_workspace" no custom
run_app reopen "$custom_home" "$custom_workspace" no reopen

for required in AGENTS.md CLAUDE.md GEMINI.md .agents/skills/remotion-story-producer-video/SKILL.md .rsp/hermes/INSTALL_PROMPT.md; do
  test -f "$custom_workspace/$required"
done
{
  echo 'codexDiscovery=green'
  if command -v hermes >/dev/null 2>&1; then
    echo 'hermes=available-manual-smoke-required'
  else
    echo 'hermes=pending-cli-unavailable'
  fi
} >"$evidence_root/agent-discovery.txt"

echo '{"nativeGateRunner":"green","fixtureOrDeliveryUploaded":false}' >"$evidence_root/runner-summary.json"
