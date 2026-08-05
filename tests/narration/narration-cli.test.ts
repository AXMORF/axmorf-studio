import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  runCli,
  type NarrationCliContext,
} from "../../scripts/narration/cli";
import { encodeCanonicalPcmWav } from "../../scripts/narration/domain/pcm-wav";
import type { ChunkAudioGenerator } from "../../scripts/narration/domain/provider-input";
import briefJson from "../../src/projects/gps-relativity/brief.json";
import narrationJson from "../../src/projects/gps-relativity/narration.json";
import renderJson from "../../src/projects/gps-relativity/render.json";
import storyCheckJson from "../../src/projects/gps-relativity/reviews/story-check.json";
import storyJson from "../../src/projects/gps-relativity/story.json";

const attemptFingerprint = `sha256:${"5".repeat(64)}`;

const writeJson = async (path: string, value: unknown) => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

const createProjectRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cli-test-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectDirectory = join(rootDir, "src/projects/gps-relativity");
  await Promise.all([
    writeJson(join(projectDirectory, "brief.json"), briefJson),
    writeJson(join(projectDirectory, "story.json"), storyJson),
    writeJson(join(projectDirectory, "narration.json"), narrationJson),
    writeJson(join(projectDirectory, "render.json"), renderJson),
    writeJson(
      join(projectDirectory, "reviews/story-check.json"),
      storyCheckJson,
    ),
  ]);
  return rootDir;
};

const createContext = ({
  rootDir,
  provider,
  stdout = [],
  configPath = "/srv/private/voxcpm.private.json",
  resolvedConfigPaths = [],
}: {
  readonly rootDir: string;
  readonly provider: ChunkAudioGenerator;
  readonly stdout?: string[];
  readonly configPath?: string;
  readonly resolvedConfigPaths?: string[];
}): NarrationCliContext => ({
  rootDir,
  env: { RSP_VOXCPM_PRIVATE_CONFIG: configPath },
  stdout: (line) => stdout.push(line),
  stderr: () => undefined,
  createGenerationDependencies: async ({ configPath: resolvedConfigPath }) => {
    resolvedConfigPaths.push(resolvedConfigPath);
    return {
      providerAttemptFingerprint: attemptFingerprint,
      generateChunk: provider,
      normalizePcm: async (sourceBytes) =>
        encodeCanonicalPcmWav(
          Buffer.alloc(Math.max(4_800 * 2, sourceBytes.length * 2), 1),
        ),
    };
  },
});

test("generate uses the repository-local private config by default and keeps the environment override", async (context) => {
  const rootDir = await createProjectRoot(context);
  const provider: ChunkAudioGenerator = async (request) =>
    Buffer.from(request.chunkId);
  const defaultConfigPaths: string[] = [];
  await runCli(["generate", "--project", "gps-relativity"], {
    ...createContext({
      rootDir,
      provider,
      resolvedConfigPaths: defaultConfigPaths,
    }),
    env: {},
  });
  assert.deepEqual(defaultConfigPaths, [
    join(rootDir, "voxcpm/voxcpm.private.json"),
  ]);

  const overrideConfigPaths: string[] = [];
  await runCli(
    ["generate", "--project", "gps-relativity"],
    createContext({
      rootDir,
      provider,
      configPath: "/operator/override/voxcpm.private.json",
      resolvedConfigPaths: overrideConfigPaths,
    }),
  );
  assert.deepEqual(overrideConfigPaths, [
    "/operator/override/voxcpm.private.json",
  ]);
});

test("generate still requires a current StoryCheck with the default private config", async (context) => {
  const rootDir = await createProjectRoot(context);
  const provider: ChunkAudioGenerator = async (request) =>
    Buffer.from(request.chunkId);

  await writeJson(
    join(
      rootDir,
      "src/projects/gps-relativity/reviews/story-check.json",
    ),
    { ...storyCheckJson, storyFingerprint: `sha256:${"0".repeat(64)}` },
  );
  await assert.rejects(
    () =>
      runCli(
        ["generate", "--project", "gps-relativity"],
        {
          ...createContext({ rootDir, provider }),
          env: {},
        },
      ),
    /StoryCheck/i,
  );
});

test("synthetic interruption resume seal and check complete end to end", async (context) => {
  const rootDir = await createProjectRoot(context);
  const stdout: string[] = [];
  let providerRequestCount = 0;
  let failOnSix = true;
  const provider: ChunkAudioGenerator = async (request) => {
    providerRequestCount += 1;
    if (failOnSix && providerRequestCount === 6) {
      throw new Error("synthetic provider interruption");
    }
    return Buffer.from(request.chunkId);
  };
  const cliContext = createContext({ rootDir, provider, stdout });

  await assert.rejects(
    () =>
      runCli(
        ["generate", "--project", "gps-relativity"],
        cliContext,
      ),
    /synthetic provider interruption/,
  );
  failOnSix = false;
  const resumed = await runCli(
    ["generate", "--project", "gps-relativity"],
    cliContext,
  );
  assert.equal(resumed.command, "generate");
  if (resumed.command !== "generate") throw new Error("expected generate");
  assert.equal(resumed.result.generatedChunkCount, 5);
  assert.equal(resumed.result.reusedChunkCount, 5);

  await runCli(
    [
      "seal",
      "--project",
      "gps-relativity",
      "--attempt",
      resumed.result.providerAttemptFingerprint,
    ],
    cliContext,
  );
  const checked = await runCli(
    ["check", "--project", "gps-relativity"],
    cliContext,
  );
  assert.equal(checked.command, "check");
  if (checked.command !== "check") throw new Error("expected check");
  assert.equal(checked.result.chunkCount, 10);
  assert.equal(checked.result.captionCueCount, 10);

  const serializedStdout = stdout.join("\n");
  assert.equal(serializedStdout.includes("/srv/private"), false);
  assert.equal(serializedStdout.includes("token"), false);
  assert.equal(serializedStdout.includes("controlInstruction"), false);
  assert.equal(serializedStdout.includes("referenceAudioChecksum"), false);
  for (const line of stdout) assert.doesNotThrow(() => JSON.parse(line));
});

test("unknown flags arbitrary paths and M3 commands are rejected", async (context) => {
  const rootDir = await createProjectRoot(context);
  const provider: ChunkAudioGenerator = async (request) =>
    Buffer.from(request.chunkId);
  const cliContext = createContext({ rootDir, provider });
  await assert.rejects(
    () =>
      runCli(["render", "--project", "gps-relativity"], cliContext),
    /generate|seal|check/,
  );
  await assert.rejects(
    () => runCli(["check", "--project", "../other"], cliContext),
    /project slug/i,
  );
  await assert.rejects(
    () =>
      runCli(
        ["check", "--project", "gps-relativity", "--output", "/tmp/x"],
        cliContext,
      ),
    /arguments|flags/i,
  );
});
