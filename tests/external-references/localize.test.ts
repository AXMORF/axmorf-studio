import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildDependencyClosure,
  readExactDependencyAllowlist,
} from "../../scripts/external-references/dependency-closure";
import { localizeShotRecipeClosure } from "../../scripts/external-references/localize";
import { loadExternalReferenceSnapshot } from "../../scripts/external-references/snapshot";

const repositoryRoot = join(import.meta.dirname, "../..");
const fixtureRoot = join(
  repositoryRoot,
  "tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440",
);

test("localizer atomically copies only exact closure plus license into the fixed Scene root", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "rsp-localize-"));
  try {
    const snapshot = await loadExternalReferenceSnapshot(fixtureRoot);
    const closure = await buildDependencyClosure({
      snapshotRoot: fixtureRoot,
      entryPath: snapshot.index.cards[0].demoSourcePath,
      allowlist: await readExactDependencyAllowlist(repositoryRoot),
    });
    const first = await localizeShotRecipeClosure({
      repositoryRoot: temporaryRoot,
      snapshotRoot: fixtureRoot,
      snapshot,
      closure,
      projectId: "synthetic-proof",
      meaningId: "meaning-one",
      cardId: "draw-svg-trace",
    });
    assert.equal(
      first.files.filter((file) => file.kind === "source").length,
      2,
    );
    assert.equal(
      first.files.filter((file) => file.kind === "license").length,
      1,
    );
    const destination = join(temporaryRoot, first.targetRoot);
    await assert.doesNotReject(() => stat(join(destination, "LICENSE")));
    const second = await localizeShotRecipeClosure({
      repositoryRoot: temporaryRoot,
      snapshotRoot: fixtureRoot,
      snapshot,
      closure,
      projectId: "synthetic-proof",
      meaningId: "meaning-one",
      cardId: "draw-svg-trace",
    });
    assert.deepEqual(second, first);

    const localizedDemo = join(
      destination,
      "upstream/demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
    );
    await writeFile(localizedDemo, "agent adaptation\n", "utf8");
    await assert.rejects(() =>
      localizeShotRecipeClosure({
        repositoryRoot: temporaryRoot,
        snapshotRoot: fixtureRoot,
        snapshot,
        closure,
        projectId: "synthetic-proof",
        meaningId: "meaning-one",
        cardId: "draw-svg-trace",
      }),
    );
    assert.equal(await readFile(localizedDemo, "utf8"), "agent adaptation\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("localizer validates all input before creating a partial destination", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "rsp-localize-fail-"));
  try {
    const snapshot = await loadExternalReferenceSnapshot(fixtureRoot);
    await assert.rejects(() =>
      localizeShotRecipeClosure({
        repositoryRoot: temporaryRoot,
        snapshotRoot: fixtureRoot,
        snapshot,
        closure: {
          schemaVersion: 1,
          entryPath: snapshot.index.cards[0].demoSourcePath,
          packageLockChecksum: `sha256:${"a".repeat(64)}`,
          bareImports: [],
          files: [],
          closureFingerprint: `sha256:${"b".repeat(64)}`,
        },
        projectId: "synthetic-proof",
        meaningId: "meaning-two",
        cardId: "draw-svg-trace",
      }),
    );
    await assert.rejects(() =>
      stat(
        join(
          temporaryRoot,
          "src/projects/synthetic-proof/scenes/meaning-two/shots/video-shotcraft/draw-svg-trace",
        ),
      ),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
