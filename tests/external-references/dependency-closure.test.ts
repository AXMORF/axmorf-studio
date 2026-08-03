import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildDependencyClosure,
  readExactDependencyAllowlist,
} from "../../scripts/external-references/dependency-closure";
import { assertGuardedSource } from "../../scripts/external-references/source-guard";

const repositoryRoot = join(import.meta.dirname, "../..");
const fixtureRoot = join(
  repositoryRoot,
  "tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440",
);

test("exact Shotcraft closure contains only the demo and its used fixture dependency", async () => {
  const allowlist = await readExactDependencyAllowlist(repositoryRoot);
  assert.deepEqual(
    allowlist.packages.map((entry) => entry.packageName),
    [
      "@react-three/fiber",
      "@remotion/motion-blur",
      "react",
      "remotion",
      "three",
    ],
  );
  const closure = await buildDependencyClosure({
    snapshotRoot: fixtureRoot,
    entryPath: "demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
    allowlist,
  });
  assert.deepEqual(
    closure.files.map((file) => file.sourcePath),
    [
      "demos/_fixtures/Fixtures.tsx",
      "demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
    ],
  );
  assert.deepEqual(closure.bareImports, [
    { packageName: "react", exactVersion: "19.2.3" },
    { packageName: "remotion", exactVersion: "4.0.489" },
  ]);
});

test("source guard rejects dynamic remote absolute escaping skill package and unapproved imports", async () => {
  const allowed = new Map([
    ["react", "19.2.3"],
    ["remotion", "4.0.489"],
  ]);
  for (const source of [
    "const x = import('./dynamic')",
    "const x = require('./legacy')",
    "import x from 'https://example.invalid/x.js'",
    "import x from '/absolute/x'",
    "import x from '../../../../escape'",
    "import x from 'video-shotcraft'",
    "import x from '@global/skill'",
    "import x from 'lodash'",
    "const asset = 'https://example.invalid/a.png'",
  ]) {
    assert.throws(() =>
      assertGuardedSource({
        source,
        sourcePath: "demos/proof/Proof.tsx",
        allowedBarePackages: allowed,
        relativeRoot: "demos",
      }),
    );
  }
});

test("unclosed and symlinked dependency graphs fail closed", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-closure-"));
  try {
    await mkdir(join(rootDir, "demos/proof"), { recursive: true });
    await writeFile(
      join(rootDir, "demos/proof/Proof.tsx"),
      "import {missing} from './missing'; export const Proof = missing;\n",
      "utf8",
    );
    await assert.rejects(() =>
      buildDependencyClosure({
        snapshotRoot: rootDir,
        entryPath: "demos/proof/Proof.tsx",
        allowlist: {
          schemaVersion: 1,
          packageLockChecksum: `sha256:${"a".repeat(64)}`,
          packages: [],
        },
      }),
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
