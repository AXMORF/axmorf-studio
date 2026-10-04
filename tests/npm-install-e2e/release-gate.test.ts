import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyRelease,
  ReleasePlanSchema,
  verifyReleaseArtifacts,
  type ReleasePlan,
} from "../../scripts/release/release-gate";
import { packageContent, sha256 } from "../../scripts/release/package-content";

const plan = (): ReleasePlan => ({
  schemaVersion: 1,
  version: "0.1.17",
  baseTag: "v0.1.16",
  primaryHost: "codex",
  fullAcceptance: false,
  compatibilityChanges: [],
  regressionTests: ["tests/runtime/scene-sound.test.tsx"],
  packages: {
    runtimeFingerprint: sha256("runtime"),
    creatorFingerprint: sha256("creator"),
  },
});

test("ordinary releases do not require a native host run at any version", () => {
  for (const version of ["0.1.15", "0.1.17", "1.0.0"]) {
    const scope = classifyRelease({ ...plan(), version }, [
      "settings/client/features/config/GeneralSettings.tsx",
      "docs/guides/PRODUCER_CONFIG.md",
    ]);
    assert.equal(scope.tier, "ordinary");
    assert.equal(scope.nativeFirstUse, false);
    assert.deepEqual(scope.requiredHosts, []);
  }
});

test("production contracts, execution and scaffold require primary native acceptance", () => {
  for (const path of [
    "packages/studio/src/contracts/project-create.ts",
    "packages/studio/src/contracts.ts",
    "scripts/project-production/cli.ts",
    "scripts/projects/application/create-project.ts",
    "packages/create-axmorf-studio/template/AGENTS.md",
    "packages/create-axmorf-studio/src/template-values.js",
    ".agents/skills/axmorf-video/SKILL.md",
    "AGENTS.md",
  ]) {
    const scope = classifyRelease(plan(), [path]);
    assert.equal(scope.nativeFirstUse, true);
    assert.deepEqual(scope.majorChanges, [path]);
    assert.deepEqual(scope.requiredHosts, ["codex"]);
  }
  assert.deepEqual(
    classifyRelease({ ...plan(), primaryHost: "hermes" }, [
      "scripts/projects/create.ts",
    ]).requiredHosts,
    ["hermes"],
  );
  assert.equal(
    classifyRelease(plan(), ["packages/create-axmorf-studio/README.md"])
      .nativeFirstUse,
    false,
  );
});

test("second host is required only for declared actual compatibility changes or full acceptance", () => {
  const value = {
    ...plan(),
    compatibilityChanges: [
      {
        host: "hermes" as const,
        paths: ["scripts/release/supervision.ts"],
        reason: "Hermes TUI notification compatibility",
      },
    ],
  };
  assert.deepEqual(
    classifyRelease(value, ["scripts/release/supervision.ts"]).requiredHosts,
    ["codex", "hermes"],
  );
  assert.throws(
    () => classifyRelease(value, ["README.md"]),
    /actual changed files/u,
  );
  assert.deepEqual(
    classifyRelease({ ...plan(), fullAcceptance: true }, ["README.md"])
      .requiredHosts,
    ["codex", "hermes"],
  );
  assert.equal(
    classifyRelease({ ...plan(), fullAcceptance: true }, ["README.md"])
      .nativeFirstUse,
    true,
  );
});

test("reviewed release plan rejects opaque paths, unbounded or duplicate test/host scopes", () => {
  assert.throws(() => classifyRelease(plan(), []), /source change set/u);
  for (const path of [
    "/etc/passwd",
    "../outside",
    "docs/../outside",
    "./README.md",
    "README.md;touch",
    "tests/runtime/test.ts",
  ])
    assert.throws(() =>
      ReleasePlanSchema.parse({ ...plan(), regressionTests: [path] }),
    );
  assert.throws(() =>
    ReleasePlanSchema.parse({
      ...plan(),
      regressionTests: [plan().regressionTests[0], plan().regressionTests[0]],
    }),
  );
  const change = {
    host: "hermes",
    paths: ["scripts/release/supervision.ts"],
    reason: "compatibility",
  };
  assert.throws(() =>
    ReleasePlanSchema.parse({
      ...plan(),
      compatibilityChanges: [change, change],
    }),
  );
  assert.throws(() =>
    ReleasePlanSchema.parse({ ...plan(), skipIntegrity: true }),
  );
});

test("ordinary scope still requires exact reviewed package content; major scope requires native evidence", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-release-scope-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const tarballs: string[] = [];
  for (const [role, name] of [
    ["runtime", "@axmorf/studio"],
    ["creator", "create-axmorf-studio"],
  ]) {
    const directory = join(root, role!);
    await mkdir(join(directory, "package"), { recursive: true });
    await writeFile(
      join(directory, "package/package.json"),
      JSON.stringify({ name, version: "0.1.17" }),
    );
    await writeFile(
      join(directory, "package/index.js"),
      "export const value=1;\n",
    );
    const tarball = join(root, `${role}.tgz`);
    execFileSync("tar", ["-czf", tarball, "-C", directory, "package"]);
    tarballs.push(tarball);
  }
  const [runtime, creator] = await Promise.all(tarballs.map(packageContent));
  const reviewed = {
    ...plan(),
    packages: {
      runtimeFingerprint: runtime!.fingerprint,
      creatorFingerprint: creator!.fingerprint,
    },
  };
  assert.equal(
    (
      await verifyReleaseArtifacts(
        reviewed,
        ["README.md"],
        tarballs[0]!,
        tarballs[1]!,
      )
    ).status,
    "release-gate-passed",
  );
  await assert.rejects(
    () =>
      verifyReleaseArtifacts(
        { ...reviewed, packages: plan().packages },
        ["README.md"],
        tarballs[0]!,
        tarballs[1]!,
      ),
    /differ from reviewed/u,
  );
  await assert.rejects(
    () =>
      verifyReleaseArtifacts(
        reviewed,
        ["scripts/projects/create.ts"],
        tarballs[0]!,
        tarballs[1]!,
      ),
    /complete native first-use/u,
  );
  await assert.rejects(() =>
    verifyReleaseArtifacts(
      reviewed,
      ["scripts/projects/create.ts"],
      tarballs[0]!,
      tarballs[1]!,
      { schemaVersion: 1, hosts: [] },
    ),
  );
});
