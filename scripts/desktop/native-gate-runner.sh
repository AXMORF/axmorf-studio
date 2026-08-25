#!/usr/bin/env bash
set -Eeuo pipefail

trap 'status=$?; printf "desktop-native-gate-runner-failed:line=%s:function=%s:command=%s:exit=%s\n" "$LINENO" "${FUNCNAME[0]:-main}" "$BASH_COMMAND" "$status" >&2; exit "$status"' ERR

app_path=${1:?packaged .app path is required}
evidence_root=${2:?evidence root is required}
repository_root=${3:-$(pwd)}
expected_architecture=${4:?expected architecture is required}
app_executable="$app_path/Contents/MacOS/AXMORF Studio"
host_node=$(command -v node)
runtime_bin="$app_path/Contents/Resources/runtime-pack/bin"
network_evidence="$repository_root/scripts/desktop/native-network-evidence.ts"
architecture_evidence="$repository_root/scripts/desktop/native-architecture-evidence.ts"
if [[
  "$(uname -s)" != "Darwin" ||
  ! -x "$app_executable" ||
  ! -x "$host_node" ||
  ! -x "$runtime_bin/ffmpeg" ||
  ! -x "$runtime_bin/ffprobe" ||
  ! -f "$network_evidence" ||
  ! -f "$architecture_evidence"
]]; then
  echo "desktop-native-gate-input-invalid" >&2
  exit 1
fi
mkdir -p "$evidence_root"
"$host_node" --import tsx "$architecture_evidence" assert-host \
  --architecture "$expected_architecture" \
  --output "$evidence_root/host-native-identity.json"
"$host_node" --import tsx "$architecture_evidence" assert-package \
  --architecture "$expected_architecture" \
  --app "$app_path" \
  --output "$evidence_root/package-native-identity.json"

app_process_running() {
  local app_pid=$1
  local state
  state=$(ps -p "$app_pid" -o stat= 2>/dev/null | tr -d ' ') || return 1
  [[ -n "$state" && "$state" != Z* ]]
}

wait_for_file() {
  local wanted=$1
  local failure=$2
  local app_pid=$3
  local remaining=${4:-300}
  while [[ ! -f "$wanted" && $remaining -gt 0 ]]; do
    if [[ -f "$failure" ]] || ! app_process_running "$app_pid"; then
      return 1
    fi
    sleep 1
    remaining=$((remaining - 1))
  done
  [[ -f "$wanted" ]]
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
  test "$actual_exit" -eq "$expected_exit"
  test ! -s "$output.stdout"
  "$host_node" -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (payload.code !== process.argv[2] || typeof payload.message !== "string") process.exit(1);
  ' "$output.stderr" "$expected_code"
}

set_network_phase() {
  local output_root=$1
  local phase=$2
  printf '%s\n' "$phase" >"$output_root/network-phase"
}

start_network_monitor() {
  local app_pid=$1
  local output_root=$2
  set_network_phase "$output_root" idle-before
  "$host_node" --import tsx "$network_evidence" monitor \
    --root-pid "$app_pid" \
    --phase-file "$output_root/network-phase" \
    --stop-file "$output_root/network-monitor-stop" \
    --output "$output_root/network-samples.jsonl" &
  NETWORK_MONITOR_PID=$!
  sleep 1
  app_process_running "$app_pid"
}

stop_network_monitor() {
  local output_root=$1
  local monitor_pid=$2
  printf 'stop\n' >"$output_root/network-monitor-stop"
  wait "$monitor_pid"
}

assert_network_evidence() {
  local output_root=$1
  local required_active_phase=$2
  local ephemeral_first
  local ephemeral_last
  ephemeral_first=$(sysctl -n net.inet.ip.portrange.first)
  ephemeral_last=$(sysctl -n net.inet.ip.portrange.last)
  "$host_node" --import tsx "$network_evidence" assert \
    --input "$output_root/network-samples.jsonl" \
    --required-active-phases "$required_active_phase" \
    --ephemeral-first "$ephemeral_first" \
    --ephemeral-last "$ephemeral_last" \
    --listener-events-directory "$output_root" \
    >"$output_root/network-summary.json"
}

assert_process_cleanup() {
  local output_root=$1
  local remaining=300
  while ! "$host_node" --import tsx "$network_evidence" \
    assert-process-cleanup \
    --input "$output_root/network-samples.jsonl" \
    >"$output_root/process-cleanup.json" 2>"$output_root/process-cleanup.stderr"; do
    remaining=$((remaining - 1))
    if [[ $remaining -le 0 ]]; then
      sed -n '1,80p' "$output_root/process-cleanup.stderr" >&2
      return 1
    fi
    sleep 0.1
  done
  rm -f "$output_root/process-cleanup.stderr"
}

assert_session_cleanup() {
  local workspace_root=$1
  local output_root=$2
  local session_root="$workspace_root/.rsp/session"
  local lock_root="$workspace_root/.rsp/locks"
  for path in \
    "$session_root/rsp.sock" \
    "$session_root/session.json" \
    "$session_root/token"; do
    test ! -e "$path"
  done
  if [[ -d "$session_root" ]] && \
    find "$session_root" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    echo "desktop-native-session-cleanup-incomplete" >&2
    return 1
  fi
  if [[ -d "$lock_root" ]] && \
    find "$lock_root" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    echo "desktop-native-operation-lock-cleanup-incomplete" >&2
    return 1
  fi
  printf '%s\n' \
    '{"sessionSocketAbsent":true,"sessionMetadataAbsent":true,"sessionTokenAbsent":true,"sessionDirectoryEmpty":true,"operationLocksEmpty":true}' \
    >"$output_root/session-cleanup.json"
}

assert_disposable_staging_cleanup() {
  local home_root=$1
  local output_root=$2
  local cache_root="$home_root/Library/Caches/com.axmorf.studio"
  if [[ -L "$cache_root" ]]; then
    echo "desktop-native-cache-root-symlink" >&2
    return 1
  fi
  if [[ -d "$cache_root" ]] && \
    find "$cache_root" -mindepth 1 -maxdepth 1 \
      -name 'workspace-delivery-*' -print -quit | grep -q .; then
    echo "desktop-native-disposable-staging-cleanup-incomplete" >&2
    return 1
  fi
  printf '%s\n' \
    '{"disposableBuildPrefix":"workspace-delivery-","remainingDisposableBuildDirectories":[],"clean":true}' \
    >"$output_root/staging-cleanup.json"
}

assert_exact_delivery() {
  local workspace_root=$1
  local output_root=$2
  local delivery="$workspace_root/deliveries/desktop-native-fixture"
  local entries
  entries=$(find "$delivery" -mindepth 1 -maxdepth 1 -print | \
    sed 's#.*/##' | LC_ALL=C sort)
  test "$entries" = $'cover-3x4.png\ncover-4x3.png\npublish.json\nvideo.mp4'
  while IFS= read -r path; do
    test -f "$path" && test ! -L "$path"
  done < <(find "$delivery" -mindepth 1 -maxdepth 1 -print)

  DYLD_LIBRARY_PATH="$runtime_bin" "$runtime_bin/ffprobe" -v error \
    -err_detect explode -count_frames \
    -show_entries stream=codec_type,codec_name,channels,width,height,r_frame_rate,nb_read_frames \
    -of json "$delivery/video.mp4" >"$output_root/video-probe.json"
  DYLD_LIBRARY_PATH="$runtime_bin" "$runtime_bin/ffprobe" -v error \
    -err_detect explode -count_frames -select_streams v:0 \
    -show_entries stream=codec_name,width,height,nb_read_frames \
    -of json "$delivery/cover-4x3.png" >"$output_root/cover-4x3-probe.json"
  DYLD_LIBRARY_PATH="$runtime_bin" "$runtime_bin/ffprobe" -v error \
    -err_detect explode -count_frames -select_streams v:0 \
    -show_entries stream=codec_name,width,height,nb_read_frames \
    -of json "$delivery/cover-3x4.png" >"$output_root/cover-3x4-probe.json"
  "$host_node" -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const probe = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const publish = JSON.parse(fs.readFileSync(path.join(root, "publish.json"), "utf8"));
    const streams = probe.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    if (streams.length !== 2 || video?.codec_name !== "h264" || audio?.codec_name !== "aac") process.exit(1);
    if (audio.channels !== publish.artifacts?.video?.media?.audioChannels || ![1, 2].includes(audio.channels) || !Number.isSafeInteger(Number(audio.nb_read_frames)) || Number(audio.nb_read_frames) <= 0) process.exit(1);
    if (video.width !== publish.width || video.height !== publish.height || video.r_frame_rate !== `${publish.fps}/1` || Number(video.nb_read_frames) !== publish.frameCount) process.exit(1);
    const publishedVideo = publish.artifacts.video.media;
    if (publishedVideo.codec !== "h264" || publishedVideo.audioCodec !== "aac" || publishedVideo.width !== video.width || publishedVideo.height !== video.height || publishedVideo.fps !== publish.fps || publishedVideo.frameCount !== Number(video.nb_read_frames) || publishedVideo.decodedToEof !== true) process.exit(1);
    const files = {video: "video.mp4", cover4x3: "cover-4x3.png", cover3x4: "cover-3x4.png"};
    for (const [key, name] of Object.entries(files)) {
      const bytes = fs.readFileSync(path.join(root, name));
      const checksum = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
      if (publish.artifacts?.[key]?.logicalPath !== `deliveries/desktop-native-fixture/${name}` || publish.artifacts[key].checksum !== checksum || publish.artifacts[key].sizeBytes !== bytes.length || publish.artifacts[key].media?.decodedToEof !== true) process.exit(1);
    }
    const pngSize = (name) => {
      const bytes = fs.readFileSync(path.join(root, name));
      if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.subarray(12, 16).toString("ascii") !== "IHDR") process.exit(1);
      return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    };
    if (String(pngSize("cover-4x3.png")) !== "1600,1200" || String(pngSize("cover-3x4.png")) !== "1200,1600") process.exit(1);
    const cover4x3 = publish.artifacts.cover4x3.media;
    const cover3x4 = publish.artifacts.cover3x4.media;
    if (cover4x3.imageFormat !== "png" || cover4x3.width !== 1600 || cover4x3.height !== 1200 || cover4x3.decodedToEof !== true || cover3x4.imageFormat !== "png" || cover3x4.width !== 1200 || cover3x4.height !== 1600 || cover3x4.decodedToEof !== true) process.exit(1);
    const coverProbes = [
      [JSON.parse(fs.readFileSync(process.argv[3], "utf8")), 1600, 1200],
      [JSON.parse(fs.readFileSync(process.argv[4], "utf8")), 1200, 1600],
    ];
    for (const [coverProbe, width, height] of coverProbes) {
      const [stream] = coverProbe.streams ?? [];
      if (coverProbe.streams?.length !== 1 || stream?.codec_name !== "png" || stream.width !== width || stream.height !== height || Number(stream.nb_read_frames) !== 1) process.exit(1);
    }
    process.stdout.write(JSON.stringify({deliveryBuildId: publish.deliveryBuildId, revisionId: publish.revisionId, sourceCurrentId: publish.sourceCurrentId, rendererRuntimeFingerprint: publish.rendererRuntimeFingerprint, artifacts: publish.artifacts}) + "\n");
  ' "$delivery" "$output_root/video-probe.json" \
    "$output_root/cover-4x3-probe.json" "$output_root/cover-3x4-probe.json" \
    >"$output_root/delivery-evidence.json"
}

launch_app() {
  local home_root=$1
  local workspace_root=$2
  local output_root=$3
  local selection=$4
  local user_data_root="$home_root/Library/Application Support/com.axmorf.studio"
  local app_log
  app_log=$(mktemp -t axmorf-desktop-native-app.XXXXXX)
  mkdir -p "$home_root" "$workspace_root" "$output_root" "$user_data_root"
  env \
    HOME="$home_root" \
    PATH="$runtime_host_tools_path" \
    AXMORF_DESKTOP_NATIVE_GATE=1 \
    AXMORF_DESKTOP_SMOKE_HOME="$home_root" \
    AXMORF_DESKTOP_SMOKE_OUTPUT="$output_root" \
    AXMORF_DESKTOP_SMOKE_SELECTION="$selection" \
    AXMORF_DESKTOP_SMOKE_USER_DATA="$user_data_root" \
    AXMORF_DESKTOP_SMOKE_WORKSPACE="$workspace_root" \
    GITHUB_SHA="${GITHUB_SHA:-local-unverified}" \
    "$app_executable" >"$app_log" 2>&1 &
  LAUNCHED_APP_PID=$!
  if ! wait_for_file \
    "$output_root/app-ready" \
    "$output_root/native-failure.json" \
    "$LAUNCHED_APP_PID" 300; then
    sed -n '1,120p' "$output_root/native-failure.json" >&2 2>/dev/null || true
    sed -n '1,120p' "$app_log" >&2 || true
    return 1
  fi
  start_network_monitor "$LAUNCHED_APP_PID" "$output_root"
}

run_second_instance_probe() {
  local home_root=$1
  local workspace_root=$2
  local output_root=$3
  local user_data_root="$home_root/Library/Application Support/com.axmorf.studio"
  local second_instance_log
  second_instance_log=$(mktemp -t axmorf-desktop-second-instance.XXXXXX)
  env \
    HOME="$home_root" \
    PATH="$runtime_host_tools_path" \
    AXMORF_DESKTOP_NATIVE_GATE=1 \
    AXMORF_DESKTOP_SMOKE_HOME="$home_root" \
    AXMORF_DESKTOP_SMOKE_OUTPUT="$output_root" \
    AXMORF_DESKTOP_SMOKE_SELECTION=custom \
    AXMORF_DESKTOP_SMOKE_USER_DATA="$user_data_root" \
    AXMORF_DESKTOP_SMOKE_WORKSPACE="$workspace_root" \
    GITHUB_SHA="${GITHUB_SHA:-local-unverified}" \
    "$app_executable" --desktop-native-second-instance \
      >"$second_instance_log" 2>&1 &
  local second_instance_pid=$!
  local remaining=300
  while app_process_running "$second_instance_pid" && [[ $remaining -gt 0 ]]; do
    sleep 0.1
    remaining=$((remaining - 1))
  done
  if app_process_running "$second_instance_pid"; then
    kill "$second_instance_pid" 2>/dev/null || true
    wait "$second_instance_pid" 2>/dev/null || true
    echo "desktop-native-second-instance-timeout" >&2
    return 1
  fi
  local second_instance_exit=0
  set +e
  wait "$second_instance_pid"
  second_instance_exit=$?
  set -e
  if [[ $second_instance_exit -ne 0 ]]; then
    sed -n '1,120p' "$second_instance_log" >&2
    return 1
  fi
  printf '%s\n' \
    '{"sharedHome":true,"sharedUserData":true,"boundedExit":true,"exitCode":0}' \
    >"$output_root/second-instance.json"
}

assert_native_listener_request_surface() {
  local port=$1
  local output_root=$2
  "$host_node" -e '
    const fs = require("fs");
    const http = require("http");
    const port = Number(process.argv[1]);
    const output = process.argv[2];
    const privatePaths = [
      "/private",
      "/private/producer-config.json",
      "/config",
      "/.rsp",
      "/.rsp/session/token",
      "/settings",
      "/api",
    ];
    const proxyPath = `/proxy?src=${encodeURIComponent("http://127.0.0.1:1/native-sentinel")}`;
    const request = (path) => new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const client = http.request({host: "127.0.0.1", port, path, method: "GET"}, (response) => {
        let sizeBytes = 0;
        response.on("data", (chunk) => { sizeBytes += chunk.length; });
        response.once("end", () => resolve({
          path,
          statusCode: response.statusCode,
          sizeBytes,
          durationMs: Date.now() - startedAt,
        }));
      });
      client.setTimeout(3000, () => client.destroy(new Error("native-listener-request-timeout")));
      client.once("error", reject);
      client.end();
    });
    Promise.all([...privatePaths, proxyPath].map(request)).then((results) => {
      const privateResults = results.slice(0, privatePaths.length);
      const proxyResult = results.at(-1);
      if (privateResults.some(({statusCode}) => !Number.isInteger(statusCode) || (statusCode >= 200 && statusCode < 300))) {
        throw new Error("native-listener-exposed-private-request-surface");
      }
      if (!Number.isInteger(proxyResult?.statusCode) || proxyResult.statusCode < 400 || proxyResult.statusCode >= 500) {
        throw new Error("native-listener-accepted-remote-proxy-source");
      }
      fs.writeFileSync(output, `${JSON.stringify({host: "127.0.0.1", port, results})}\n`, {flag: "wx"});
    }).catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
  ' "$port" "$output_root/listener-request-surface.json"
}

wait_for_native_delivery_listener() {
  local workspace_root=$1
  local output_root=$2
  local app_pid=$3
  local label=$4
  local gate_root="$workspace_root/.rsp/native-gate"
  local ready="$gate_root/listener-ready.json"
  local last_sequence=""
  local sequence=""
  local remaining=12000
  if [[ -f "$output_root/listener-sequence" ]]; then
    last_sequence=$(<"$output_root/listener-sequence")
  fi
  while [[ $remaining -gt 0 ]]; do
    if [[ -f "$output_root/native-failure.json" ]] || ! app_process_running "$app_pid"; then
      return 1
    fi
    if [[ -f "$ready" ]]; then
      sequence=$("$host_node" -e '
        try {
          const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
          if (Number.isInteger(value.sequence) && value.sequence > 0) process.stdout.write(String(value.sequence));
        } catch {}
      ' "$ready")
      if [[
        -n "$sequence" &&
        ( -z "$last_sequence" || "$sequence" -gt "$last_sequence" )
      ]]; then
        break
      fi
    fi
    sleep 0.05
    remaining=$((remaining - 1))
  done
  if [[
    -z "$sequence" ||
    ( -n "$last_sequence" && "$sequence" -le "$last_sequence" )
  ]]; then
    echo "desktop-native-listener-ready-missing" >&2
    return 1
  fi
  local captured="$output_root/listener-ready-$label-$sequence.json"
  cp "$ready" "$captured"
  "$host_node" -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (Object.keys(value).sort().join(",") !== "host,port,sequence,storyId" || value.storyId !== "desktop-native-fixture" || value.host !== "127.0.0.1" || !Number.isInteger(value.port) || value.port <= 0 || value.port > 65535 || value.sequence !== Number(process.argv[2])) process.exit(1);
  ' "$captured" "$sequence"
  NATIVE_LISTENER_PORT=$("$host_node" -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(value.port));
  ' "$captured")
  printf '%s\n' "$sequence" >"$output_root/listener-sequence"
  if [[ "$label" = "manual-1" ]]; then
    assert_native_listener_request_surface "$NATIVE_LISTENER_PORT" "$output_root"
  fi
  # Keep each real socket open across multiple independent lsof tree samples.
  sleep 2
  NATIVE_LISTENER_SEQUENCE=$sequence
}

write_native_delivery_action() {
  local workspace_root=$1
  local sequence=$2
  local action=$3
  local gate_root="$workspace_root/.rsp/native-gate"
  test "$action" = continue || test "$action" = fail
  test ! -e "$gate_root/action"
  printf '{"sequence":%s,"action":"%s"}\n' \
    "$sequence" "$action" >"$gate_root/action.tmp"
  chmod 600 "$gate_root/action.tmp"
  mv "$gate_root/action.tmp" "$gate_root/action"
}

wait_for_native_listener_closed() {
  local workspace_root=$1
  local output_root=$2
  local sequence=$3
  local label=$4
  local gate_root="$workspace_root/.rsp/native-gate"
  local closed="$gate_root/listener-closed.json"
  local remaining=12000
  while [[ $remaining -gt 0 ]]; do
    if [[ -f "$closed" ]] && "$host_node" -e '
      try {
        const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        if (value.sequence === Number(process.argv[2])) process.exit(0);
      } catch {}
      process.exit(1);
    ' "$closed" "$sequence"; then
      break
    fi
    sleep 0.05
    remaining=$((remaining - 1))
  done
  if [[ $remaining -le 0 ]]; then
    echo "desktop-native-listener-closed-missing" >&2
    return 1
  fi
  local captured="$output_root/listener-closed-$label-$sequence.json"
  cp "$closed" "$captured"
  "$host_node" -e '
    const fs = require("fs");
    const ready = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const closed = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const expected = {...ready, closed: true};
    if (JSON.stringify(closed) !== JSON.stringify(expected)) process.exit(1);
  ' "$output_root/listener-ready-$label-$sequence.json" "$captured"
}

release_native_delivery_listeners() {
  local workspace_root=$1
  local output_root=$2
  local app_pid=$3
  local label=$4
  local listener_count=${5:-6}
  local index
  for ((index = 1; index <= listener_count; index += 1)); do
    wait_for_native_delivery_listener \
      "$workspace_root" "$output_root" "$app_pid" "$label-$index"
    write_native_delivery_action \
      "$workspace_root" "$NATIVE_LISTENER_SEQUENCE" continue
    wait_for_native_listener_closed \
      "$workspace_root" "$output_root" "$NATIVE_LISTENER_SEQUENCE" \
      "$label-$index"
  done
}

reject_native_delivery_listener() {
  local workspace_root=$1
  local output_root=$2
  local app_pid=$3
  wait_for_native_delivery_listener \
    "$workspace_root" "$output_root" "$app_pid" failure
  write_native_delivery_action \
    "$workspace_root" "$NATIVE_LISTENER_SEQUENCE" fail
  wait_for_native_listener_closed \
    "$workspace_root" "$output_root" "$NATIVE_LISTENER_SEQUENCE" failure
}

drive_production() {
  local label=$1
  local home_root=$2
  local workspace_root=$3
  local policy=$4
  local output_root="$evidence_root/$label"
  launch_app "$home_root" "$workspace_root" "$output_root" custom
  local app_pid=$LAUNCHED_APP_PID
  local monitor_pid=$NETWORK_MONITOR_PID
  local rsp="$workspace_root/.rsp/bin/rsp"
  test -x "$rsp"
  "$host_node" -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const settings = value.settings;
    if (settings.initialStatus !== "not-configured" || settings.savedStatus !== "ready" || settings.providerId !== "native-gate-edge" || !settings.providerFormVisible || !settings.rawJsonEditorAbsent || !settings.secretValuesAbsent || !settings.encryptedAuthorityVisible) process.exit(1);
  ' "$output_root/settings-probe.json"
  test -s "$output_root/desktop-settings.png"

  "$rsp" doctor >"$output_root/doctor.json"
  "$host_node" -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const expectedNetwork = {controlPlane:"authenticated-unix-domain-socket-only",persistentTcpListeners:false,deliveryBuildListener:{transport:"http",host:"127.0.0.1",portAllocation:"os-ephemeral",scope:"delivery-build"}};
    if (value.protocolVersion !== "rsp-local-v2" || value.adapterMode !== "workspace" || value.runtimePackMode !== "embedded" || value.runtimePack.architecture !== process.argv[2] || JSON.stringify(value.network) !== JSON.stringify(expectedNetwork) || !value.productionAvailable || !value.deliveryAvailable || value.deliveryBlocker !== null || !value.runtimePackAvailable || value.distributionReady || value.provider !== "ready") process.exit(1);
  ' "$output_root/doctor.json" "$expected_architecture"

  local token="$workspace_root/.rsp/session/token"
  local saved_token="$gate_runtime_root/$label-session-token.backup"
  cp "$token" "$saved_token"
  printf '%064d\n' 0 >"$token"
  chmod 600 "$token"
  assert_rsp_failure 4 rsp-unauthorized "$output_root/auth-reject" "$rsp" doctor
  cp "$saved_token" "$token"
  chmod 600 "$token"
  rm "$saved_token"

  local outside="$output_root/outside-rsp"
  cp "$rsp" "$outside"
  chmod 755 "$outside"
  assert_rsp_failure 3 rsp-workspace-invalid "$output_root/path-reject" "$outside" doctor
  rm "$outside"

  "$rsp" help --json >"$output_root/rsp-help.json"
  "$rsp" schema project-create >"$output_root/project-create-schema.json"
  "$rsp" schema asset-import >"$output_root/asset-import-schema.json"
  "$rsp" project create-context >"$output_root/project-create-context.json"
  "$host_node" -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const forbidden = ["command", "input", "protocolVersion", "requestId", "workspaceId"];
    if (value.protocolVersion !== "rsp-local-v2" || value.stdin !== "raw-project-create-input" || value.schemaScope !== "structural-and-cross-field-static" || value.operationalValidation?.contextCommand !== "./.rsp/bin/rsp project create-context" || value.sceneTemplatesOmission !== "inherit-producer-config-defaults" || JSON.stringify(value.forbiddenWrapperFields) !== JSON.stringify(forbidden) || value.jsonSchema.additionalProperties !== false || "sceneTemplates" in value.example) process.exit(1);
  ' "$output_root/project-create-schema.json"
  "$host_node" --import tsx \
    "$repository_root/scripts/desktop/native-fixture.ts" create-input \
    >"$output_root/project-create-input.json"
  "$host_node" -e '
    const fs = require("fs");
    const input = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    fs.writeFileSync(process.argv[2], JSON.stringify({command:"project-create",input,protocolVersion:"rsp-local-v2"}));
  ' "$output_root/project-create-input.json" "$output_root/project-create-wrapper.json"
  "$rsp" project validate <"$output_root/project-create-input.json" \
    >"$output_root/project-create-validation.json"
  "$host_node" -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (value.status !== "project-create-valid" || value.storyId !== "desktop-native-fixture" || value.issues.length !== 0) process.exit(1);
  ' "$output_root/project-create-validation.json"
  assert_rsp_failure 5 rsp-request-invalid \
    "$output_root/project-create-wrapper-reject" \
    "$rsp" project create <"$output_root/project-create-wrapper.json"
  "$host_node" -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (!Array.isArray(value.issues) || value.issues[0]?.path !== "$" || value.issues[0]?.code !== "rsp-project-create-wrapper-forbidden") process.exit(1);
  ' "$output_root/project-create-wrapper-reject.stderr"
  "$rsp" project create <"$output_root/project-create-input.json" \
    >"$output_root/project-create.json"
  rm "$output_root/project-create-input.json" "$output_root/project-create-wrapper.json"
  "$rsp" context --project desktop-native-fixture >"$output_root/context.json"

  test ! -e "$workspace_root/.rsp/attempts/desktop-native-fixture"
  "$rsp" inspect --project desktop-native-fixture >"$output_root/inspect-before.json"
  test ! -e "$workspace_root/.rsp/attempts/desktop-native-fixture"

  "$rsp" prepare --project desktop-native-fixture --delivery-policy "$policy" \
    >"$output_root/prepare.json"
  "$host_node" --import tsx \
    "$repository_root/scripts/desktop/native-fixture.ts" execute-agent-tasks \
    --workspace "$workspace_root" <"$output_root/prepare.json" \
    >"$output_root/agent-tasks.json"

  local attempt_id
  local revision_id
  attempt_id=$("$host_node" -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).attemptId' "$output_root/prepare.json")
  revision_id=$("$host_node" -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).revisionId' "$output_root/prepare.json")
  "$host_node" -e '
    const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    for (const task of p.dirtyAgentTasks) process.stdout.write(task.taskRevision+"\n");
  ' "$output_root/prepare.json" >"$output_root/task-revisions.txt"
  while IFS= read -r task_revision; do
    "$rsp" task finalize --task "$task_revision" >>"$output_root/task-finalizes.jsonl"
    "$rsp" task check --task "$task_revision" >>"$output_root/task-checks.jsonl"
    "$rsp" task commit --task "$task_revision" --attempt "$attempt_id" \
      >>"$output_root/task-commits.jsonl"
  done <"$output_root/task-revisions.txt"
  "$rsp" inspect --project desktop-native-fixture \
    >"$output_root/inspect-after-tasks.json"

  if [[ "$policy" = manual ]]; then
    set_network_phase "$output_root" manual-source-current
    "$rsp" continue \
      --project desktop-native-fixture \
      --revision "$revision_id" \
      --attempt "$attempt_id" \
      --delivery-policy manual >"$output_root/continuation.json"
    test -s "$workspace_root/.rsp/current/source/desktop-native-fixture.json"
    test ! -e "$workspace_root/deliveries/desktop-native-fixture"
    set_network_phase "$output_root" manual-delivery
    release_native_delivery_listeners \
      "$workspace_root" "$output_root" "$app_pid" manual &
    local release_pid=$!
    "$rsp" delivery build --project desktop-native-fixture \
      >"$output_root/delivery-build.json"
    wait "$release_pid"
    set_network_phase "$output_root" idle-after-manual
  else
    test "$policy" = automatic
    set_network_phase "$output_root" automatic-delivery
    release_native_delivery_listeners \
      "$workspace_root" "$output_root" "$app_pid" automatic &
    local release_pid=$!
    "$rsp" continue \
      --project desktop-native-fixture \
      --revision "$revision_id" \
      --attempt "$attempt_id" \
      --delivery-policy automatic >"$output_root/continuation.json"
    wait "$release_pid"
    set_network_phase "$output_root" idle-after-automatic
  fi
  test -s "$workspace_root/.rsp/current/source/desktop-native-fixture.json"
  assert_exact_delivery "$workspace_root" "$output_root"
  "$rsp" inspect --project desktop-native-fixture >"$output_root/inspect-current.json"
  "$rsp" doctor >"$output_root/doctor-current.json"
  "$host_node" -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (!value.deliveryAvailable || value.deliveryBlocker !== null || value.previewCatalog.entryCount !== 1 || value.activeWork !== null) process.exit(1);
  ' "$output_root/doctor-current.json"

  if [[ "$policy" = manual ]]; then
    local delivery="$workspace_root/deliveries/desktop-native-fixture"
    local delivery_backup="$workspace_root/deliveries/.native-gate-success-backup"
    test ! -e "$delivery_backup"
    mv "$delivery" "$delivery_backup"
    set_network_phase "$output_root" failure-delivery
    reject_native_delivery_listener \
      "$workspace_root" "$output_root" "$app_pid" &
    local reject_pid=$!
    assert_rsp_failure 6 rsp-command-failed \
      "$output_root/delivery-failure" \
      "$rsp" delivery build --project desktop-native-fixture
    wait "$reject_pid"
    test ! -e "$delivery"
    set_network_phase "$output_root" idle-after-failure
    sleep 1
    mv "$delivery_backup" "$delivery"
    assert_exact_delivery "$workspace_root" "$output_root"
  fi

  printf 'ready\n' >"$output_root/delivery-ready"
  wait_for_file "$output_root/native-report.json" "$output_root/native-failure.json" "$app_pid" 600
  run_second_instance_probe "$home_root" "$workspace_root" "$output_root"
  sleep 2
  if [[ "$policy" = manual ]]; then
    local delivery="$workspace_root/deliveries/desktop-native-fixture"
    local quit_backup="$workspace_root/deliveries/.native-gate-quit-backup"
    test ! -e "$quit_backup"
    mv "$delivery" "$quit_backup"
    set_network_phase "$output_root" quit-delivery
    set +e
    "$rsp" delivery build --project desktop-native-fixture \
      >"$output_root/quit-delivery.stdout" \
      2>"$output_root/quit-delivery.stderr" &
    local quit_build_pid=$!
    set -e
    wait_for_native_delivery_listener \
      "$workspace_root" "$output_root" "$app_pid" quit
    printf 'quit\n' >"$output_root/request-quit"
    wait "$app_pid"
    wait_for_native_listener_closed \
      "$workspace_root" "$output_root" "$NATIVE_LISTENER_SEQUENCE" quit
    set +e
    wait "$quit_build_pid"
    local quit_build_exit=$?
    set -e
    test "$quit_build_exit" -ne 0
    test -f "$output_root/quit-request-observed"
    test ! -e "$delivery"
    set_network_phase "$output_root" idle-after-quit
    sleep 1
  else
    printf 'continue\n' >"$output_root/continue"
    wait "$app_pid"
  fi
  stop_network_monitor "$output_root" "$monitor_pid"
  if [[ "$policy" = manual ]]; then
    assert_network_evidence \
      "$output_root" "manual-delivery,failure-delivery,quit-delivery"
  else
    assert_network_evidence "$output_root" automatic-delivery
  fi
  assert_process_cleanup "$output_root"
  assert_session_cleanup "$workspace_root" "$output_root"
  assert_disposable_staging_cleanup "$home_root" "$output_root"
  if [[ "$policy" = manual ]]; then
    mv \
      "$workspace_root/deliveries/.native-gate-quit-backup" \
      "$workspace_root/deliveries/desktop-native-fixture"
    assert_exact_delivery "$workspace_root" "$output_root"
  fi
  "$host_node" -e '
    const value=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    if (!value.secondInstanceFocused || !value.windowVisibleAfterSecondInstance) process.exit(1);
  ' "$output_root/lifecycle.json"
}

gate_runtime_root=$(mktemp -d "${TMPDIR:-/tmp}/axmorf-desktop-native.XXXXXX")
case "$gate_runtime_root" in
  "${TMPDIR:-/tmp}"/axmorf-desktop-native.*) ;;
  *)
    echo "desktop-native-gate-temp-root-invalid" >&2
    exit 1
    ;;
esac
runtime_host_tools_path="$gate_runtime_root/no-host-tools"
mkdir -p "$runtime_host_tools_path"
cleanup_gate_runtime_root() {
  for pair in \
    "manual:${manual_workspace:-}" \
    "automatic:${automatic_workspace:-}"; do
    local label=${pair%%:*}
    local workspace=${pair#*:}
    local diagnostic="$workspace/.rsp/native-gate/command-failure.json"
    if [[ -n "$workspace" && -f "$diagnostic" && ! -L "$diagnostic" ]]; then
      cp "$diagnostic" "$evidence_root/$label-command-failure.json"
    fi
    if [[ -n "$workspace" ]]; then
      local attempt_root="$workspace/.rsp/attempts/desktop-native-fixture"
      local progress_paths=()
      if [[ -d "$attempt_root" && ! -L "$attempt_root" ]]; then
        while IFS= read -r progress_path; do
          progress_paths+=("$progress_path")
        done < <(
          find "$attempt_root" \
            -mindepth 2 \
            -maxdepth 2 \
            -name progress.generated.json \
            -type f \
            -print | LC_ALL=C sort
        )
        if [[ ${#progress_paths[@]} -eq 1 ]]; then
          "$host_node" -e '
            const fs = require("fs");
            const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
            const terminal = value.terminalResult;
            const summary = value.taskOutcomeSummary;
            const output = {
              contractVersion: "desktop-native-attempt-terminal-v1",
              state: value.state,
              diagnosticCode: value.diagnosticCode,
              terminalStatus: terminal?.status ?? null,
              terminalDiagnosticCode: terminal?.diagnosticCode ?? null,
              taskOutcomeSummary: summary === undefined ? null : {
                committedTaskCount: summary.committedTaskCount,
                currentTaskCount: summary.currentTaskCount,
                failedTaskCount: summary.failedTaskCount,
              },
            };
            fs.writeFileSync(process.argv[2], `${JSON.stringify(output)}\n`, {
              encoding: "utf8",
              flag: "wx",
              mode: 0o600,
            });
          ' "${progress_paths[0]}" "$evidence_root/$label-attempt-terminal.json"
        fi
      fi
    fi
  done
  rm -rf -- "$gate_runtime_root"
}
trap cleanup_gate_runtime_root EXIT
manual_home="$gate_runtime_root/manual-home"
manual_workspace="$gate_runtime_root/manual-workspace"
drive_production manual "$manual_home" "$manual_workspace" manual

automatic_home="$gate_runtime_root/automatic-home"
automatic_workspace="$gate_runtime_root/automatic-workspace"
drive_production automatic "$automatic_home" "$automatic_workspace" automatic

reopen_output="$evidence_root/reopen"
launch_app "$manual_home" "$manual_workspace" "$reopen_output" reopen
reopen_pid=$LAUNCHED_APP_PID
reopen_monitor_pid=$NETWORK_MONITOR_PID
printf 'ready\n' >"$reopen_output/delivery-ready"
wait_for_file "$reopen_output/native-report.json" "$reopen_output/native-failure.json" "$reopen_pid" 600
set_network_phase "$reopen_output" idle-after-reopen
printf 'continue\n' >"$reopen_output/continue"
wait "$reopen_pid"
stop_network_monitor "$reopen_output" "$reopen_monitor_pid"
"$host_node" --import tsx "$network_evidence" assert-idle \
  --input "$reopen_output/network-samples.jsonl" \
  >"$reopen_output/network-summary.json"
assert_process_cleanup "$reopen_output"
assert_session_cleanup "$manual_workspace" "$reopen_output"
assert_disposable_staging_cleanup "$manual_home" "$reopen_output"

for required in \
  AGENTS.md CLAUDE.md GEMINI.md \
  .agents/skills/remotion-story-producer-video/SKILL.md \
  .rsp/hermes/INSTALL_PROMPT.md; do
  test -f "$manual_workspace/$required"
done

"$host_node" -e '
  const fs = require("fs");
  fs.writeFileSync(process.argv[1], `${JSON.stringify({
    contractVersion: "desktop-native-runner-v2",
    status: "native-evidence-complete",
    architecture: process.argv[2],
    sourceCurrent: true,
    nativeProductionEvidence: true,
    deterministicFixture: true,
    externalCreativeAgentTested: false,
    offlineRuntimeTested: true,
    hostToolsRequiredAtRuntime: false,
    deliveryBuilt: true,
    manualDeliveryTested: true,
    automaticDeliveryTested: true,
    failureCleanupTested: true,
    quitCleanupTested: true,
    loopbackListenerVerified: true,
    processCleanupVerified: true,
    sessionCleanupVerified: true,
    stagingCleanupVerified: true,
    reopen: true,
    fixtureOrDeliveryUploaded: false,
  })}\n`, {flag: "wx", mode: 0o600});
' "$evidence_root/runner-summary.json" "$expected_architecture"
