import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { loadCurrentDeliveryInputs } from "../../scripts/delivery/application/inputs";
import { createDeliveryProjectFixture } from "../fixtures/delivery";

const createRoot = (context: TestContext) =>
  mkdtemp(join(tmpdir(), "rsp-delivery-inputs-")).then((rootDir) => {
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    return rootDir;
  });

test("loads only current checksum-bound approved exact preview and passing final-v2", async (context) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  const loaded = await loadCurrentDeliveryInputs({
    rootDir,
    projectId: fixture.storyId,
    verifyFinalProject: async () => fixture.finalReport,
  });
  assert.equal(loaded.approval.previewChecksum, fixture.previewChecksum);
  assert.equal(
    loaded.finalAssembly.finalAssemblyFingerprint,
    fixture.assembly.finalAssemblyFingerprint,
  );
  assert.equal(loaded.finalReport.reportVersion, "final-mechanical-check-v2");
});

test("rejects missing malformed stale wrong approval failed final check and path escape", async (context) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  const approvalPath = join(
    fixture.projectRoot,
    "generated/final-preview-approval.generated.json",
  );
  const original = await readFile(approvalPath, "utf8");

  await rm(approvalPath);
  await assert.rejects(() =>
    loadCurrentDeliveryInputs({
      rootDir,
      projectId: fixture.storyId,
      verifyFinalProject: async () => fixture.finalReport,
    }),
  );
  await writeFile(approvalPath, "{malformed", "utf8");
  await assert.rejects(() =>
    loadCurrentDeliveryInputs({
      rootDir,
      projectId: fixture.storyId,
      verifyFinalProject: async () => fixture.finalReport,
    }),
  );
  await writeFile(
    approvalPath,
    original.replace(fixture.previewChecksum, `sha256:${"f".repeat(64)}`),
  );
  await assert.rejects(() =>
    loadCurrentDeliveryInputs({
      rootDir,
      projectId: fixture.storyId,
      verifyFinalProject: async () => fixture.finalReport,
    }),
  );
  await writeFile(approvalPath, original);
  await assert.rejects(() =>
    loadCurrentDeliveryInputs({
      rootDir,
      projectId: fixture.storyId,
      verifyFinalProject: async () => {
        throw new Error("Final project check failed.");
      },
    }),
  );

  const evidencePath = join(
    fixture.projectRoot,
    "generated/final-preview-evidence.generated.json",
  );
  const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as {
    media: { fullPreview: { relativePath: string } };
  };
  evidence.media.fullPreview.relativePath = "out/../private/final.mp4";
  await writeFile(evidencePath, `${JSON.stringify(evidence)}\n`);
  await assert.rejects(() =>
    loadCurrentDeliveryInputs({
      rootDir,
      projectId: fixture.storyId,
      verifyFinalProject: async () => fixture.finalReport,
    }),
  );
});

test("rejects a symbolic-link approved preview", async (context) => {
  const rootDir = await createRoot(context);
  const fixture = await createDeliveryProjectFixture(rootDir);
  const previewPath = join(rootDir, fixture.previewRelativePath);
  const target = join(rootDir, "out/delivery-proof/target.mp4");
  await writeFile(target, fixture.previewBytes);
  await rm(previewPath);
  await symlink(target, previewPath);
  await assert.rejects(() =>
    loadCurrentDeliveryInputs({
      rootDir,
      projectId: fixture.storyId,
      verifyFinalProject: async () => fixture.finalReport,
    }),
  );
});
