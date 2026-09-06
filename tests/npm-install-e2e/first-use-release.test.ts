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
