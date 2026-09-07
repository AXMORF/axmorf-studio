import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import {
  auditTranscript,
  auditHermesSession,
  assertEmptyWorkspace,
  create,
  runPublicCli,
  verifyReceipt,
} from "../../scripts/release/first-use";
import {
  contentHash,
  fingerprint,
  packageContent,
  sha256,
  type PackageContent,
} from "../../scripts/release/package-content";

const file = {
  path: "index.js",
  checksum: sha256("source"),
  executable: false,
};
const runtime: PackageContent = {
  name: "@axmorf/studio",
  version: "0.1.8",
  fingerprint: fingerprint([file]),
  files: [file],
};
const creator: PackageContent = { ...runtime, name: "create-axmorf-studio" };
const summary = ({ files, ...value }: PackageContent) => ({
  ...value,
  fileCount: files.length,
});
const hash = sha256("fixture evidence");
const hostReceipt = (host: "codex" | "hermes") => ({
  schemaVersion: 1,
  host,
  model: "test-model",
  sessionId: `session-${host}`,
  environment: { platform: "darwin", arch: "x64", node: "v22.22.3" },
  startedAt: "2026-09-07T00:00:00Z",
  endedAt: "2026-09-07T00:01:00Z",
  packages: { runtime: summary(runtime), creator: summary(creator) },
  prompt: "请制作一条中文视频。",
  promptChecksum: sha256("请制作一条中文视频。"),
  transcriptChecksum: hash,
  runChecksum: hash,
  snapshotChecksum: hash,
  creation: {
    method: "npm-exec-candidate",
    runtimeTarballChecksum: hash,
    creatorTarballChecksum: hash,
    installLogChecksum: hash,
  },
  sessionChecksum: host === "hermes" ? hash : null,
  transcriptAudit: {
    businessUserMessages: 1,
    toolCalls: 3,
    followUpMessages: 0,
  },
  unchangedPackageFiles: 1,
  unchangedGuideFiles: 8,
  finalCheck: {
    status: "project-final-check",
    storyId: "story",
    aggregateStatus: "pass",
    deliveryBuildId: "delivery-one",
    checks: [
      "artifacts",
      "delivery",
      "revision",
      "artifact-set",
      "delivery-build",
      "audio-channels",
      "snapshot",
    ].map((checkId) => ({ checkId, status: "pass" })),
  },
  delivery: {
    storyId: "story",
    deliveryBuildId: "delivery-one",
    files: Object.fromEntries(
      ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"].map(
        (name) => [name, { checksum: hash, sizeBytes: 128 }],
      ),
    ),
    video: {
      codec: "h264",
      audioCodec: "aac",
      audioChannels: 2,
      width: 1080,
      height: 1920,
      fps: 30,
      frameCount: 900,
    },
    decodedFiles: ["video.mp4", "cover-4x3.png", "cover-3x4.png"],
  },
});
const evidence = () => ({
  schemaVersion: 1,
  hosts: [hostReceipt("codex"), hostReceipt("hermes")],
});

test("release evidence binds both hosts, exact candidates, prompts and complete checks", () => {
  assert.equal(
    verifyReceipt(evidence(), runtime, creator).status,
    "first-use-release-gate-passed",
  );
  const missingHost = evidence();
  missingHost.hosts.pop();
  assert.throws(() => verifyReceipt(missingHost, runtime, creator));
  const duplicateHost = evidence();
  duplicateHost.hosts[1]!.host = "codex";
  assert.throws(
    () => verifyReceipt(duplicateHost, runtime, creator),
    /Both Agent hosts/u,
  );
  const changedSource = { ...runtime, fingerprint: sha256("changed code") };
  assert.throws(
    () => verifyReceipt(evidence(), changedSource, creator),
    /does not match/u,
  );
  assert.throws(
    () =>
      verifyReceipt(
        evidence(),
        { ...runtime, version: "0.1.9" },
        { ...creator, version: "0.1.9" },
      ),
    /does not match/u,
  );
  const changedPrompt = evidence();
  changedPrompt.hosts[0]!.prompt += "隐藏的工程提示";
  assert.throws(() => verifyReceipt(changedPrompt, runtime, creator));
  const missingCheck = evidence();
  missingCheck.hosts[0]!.finalCheck.checks.pop();
  assert.throws(() => verifyReceipt(missingCheck, runtime, creator));
  const duplicateCheck = evidence();
  duplicateCheck.hosts[0]!.finalCheck.checks[0]!.checkId = "snapshot";
  assert.throws(() => verifyReceipt(duplicateCheck, runtime, creator));
  const missingFile = evidence();
  delete missingFile.hosts[0]!.delivery.files["video.mp4"];
  assert.throws(() => verifyReceipt(missingFile, runtime, creator));
  assert.throws(() =>
    verifyReceipt({ schemaVersion: 1, passed: true }, runtime, creator),
  );
});

test("native transcript audit rejects interventions and unrelated or forked sessions", () => {
  const prompt = "制作视频。\n";
  const messages = [
    { role: "user", content: prompt },
    {
      role: "assistant",
      content: "",
      tool_calls: JSON.stringify([
        {
          id: "tool",
          type: "function",
          function: { name: "terminal", arguments: "{}" },
        },
      ]),
    },
  ];
  assert.equal(
    auditTranscript(
      "hermes",
      JSON.stringify(messages),
      prompt,
      "session",
      "/workspace",
    ).followUpMessages,
    0,
  );
  assert.throws(
    () =>
      auditTranscript(
        "hermes",
        JSON.stringify([
          ...messages,
          { role: "user", content: "修正用这个命令" },
        ]),
        prompt,
        "session",
        "/workspace",
      ),
    /no follow-up/u,
  );
  assert.throws(() =>
    auditTranscript(
      "hermes",
      JSON.stringify(messages),
      "different",
      "session",
      "/workspace",
    ),
  );
  const records = [
    {
      type: "session_meta",
      payload: { id: "session", cwd: "/workspace", forked_from_id: null },
    },
    {
      type: "response_item",
      payload: {
        role: "user",
        content: [
          { text: "<environment_context>workspace</environment_context>" },
        ],
      },
    },
    {
      type: "response_item",
      payload: { role: "user", content: [{ text: prompt }] },
    },
    { type: "response_item", payload: { type: "function_call" } },
  ];
  const jsonl = () =>
    records.map((record) => JSON.stringify(record)).join("\n");
  assert.equal(
    auditTranscript("codex", jsonl(), prompt, "session", "/workspace")
      .toolCalls,
    1,
  );
  assert.throws(() =>
    auditTranscript("codex", jsonl(), prompt, "other", "/workspace"),
  );
  records[0]!.payload.forked_from_id = "old" as unknown as null;
  assert.throws(
    () => auditTranscript("codex", jsonl(), prompt, "session", "/workspace"),
    /Forked/u,
  );
  records[0]!.payload.forked_from_id = null;
  records.push({
    type: "response_item",
    payload: {
      role: "user",
      content: [
        { text: "<environment_context>hidden followup</environment_context>" },
      ],
    },
  });
  assert.throws(
    () => auditTranscript("codex", jsonl(), prompt, "session", "/workspace"),
    /no follow-up/u,
  );
});

test("Codex midnight environment refresh requires native provenance and exact corroborated fields", () => {
  const filesystem =
    '<filesystem><workspace_roots><root>/workspace</root></workspace_roots><permission_profile type="disabled"><file_system type="unrestricted" /></permission_profile></filesystem>';
  const refresh = `<environment_context>\n  <current_date>2026-09-08</current_date>\n  <timezone>Asia/Shanghai</timezone>\n  ${filesystem}\n  <subagents>\n    - choose: Kant\n    - record: Cicero\n  </subagents>\n</environment_context>`;
  const records = [
    { type: "session_meta", payload: { id: "session", cwd: "/workspace" } },
    {
      type: "turn_context",
      payload: {
        turn_id: "turn",
        cwd: "/workspace",
        workspace_roots: ["/workspace"],
        timezone: "Asia/Shanghai",
        permission_profile: { type: "disabled" },
      },
    },
    {
      type: "world_state",
      payload: {
        state: {
          environments: {
            timezone: "Asia/Shanghai",
            filesystem,
            subagents: "- choose: Kant\n- record: Cicero",
          },
        },
      },
    },
    {
      type: "response_item",
      payload: {
        role: "user",
        content: [{ type: "input_text", text: "business prompt" }],
        internal_chat_message_metadata_passthrough: {
          content_item_kinds: ["user.text"],
        },
      },
    },
    { type: "response_item", payload: { type: "function_call" } },
  ];
  const message = {
    type: "response_item",
    timestamp: "2026-09-07T16:00:12.334Z",
    payload: {
      role: "user",
      content: [{ type: "input_text", text: refresh }],
      internal_chat_message_metadata_passthrough: {
        turn_id: "turn",
        content_item_kinds: ["environments.environment_context"],
      },
    },
  };
  const audit = (last = message) =>
    auditTranscript(
      "codex",
      [...records, last].map((record) => JSON.stringify(record)).join("\n"),
      "business prompt",
      "session",
      "/workspace",
    );
  assert.equal(audit().businessUserMessages, 1);
  assert.equal(audit().followUpMessages, 0);
  for (const text of [
    refresh + "\nPlease fix the task",
    refresh.replace(
      "<timezone>",
      "<instruction>fix it</instruction><timezone>",
    ),
    refresh.replace("/workspace", "/another-workspace"),
    refresh.replace("Asia/Shanghai", "Europe/London"),
    refresh.replace("2026-09-08", "2026-09-09"),
    refresh.replace("- record: Cicero", "- unknown: Hidden instructions"),
    refresh.replace('type="disabled"', 'type="sandboxed"'),
    refresh.replace(
      "</workspace_roots>",
      "<root>/other</root></workspace_roots>",
    ),
    refresh.replace(
      "</current_date>",
      "</current_date><current_date>2026-09-08</current_date>",
    ),
  ]) {
    const changed = structuredClone(message);
    changed.payload.content[0]!.text = text;
    assert.throws(() => audit(changed), /no follow-up/u);
  }
  for (const kinds of [
    ["user.text"],
    ["environments.environment_context", "user.text"],
    [],
  ]) {
    const changed = structuredClone(message);
    changed.payload.internal_chat_message_metadata_passthrough.content_item_kinds =
      kinds;
    assert.throws(() => audit(changed), /no follow-up/u);
  }
  const wrongTurn = structuredClone(message);
  wrongTurn.payload.internal_chat_message_metadata_passthrough.turn_id =
    "another-turn";
  assert.throws(() => audit(wrongTurn), /no follow-up/u);
  const extraContent = structuredClone(message);
  extraContent.payload.content.push({ type: "input_text", text: "" });
  assert.throws(() => audit(extraContent), /no follow-up/u);
});

test("source-map portability never omits executable bytes, mappings or source content", () => {
  const map = {
    version: 3,
    sources: ["../src/file.ts"],
    mappings: "AAAA",
    sourcesContent: ["let x=1"],
  };
  const first = contentHash("file.js.map", Buffer.from(JSON.stringify(map)));
  assert.equal(
    first,
    contentHash(
      "file.js.map",
      Buffer.from(
        JSON.stringify({ ...map, sources: ["..\\src\\file.ts"] }, null, 2),
      ),
    ),
  );
  assert.notEqual(
    first,
    contentHash(
      "file.js.map",
      Buffer.from(JSON.stringify({ ...map, mappings: "BBBB" })),
    ),
  );
  assert.notEqual(
    first,
    contentHash(
      "file.js.map",
      Buffer.from(JSON.stringify({ ...map, sourcesContent: ["let x=2"] })),
    ),
  );
  assert.throws(
    () =>
      contentHash(
        "file.js.map",
        Buffer.from(
          JSON.stringify({ ...map, sources: ["/private/source.ts"] }),
        ),
      ),
    /Absolute build path/u,
  );
  assert.notEqual(
    contentHash("file.js", Buffer.from("let x=1")),
    contentHash("file.js", Buffer.from("let x=2")),
  );
});

test("package fingerprint ignores archive metadata but binds actual packed files", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-release-content-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "package"));
  await writeFile(
    join(root, "package/package.json"),
    JSON.stringify({ name: "@axmorf/studio", version: "0.1.8" }),
  );
  await writeFile(join(root, "package/index.js"), "export const value=1;\n");
  const pack = (name: string, order: string[]) =>
    execFileSync("tar", ["-czf", join(root, name), "-C", root, ...order]);
  pack("one.tgz", ["package/package.json", "package/index.js"]);
  pack("two.tgz", ["package/index.js", "package/package.json"]);
  const one = await packageContent(join(root, "one.tgz"));
  const two = await packageContent(join(root, "two.tgz"));
  assert.deepEqual(one, two);
  assert.notEqual(
    sha256(await readFile(join(root, "one.tgz"))),
    sha256(await readFile(join(root, "two.tgz"))),
  );
  await writeFile(join(root, "package/index.js"), "export const value=2;\n");
  pack("three.tgz", ["package"]);
  assert.notEqual(
    one.fingerprint,
    (await packageContent(join(root, "three.tgz"))).fingerprint,
  );
});

test("publication verifies first-use candidates before publishing either package", async () => {
  const workflow = await readFile(".github/workflows/npm-publish.yml", "utf8");
  assert.match(
    workflow,
    /test -f "docs\/evidence\/v\$\{root_version\}-first-use\.json"/u,
  );
  assert.ok(
    workflow.indexOf("first-use.ts verify") <
      workflow.indexOf('npm publish "$tarball"'),
  );
});

test("Hermes rejects empty, malformed and unrelated native session evidence", () => {
  const prompt = "make a video";
  for (const calls of [[], {}, "[]", "{}", [{ id: "only-an-id" }]]) {
    assert.throws(() =>
      auditTranscript(
        "hermes",
        JSON.stringify([
          { role: "user", content: prompt },
          { role: "assistant", content: "", tool_calls: calls },
        ]),
        prompt,
        "session",
        "/workspace",
      ),
    );
  }
  const transcript = JSON.stringify([{ role: "user", content: prompt }]);
  const session = {
    id: "session",
    model: "model",
    cwd: "/workspace",
    started_at: 1,
    ended_at: 2,
    message_count: 1,
    tool_call_count: 2,
  };
  assert.equal(
    auditHermesSession(session, "session", "model", "/workspace", transcript, 2)
      .id,
    "session",
  );
  assert.throws(
    () =>
      auditHermesSession(
        session,
        "other",
        "model",
        "/workspace",
        transcript,
        2,
      ),
    /session id/u,
  );
  assert.throws(
    () =>
      auditHermesSession(session, "session", "model", "/other", transcript, 2),
    /Workspace/u,
  );
  assert.throws(
    () =>
      auditHermesSession(
        session,
        "session",
        "other",
        "/workspace",
        transcript,
        2,
      ),
    /model/u,
  );
  assert.throws(
    () =>
      auditHermesSession(session, "session", "model", "/workspace", "[]", 2),
    /complete session/u,
  );
  assert.throws(
    () =>
      auditHermesSession(
        session,
        "session",
        "model",
        "/workspace",
        transcript,
        1,
      ),
    /tool calls/u,
  );
});

test("creation cannot sign an existing Workspace and snapshot rejects cached production", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-first-use-create-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "existing");
  await mkdir(workspace);
  const configPath = join(root, "config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      host: "codex",
      workspace,
      runtimeTarball: "never-read.tgz",
      creatorTarball: "never-read.tgz",
      promptFile: "never-read.txt",
    }),
  );
  await assert.rejects(
    () => create(configPath, join(root, "snapshot.json")),
    /nonexistent path/u,
  );
  for (const path of [
    ".narration-work",
    "out",
    "public/projects",
    ".producer-revisions",
  ]) {
    const polluted = join(root, path.replaceAll("/", "-"));
    await mkdir(join(polluted, path), { recursive: true });
    await writeFile(join(polluted, path, "cached-data"), "old run");
    await assert.rejects(() => assertEmptyWorkspace(polluted), /not empty/u);
  }
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/release/first-use.ts",
          "snapshot",
          configPath,
          join(root, "snapshot.json"),
        ],
        { stdio: "pipe" },
      ),
    /Command failed/u,
  );
});

test("release recorder executes the real bundled CLI through its verified public bin", async (context) => {
  // Keep this disposable bundle under the repository's dependency ancestry so
  // its real external imports resolve without another npm install or a stub CLI.
  const workspace = await mkdtemp(
    join(process.cwd(), "node_modules/.axmorf-public-bin-"),
  );
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const runtime = join(workspace, "node_modules/@axmorf/studio");
  const entry = join(runtime, "dist/cli/main.js");
  await mkdir(join(runtime, "dist/cli"), { recursive: true });
  await mkdir(join(workspace, "node_modules/.bin"), { recursive: true });
  await writeFile(
    join(runtime, "package.json"),
    JSON.stringify({ name: "@axmorf/studio", type: "module" }),
  );
  await build({
    entryPoints: [join(process.cwd(), "packages/studio/src/cli/main.ts")],
    outfile: entry,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    target: "es2022",
    logLevel: "silent",
  });
  const bin = join(workspace, "node_modules/.bin/axmorf");
  await symlink(entry, bin);
  const help = JSON.parse(await runPublicCli(workspace, ["--help"]));
  assert.equal(help.status, "help");
  assert.ok(
    help.commands.some((command: string) => command.includes("project:check")),
  );
  await rm(bin);
  const unrelated = join(workspace, "unrelated.js");
  await writeFile(unrelated, 'process.stdout.write("incorrect executable");');
  await symlink(unrelated, bin);
  await assert.rejects(
    () => runPublicCli(workspace, ["--help"]),
    /verified runtime package/u,
  );
});

test("new releases reject historical inline receipts without native child evidence", () => {
  const nextRuntime = { ...runtime, version: "0.1.9" };
  const nextCreator = { ...creator, version: "0.1.9" };
  const hosts = [hostReceipt("codex"), hostReceipt("hermes")].map((host) => ({
    ...host,
    packages: { runtime: summary(nextRuntime), creator: summary(nextCreator) },
  }));
  assert.throws(
    () => verifyReceipt({ schemaVersion: 1, hosts }, nextRuntime, nextCreator),
    /native child execution/u,
  );
});

test("native child receipts require the full task pool, native lineage, commits and bounded refill", async (context) => {
  const { auditNativeExecution } =
    await import("../../scripts/release/native-execution");
  const root = await mkdtemp(join(tmpdir(), "axmorf-native-receipt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const timestamp = (second: number) =>
    new Date(Date.parse("2026-09-07T00:00:00Z") + second * 1000).toISOString();
  const output = (
    id: string,
    value: unknown,
    second: number,
    name = "exec",
  ) => [
    {
      type: "response_item",
      timestamp: timestamp(second),
      payload: { type: "function_call", name, call_id: id, arguments: "{}" },
    },
    {
      type: "response_item",
      timestamp: timestamp(second),
      payload: {
        type: "function_call_output",
        call_id: id,
        output: JSON.stringify(value),
      },
    },
  ];
  const tasks = Array.from({ length: 5 }, (_, index) => ({
    taskRevision: `task-${index}`,
  }));
  const intervals = [
    [1, 3],
    [20, 60],
    [20, 65],
    [20, 70],
    [20, 75],
    [61, 90],
  ];
  const nativeChildren: Array<{ transcriptFile: string }> = [];
  for (const [index, [started, ended]] of intervals.entries()) {
    const taskRevision = index === 0 ? null : tasks[index - 1]!.taskRevision;
    const events = [
      {
        type: "session_meta",
        timestamp: timestamp(started!),
        payload: {
          id: `child-${index}`,
          cwd: root,
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: "parent",
                depth: 1,
                agent_path: `/root/child-${index}`,
              },
            },
          },
        },
      },
      ...output(
        `bind-${index}`,
        taskRevision === null
          ? { probe: "native-tool-result" }
          : {
              status: "task-worker-bound",
              transport: "shared-workspace",
              taskRevision,
              attemptId: "attempt",
              storyId: "story",
            },
        started! + 1,
      ),
      ...(taskRevision === null
        ? []
        : output(
            `commit-${index}`,
            {
              status: "producer-artifact-committed",
              attemptRecorded: true,
              artifact: { taskRevision },
            },
            ended! - 1,
          )),
      {
        type: "event_msg",
        timestamp: timestamp(ended!),
        payload: { type: "task_complete" },
      },
    ];
    const transcriptFile = join(root, `child-${index}.jsonl`);
    await writeFile(
      transcriptFile,
      events.map((event) => JSON.stringify(event)).join("\n"),
    );
    nativeChildren.push({ transcriptFile });
  }
  const resolution = {
    status: "ready",
    mode: "subagents",
    source: { mode: "builtin-default", maxConcurrency: "builtin-default" },
    requestedMaxConcurrency: 4,
    effectiveMaxConcurrency: 4,
    workerTransport: "shared-workspace",
  };
  const makeTranscript = (extra: unknown[] = []) =>
    [
      ...output("resolve", resolution, 5),
      ...output(
        "prepare",
        {
          status: "project-production-prepared",
          storyId: "story",
          attemptId: "attempt",
          dirtyAgentTasks: tasks,
        },
        10,
      ),
      ...intervals.flatMap(([start], index) =>
        output(
          `spawn-${index}`,
          { task_name: `/root/child-${index}` },
          start!,
          "spawn_agent",
        ),
      ),
      ...extra,
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
  const input = {
    host: "codex" as const,
    transcript: makeTranscript(),
    sessionId: "parent",
    workspace: root,
    startedAt: timestamp(0),
    endedAt: timestamp(100),
    storyId: "story",
    nativeChildren,
  };
  const result = await auditNativeExecution(input);
  assert.equal(result.execution.productionChildCount, 5);
  assert.equal(result.execution.probeChildCount, 1);
  assert.equal(result.execution.peakActiveChildren, 4);
  assert.equal(result.execution.refillAdmissions, 1);
  await assert.rejects(
    () =>
      auditNativeExecution({
        ...input,
        nativeChildren: nativeChildren.slice(1),
      }),
    /Export every native child/u,
  );
  await assert.rejects(
    () =>
      auditNativeExecution({
        ...input,
        transcript: makeTranscript(
          output("root-commit", { status: "producer-artifact-committed" }, 80),
        ),
      }),
    /Root must not commit/u,
  );
  resolution.effectiveMaxConcurrency = 3;
  await assert.rejects(
    () => auditNativeExecution({ ...input, transcript: makeTranscript() }),
    /exceeded/u,
  );
  resolution.effectiveMaxConcurrency = 4;
  const childPath = nativeChildren[1]!.transcriptFile;
  const original = await readFile(childPath, "utf8");
  await writeFile(
    childPath,
    original.replace(
      '"parent_thread_id":"parent"',
      '"parent_thread_id":"unrelated"',
    ),
  );
  await assert.rejects(() => auditNativeExecution(input), /direct descendant/u);
  await writeFile(
    childPath,
    original.replace("producer-artifact-committed", "not-committed"),
  );
  await assert.rejects(() => auditNativeExecution(input), /did not commit/u);
  await writeFile(childPath, original);

  const hermesRecords = (events: Array<Record<string, unknown>>) =>
    events.flatMap((event) => {
      if (event.type !== "response_item") return [];
      const payload = event.payload as Record<string, unknown>;
      const bridged = /^(?:prepare|commit)/u.test(String(payload.call_id));
      return [
        {
          timestamp: Date.parse(String(event.timestamp)) / 1000,
          ...(payload.type === "function_call"
            ? {
                role: "assistant",
                content: "",
                tool_calls: JSON.stringify([
                  {
                    id: payload.call_id,
                    type: "function",
                    function: {
                      name:
                        payload.name === "exec"
                          ? bridged
                            ? "tool_call"
                            : "terminal"
                          : payload.name,
                      arguments: bridged
                        ? JSON.stringify({
                            name: "process_manage",
                            arguments: {
                              action: "log",
                              session_id: "proc-fixture",
                            },
                          })
                        : payload.arguments,
                    },
                  },
                ]),
              }
            : {
                role: "tool",
                content: bridged
                  ? JSON.stringify({
                      status: "exited",
                      output: `> workspace command\n${String(payload.output)}`,
                    })
                  : payload.output,
                tool_call_id: payload.call_id,
                ...(bridged ? { tool_name: "process_manage" } : {}),
              }),
        },
      ];
    });
  const hermesChildren = [];
  for (const [index, child] of nativeChildren.entries()) {
    const events = (await readFile(child.transcriptFile, "utf8"))
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const messages = hermesRecords(events);
    const transcriptFile = join(root, `hermes-child-${index}.json`);
    const sessionFile = join(root, `hermes-child-${index}-session.json`);
    await writeFile(transcriptFile, JSON.stringify(messages));
    await writeFile(
      sessionFile,
      JSON.stringify({
        id: `hermes-child-${index}`,
        parent_session_id: "parent",
        source: "subagent",
        cwd: null,
        started_at: Date.parse(timestamp(intervals[index]![0]!)) / 1000,
        ended_at: Date.parse(timestamp(intervals[index]![1]!)) / 1000,
        message_count: messages.length,
        tool_call_count: messages.filter(
          (message) => message.role === "assistant",
        ).length,
      }),
    );
    hermesChildren.push({ transcriptFile, sessionFile });
  }
  const hermesRoot = hermesRecords([
    ...output("resolve", resolution, 5),
    ...output(
      "prepare",
      {
        status: "project-production-prepared",
        storyId: "story",
        attemptId: "attempt",
        dirtyAgentTasks: tasks,
      },
      10,
    ),
    ...intervals.flatMap(([start], index) => {
      const events = output(
        `delegate-${index}`,
        { status: "dispatched", delegation_id: `delegation-${index}` },
        start!,
        "delegate_task",
      );
      events[0]!.payload.arguments = JSON.stringify({
        tasks: [{ goal: index === 0 ? "probe" : `task-${index - 1}` }],
      });
      return events;
    }),
  ]);
  const hermesInput = {
    ...input,
    host: "hermes" as const,
    nativeChildren: hermesChildren,
    transcript: JSON.stringify(hermesRoot),
  };
  assert.equal(
    (await auditNativeExecution(hermesInput)).execution.productionChildCount,
    5,
  );
  const sessionPath = hermesChildren[1]!.sessionFile;
  const session = JSON.parse(await readFile(sessionPath, "utf8"));
  await writeFile(
    sessionPath,
    JSON.stringify({ ...session, parent_session_id: "unrelated" }),
  );
  await assert.rejects(
    () => auditNativeExecution(hermesInput),
    /direct descendant/u,
  );
});

test("Codex full-history forks verify parent lineage and exclude inherited calls and completion", async () => {
  const { codexChildTrace, nativeTrace } =
    await import("../../scripts/release/native-execution");
  type Record = {
    type: string;
    timestamp: string;
    payload: { [key: string]: unknown };
  };
  const row = (type: string, payload: Record["payload"]): Record => ({
    type,
    payload,
    timestamp: "2026-09-07T00:00:00Z",
  });
  const encode = (records: Record[]) =>
    records.map((record) => JSON.stringify(record)).join("\n");
  const call = (id: string) =>
    row("response_item", {
      type: "function_call",
      call_id: id,
      name: "exec",
      arguments: "{}",
    });
  const output = (id: string) =>
    row("response_item", {
      type: "function_call_output",
      call_id: id,
      output: JSON.stringify({
        status: "producer-artifact-committed",
        artifact: { taskRevision: id },
      }),
    });
  const parentRecords = [
    row("session_meta", { id: "parent", source: "exec", cwd: "/workspace" }),
    row("event_msg", { type: "task_started", turn_id: "parent-turn" }),
    row("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "business prompt" }],
    }),
    call("parent-call"),
    output("parent-call"),
    row("event_msg", { type: "task_complete", turn_id: "parent-turn" }),
  ];
  const parent = nativeTrace("codex", encode(parentRecords));
  const child = [
    row("session_meta", { id: "child", forked_from_id: "parent" }),
    ...parentRecords.map((record) => ({
      ...record,
      timestamp: "2026-09-07T00:00:10Z",
    })),
    row("world_state", { full: true, state: { regenerated: true } }),
    row("response_item", {
      type: "message",
      role: "developer",
      content: [
        { type: "input_text", text: "<multi_agent_role>native child adapter" },
      ],
    }),
    row("event_msg", { type: "thread_settings_applied", thread_id: "child" }),
    row("event_msg", { type: "task_started", turn_id: "child-turn" }),
    row("turn_context", { turn_id: "child-turn", root_turn_id: "parent-turn" }),
    call("child-call"),
    output("child-call"),
    row("event_msg", { type: "task_complete", turn_id: "child-turn" }),
  ];
  const trace = codexChildTrace(encode(child), parent);
  assert.deepEqual([...trace.calls.keys()], ["child-call"]);
  assert.equal(trace.outputs.length, 1);
  assert.equal(
    trace.outputs[0]!.objects[0]!.status,
    "producer-artifact-committed",
  );
  assert.deepEqual(
    trace.records
      .filter(
        (record) =>
          record.type === "event_msg" &&
          (record.payload as Record["payload"]).type === "task_complete",
      )
      .map((record) => (record.payload as Record["payload"]).turn_id),
    ["child-turn"],
  );
  const withoutOwnWork = codexChildTrace(
    encode(
      child.filter(
        (record) =>
          record.payload.call_id !== "child-call" &&
          !(
            record.payload.type === "task_complete" &&
            record.payload.turn_id === "child-turn"
          ),
      ),
    ),
    parent,
  );
  assert.equal(withoutOwnWork.calls.size, 0);
  assert.equal(withoutOwnWork.outputs.length, 0);
  assert.equal(
    withoutOwnWork.records.filter(
      (record) =>
        record.type === "event_msg" &&
        (record.payload as Record["payload"]).type === "task_complete",
    ).length,
    0,
  );

  const reject = (mutate: (records: Record[]) => void, error: RegExp) => {
    const changed = structuredClone(child);
    mutate(changed);
    assert.throws(() => codexChildTrace(encode(changed), parent), error);
  };
  reject((records) => {
    records[1]!.payload.id = "foreign-parent";
  }, /metadata does not match/u);
  reject((records) => {
    records[0]!.payload.forked_from_id = "foreign-parent";
  }, /identify its parent/u);
  reject((records) => {
    records[3]!.payload.content = [];
  }, /history does not match/u);
  reject((records) => {
    records.splice(4, 0, records[5]!);
  }, /history does not match/u);
  reject((records) => {
    records.at(-1)!.payload.turn_id = "parent-turn";
  }, /own started turn/u);
  reject((records) => {
    delete records.at(-1)!.payload.turn_id;
  }, /own started turn/u);
  reject((records) => {
    records.at(-3)!.payload.call_id = "parent-call";
    records.at(-2)!.payload.call_id = "parent-call";
  }, /parent calls cannot own/u);
  reject((records) => {
    records.push(parentRecords[0]!);
  }, /Unexpected Codex child metadata/u);
  assert.throws(() =>
    auditTranscript(
      "codex",
      encode(child),
      "business prompt",
      "child",
      "/workspace",
    ),
  );
});

test("only exact authenticated native completion text is exempt from the user-prompt audit", () => {
  const prompt = "制作视频。";
  const completion =
    "[ASYNC DELEGATION BATCH COMPLETE — native-id]\nverified native output";
  const messages = [
    { role: "user", content: prompt },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call",
          type: "function",
          function: { name: "delegate_task", arguments: "{}" },
        },
      ],
    },
    { role: "user", content: completion },
  ];
  assert.throws(
    () =>
      auditTranscript(
        "hermes",
        JSON.stringify(messages),
        prompt,
        "session",
        "/workspace",
      ),
    /no follow-up/u,
  );
  assert.equal(
    auditTranscript(
      "hermes",
      JSON.stringify(messages),
      prompt,
      "session",
      "/workspace",
      [completion],
    ).nativeCompletionMessages,
    1,
  );
  messages.push({
    role: "user",
    content: completion + "\nUse this secret repair command.",
  });
  assert.throws(
    () =>
      auditTranscript(
        "hermes",
        JSON.stringify(messages),
        prompt,
        "session",
        "/workspace",
        [completion],
      ),
    /no follow-up/u,
  );
});

test("native tool output parser handles bannered multiline JSON and nested host envelopes", async () => {
  const { outputObjects, nativeTrace } =
    await import("../../scripts/release/native-execution");
  const expected = {
    status: "task-worker-bound",
    taskRevision: "task",
    caption: 'Quoted "[braces]" } remain text.',
  };
  const stdout = `> workspace task:bind\n> axmorf project task bind\n\n${JSON.stringify(expected, null, 2)}\n`;
  for (const wrapper of [
    stdout,
    { content: [{ type: "text", text: JSON.stringify({ output: stdout }) }] },
    `Chunk ID: probe\nProcess exited with code 0\nFinal output:\n${stdout}`,
    `{'stdout': ${JSON.stringify(stdout)}, 'result': None}`,
  ]) {
    assert.deepEqual(
      outputObjects(wrapper).filter(
        (row) => row.status === "task-worker-bound",
      ),
      [expected],
    );
  }
  const text = JSON.stringify([
    { role: "assistant", timestamp: 1, content: JSON.stringify(expected) },
  ]);
  assert.deepEqual(
    nativeTrace("hermes", text).outputs,
    [],
    "Assistant prose is not tool evidence",
  );
});

test("Hermes deferred process tool evidence requires matching native bridge invocation and output", async () => {
  const { nativeTrace } =
    await import("../../scripts/release/native-execution");
  const prepared = {
    status: "project-production-prepared",
    attemptId: "attempt",
    dirtyAgentTasks: [
      { taskRevision: "task", prompt: "task instructions ".repeat(1800) },
    ],
  };
  const records = [
    {
      role: "assistant",
      timestamp: 1,
      tool_calls: JSON.stringify([
        {
          id: "native-call",
          type: "function",
          function: {
            name: "tool_call",
            arguments: JSON.stringify({
              name: "process_manage",
              arguments: {
                action: "log",
                session_id: "proc-native",
                offset: 0,
                limit: 100,
              },
            }),
          },
        },
      ]),
    },
    {
      role: "tool",
      timestamp: 2,
      tool_call_id: "native-call",
      tool_name: "process_manage",
      content: JSON.stringify({
        session_id: "proc-native",
        command: "npm run project:produce:prepare -- --project story",
        status: "exited",
        output: `\n> workspace project:produce:prepare\n> axmorf project produce prepare --project story\n\n${JSON.stringify(prepared)}\n`,
        total_lines: 6,
        showing: "all",
      }),
    },
  ];
  const audit = (value = records) =>
    nativeTrace("hermes", JSON.stringify(value));
  const trace = audit();
  assert.equal(trace.outputs[0]!.name, "process_manage");
  assert.deepEqual(
    trace.outputs[0]!.objects.filter(
      (value) => value.status === "project-production-prepared",
    ),
    [prepared],
  );
  const mismatch = structuredClone(records);
  mismatch[1]!.tool_name = "terminal";
  assert.throws(
    () => audit(mismatch),
    /does not match its underlying invocation/u,
  );
  assert.throws(() => audit(records.slice(1)), /missing its originating call/u);
  const ordinaryRead = structuredClone(records);
  ordinaryRead[0]!.tool_calls = JSON.stringify([
    {
      id: "native-call",
      type: "function",
      function: { name: "read_file", arguments: "{}" },
    },
  ]);
  assert.equal(
    audit(ordinaryRead).outputs[0]!.name,
    "read_file",
    "Output tool_name alone cannot turn a read into command evidence",
  );
  const malformed = structuredClone(records);
  malformed[0]!.tool_calls = JSON.stringify([
    {
      id: "native-call",
      type: "function",
      function: { name: "tool_call", arguments: "not-json" },
    },
  ]);
  assert.throws(() => audit(malformed));
});
