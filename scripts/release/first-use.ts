import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  readdir,
  writeFile,
} from "node:fs/promises";
import { arch, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { resolveNpmCliPath } from "../../packages/create-axmorf-studio/src/index.js";
import {
  auditNativeExecution,
  NativeChildInput,
  NativeExecutionSchema,
} from "./native-execution";
import {
  directoryFiles,
  packageContent,
  sha256,
  type FileDigest,
  type PackageContent,
} from "./package-content";

const Host = z.enum(["codex", "hermes"]);
const Hash = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const Text = z.string().min(1);
const Package = z
  .object({
    name: Text,
    version: Text,
    fingerprint: Hash,
    fileCount: z.number().int().positive(),
  })
  .strict();
const File = z
  .object({ checksum: Hash, sizeBytes: z.number().int().positive() })
  .strict();
const FinalCheck = z
  .object({
    status: z.literal("project-final-check"),
    storyId: Text,
    aggregateStatus: z.literal("pass"),
    deliveryBuildId: Text,
    checks: z
      .array(
        z.object({ checkId: Text, status: z.literal("pass") }).passthrough(),
      )
      .min(7),
  })
  .passthrough();
const Creation = z
  .object({
    method: z.literal("npm-exec-candidate"),
    runtimeTarballChecksum: Hash,
    creatorTarballChecksum: Hash,
    installLogChecksum: Hash,
  })
  .strict();
export const HostReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    host: Host,
    model: Text,
    sessionId: Text,
    environment: z.object({ platform: Text, arch: Text, node: Text }).strict(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
    packages: z.object({ runtime: Package, creator: Package }).strict(),
    prompt: Text,
    promptChecksum: Hash,
    transcriptChecksum: Hash,
    runChecksum: Hash,
    snapshotChecksum: Hash,
    creation: Creation,
    sessionChecksum: Hash.nullable(),
    transcriptAudit: z
      .object({
        businessUserMessages: z.literal(1),
        toolCalls: z.number().int().positive(),
        followUpMessages: z.literal(0),
        nativeCompletionMessages: z.number().int().nonnegative().optional(),
      })
      .strict(),
    unchangedPackageFiles: z.number().int().positive(),
    nativeExecution: NativeExecutionSchema.optional(),
    unchangedGuideFiles: z.number().int().positive(),
    finalCheck: FinalCheck,
    delivery: z
      .object({
        storyId: Text,
        deliveryBuildId: Text,
        files: z
          .object({
            "video.mp4": File,
            "cover-4x3.png": File,
            "cover-3x4.png": File,
            "publish.json": File,
          })
          .strict(),
        video: z
          .object({
            codec: z.literal("h264"),
            audioCodec: z.literal("aac"),
            audioChannels: z.literal(2),
            width: z.number().positive(),
            height: z.number().positive(),
            fps: z.number().positive(),
            frameCount: z.number().int().positive(),
          })
          .strict(),
        decodedFiles: z.tuple([
          z.literal("video.mp4"),
          z.literal("cover-4x3.png"),
          z.literal("cover-3x4.png"),
        ]),
      })
      .strict(),
  })
  .strict();

const SnapshotConfig = z
  .object({
    host: Host,
    workspace: Text,
    runtimeTarball: Text,
    creatorTarball: Text,
    promptFile: Text,
  })
  .strict();
type Snapshot = {
  schemaVersion: 1;
  host: z.infer<typeof Host>;
  workspace: string;
  createdAt: string;
  environment: { platform: string; arch: string; node: string };
  prompt: string;
  packages: { runtime: PackageContent; creator: PackageContent };
  guides: FileDigest[];
  creation: z.infer<typeof Creation>;
  installLogPath: string;
};
const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const packageSummary = ({ files, ...content }: PackageContent) => ({
  ...content,
  fileCount: files.length,
});

export const assertEmptyWorkspace = async (workspace: string) => {
  for (const relative of [
    "src/projects",
    "deliveries",
    ".producer-artifacts",
    ".producer-work",
    ".producer-attempts",
    ".producer-revisions",
    ".narration-work",
    "out",
    "public/projects",
  ]) {
    let entries;
    try {
      entries = await readdir(join(workspace, relative));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    assert.deepEqual(
      entries.filter(
        (entry) =>
          entry !== ".gitkeep" &&
          !(
            relative === "src/projects" &&
            entry === "project-registry.generated.ts"
          ) &&
          !(relative === ".producer-attempts" && entry === ".processes"),
      ),
      [],
      `First-use Workspace is not empty: ${relative}`,
    );
  }
};

const guideFiles = async (workspace: string): Promise<FileDigest[]> => {
  const guides = (await directoryFiles(join(workspace, ".agents"))).map(
    (file) => ({ ...file, path: `.agents/${file.path}` }),
  );
  for (const path of ["README.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
    const metadata = await lstat(join(workspace, path));
    assert.ok(
      metadata.isFile() && !metadata.isSymbolicLink(),
      `${path} must be a regular file`,
    );
    guides.push({
      path,
      checksum: sha256(await readFile(join(workspace, path))),
      executable: (metadata.mode & 0o111) !== 0,
    });
  }
  return guides.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
};

const assertAbsent = async (path: string) => {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`First-use creation requires a nonexistent path: ${path}`);
};

export async function create(configPath: string, outputPath: string) {
  const config = SnapshotConfig.parse(await readJson(configPath));
  const workspace = resolve(config.workspace);
  await assertAbsent(workspace);
  await assertAbsent(outputPath);
  const runtimeTarball = resolve(config.runtimeTarball);
  const creatorTarball = resolve(config.creatorTarball);
  const runtime = await packageContent(runtimeTarball);
  const creator = await packageContent(creatorTarball);
  assert.equal(runtime.name, "@axmorf/studio");
  assert.equal(creator.name, "create-axmorf-studio");
  assert.equal(runtime.version, creator.version);
  const runtimeTarballChecksum = sha256(await readFile(runtimeTarball));
  const creatorTarballChecksum = sha256(await readFile(creatorTarball));
  const npmCliPath = await resolveNpmCliPath({
    npmExecPath: process.env.npm_execpath,
    execPath: process.execPath,
    platform: process.platform,
  });
  await mkdir(dirname(workspace), { recursive: true });
  const npmCache = await mkdtemp(
    join(dirname(resolve(outputPath)), ".first-use-npm-cache-"),
  );
  const installLogPath = `${resolve(outputPath)}.install.log`;
  const installLog = await open(installLogPath, "wx");
  process.stderr.write(
    `Creating ${config.host} Workspace; installation log: ${installLogPath}\n`,
  );
  try {
    execFileSync(
      process.execPath,
      [
        npmCliPath,
        "exec",
        "--yes",
        `--package=${creatorTarball}`,
        "--",
        "create-axmorf-studio",
        basename(workspace),
        "--yes",
        "--runtime-package",
        runtimeTarball,
      ],
      {
        cwd: dirname(workspace),
        env: {
          ...process.env,
          NPM_CONFIG_CACHE: npmCache,
          npm_config_cache: npmCache,
        },
        stdio: ["ignore", installLog.fd, installLog.fd],
        timeout: 1_200_000,
      },
    );
  } finally {
    await installLog.close();
  }
  assert.equal(
    sha256(await readFile(runtimeTarball)),
    runtimeTarballChecksum,
    "Runtime tarball changed during creation",
  );
  assert.equal(
    sha256(await readFile(creatorTarball)),
    creatorTarballChecksum,
    "Creator tarball changed during creation",
  );
  await assertEmptyWorkspace(workspace);
  assert.deepEqual(
    await directoryFiles(join(workspace, "node_modules/@axmorf/studio")),
    runtime.files,
    "Installed runtime does not match the candidate tarball",
  );
  const guides = await guideFiles(workspace);
  for (const file of guides) {
    assert.deepEqual(
      creator.files.find(
        (candidate) => candidate.path === `template/${file.path}`,
      ),
      { ...file, path: `template/${file.path}` },
      `Workspace guide is not from the candidate creator: ${file.path}`,
    );
  }
  const prompt = await readFile(config.promptFile, "utf8");
  assert.ok(prompt.trim().length > 0, "Business prompt is empty");
  const result: Snapshot = {
    schemaVersion: 1,
    host: config.host,
    workspace,
    createdAt: new Date().toISOString(),
    environment: { platform: platform(), arch: arch(), node: process.version },
    prompt,
    packages: { runtime, creator },
    guides,
    creation: {
      method: "npm-exec-candidate",
      runtimeTarballChecksum,
      creatorTarballChecksum,
      installLogChecksum: sha256(await readFile(installLogPath)),
    },
    installLogPath,
  };
  await writeJson(outputPath, result);
  return {
    status: "first-use-workspace-created",
    host: config.host,
    outputPath,
  };
}

export function auditTranscript(
  host: "codex" | "hermes",
  text: string,
  prompt: string,
  sessionId: string,
  workspace: string,
  allowedNativeMessages: readonly string[] = [],
) {
  let userMessages: string[];
  let toolCalls: number;
  if (host === "hermes") {
    const records = z
      .array(
        z
          .object({
            role: Text,
            content: z.string().nullable(),
            tool_calls: z.unknown().optional(),
          })
          .passthrough(),
      )
      .parse(JSON.parse(text));
    userMessages = records
      .filter((row) => row.role === "user")
      .map((row) => row.content ?? "");
    toolCalls = 0;
    const Calls = z.array(
      z
        .object({
          id: Text,
          type: z.literal("function"),
          function: z
            .object({ name: Text, arguments: z.string() })
            .passthrough(),
        })
        .passthrough(),
    );
    for (const row of records) {
      if (row.role !== "assistant" || row.tool_calls == null) continue;
      const calls = Calls.parse(
        typeof row.tool_calls === "string"
          ? JSON.parse(row.tool_calls)
          : row.tool_calls,
      );
      toolCalls += calls.length;
    }
  } else {
    const records = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const meta = records.filter((row) => row.type === "session_meta");
    assert.equal(meta.length, 1, "Expected a single fresh Codex session");
    assert.equal(meta[0].payload.id, sessionId);
    assert.equal(meta[0].payload.cwd, workspace);
    assert.ok(
      meta[0].payload.forked_from_id == null,
      "Forked Codex history is not a first-use test",
    );
    const messages = records
      .filter(
        (row) => row.type === "response_item" && row.payload.role === "user",
      )
      .map((row) => row.payload);
    userMessages = [];
    for (const [index, message] of messages.entries()) {
      const content = message.content
        .map((item: { text?: string }) => item.text ?? "")
        .join("");
      const isUserText =
        message.internal_chat_message_metadata_passthrough?.content_item_kinds?.includes(
          "user.text",
        );
      // Codex serializes its initial host/workspace instruction envelope as role=user.
      // Exempt only that first envelope; any subsequent user message is intervention.
      if (
        !isUserText &&
        index === 0 &&
        /^(?:<recommended_plugins>|# AGENTS\.md instructions for |<environment_context>)/u.test(
          content,
        )
      )
        continue;
      userMessages.push(content);
    }
    toolCalls = records.filter(
      (row) =>
        row.type === "response_item" &&
        ["function_call", "custom_tool_call"].includes(row.payload.type),
    ).length;
  }
  const remainingNative = [...allowedNativeMessages];
  let nativeCompletionMessages = 0;
  userMessages = userMessages.filter((message) => {
    const index = remainingNative.indexOf(message);
    if (index === -1) return true;
    remainingNative.splice(index, 1);
    nativeCompletionMessages += 1;
    return false;
  });
  assert.deepEqual(
    userMessages,
    [prompt],
    "First-use must have exactly the snapshotted business prompt and no follow-up messages",
  );
  assert.ok(toolCalls > 0, "Transcript contains no Agent tool calls");
  return {
    businessUserMessages: 1 as const,
    toolCalls,
    followUpMessages: 0 as const,
    nativeCompletionMessages,
  };
}

export function auditHermesSession(
  value: unknown,
  sessionId: string,
  model: string,
  workspace: string,
  transcript: string,
  toolCalls: number,
) {
  const session = z
    .object({
      id: Text,
      model: Text,
      cwd: Text,
      started_at: z.number().positive(),
      ended_at: z.number().positive(),
      message_count: z.number().int().positive(),
      tool_call_count: z.number().int().positive(),
    })
    .passthrough()
    .parse(value);
  assert.equal(
    session.id,
    sessionId,
    "Hermes session id does not match the selected run",
  );
  assert.equal(
    session.cwd,
    workspace,
    "Hermes session Workspace does not match",
  );
  assert.equal(session.model, model, "Hermes session model does not match");
  assert.equal(
    session.message_count,
    JSON.parse(transcript).length,
    "Hermes transcript does not contain the complete session",
  );
  assert.equal(
    session.tool_call_count,
    toolCalls,
    "Hermes session tool calls do not match the transcript",
  );
  assert.ok(session.ended_at > session.started_at);
  return session;
}

const command = (workspace: string, args: string[], timeout = 180_000) =>
  execFileSync(process.execPath, args, {
    cwd: workspace,
    encoding: "utf8",
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });

export async function runPublicCli(
  workspace: string,
  args: string[],
  timeout = 180_000,
) {
  const bin = join(workspace, "node_modules/.bin/axmorf");
  const expected = join(
    workspace,
    "node_modules/@axmorf/studio/dist/cli/main.js",
  );
  assert.ok(
    (await lstat(bin)).isSymbolicLink(),
    "Public axmorf bin must be npm's symlink",
  );
  assert.equal(
    await realpath(bin),
    await realpath(expected),
    "Public axmorf bin must resolve to the verified runtime package",
  );
  // Preserve npm's public bin path in argv[1]. Calling the bundle's internal
  // file directly can also activate bundled source CLI entrypoint guards.
  return command(workspace, [bin, ...args], timeout);
}

export async function record(
  snapshotPath: string,
  evidencePath: string,
  outputPath: string,
) {
  const initial: Snapshot = await readJson(snapshotPath);
  assert.equal(initial.schemaVersion, 1);
  Creation.parse(initial.creation);
  assert.equal(
    sha256(await readFile(initial.installLogPath)),
    initial.creation.installLogChecksum,
    "Creation log changed after snapshot",
  );
  const input = z
    .object({
      storyId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
      model: Text,
      sessionId: Text,
      transcriptFile: Text,
      runFile: Text,
      sessionFile: Text.optional(),
      nativeChildren: z.array(NativeChildInput).optional(),
      delegationFile: Text.optional(),
      hermesRuntimeRoot: Text.optional(),
    })
    .strict()
    .parse(await readJson(evidencePath));
  const run = z
    .object({
      host: Host,
      workspace: Text,
      startedAt: z.iso.datetime({ offset: true }),
      endedAt: z.iso.datetime({ offset: true }),
      exitCode: z.literal(0),
      prompt: Text,
      harnessInterventions: z.tuple([]),
    })
    .passthrough()
    .parse(await readJson(input.runFile));
  assert.equal(run.host, initial.host);
  assert.equal(run.workspace, initial.workspace);
  assert.equal(run.prompt, initial.prompt);
  assert.ok(
    Date.parse(initial.createdAt) <= Date.parse(run.startedAt),
    "Snapshot was not created before the run",
  );
  assert.ok(Date.parse(run.endedAt) > Date.parse(run.startedAt));
  const workspace = initial.workspace;
  const installed = await directoryFiles(
    join(workspace, "node_modules/@axmorf/studio"),
  );
  assert.deepEqual(
    installed,
    initial.packages.runtime.files,
    "Runtime package changed during the test",
  );
  assert.deepEqual(
    await guideFiles(workspace),
    initial.guides,
    "Public guides changed during the test",
  );
  const transcript = await readFile(input.transcriptFile, "utf8");
  const requiresNative = requiresNativeExecution(
    initial.packages.runtime.version,
  );
  if (requiresNative)
    assert.ok(
      input.nativeChildren,
      "This release requires native child execution evidence",
    );
  const native =
    input.nativeChildren === undefined
      ? undefined
      : await auditNativeExecution({
          host: initial.host,
          transcript,
          sessionId: input.sessionId,
          workspace,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          storyId: input.storyId,
          nativeChildren: input.nativeChildren,
          ...(input.delegationFile === undefined
            ? {}
            : { delegationFile: input.delegationFile }),
          ...(input.hermesRuntimeRoot === undefined
            ? {}
            : { hermesRuntimeRoot: input.hermesRuntimeRoot }),
        });
  const transcriptAudit = auditTranscript(
    initial.host,
    transcript,
    initial.prompt,
    input.sessionId,
    workspace,
    native?.allowedNativeMessages,
  );
  let sessionChecksum: string | null = null;
  if (initial.host === "hermes") {
    assert.ok(
      input.sessionFile,
      "Hermes evidence requires its native sessionFile",
    );
    const sessionBytes = await readFile(input.sessionFile);
    const session = auditHermesSession(
      JSON.parse(sessionBytes.toString("utf8")),
      input.sessionId,
      input.model,
      workspace,
      transcript,
      transcriptAudit.toolCalls,
    );
    assert.ok(
      session.started_at * 1000 >= Date.parse(run.startedAt),
      "Hermes session predates this run",
    );
    assert.ok(
      session.ended_at * 1000 <= Date.parse(run.endedAt),
      "Hermes session ends after this run",
    );
    sessionChecksum = sha256(sessionBytes);
  }
  const checkText = await runPublicCli(
    workspace,
    ["project", "check", "--project", input.storyId, "--level", "final"],
    600_000,
  );
  const finalCheck = FinalCheck.parse(JSON.parse(checkText.trim()));
  const deliveryRoot = join(workspace, "deliveries", input.storyId);
  const names = ["cover-3x4.png", "cover-4x3.png", "publish.json", "video.mp4"];
  assert.deepEqual(
    (await readdir(deliveryRoot)).sort(),
    names,
    "Delivery must contain exactly four files",
  );
  const files: Record<string, { checksum: string; sizeBytes: number }> = {};
  for (const name of names) {
    const path = join(deliveryRoot, name);
    const metadata = await lstat(path);
    assert.ok(metadata.isFile() && !metadata.isSymbolicLink());
    files[name] = {
      checksum: sha256(await readFile(path)),
      sizeBytes: metadata.size,
    };
  }
  const publish = await readJson(join(deliveryRoot, "publish.json"));
  assert.equal(publish.storyId, input.storyId);
  assert.equal(publish.deliveryBuildId, finalCheck.deliveryBuildId);
  for (const artifact of Object.values(publish.artifacts) as Array<{
    repositoryPath: string;
    checksum: string;
    sizeBytes: number;
  }>) {
    assert.deepEqual(files[basename(artifact.repositoryPath)], {
      checksum: artifact.checksum,
      sizeBytes: artifact.sizeBytes,
    });
  }
  const cli = join(workspace, "node_modules/@remotion/cli/remotion-cli.js");
  const probe = JSON.parse(
    command(workspace, [
      cli,
      "ffprobe",
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-of",
      "json",
      join(deliveryRoot, "video.mp4"),
    ]),
  );
  const video = probe.streams.find(
    (stream: { codec_type: string }) => stream.codec_type === "video",
  );
  const audio = probe.streams.find(
    (stream: { codec_type: string }) => stream.codec_type === "audio",
  );
  const media = {
    codec: video.codec_name,
    audioCodec: audio.codec_name,
    audioChannels: audio.channels,
    width: video.width,
    height: video.height,
    fps:
      Number(video.r_frame_rate.split("/")[0]) /
      Number(video.r_frame_rate.split("/")[1]),
    frameCount: Number(video.nb_read_frames),
  };
  for (const field of ["width", "height", "fps", "frameCount"] as const)
    assert.equal(media[field], publish[field]);
  const decodedFiles = ["video.mp4", "cover-4x3.png", "cover-3x4.png"] as const;
  for (const name of decodedFiles)
    command(workspace, [
      cli,
      "ffmpeg",
      "-v",
      "error",
      "-xerror",
      "-i",
      join(deliveryRoot, name),
      "-c:v",
      "rawvideo",
      "-c:a",
      "pcm_s16le",
      "-f",
      "null",
      "-",
    ]);
  const receipt = HostReceiptSchema.parse({
    schemaVersion: 1,
    host: initial.host,
    model: input.model,
    sessionId: input.sessionId,
    environment: initial.environment,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    packages: {
      runtime: packageSummary(initial.packages.runtime),
      creator: packageSummary(initial.packages.creator),
    },
    prompt: initial.prompt,
    promptChecksum: sha256(initial.prompt),
    transcriptChecksum: sha256(transcript),
    runChecksum: sha256(await readFile(input.runFile)),
    snapshotChecksum: sha256(await readFile(snapshotPath)),
    creation: initial.creation,
    sessionChecksum,
    transcriptAudit,
    nativeExecution: native?.execution,
    unchangedPackageFiles: installed.length,
    unchangedGuideFiles: initial.guides.length,
    finalCheck,
    delivery: {
      storyId: input.storyId,
      deliveryBuildId: publish.deliveryBuildId,
      files,
      video: media,
      decodedFiles,
    },
  });
  await writeJson(outputPath, receipt);
  return { status: "first-use-host-verified", host: initial.host, outputPath };
}

export function verifyReceipt(
  value: unknown,
  runtime: PackageContent,
  creator: PackageContent,
) {
  const receipt = z
    .object({
      schemaVersion: z.literal(1),
      hosts: z.array(HostReceiptSchema).length(2),
    })
    .strict()
    .parse(value);
  assert.deepEqual(
    receipt.hosts.map((host) => host.host).sort(),
    ["codex", "hermes"],
    "Both Agent hosts are required",
  );
  assert.equal(runtime.name, "@axmorf/studio");
  assert.equal(creator.name, "create-axmorf-studio");
  assert.equal(runtime.version, creator.version);
  for (const host of receipt.hosts) {
    assert.deepEqual(
      host.packages,
      { runtime: packageSummary(runtime), creator: packageSummary(creator) },
      "First-use evidence does not match these release candidates",
    );
    if (requiresNativeExecution(runtime.version)) {
      assert.ok(
        host.nativeExecution,
        "This release requires actual bounded native child execution on both hosts",
      );
      const execution = host.nativeExecution;
      assert.equal(execution.productionChildCount, execution.dirtyTaskCount);
      assert.equal(
        execution.childEvidence.length,
        execution.productionChildCount + execution.probeChildCount,
      );
      assert.ok(
        execution.peakActiveChildren <= execution.effectiveMaxConcurrency,
      );
      assert.equal(
        new Set(execution.childEvidence.map((child) => child.sessionId)).size,
        execution.childEvidence.length,
      );
      assert.equal(
        execution.childEvidence.filter((child) => child.taskRevision !== null)
          .length,
        execution.dirtyTaskCount,
      );
      assert.equal(
        new Set(
          execution.childEvidence.flatMap((child) =>
            child.taskRevision === null ? [] : [child.taskRevision],
          ),
        ).size,
        execution.dirtyTaskCount,
      );
      assert.ok(
        execution.childEvidence.every(
          (child) =>
            (child.sessionChecksum !== null) === (host.host === "hermes"),
        ),
      );
    }
    assert.equal(host.promptChecksum, sha256(host.prompt));
    assert.equal(
      host.sessionChecksum !== null,
      host.host === "hermes",
      "Hermes evidence must bind the native session metadata",
    );
    assert.equal(host.unchangedPackageFiles, runtime.files.length);
    assert.equal(host.finalCheck.storyId, host.delivery.storyId);
    assert.equal(
      host.finalCheck.deliveryBuildId,
      host.delivery.deliveryBuildId,
    );
    assert.deepEqual(
      host.finalCheck.checks.map((check) => check.checkId).sort(),
      [
        "artifact-set",
        "artifacts",
        "audio-channels",
        "delivery",
        "delivery-build",
        "revision",
        "snapshot",
      ],
    );
    assert.ok(Date.parse(host.endedAt) > Date.parse(host.startedAt));
  }
  assert.notEqual(receipt.hosts[0]!.sessionId, receipt.hosts[1]!.sessionId);
  return {
    status: "first-use-release-gate-passed",
    version: runtime.version,
    hosts: ["codex", "hermes"],
    runtimeFingerprint: runtime.fingerprint,
    creatorFingerprint: creator.fingerprint,
  };
}

const requiresNativeExecution = (version: string) =>
  !/^0\.1\.[0-8](?:$|-)/u.test(version);

async function main(args: string[]) {
  const [operation, ...paths] = args;
  if (operation === "create" && paths.length === 2)
    return create(paths[0]!, paths[1]!);
  if (operation === "record" && paths.length === 3)
    return record(paths[0]!, paths[1]!, paths[2]!);
  if (operation === "verify" && paths.length === 3)
    return verifyReceipt(
      await readJson(paths[2]!),
      await packageContent(paths[0]!),
      await packageContent(paths[1]!),
    );
  throw new Error(
    "Usage: first-use.ts create config.json snapshot.json | record snapshot.json run-evidence.json receipt.json | verify runtime.tgz creator.tgz combined-receipt.json",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
