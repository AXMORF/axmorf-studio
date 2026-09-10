import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  lstat,
  symlink,
  writeFile,
  unlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.join(
  process.cwd(),
  ".agents/skills/axmorf-video/scripts/native-probe.mjs",
);
const run = (cwd: string, ...args: string[]) =>
  JSON.parse(
    execFileSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
    }),
  );
const failRun = (cwd: string, ...args: string[]) =>
  assert.throws(() =>
    execFileSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );

test("create, exact worker roundtrip, verify and cleanup work in a cwd with spaces and quotes", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "native probe 'cwd "));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const created = run(cwd, "create", "--count", "2");
  assert.equal(created.status, "native-probe-created");
  assert.equal(created.probes.length, 2);
  assert.match(
    created.probes[0].workerPrompt,
    new RegExp(created.probes[0].source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(
    created.probes[0].workerPrompt,
    new RegExp(created.probes[0].target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.doesNotMatch(
    created.probes[0].workerPrompt,
    /[A-Za-z0-9+/]{80,}={0,2}/,
  );
  const before = await Promise.all([
    lstat(created.probes[0].source),
    lstat(created.probes[1].source),
    lstat(path.join(created.probeDirectory, "manifest.json")),
  ]);
  for (const probe of created.probes)
    await writeFile(probe.target, await readFile(probe.source), { flag: "wx" });
  const paths = (await readdir(created.probeDirectory))
    .sort()
    .map((name) => path.join(created.probeDirectory, name));
  const contents = await Promise.all(paths.map((file) => readFile(file)));
  const mtimes = await Promise.all(
    paths.map(async (file) => (await lstat(file)).mtimeMs),
  );
  const verified = JSON.parse(
    execFileSync("/bin/sh", ["-c", created.verifyCommand], {
      cwd,
      encoding: "utf8",
    }),
  );
  assert.equal(verified.status, "native-probe-io-verified");
  assert.equal(verified.verifiedProbeCount, 2);
  const after = await Promise.all([
    lstat(created.probes[0].source),
    lstat(created.probes[1].source),
    lstat(path.join(created.probeDirectory, "manifest.json")),
  ]);
  assert.deepEqual(
    after.map((entry) => entry.mtimeMs),
    before.map((entry) => entry.mtimeMs),
  );
  assert.deepEqual(
    await Promise.all(paths.map((file) => readFile(file))),
    contents,
  );
  assert.deepEqual(
    await Promise.all(paths.map(async (file) => (await lstat(file)).mtimeMs)),
    mtimes,
  );
  assert.equal(
    JSON.parse(
      execFileSync("/bin/sh", ["-c", created.cleanupCommand], {
        cwd,
        encoding: "utf8",
      }),
    ).status,
    "native-probe-cleaned",
  );
  await assert.rejects(lstat(created.probeDirectory), { code: "ENOENT" });
});

test("rejects count, wrong cwd, unknown files, symlinks, drift, and missing responses", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "native probe negative "));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const count of ["0", "5", "1.5", "x", "01", "1e0", "0x1"])
    failRun(cwd, "create", "--count", count);
  failRun(cwd, "create", "--count", "1", "--count", "1");
  failRun(cwd, "verify", "--unknown", "x");
  failRun(cwd, "cleanup");
  const created = run(cwd, "create", "--count", "1");
  const probe = created.probes[0];
  const manifestPath = path.join(created.probeDirectory, "manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString());
  manifest.extra = true;
  await writeFile(manifestPath, JSON.stringify(manifest));
  failRun(cwd, "verify", "--directory", created.probeDirectory);
  await writeFile(manifestPath, manifestBytes);
  failRun(cwd, "verify", "--directory", path.dirname(created.probeDirectory));
  failRun(cwd, "verify", "--directory", path.join(cwd, "missing"));
  const outside = await mkdtemp(
    path.join(tmpdir(), ".axmorf-worker-probe-outside-"),
  );
  t.after(() => rm(outside, { recursive: true, force: true }));
  failRun(cwd, "verify", "--directory", outside);
  await symlink(outside, path.join(cwd, ".axmorf-worker-probe-link"));
  failRun(
    cwd,
    "verify",
    "--directory",
    path.join(cwd, ".axmorf-worker-probe-link"),
  );
  await writeFile(path.join(created.probeDirectory, "unknown.txt"), "x");
  failRun(cwd, "verify", "--directory", created.probeDirectory);
  await unlink(path.join(created.probeDirectory, "unknown.txt"));
  await symlink(probe.source, path.join(created.probeDirectory, "unknown.txt"));
  failRun(cwd, "verify", "--directory", created.probeDirectory);
  await unlink(path.join(created.probeDirectory, "unknown.txt"));
  await writeFile(probe.target, Buffer.alloc(64, 1));
  failRun(cwd, "verify", "--directory", created.probeDirectory);
  await unlink(probe.target);
  await symlink(probe.source, probe.target);
  failRun(cwd, "verify", "--directory", created.probeDirectory);
  failRun(cwd, "cleanup", "--directory", created.probeDirectory);
});

test("wrong response directory and checksum drift preserve failed probe evidence", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "native-probe-misplaced-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const created = run(cwd, "create", "--count", "1");
  const probe = created.probes[0];
  const original = await readFile(probe.source);
  const misplaced = path.join(cwd, path.basename(probe.target));
  await writeFile(misplaced, original);
  for (const action of ["verify", "cleanup"]) {
    const result = spawnSync(
      process.execPath,
      [script, action, "--directory", created.probeDirectory],
      { cwd, encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing=.*response-0\.txt/u);
  }
  assert.deepEqual(await readFile(misplaced), original);
  assert.deepEqual(await readFile(probe.source), original);
  await writeFile(probe.target, original);
  await writeFile(probe.source, Buffer.alloc(65, 97));
  for (const action of ["verify", "cleanup"]) {
    const result = spawnSync(
      process.execPath,
      [script, action, "--directory", created.probeDirectory],
      { cwd, encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /challenge checksum or size drift/u);
  }
  assert.equal((await lstat(created.probeDirectory)).isDirectory(), true);
  await writeFile(probe.source, original);
  run(cwd, "cleanup", "--directory", created.probeDirectory);
  assert.deepEqual(await readFile(misplaced), original);
});

test("workspace and creator helper copies are byte identical", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      ".agents/skills/axmorf-video/scripts/native-probe.mjs",
    ),
  );
  const template = await readFile(
    path.join(
      process.cwd(),
      "packages/create-axmorf-studio/template/.agents/skills/axmorf-video/scripts/native-probe.mjs",
    ),
  );
  assert.deepEqual(template, source);
});
