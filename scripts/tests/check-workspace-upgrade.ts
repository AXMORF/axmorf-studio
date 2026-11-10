import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { resolveNpmCliPath } from "../../packages/create-axmorf-studio/src/index.js";
import { createTemporaryDirectory } from "../../tests/package-boundary/support";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const sharedPath = "src/remotion/catalog/assets.manifest.json";
const oldVersion = "0.3.0-rc.5";

// Opt-in network/browser gate: build packages, then run this file with node --import tsx --test.
// Keep real npm installs out of the offline repository unit-test discovery.
test("a real rc.5 Workspace fixture upgrades untouched resources to the current packed runtime", async (context) => {
  const parent = await createTemporaryDirectory(
    context,
    "axmorf-packed-upgrade-",
  );
  const root = join(parent, "fixture");
  const creator = join(
    repositoryRoot,
    "packages/create-axmorf-studio/bin/create-axmorf-studio.js",
  );
  const npmCli = await resolveNpmCliPath({
    npmExecPath: process.env.npm_execpath,
    execPath: process.execPath,
    platform: process.platform,
  });
  const run = async (args: string[], cwd: string) => {
    try {
      const { stdout } = await execFileAsync(process.execPath, args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string };
      context.diagnostic(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`);
      throw error;
    }
  };
  context.diagnostic(
    "Packing the current built runtime and creating a rc.5 Workspace fixture.",
  );
  const packed = JSON.parse(
    await run(
      [
        npmCli,
        "pack",
        "./packages/studio",
        "--ignore-scripts",
        "--pack-destination",
        parent,
        "--json",
      ],
      repositoryRoot,
    ),
  ) as { filename: string }[];
  const runtimePackage = join(parent, packed[0]!.filename);
  await run(
    [
      creator,
      "fixture",
      "--yes",
      "--no-install",
      "--runtime-package",
      oldVersion,
    ],
    parent,
  );
  // Actual rc.5 package resources, not hashes invented from the Workspace contents.
  await run([npmCli, "install"], root);
  const runtimeRoot = join(root, "node_modules/@axmorf/studio");
  assert.equal(
    JSON.parse(await readFile(join(runtimeRoot, "package.json"), "utf8"))
      .version,
    oldVersion,
  );
  const previous = await readFile(
    new URL(
      "../../tests/npm-install-e2e/fixtures/rc5-assets.manifest.json",
      import.meta.url,
    ),
  );
  assert.deepEqual(
    await readFile(join(runtimeRoot, "dist/assets/workspace-seed", sharedPath)),
    previous,
  );
  await mkdir(join(root, "src/remotion/catalog"), { recursive: true });
  await copyFile(
    new URL(
      "../../tests/npm-install-e2e/fixtures/rc5-assets.manifest.json",
      import.meta.url,
    ),
    join(root, sharedPath),
  );
  // This release predates shared-resource hash records.
  await assert.rejects(readFile(join(root, ".axmorf/shared-resources.json")), {
    code: "ENOENT",
  });
  await run([npmCli, "run", "--silent", "browser:prepare"], root);
  const configBefore = await readFile(
    join(root, "private/producer.config.json"),
  );

  context.diagnostic(
    "Running the real creator upgrade (npm install, bootstrap and doctor).",
  );
  const output = await run(
    [creator, "upgrade", "--yes", "--runtime-package", runtimePackage],
    root,
  );
  const result = JSON.parse(output.trim().split(/\r?\n/u).at(-1)!);
  assert.equal(result.status, "workspace-upgraded");
  assert.equal(result.ready, true);
  assert.equal(result.runtime.from, oldVersion);
  const currentBytes = await readFile(
    join(
      repositoryRoot,
      "packages/studio/src/remotion/catalog/assets.manifest.json",
    ),
  );
  assert.notDeepEqual(previous, currentBytes);
  assert.deepEqual(await readFile(join(root, sharedPath)), currentBytes);
  assert.deepEqual(
    await readFile(join(root, result.backup, sharedPath)),
    previous,
  );
  assert.deepEqual(
    await readFile(join(root, "private/producer.config.json")),
    configBefore,
  );
  const currentPackage = JSON.parse(
    await readFile(
      join(repositoryRoot, "packages/studio/package.json"),
      "utf8",
    ),
  );
  assert.equal(
    JSON.parse(await readFile(join(runtimeRoot, "package.json"), "utf8"))
      .version,
    currentPackage.version,
  );
  const hashes = JSON.parse(
    await readFile(join(root, ".axmorf/shared-resources.json"), "utf8"),
  );
  assert.equal(
    hashes.files[sharedPath],
    `sha256:${createHash("sha256").update(currentBytes).digest("hex")}`,
  );
  const doctor = JSON.parse(
    await run([npmCli, "run", "--silent", "doctor"], root),
  );
  assert.equal(doctor.status, "workspace-ready");
  assert.ok(Object.values(doctor.checks).every((value) => value === "pass"));
});
