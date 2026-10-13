import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MANAGED_FILES,
  MIRRORED_DIRECTORIES,
  createWorkspace,
  desiredManagedFiles,
  upgradeWorkspace,
} from "../../packages/create-axmorf-studio/src/index.js";

const skillPath = ".agents/skills/axmorf-video/SKILL.md";
const qualityBar =
  ".agents/skills/axmorf-video/references/visual-quality-bar.md";

const recorder = (failOn?: string) => {
  const calls: string[] = [];
  return {
    calls,
    runCommand: async (command: string, args: string[]) => {
      const call = [command, ...args.filter((arg) => arg !== "--silent")].join(
        " ",
      );
      calls.push(call);
      if (call === failOn) throw new Error(`${call} failed`);
    },
  };
};

/** A generated Workspace edited to look like an older release with user data. */
const legacyWorkspace = async () => {
  const parent = await mkdtemp(join(tmpdir(), "axmorf-upgrade-"));
  await createWorkspace(
    { cwd: parent, target: "ws", install: false, runtimePackage: "0.1.0" },
    { runCommand: async () => {}, progress: () => {} },
  );
  const root = join(parent, "ws");
  await rm(join(root, ".axmorf"), { recursive: true });
  await writeFile(join(root, skillPath), "old skill\n");
  await rm(join(root, qualityBar));
  await writeFile(
    join(root, ".agents/skills/axmorf-video/references/retired.md"),
    "retired\n",
  );
  await mkdir(join(root, ".agents/skills/my-own-skill"), { recursive: true });
  await writeFile(join(root, ".agents/skills/my-own-skill/SKILL.md"), "mine\n");
  await mkdir(join(root, "src/projects/demo"), { recursive: true });
  await writeFile(join(root, "src/projects/demo/story.json"), "{}\n");
  await writeFile(
    join(root, "private/producer.config.json"),
    '{"user":true}\n',
  );
  await writeFile(join(root, "package-lock.json"), '{"lock":"old"}\n');
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  manifest.scripts["my:script"] = "echo mine";
  delete manifest.scripts["workspace:upgrade"];
  manifest.dependencies["left-pad"] = "1.3.0";
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { parent, root };
};

test("every template file has an upgrade classification", async () => {
  const { managed, placeholders } = await desiredManagedFiles();
  for (const path of MANAGED_FILES) assert.ok(managed.has(path), path);
  for (const directory of MIRRORED_DIRECTORIES) {
    assert.ok(
      [...managed.keys()].some((path) => path.startsWith(`${directory}/`)),
      directory,
    );
  }
  assert.ok(managed.has("producer.config.example.json"));
  assert.ok(placeholders.includes("deliveries/.gitkeep"));
  for (const path of managed.keys()) {
    assert.doesNotMatch(
      path,
      /^(?:private|public|deliveries|src\/projects)\//u,
      path,
    );
  }
});

test("new Workspaces record managed checksums for later upgrades", async () => {
  const parent = await mkdtemp(join(tmpdir(), "axmorf-upgrade-"));
  try {
    await createWorkspace(
      { cwd: parent, target: "ws", install: false, runtimePackage: "0.1.0" },
      { runCommand: async () => {}, progress: () => {} },
    );
    const manifest = JSON.parse(
      await readFile(join(parent, "ws/.axmorf/managed.json"), "utf8"),
    );
    assert.equal(manifest.schemaVersion, 1);
    assert.match(manifest.files[skillPath], /^sha256:/u);
    assert.match(manifest.files["producer.config.example.json"], /^sha256:/u);
    const scripts = JSON.parse(
      await readFile(join(parent, "ws/package.json"), "utf8"),
    ).scripts;
    assert.match(
      scripts["workspace:upgrade"],
      /create-axmorf-studio@latest -- create-axmorf-studio upgrade/u,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("legacy upgrade refreshes managed files and keeps user data", async () => {
  const { parent, root } = await legacyWorkspace();
  const { calls, runCommand } = recorder();
  try {
    const result = await upgradeWorkspace(
      { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
      {
        runCommand,
        progress: () => {},
        now: () => new Date("2026-10-14T00:00:00Z"),
      },
    );
    assert.equal(result.status, "workspace-upgraded");
    assert.equal(result.legacyWithoutManifest, true);
    assert.deepEqual(result.runtime, { from: "0.1.0", to: "9.9.9" });
    assert.ok(result.updated.includes(skillPath));
    assert.ok(result.created.includes(qualityBar));
    assert.deepEqual(result.removed, [
      ".agents/skills/axmorf-video/references/retired.md",
    ]);
    assert.deepEqual(calls, ["install", "run bootstrap", "run doctor"]);

    assert.notEqual(
      await readFile(join(root, skillPath), "utf8"),
      "old skill\n",
    );
    await assert.rejects(
      stat(join(root, ".agents/skills/axmorf-video/references/retired.md")),
    );
    assert.equal(
      await readFile(
        join(root, ".agents/skills/my-own-skill/SKILL.md"),
        "utf8",
      ),
      "mine\n",
    );
    assert.equal(
      await readFile(join(root, "src/projects/demo/story.json"), "utf8"),
      "{}\n",
    );
    assert.equal(
      await readFile(join(root, "private/producer.config.json"), "utf8"),
      '{"user":true}\n',
    );

    const manifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    );
    assert.equal(manifest.dependencies["@axmorf/studio"], "9.9.9");
    assert.equal(manifest.dependencies["left-pad"], "1.3.0");
    assert.equal(manifest.scripts["my:script"], "echo mine");
    assert.ok(manifest.scripts["workspace:upgrade"]);
    assert.equal(manifest.name, "ws");

    const backup = join(root, result.backup!);
    assert.equal(
      await readFile(join(backup, skillPath), "utf8"),
      "old skill\n",
    );
    assert.equal(
      await readFile(
        join(backup, ".agents/skills/axmorf-video/references/retired.md"),
        "utf8",
      ),
      "retired\n",
    );
    assert.match(
      await readFile(join(backup, "package.json"), "utf8"),
      /my:script/u,
    );
    assert.ok(
      JSON.parse(await readFile(join(root, ".axmorf/managed.json"), "utf8"))
        .files[qualityBar],
    );
    await assert.rejects(stat(join(root, ".project-operation.lock")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("upgrades after the first one identify locally edited managed files", async () => {
  const { parent, root } = await legacyWorkspace();
  try {
    await upgradeWorkspace(
      {
        cwd: root,
        install: false,
        runtimePackage: "9.9.9",
        creatorVersion: "9.9.9",
      },
      { progress: () => {} },
    );
    await writeFile(join(root, "AGENTS.md"), "edited by me\n");
    const plan = await upgradeWorkspace(
      {
        cwd: root,
        dryRun: true,
        runtimePackage: "9.9.9",
        creatorVersion: "9.9.9",
      },
      { progress: () => {} },
    );
    assert.equal(plan.status, "workspace-upgrade-planned");
    assert.equal(plan.legacyWithoutManifest, false);
    assert.deepEqual(plan.updated, ["AGENTS.md"]);
    assert.deepEqual(plan.localChanges, ["AGENTS.md"]);
    assert.equal(
      await readFile(join(root, "AGENTS.md"), "utf8"),
      "edited by me\n",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("dry-run writes nothing", async () => {
  const { parent, root } = await legacyWorkspace();
  try {
    const before = await readdir(root, { recursive: true });
    const plan = await upgradeWorkspace(
      {
        cwd: root,
        dryRun: true,
        runtimePackage: "9.9.9",
        creatorVersion: "9.9.9",
      },
      { progress: () => {} },
    );
    assert.ok(plan.updated.length > 0);
    assert.deepEqual(
      (await readdir(root, { recursive: true })).sort(),
      before.sort(),
    );
    assert.equal(await readFile(join(root, skillPath), "utf8"), "old skill\n");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("an active Project operation blocks the upgrade", async () => {
  const { parent, root } = await legacyWorkspace();
  try {
    await writeFile(join(root, ".project-operation.lock"), "{}\n");
    await assert.rejects(
      upgradeWorkspace(
        { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
        { runCommand: async () => {}, progress: () => {} },
      ),
      /Project operation is active/u,
    );
    assert.equal(await readFile(join(root, skillPath), "utf8"), "old skill\n");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a failed bootstrap restores every managed file and reinstalls", async () => {
  const { parent, root } = await legacyWorkspace();
  const { calls, runCommand } = recorder("run bootstrap");
  try {
    const packageBefore = await readFile(join(root, "package.json"), "utf8");
    await assert.rejects(
      upgradeWorkspace(
        { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
        { runCommand, progress: () => {} },
      ),
      /restored from \.axmorf\/backups\/.+dependency reinstall: restored/u,
    );
    assert.deepEqual(calls, ["install", "run bootstrap", "install"]);
    assert.equal(await readFile(join(root, skillPath), "utf8"), "old skill\n");
    assert.equal(
      await readFile(join(root, "package.json"), "utf8"),
      packageBefore,
    );
    assert.equal(
      await readFile(join(root, "package-lock.json"), "utf8"),
      '{"lock":"old"}\n',
    );
    assert.equal(
      await readFile(
        join(root, ".agents/skills/axmorf-video/references/retired.md"),
        "utf8",
      ),
      "retired\n",
    );
    await assert.rejects(stat(join(root, qualityBar)));
    await assert.rejects(stat(join(root, ".axmorf/managed.json")));
    await assert.rejects(stat(join(root, ".project-operation.lock")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a directory that is not a Workspace is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-upgrade-"));
  try {
    await writeFile(join(root, "package.json"), '{"name":"other"}\n');
    await assert.rejects(
      upgradeWorkspace(
        { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
        { runCommand: async () => {}, progress: () => {} },
      ),
      /not an AXMORF Studio Workspace/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
