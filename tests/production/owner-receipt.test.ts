import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ProductionOwnerReceiptSchema,
  buildProductionOwnerReceipt,
  serializeCanonicalJson,
} from "../../src/contracts";
import {
  assertOwnerOutputManifestCurrent,
  collectOwnerOutputManifest,
  readOwnerReceipt,
  writeOwnerReceiptAtomic,
} from "../../scripts/production/adapters/owner-inbox";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const receipt = (overrides: Record<string, unknown> = {}) =>
  buildProductionOwnerReceipt({
    runId: "story-example-run-001",
    storyId: "story-example",
    ownerKind: "scene",
    meaningId: "opening",
    assignmentFingerprint: sha("1"),
    taskInputFingerprint: sha("2"),
    requirementsFingerprint: sha("3"),
    inputFingerprints: [
      { artifactId: "assignment", fingerprint: sha("1") },
    ],
    outputManifest: [],
    occurredAt: "2026-08-10T00:00:00.000Z",
    status: "owner-ready",
    ...overrides,
  });

test("owner receipt is strict, fingerprinted, and contains no lifecycle fields", () => {
  const ready = receipt();
  assert.equal(ready.status, "owner-ready");
  assert.doesNotMatch(JSON.stringify(ready), /threadId|taskId|heartbeat|progress/iu);
  assert.throws(() =>
    ProductionOwnerReceiptSchema.parse({ ...ready, threadId: "forbidden" }),
  );
  assert.throws(() =>
    ProductionOwnerReceiptSchema.parse({
      ...ready,
      assignmentFingerprint: sha("9"),
    }),
  );
});

test("receipt publication is atomic, idempotent, and conflicting content fails closed", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-owner-inbox-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const first = await writeOwnerReceiptAtomic({ rootDir, receipt: receipt() });
  assert.equal(first.written, true);
  const second = await writeOwnerReceiptAtomic({ rootDir, receipt: receipt() });
  assert.equal(second.written, false);
  await assert.rejects(
    writeOwnerReceiptAtomic({
      rootDir,
      receipt: receipt({
        outputManifest: [
          {
            repositoryPath: "src/projects/story-example/scenes/opening/extra.ts",
            checksum: sha("8"),
            sizeBytes: 1,
          },
        ],
      }),
    }),
    /conflicting content/iu,
  );
  const stored = await readOwnerReceipt({
    rootDir,
    runId: "story-example-run-001",
    ownerKind: "scene",
    meaningId: "opening",
  });
  assert.equal(stored?.receiptFingerprint, receipt().receiptFingerprint);
  assert.doesNotMatch(
    await readFile(first.path, "utf8"),
    /threadId|heartbeat|progress/iu,
  );
});

test("an orphan same-directory pending receipt is recoverable by a replacement owner", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-owner-pending-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const ready = receipt();
  const directory = join(
    rootDir,
    ".producer-runs/story-example-run-001/owner-receipts/scene",
  );
  const pending = join(directory, ".opening.json.pending");
  await mkdir(directory, { recursive: true });
  await writeFile(pending, `${serializeCanonicalJson(ready)}\n`);
  const recovered = await writeOwnerReceiptAtomic({
    rootDir,
    receipt: receipt({ occurredAt: "2026-08-10T00:00:05.000Z" }),
  });
  assert.equal(recovered.written, true);
  assert.equal(
    (await readOwnerReceipt({
      rootDir,
      runId: ready.runId,
      ownerKind: "scene",
      meaningId: "opening",
    }))?.receiptFingerprint,
    ready.receiptFingerprint,
  );
  await assert.rejects(access(pending));
});

test("concurrent semantic replay with different clocks installs one immutable receipt", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "rsp-owner-concurrent-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  for (let round = 0; round < 20; round += 1) {
    const rootDir = join(parent, String(round));
    await mkdir(rootDir);
    const runId = `story-example-run-${String(round).padStart(3, "0")}`;
    const writes = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        writeOwnerReceiptAtomic({
          rootDir,
          receipt: receipt({
            runId,
            occurredAt: `2026-08-10T00:00:00.${String(index).padStart(3, "0")}Z`,
          }),
        }),
      ),
    );
    assert.equal(writes.filter(({ written }) => written).length, 1);
    assert.equal(
      new Set(writes.map(({ receipt: stored }) => stored.receiptFingerprint)).size,
      1,
    );
  }
});

test("malformed receipt, output drift, unknown files, symlinks, and escapes are rejected", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-owner-files-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sceneRoot = "src/projects/story-example/scenes/opening";
  await mkdir(join(rootDir, sceneRoot), { recursive: true });
  await writeFile(join(rootDir, sceneRoot, "Renderer.tsx"), "export const Renderer = () => null;\n");
  const scope = {
    directories: [sceneRoot],
    requiredFiles: [`${sceneRoot}/Renderer.tsx`],
  } as const;
  const manifest = await collectOwnerOutputManifest({
    rootDir,
    scope,
    allowMissing: false,
  });
  await assertOwnerOutputManifestCurrent({ rootDir, scope, expected: manifest });
  await writeFile(join(rootDir, sceneRoot, "unknown.ts"), "export {};\n");
  await assert.rejects(
    assertOwnerOutputManifestCurrent({ rootDir, scope, expected: manifest }),
    /unknown files|checksum drift/iu,
  );
  await rm(join(rootDir, sceneRoot, "unknown.ts"));
  await symlink("Renderer.tsx", join(rootDir, sceneRoot, "Alias.tsx"));
  await assert.rejects(
    collectOwnerOutputManifest({ rootDir, scope, allowMissing: false }),
    /symbolic links/iu,
  );
  assert.throws(() =>
    receipt({
      outputManifest: [
        { repositoryPath: "../escape", checksum: sha("1"), sizeBytes: 1 },
      ],
    }),
  );

  const malformedRoot = await mkdtemp(join(tmpdir(), "rsp-owner-malformed-"));
  context.after(() => rm(malformedRoot, { recursive: true, force: true }));
  const malformedPath = join(
    malformedRoot,
    ".producer-runs/story-example-run-001/owner-receipts/scene/opening.json",
  );
  await mkdir(join(malformedPath, ".."), { recursive: true });
  await writeFile(malformedPath, "{malformed\n");
  await assert.rejects(
    readOwnerReceipt({
      rootDir: malformedRoot,
      runId: "story-example-run-001",
      ownerKind: "scene",
      meaningId: "opening",
    }),
  );
});

test("failed receipt manifests may bind an owner scope that has no authored output", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-owner-failed-output-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const scope = {
    directories: ["src/projects/story-example/scenes/opening"],
  } as const;
  await assert.rejects(
    assertOwnerOutputManifestCurrent({ rootDir, scope, expected: [] }),
    /missing/iu,
  );
  await assertOwnerOutputManifestCurrent({
    rootDir,
    scope,
    expected: [],
    allowMissing: true,
  });
});
