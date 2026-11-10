import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bootstrapWorkspace } from "../../packages/studio/src/bootstrap/workspace-bootstrap";

import {
  MANAGED_FILES,
  MIRRORED_DIRECTORIES,
  createWorkspace,
  desiredManagedFiles,
  upgradeWorkspace,
} from "../../packages/create-axmorf-studio/src/index.js";

const skillPath = ".agents/skills/axmorf-film/SKILL.md";
const craftGuide = ".agents/skills/axmorf-film/references/craft.md";
const retiredSkill = ".agents/skills/axmorf-video/SKILL.md";
const retiredReference = ".agents/skills/axmorf-video/references/retired.md";

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
  await rm(join(root, ".claude"), { recursive: true });
  await writeFile(join(root, skillPath), "old skill\n");
  await rm(join(root, craftGuide));
  // The Project-chain Skill that 0.3.0 retired.
  await mkdir(join(root, ".agents/skills/axmorf-video/references"), {
    recursive: true,
  });
  await writeFile(join(root, retiredSkill), "retired skill\n");
  await writeFile(join(root, retiredReference), "retired\n");
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
  manifest.scripts["project:create"] = "axmorf project create";
  manifest.scripts["project:check"] = "echo my own check";
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
      /^(?:private|public|deliveries|src\/films|src\/projects)\//u,
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
    assert.ok(result.created.includes(craftGuide));
    assert.ok(result.created.includes(".claude/skills/axmorf-film/SKILL.md"));
    assert.deepEqual(result.removed, [retiredSkill, retiredReference]);
    assert.deepEqual(result.legacyProjectData, ["src/projects"]);
    assert.deepEqual(calls, ["install", "run bootstrap", "run doctor"]);

    assert.notEqual(
      await readFile(join(root, skillPath), "utf8"),
      "old skill\n",
    );
    await assert.rejects(stat(join(root, retiredReference)));
    await assert.rejects(stat(join(root, retiredSkill)));
    // Removing every file of a retired Skill leaves no empty directory behind.
    await assert.rejects(stat(join(root, ".agents/skills/axmorf-video")));
    await stat(join(root, ".agents/skills/axmorf-film"));
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
    assert.equal(manifest.scripts["project:create"], undefined);
    assert.equal(manifest.scripts["project:check"], "echo my own check");
    assert.ok(manifest.scripts["workspace:upgrade"]);
    assert.equal(manifest.name, "ws");

    const backup = join(root, result.backup!);
    assert.equal(
      await readFile(join(backup, skillPath), "utf8"),
      "old skill\n",
    );
    assert.equal(
      await readFile(join(backup, retiredReference), "utf8"),
      "retired\n",
    );
    assert.match(
      await readFile(join(backup, "package.json"), "utf8"),
      /my:script/u,
    );
    assert.ok(
      JSON.parse(await readFile(join(root, ".axmorf/managed.json"), "utf8"))
        .files[craftGuide],
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
    assert.deepEqual(plan.removed, []);
    assert.equal(
      await readFile(join(root, "AGENTS.md"), "utf8"),
      "edited by me\n",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("managed files a release dropped are removed when the manifest recorded them", async () => {
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
    // 0.2.x shipped this facade as a managed file; 0.3.0 no longer does.
    const facade = "src/runtime/capabilities.ts";
    const bytes = 'export * from "@axmorf/studio/remotion";\n';
    await mkdir(join(root, "src/runtime"), { recursive: true });
    await writeFile(join(root, facade), bytes);
    const manifestPath = join(root, ".axmorf/managed.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files[facade] =
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await upgradeWorkspace(
      {
        cwd: root,
        install: false,
        runtimePackage: "9.9.9",
        creatorVersion: "9.9.9",
      },
      { progress: () => {} },
    );
    assert.deepEqual(result.removed, [facade]);
    assert.deepEqual(result.localChanges, []);
    await assert.rejects(stat(join(root, facade)));
    await assert.rejects(stat(join(root, "src/runtime")));
    await stat(join(root, "src"));
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

test("an active Workspace operation blocks the upgrade", async () => {
  const { parent, root } = await legacyWorkspace();
  try {
    await writeFile(join(root, ".project-operation.lock"), "{}\n");
    await assert.rejects(
      upgradeWorkspace(
        { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
        { runCommand: async () => {}, progress: () => {} },
      ),
      /Workspace operation is active/u,
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
      await readFile(join(root, retiredReference), "utf8"),
      "retired\n",
    );
    await assert.rejects(stat(join(root, craftGuide)));
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

const sharedResourcePath = "src/remotion/catalog/assets.manifest.json";
const sharedManifestPath = ".axmorf/shared-resources.json";
const installedSeedPath =
  "node_modules/@axmorf/studio/dist/assets/workspace-seed";
const resourceHash = (bytes: string | Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const writeResource = async (
  root: string,
  path: string,
  bytes: string | Buffer,
) => {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), bytes);
};

/** Simulate npm replacing the runtime seed, then run the real bootstrap against it. */
const resourceUpgradeRunner = (
  root: string,
  nextBytes: string | Buffer,
  failAt?: string,
) => {
  const calls: string[] = [];
  const runCommand = async (command: string, args: string[]) => {
    const stage = command === "install" ? "install" : args.at(-1)!;
    calls.push(stage);
    if (stage === "install") {
      await writeResource(
        root,
        `${installedSeedPath}/${sharedResourcePath}`,
        nextBytes,
      );
      await writeResource(
        root,
        `${installedSeedPath}/public/assets/axmorf-shared/added.txt`,
        "added\n",
      );
    } else if (stage === "bootstrap") {
      await bootstrapWorkspace({
        rootDir: root,
        workspaceSeedRoot: join(root, installedSeedPath),
      });
    }
    if (stage === failAt) throw new Error(`forced ${stage} failure`);
  };
  return { calls, runCommand };
};

test("upgrade from the rc.5 asset manifest to the current package preserves config and backs up old bytes", async () => {
  const { parent, root } = await legacyWorkspace();
  try {
    // Exact fixture from v0.3.0-rc.5 (9529685), the production upgrade regression.
    const previous = await readFile(
      new URL("./fixtures/rc5-assets.manifest.json", import.meta.url),
    );
    assert.match(resourceHash(previous), /^sha256:c878e16b/u);
    const next = await readFile(
      "packages/studio/src/remotion/catalog/assets.manifest.json",
    );
    assert.notDeepEqual(previous, next);
    await writeResource(root, sharedResourcePath, previous);
    await writeResource(
      root,
      `${installedSeedPath}/${sharedResourcePath}`,
      previous,
    );
    // A stale history entry must not override the installed package's actual old hash.
    await writeResource(
      root,
      sharedManifestPath,
      JSON.stringify({
        schemaVersion: 1,
        files: { [sharedResourcePath]: resourceHash("stale") },
      }),
    );
    const beforeConfig = await readFile(
      join(root, "private/producer.config.json"),
    );
    const { calls, runCommand } = resourceUpgradeRunner(root, next);
    const result = await upgradeWorkspace(
      { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
      { runCommand, progress: () => {} },
    );
    assert.equal(result.status, "workspace-upgraded");
    assert.deepEqual(calls, ["install", "bootstrap", "doctor"]);
    assert.deepEqual(await readFile(join(root, sharedResourcePath)), next);
    assert.deepEqual(
      await readFile(join(root, result.backup!, sharedResourcePath)),
      previous,
    );
    assert.deepEqual(
      await readFile(join(root, "private/producer.config.json")),
      beforeConfig,
    );
    const manifest = JSON.parse(
      await readFile(join(root, sharedManifestPath), "utf8"),
    );
    assert.equal(manifest.files[sharedResourcePath], resourceHash(next));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("upgrade can use recorded hashes when the old installed runtime is unavailable", async () => {
  const { parent, root } = await legacyWorkspace();
  try {
    await writeResource(root, sharedResourcePath, "old package\n");
    await writeResource(
      root,
      sharedManifestPath,
      JSON.stringify({
        schemaVersion: 1,
        files: { [sharedResourcePath]: resourceHash("old package\n") },
      }),
    );
    const { runCommand } = resourceUpgradeRunner(root, "new package\n");
    const result = await upgradeWorkspace(
      { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
      { runCommand, progress: () => {} },
    );
    assert.equal(result.status, "workspace-upgraded");
    assert.equal(
      await readFile(join(root, sharedResourcePath), "utf8"),
      "new package\n",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

for (const scenario of ["local edit", "no old hash"]) {
  test(`upgrade preserves conflicting shared resources with ${scenario}`, async () => {
    const { parent, root } = await legacyWorkspace();
    try {
      await writeResource(root, sharedResourcePath, "local bytes\n");
      if (scenario === "local edit") {
        await writeResource(
          root,
          `${installedSeedPath}/${sharedResourcePath}`,
          "old package\n",
        );
      }
      const { calls, runCommand } = resourceUpgradeRunner(
        root,
        "new package\n",
      );
      const packageBefore = await readFile(join(root, "package.json"));
      await assert.rejects(
        upgradeWorkspace(
          { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
          { runCommand, progress: () => {} },
        ),
        /conflicts with package bytes/u,
      );
      assert.equal(
        await readFile(join(root, sharedResourcePath), "utf8"),
        "local bytes\n",
      );
      assert.deepEqual(
        await readFile(join(root, "package.json")),
        packageBefore,
      );
      assert.deepEqual(calls, ["install", "bootstrap", "install"]);
      await assert.rejects(stat(join(root, sharedManifestPath)), {
        code: "ENOENT",
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
}

for (const failAt of ["bootstrap", "doctor"]) {
  for (const recorded of [false, true]) {
    test(`a failed ${failAt} rolls shared resources and ${recorded ? "existing" : "new"} manifest back`, async () => {
      const { parent, root } = await legacyWorkspace();
      try {
        await writeResource(root, sharedResourcePath, "old package\n");
        await writeResource(
          root,
          `${installedSeedPath}/${sharedResourcePath}`,
          "old package\n",
        );
        const beforeManifest = JSON.stringify({
          schemaVersion: 1,
          files: { [sharedResourcePath]: resourceHash("old package\n") },
        });
        if (recorded)
          await writeResource(root, sharedManifestPath, beforeManifest);
        const beforePackage = await readFile(join(root, "package.json"));
        const beforeLock = await readFile(join(root, "package-lock.json"));
        const { runCommand } = resourceUpgradeRunner(
          root,
          "new package\n",
          failAt,
        );
        await assert.rejects(
          upgradeWorkspace(
            { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
            { runCommand, progress: () => {} },
          ),
          new RegExp(`forced ${failAt} failure`, "u"),
        );
        assert.equal(
          await readFile(join(root, sharedResourcePath), "utf8"),
          "old package\n",
        );
        assert.deepEqual(
          await readFile(join(root, "package.json")),
          beforePackage,
        );
        assert.deepEqual(
          await readFile(join(root, "package-lock.json")),
          beforeLock,
        );
        if (recorded) {
          assert.equal(
            await readFile(join(root, sharedManifestPath), "utf8"),
            beforeManifest,
          );
        } else {
          await assert.rejects(stat(join(root, sharedManifestPath)), {
            code: "ENOENT",
          });
        }
        await assert.rejects(
          stat(join(root, "public/assets/axmorf-shared/added.txt")),
          { code: "ENOENT" },
        );
        await assert.rejects(stat(join(root, ".project-operation.lock")), {
          code: "ENOENT",
        });
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  }
}

test("upgrade refuses shared-resource symlink parents without touching the external bytes", async () => {
  const { parent, root } = await legacyWorkspace();
  try {
    await writeResource(
      root,
      `${installedSeedPath}/${sharedResourcePath}`,
      "old package\n",
    );
    await mkdir(join(parent, "outside"));
    await writeFile(
      join(parent, "outside/assets.manifest.json"),
      "old package\n",
    );
    await mkdir(join(root, "src/remotion"), { recursive: true });
    await symlink(
      join(parent, "outside"),
      join(root, "src/remotion/catalog"),
      "dir",
    );
    const packageBefore = await readFile(join(root, "package.json"));
    const { runCommand } = resourceUpgradeRunner(root, "new package\n");
    await assert.rejects(
      upgradeWorkspace(
        { cwd: root, runtimePackage: "9.9.9", creatorVersion: "9.9.9" },
        { runCommand, progress: () => {} },
      ),
      /parent is unsafe/u,
    );
    assert.equal(
      await readFile(join(parent, "outside/assets.manifest.json"), "utf8"),
      "old package\n",
    );
    assert.deepEqual(await readFile(join(root, "package.json")), packageBefore);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
