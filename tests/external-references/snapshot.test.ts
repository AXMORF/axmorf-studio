import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  GitCommitSchema,
  computeExternalReferenceSnapshotFingerprint,
} from "../../src/contracts/external-reference";
import {
  assertCleanExactCheckout,
  runGit,
} from "../../scripts/external-references/adapters/git";
import {
  appendExternalReferenceSnapshot,
  loadExternalReferenceSnapshot,
  renderExternalReferenceSnapshot,
} from "../../scripts/external-references/snapshot";

const repositoryRoot = join(import.meta.dirname, "../..");
const fixtureRoot = join(
  repositoryRoot,
  "tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440",
);
const revision = "d4915443232e89527fdc9d7e79f132ba411fc440";

test("external reference revisions require a full lowercase immutable commit", () => {
  assert.equal(GitCommitSchema.parse(revision), revision);
  for (const invalid of [
    "main",
    "latest",
    "v1.0.0",
    revision.slice(0, 12),
    revision.toUpperCase(),
  ]) {
    assert.throws(() => GitCommitSchema.parse(invalid));
  }
});

test("git authoring adapter rejects dirty and mismatched checkouts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-external-git-"));
  try {
    await runGit(rootDir, ["init", "-q"]);
    await runGit(rootDir, ["config", "user.email", "test@example.invalid"]);
    await runGit(rootDir, ["config", "user.name", "Test"]);
    await writeFile(join(rootDir, "proof.txt"), "proof\n", "utf8");
    await runGit(rootDir, ["add", "proof.txt"]);
    await runGit(rootDir, ["commit", "-qm", "proof"]);
    const head = (await runGit(rootDir, ["rev-parse", "HEAD"])).trim();
    await assert.doesNotReject(() => assertCleanExactCheckout(rootDir, head));
    await assert.rejects(() =>
      assertCleanExactCheckout(rootDir, "0".repeat(40)),
    );
    await writeFile(join(rootDir, "proof.txt"), "dirty\n", "utf8");
    await assert.rejects(() => assertCleanExactCheckout(rootDir, head));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("snapshot binds canonical index licenses and every fixture byte", async () => {
  const snapshot = await loadExternalReferenceSnapshot(fixtureRoot);
  assert.equal(snapshot.revision, revision);
  assert.equal(snapshot.index.cards.length, 1);
  assert.equal(
    computeExternalReferenceSnapshotFingerprint(snapshot),
    snapshot.snapshotFingerprint,
  );
  assert.equal(snapshot.sourceLicense.verificationStatus, "verified");
  assert.equal(snapshot.previewMediaLicense.verificationStatus, "verified");
  assert.notDeepEqual(snapshot.sourceLicense, snapshot.previewMediaLicense);

  const temporary = await mkdtemp(join(tmpdir(), "rsp-external-snapshot-"));
  try {
    await runGit(repositoryRoot, ["status", "--porcelain"]);
    const manifest = await readFile(join(fixtureRoot, "fixture-manifest.json"));
    await writeFile(
      join(temporary, "fixture-manifest.json"),
      Uint8Array.from(manifest),
    );
    await assert.rejects(() => loadExternalReferenceSnapshot(temporary));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("snapshot records append atomically and never overwrite different bytes", async () => {
  const snapshot = await loadExternalReferenceSnapshot(fixtureRoot);
  const recordsRoot = await mkdtemp(join(tmpdir(), "rsp-snapshots-"));
  try {
    const first = await appendExternalReferenceSnapshot(recordsRoot, snapshot);
    const firstBytes = await readFile(first, "utf8");
    assert.equal(firstBytes, renderExternalReferenceSnapshot(snapshot));
    assert.equal(
      await appendExternalReferenceSnapshot(recordsRoot, snapshot),
      first,
    );
    await writeFile(first, "different\n", "utf8");
    await assert.rejects(() =>
      appendExternalReferenceSnapshot(recordsRoot, snapshot),
    );
    assert.equal(await readFile(first, "utf8"), "different\n");
  } finally {
    await rm(recordsRoot, { recursive: true, force: true });
  }
});
