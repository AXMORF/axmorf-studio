import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  createNpmCommandRunner,
  createWorkspace,
  parseArguments,
  resolveNpmCliPath,
  runCli,
} from "../../packages/create-axmorf-studio/src/index.js";
import { ProducerConfigSchema } from "@axmorf/studio/contracts";
import { renderFilmRegistrySource } from "../../scripts/films/registry";

const creatorTemplate = join(
  process.cwd(),
  "packages/create-axmorf-studio/template",
);

const temporaryRoot = async (context: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-scaffold-contract-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
};

test("arguments are strict and keep the test runtime override explicit", () => {
  assert.deepEqual(
    parseArguments([
      "my-video",
      "--yes",
      "--no-install",
      "--runtime-package",
      "./runtime.tgz",
    ]),
    {
      command: "create",
      dryRun: false,
      target: "my-video",
      yes: true,
      install: false,
      runtimePackage: "./runtime.tgz",
      help: false,
    },
  );
  assert.deepEqual(parseArguments(["upgrade", "--dry-run"]), {
    command: "upgrade",
    dryRun: true,
    target: ".",
    yes: false,
    install: true,
    runtimePackage: parseArguments(["x"]).runtimePackage,
    help: false,
  });
  assert.equal(parseArguments(["upgrade", "../ws"]).target, "../ws");
  assert.throws(
    () => parseArguments(["one", "--dry-run"]),
    /only valid with upgrade/u,
  );
  assert.throws(() => parseArguments([]), /target directory is required/u);
  assert.throws(() => parseArguments(["one", "two"]), /Exactly one target/u);
  assert.throws(
    () => parseArguments(["one", "--yes", "--yes"]),
    /only be specified once/u,
  );
  assert.throws(() => parseArguments(["one", "--unknown"]), /Unknown option/u);
  assert.throws(
    () => parseArguments(["one", "--runtime-package"]),
    /requires a package version/u,
  );
});

test("default creator runtime tracks its own published package version", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../../packages/create-axmorf-studio/package.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    parseArguments(["fresh-workspace"]).runtimePackage,
    manifest.version,
  );
});

test("help documents every supported creator option", async () => {
  const output: string[] = [];
  const result = await runCli(["--help"], {
    stdout: (value) => output.push(value),
  });
  assert.deepEqual(result, { status: "help" });
  assert.match(output.join(""), /--runtime-package <version-or-path>/u);
});

test("npm runs through its validated JavaScript CLI on Windows without npm.cmd or a shell", async () => {
  const execPath = String.raw`C:\Program Files\nodejs\node.exe`;
  const npmCliPath = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`;
  const calls: Array<{
    executable: string;
    args: string[];
    options: { cwd: string; shell: boolean; stdio: string };
  }> = [];
  const child = new EventEmitter();
  const runner = createNpmCommandRunner({
    npmExecPath: npmCliPath,
    execPath,
    platform: "win32",
    filesystem: {
      lstat: async (path: string) => {
        assert.equal(path, npmCliPath);
        return {
          isFile: () => true,
          isSymbolicLink: () => false,
        };
      },
    },
    spawnProcess: (executable, args, options) => {
      calls.push({ executable, args, options });
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    },
  });

  await runner("run", ["--silent", "doctor"], {
    cwd: String.raw`C:\work\story`,
  });
  assert.deepEqual(calls, [
    {
      executable: execPath,
      args: [npmCliPath, "run", "--silent", "doctor"],
      options: {
        cwd: String.raw`C:\work\story`,
        stdio: "inherit",
        shell: false,
      },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /npm\.cmd/iu);
});

test("npm CLI resolution rejects a symlink even when npm_execpath names JavaScript", async () => {
  await assert.rejects(
    () =>
      resolveNpmCliPath({
        npmExecPath: "/opt/npm/bin/npm-cli.js",
        execPath: "/opt/node/bin/node",
        platform: "linux",
        filesystem: {
          lstat: async () => ({
            isFile: () => true,
            isSymbolicLink: () => true,
          }),
        },
      }),
    /regular non-symlink/u,
  );
});

test("npm retains a private diagnostic directory across stages without capturing stdio", async (context) => {
  const root = await temporaryRoot(context);
  const npmCliPath = join(root, "npm-cli.js");
  await writeFile(npmCliPath, "// npm test fixture\n");
  const diagnostics: string[] = [];
  const requests: Array<{ args: string[]; stdio: string }> = [];
  const runner = createNpmCommandRunner({
    npmExecPath: npmCliPath,
    execPath: process.execPath,
    platform: process.platform,
    spawnProcess: (_executable, args, options) => {
      requests.push({ args, stdio: options.stdio });
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    },
  });
  await runner("install", [], {
    cwd: root,
    onLogDirectory: (path: string) => diagnostics.push(path),
  });
  const logDirectory = diagnostics[0]!;
  context.after(() => rm(logDirectory, { recursive: true, force: true }));
  await runner("run", ["--silent", "doctor"], { cwd: root });
  assert.equal(diagnostics.length, 1);
  assert.equal((await lstat(logDirectory)).isDirectory(), true);
  if (process.platform !== "win32") {
    assert.equal((await lstat(logDirectory)).mode & 0o777, 0o700);
  }
  assert.deepEqual(
    requests.map(({ args, stdio }) => ({
      logOptions: args.slice(1, 3),
      command: args[3],
      stdio,
    })),
    ["install", "run"].map((command) => ({
      logOptions: [`--logs-dir=${logDirectory}`, "--logs-max=10"],
      command,
      stdio: "inherit",
    })),
  );
});

test("no-install creates a standalone, host-neutral workspace without claiming readiness", async (context) => {
  const root = await temporaryRoot(context);
  const commands: unknown[] = [];
  const output: string[] = [];
  const result = await runCli(
    [
      "story-one",
      "--yes",
      "--no-install",
      "--runtime-package",
      "./runtime.tgz",
    ],
    {
      cwd: root,
      templateRoot: creatorTemplate,
      stdout: (value) => output.push(value),
      runCommand: async (...args) => {
        commands.push(args);
      },
    },
  );
  const workspace = join(root, "story-one");
  const manifest = JSON.parse(
    await readFile(join(workspace, "package.json"), "utf8"),
  );
  const config = JSON.parse(
    await readFile(join(workspace, "private/producer.config.json"), "utf8"),
  );
  const example = JSON.parse(
    await readFile(join(workspace, "producer.config.example.json"), "utf8"),
  );

  assert.equal(result.status, "workspace-generated");
  assert.equal(result.ready, false);
  assert.equal(commands.length, 0);
  assert.deepEqual(JSON.parse(output[0]!), result);
  assert.equal(manifest.private, true);
  assert.equal(manifest.license, "UNLICENSED");
  assert.equal(manifest.type, "module");
  assert.match(
    await readFile(join(workspace, "remotion.config.ts"), "utf8"),
    /Config\.setVideoImageFormat/u,
  );
  await assert.rejects(() => lstat(join(workspace, "remotion.config.mjs")), {
    code: "ENOENT",
  });
  assert.equal(Object.hasOwn(manifest, "workspaces"), false);
  assert.deepEqual(manifest.axmorf, { workspaceVersion: 1 });
  assert.equal(
    manifest.dependencies["@axmorf/studio"],
    `file:${join(root, "runtime.tgz")}`,
  );
  assert.equal(manifest.dependencies.remotion, "4.0.489");
  assert.equal(manifest.dependencies["@remotion/cli"], "4.0.489");
  assert.equal(manifest.dependencies.react, "19.2.3");
  assert.deepEqual(manifest.overrides, {
    "fast-uri": "3.1.9",
    "brace-expansion@1": "1.1.21",
    "brace-expansion@2": "2.1.7",
    nanoid: "3.3.18",
    "postcss-selector-parser": "7.1.6",
    "source-map-js": "1.2.2",
    zod: "4.6.7",
  });
  for (const version of [
    ...Object.values(manifest.dependencies),
    ...Object.values(manifest.devDependencies),
  ] as string[]) {
    if (version.startsWith("file:")) continue;
    assert.doesNotMatch(version, /^[~^*><=]/u);
  }
  assert.deepEqual(
    Object.keys(manifest.scripts).filter((name) =>
      /^(project|catalog|reference):/u.test(name),
    ),
    [],
    "0.3.0 Workspaces carry no Project-chain scripts.",
  );
  assert.equal(
    manifest.scripts.compositions,
    "remotion compositions src/index.ts",
  );
  assert.doesNotMatch(JSON.stringify(manifest.scripts), /tsx|scripts\//u);
  const remotionEntry = await readFile(join(workspace, "src/index.ts"), "utf8");
  assert.match(
    remotionEntry,
    /createRemotionRoot\(\{\s*films: filmRegistry,\s*sceneTemplateAudioProjection\s*\}\)/u,
  );
  assert.doesNotMatch(remotionEntry, /projects/u);
  assert.match(remotionEntry, /from "\.\/films\/index"/u);
  assert.equal(
    await readFile(join(workspace, "src/films/index.ts"), "utf8"),
    renderFilmRegistrySource([]),
  );
  for (const command of [
    "new",
    "voice",
    "music",
    "asset",
    "review",
    "check",
    "deliver",
    "list",
    "delete",
  ]) {
    assert.equal(manifest.scripts[`film:${command}`], `axmorf film ${command}`);
  }
  assert.doesNotMatch(
    remotionEntry,
    /import \{ RemotionRoot \} from "@axmorf/u,
  );
  await assert.rejects(() => lstat(join(workspace, "src/runtime")), {
    code: "ENOENT",
  });
  assert.deepEqual(ProducerConfigSchema.parse(config), config);
  assert.deepEqual(config, example);
  assert.deepEqual(config.sceneDefaults, {
    introSceneTemplateId: "axmorf-brand-reveal-v1",
    outroSceneTemplateId: "axmorf-source-follow-v1",
  });
  assert.equal(config.tts.providers[0].kind, "edge-tts");
  assert.equal(
    Object.hasOwn(config.tts.providers[0].connection, "apiKey"),
    false,
  );
  assert.equal(
    Object.hasOwn(config.tts.providers[0].connection, "token"),
    false,
  );
  const workspaceGitignore = await readFile(
    join(workspace, ".gitignore"),
    "utf8",
  );
  assert.match(workspaceGitignore, /^private\/$/mu);
  assert.match(workspaceGitignore, /^public\/assets\/axmorf-shared\/$/mu);
  assert.match(
    workspaceGitignore,
    /^src\/remotion\/catalog\/assets\.manifest\.json$/mu,
  );
  assert.match(workspaceGitignore, /^src\/films\/$/mu);
  assert.match(workspaceGitignore, /^\.producer-revisions\/$/mu);
  await assert.rejects(
    () => lstat(join(workspace, ".agents/skills/axmorf-video")),
    { code: "ENOENT" },
  );
  for (const reference of ["craft", "music", "artwork", "api"]) {
    const path = `.agents/skills/axmorf-film/references/${reference}.md`;
    assert.equal(
      await readFile(join(workspace, path), "utf8"),
      await readFile(join(process.cwd(), path), "utf8"),
      "New Workspaces must receive the same creative guidance as the repository.",
    );
  }
  const workspaceReadme = await readFile(join(workspace, "README.md"), "utf8");
  const workspaceAgents = await readFile(join(workspace, "AGENTS.md"), "utf8");
  assert.match(workspaceReadme, /npm run doctor/u);
  assert.match(workspaceReadme, /Ask your Agent for a video/u);
  assert.match(
    workspaceReadme,
    /`AGENTS\.md` and the local `axmorf-film` Skill supply/u,
  );
  assert.match(
    workspaceReadme,
    /You do not need to include internal commands/u,
  );
  assert.match(
    workspaceAgents,
    /prepare the declared\s+Node\.js\/npm environment/u,
  );
  assert.match(workspaceAgents, /do not modify `node_modules`/u);
  assert.match(
    workspaceAgents,
    /Before the first film in this Workspace, run `npm run doctor`/u,
  );
  assert.match(workspaceAgents, /\.agents\/skills\/axmorf-film\/SKILL\.md/u);
  assert.doesNotMatch(workspaceAgents, /axmorf-video|project:/u);
  const filmSkill = await readFile(
    join(workspace, ".agents/skills/axmorf-film/SKILL.md"),
    "utf8",
  );
  assert.equal(
    filmSkill,
    await readFile(
      join(creatorTemplate, ".agents/skills/axmorf-film/SKILL.md"),
      "utf8",
    ),
  );
  for (const command of [
    "film:voice",
    "film:music",
    "film:review",
    "film:deliver",
  ]) {
    assert.match(filmSkill, new RegExp(command, "u"));
  }
  // Claude Code only discovers .claude/skills; that entry points at the shared Skill.
  const claudeEntry = await readFile(
    join(workspace, ".claude/skills/axmorf-film/SKILL.md"),
    "utf8",
  );
  const frontmatter = (source: string) => source.split("---")[1];
  assert.equal(frontmatter(claudeEntry), frontmatter(filmSkill));
  assert.match(claudeEntry, /\.agents\/skills\/axmorf-film\/SKILL\.md/u);
  assert.doesNotMatch(filmSkill, /Codex|OpenAI|spawn_agent/u);
  assert.equal(
    await readFile(join(workspace, "CLAUDE.md"), "utf8"),
    "@AGENTS.md\n",
  );
  assert.equal(
    await readFile(join(workspace, "GEMINI.md"), "utf8"),
    "@./AGENTS.md\n",
  );
  await assert.rejects(() => lstat(join(workspace, ".git")), /ENOENT/u);
  await assert.rejects(
    () => lstat(join(workspace, "package-lock.json")),
    /ENOENT/u,
  );
});

test("default flow installs, bootstraps, doctors, and only then atomically publishes the target", async (context) => {
  const root = await temporaryRoot(context);
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const result = await runCli(
    ["ready-story", "--yes", "--runtime-package", "0.1.0"],
    {
      cwd: root,
      templateRoot: creatorTemplate,
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
      runCommand: async (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        assert.match(options.cwd, /\.ready-story\.staging-/u);
        await assert.rejects(() => lstat(join(root, "ready-story")), /ENOENT/u);
        if (command === "install") {
          await writeFile(
            join(options.cwd, "package-lock.json"),
            '{"name":"ready-story","lockfileVersion":3}\n',
            "utf8",
          );
        }
      },
    },
  );

  assert.ok(result.status === "workspace-ready");
  assert.deepEqual(stdout, [`${JSON.stringify(result)}\n`]);
  assert.deepEqual(
    stderr.map((value) => value.replace(/\(\d+s elapsed\)/u, "(elapsed)")),
    ["install", "bootstrap", "browser", "doctor"].flatMap((stage) => [
      `[axmorf] ${stage}: starting\n`,
      `[axmorf] ${stage}: complete (elapsed)\n`,
    ]),
  );
  assert.equal(result.ready, true);
  assert.deepEqual(
    calls.map(({ command, args }) => [command, args]),
    [
      ["install", []],
      ["run", ["--silent", "bootstrap"]],
      ["run", ["--silent", "browser:prepare"]],
      ["run", ["--silent", "doctor"]],
    ],
  );
  assert.equal(
    (await lstat(join(root, "ready-story/package-lock.json"))).isFile(),
    true,
  );
  assert.deepEqual(
    (await readdir(root)).filter((name) => name.includes(".staging-")),
    [],
  );
});

test("install or doctor failure leaves neither a target nor staging debris", async (context) => {
  const root = await temporaryRoot(context);
  await assert.rejects(
    () =>
      createWorkspace(
        {
          cwd: root,
          target: "failed-story",
          install: true,
          runtimePackage: "0.1.0",
        },
        {
          templateRoot: creatorTemplate,
          runCommand: async (command, args, options) => {
            if (command === "install") {
              await writeFile(
                join(options.cwd, "package-lock.json"),
                "{}\n",
                "utf8",
              );
              return;
            }
            if (args.includes("doctor"))
              throw new Error("doctor rejected workspace");
          },
        },
      ),
    /doctor rejected workspace/u,
  );
  await assert.rejects(() => lstat(join(root, "failed-story")), /ENOENT/u);
  assert.deepEqual(await readdir(root), []);
});

test("long setup stages report elapsed progress and clear their timer on failure", async (context) => {
  const root = await temporaryRoot(context);
  const output: string[] = [];
  const intervals: Array<{ callback: () => void; cancelled: boolean }> = [];
  let milliseconds = 0;
  const failure = new Error("npm failed with exit code 1");
  await assert.rejects(
    () =>
      createWorkspace(
        {
          cwd: root,
          target: "progress-story",
          install: true,
          runtimePackage: "0.1.0",
        },
        {
          templateRoot: creatorTemplate,
          progress: (value: string) => output.push(value),
          now: () => milliseconds,
          scheduleInterval: (callback: () => void, delay: number) => {
            assert.equal(delay, 30_000);
            const interval = {
              callback,
              cancelled: false,
              unref: () => undefined,
            };
            intervals.push(interval);
            return interval;
          },
          cancelInterval: (interval) => {
            const matching = intervals.find((entry) => entry === interval);
            assert.ok(matching);
            matching.cancelled = true;
          },
          runCommand: async (command, _args, options) => {
            if (command === "install") {
              options.onLogDirectory?.("/retained/npm-logs");
              milliseconds = 30_000;
              intervals[0]!.callback();
              milliseconds = 65_000;
              return;
            }
            milliseconds = 70_000;
            throw failure;
          },
        },
      ),
    (error: unknown) => error === failure,
  );
  assert.deepEqual(output, [
    "[axmorf] install: starting\n",
    "[axmorf] npm diagnostic logs (retained): /retained/npm-logs\n",
    "[axmorf] install: still running (30s elapsed)\n",
    "[axmorf] install: complete (65s elapsed)\n",
    "[axmorf] bootstrap: starting\n",
    "[axmorf] bootstrap: failed (5s elapsed)\n",
  ]);
  assert.equal(intervals.length, 2);
  assert.ok(intervals.every((interval) => interval.cancelled));
  assert.deepEqual(await readdir(root), []);
});

test("browser setup failure preserves bounded diagnostics before staging cleanup", async (context) => {
  const root = await temporaryRoot(context);
  await assert.rejects(
    () =>
      createWorkspace(
        {
          cwd: root,
          target: "browser-failed",
          install: true,
          runtimePackage: "0.1.0",
        },
        {
          templateRoot: creatorTemplate,
          runCommand: async (_command, args, options) => {
            if (args.includes("browser:prepare")) {
              await writeFile(
                join(options.cwd, ".axmorf-browser-prepare.log"),
                `discarded-prefix${"x".repeat(5000)}\nBrowser download interrupted`,
              );
              throw new Error("browser setup failed");
            }
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /browser setup failed/u);
      assert.match(error.message, /Browser download interrupted/u);
      assert.doesNotMatch(error.message, /discarded-prefix/u);
      assert.ok(error.message.length < 4300);
      return true;
    },
  );
  assert.deepEqual(await readdir(root), []);
});

test("unsafe targets fail before filesystem mutation", async (context) => {
  const root = await temporaryRoot(context);
  const runCommand = async () => {
    throw new Error("command runner must not be called");
  };
  await mkdir(join(root, "non-empty"));
  await writeFile(join(root, "non-empty/user.txt"), "owned\n", "utf8");
  await assert.rejects(
    () =>
      createWorkspace(
        {
          cwd: root,
          target: "non-empty",
          install: false,
          runtimePackage: "0.1.0",
        },
        { templateRoot: creatorTemplate, runCommand },
      ),
    /not empty/u,
  );
  await assert.rejects(
    () =>
      createWorkspace(
        {
          cwd: root,
          target: "../escape",
          install: false,
          runtimePackage: "0.1.0",
        },
        { templateRoot: creatorTemplate, runCommand },
      ),
    /stay inside/u,
  );
  await assert.rejects(
    () =>
      createWorkspace(
        {
          cwd: root,
          target: "UPPERCASE",
          install: false,
          runtimePackage: "0.1.0",
        },
        { templateRoot: creatorTemplate, runCommand },
      ),
    /lowercase npm package name/u,
  );

  const symlinkSource = join(root, "symlink-source");
  await mkdir(symlinkSource);
  await symlink(symlinkSource, join(root, "linked-target"));
  await assert.rejects(
    () =>
      createWorkspace(
        {
          cwd: root,
          target: "linked-target",
          install: false,
          runtimePackage: "0.1.0",
        },
        { templateRoot: creatorTemplate, runCommand },
      ),
    /symbolic link/u,
  );
  assert.equal(
    await readFile(join(root, "non-empty/user.txt"), "utf8"),
    "owned\n",
  );
});
