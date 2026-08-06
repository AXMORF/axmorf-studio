import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {
  FINAL_MECHANICAL_CHECK_V2_IDS,
  FinalAssemblyPlanSchema,
  FinalPreviewApprovalInputSchema,
  FinalPreviewApprovalSchema,
  FinalPreviewEvidenceSchema,
  createFinalPreviewApproval,
} from "../../src/contracts";
import {
  M9ApprovalError,
  checkM9FinalPreviewApproval,
  persistM9FinalPreviewApprovalArtifact,
  validateM9ApprovalAuthoringRecord,
  writeM9FinalPreviewApproval,
} from "../../scripts/m9-product/approval";
import {runFinalMechanicalCheck} from "../../scripts/project-check/final-run";

const rootDir = join(import.meta.dirname, "../..");
const projectRoot = join(rootDir, "src/projects/product-comic-vertical");
const approvalPath = join(
  projectRoot,
  "generated/final-preview-approval.generated.json",
);
const authoringPath = join(projectRoot, "reviews/final-preview-approval.json");
const evidencePath = join(
  projectRoot,
  "generated/final-preview-evidence.generated.json",
);
const assemblyPath = join(
  projectRoot,
  "generated/final-assembly.generated.json",
);
const finalReportPath = join(
  projectRoot,
  "generated/final-mechanical-check.generated.json",
);
const sha = (value: string) => `sha256:${value.repeat(64)}`;

const readCurrentInputs = async () => {
  const [rawEvidence, rawAssembly] = await Promise.all([
    readFile(evidencePath, "utf8").then(JSON.parse),
    readFile(assemblyPath, "utf8").then(JSON.parse),
  ]);
  return {
    evidence: FinalPreviewEvidenceSchema.parse(rawEvidence),
    assembly: FinalAssemblyPlanSchema.parse(rawAssembly),
  };
};

test("approval writer requires the exact explicit-user authorization token", async () => {
  for (const authorization of [
    undefined,
    {source: "agent-review", decision: "approved"},
    {source: "explicit-user-current-preview", decision: "revise"},
    {
      source: "explicit-user-current-preview",
      decision: "approved",
      note: "Agent review cannot extend the authorization shape.",
    },
  ]) {
    await assert.rejects(
      () => writeM9FinalPreviewApproval({rootDir, authorization}),
      (error: unknown) =>
        error instanceof M9ApprovalError &&
        error.code === "approval-write-not-authorized",
    );
  }
});

test("approval authoring binds only the current preview evidence and assembly", async () => {
  const {evidence, assembly} = await readCurrentInputs();
  const current = FinalPreviewApprovalInputSchema.parse({
    schemaVersion: 1,
    approvalVersion: "final-preview-approval-v1",
    storyId: "product-comic-vertical",
    compositionId: "ProductComicVertical",
    decision: "approved",
    previewChecksum: evidence.media.fullPreview.checksum,
    evidenceFingerprint: evidence.evidenceFingerprint,
    finalAssemblyFingerprint: assembly.finalAssemblyFingerprint,
    approvalReference: "user-approved-current-preview",
  });
  assert.deepEqual(
    validateM9ApprovalAuthoringRecord({rawAuthoring: current, evidence, assembly}),
    current,
  );
  for (const rawAuthoring of [
    {...current, previewChecksum: sha("a")},
    {...current, evidenceFingerprint: sha("b")},
    {...current, finalAssemblyFingerprint: sha("c")},
  ]) {
    assert.throws(
      () =>
        validateM9ApprovalAuthoringRecord({
          rawAuthoring,
          evidence,
          assembly,
        }),
      (error: unknown) =>
        error instanceof M9ApprovalError && error.code === "stale-approval",
    );
  }
  for (const rawAuthoring of [
    {...current, decision: "revise"},
    {...current, approvalReference: "looks-good"},
    {...current, note: "free-form"},
    {},
  ]) {
    assert.throws(
      () =>
        validateM9ApprovalAuthoringRecord({
          rawAuthoring,
          evidence,
          assembly,
        }),
      (error: unknown) =>
        error instanceof M9ApprovalError &&
        error.code === "approval-write-not-authorized",
    );
  }
});

test("approval artifact writer is pass-only atomic idempotent and byte-exact", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "m9-approval-artifact-"));
  context.after(() => rm(temporaryRoot, {recursive: true}));
  const destination = join(temporaryRoot, "approval.json");
  const {evidence, assembly} = await readCurrentInputs();
  const approval = createFinalPreviewApproval({
    schemaVersion: 1,
    approvalVersion: "final-preview-approval-v1",
    storyId: "product-comic-vertical",
    compositionId: "ProductComicVertical",
    decision: "approved",
    previewChecksum: evidence.media.fullPreview.checksum,
    evidenceFingerprint: evidence.evidenceFingerprint,
    finalAssemblyFingerprint: assembly.finalAssemblyFingerprint,
    approvalReference: "user-approved-current-preview",
  });
  await persistM9FinalPreviewApprovalArtifact({
    destination,
    approval,
    mode: "write",
  });
  const before = await readFile(destination);
  const beforeMtime = (await stat(destination)).mtimeMs;
  await persistM9FinalPreviewApprovalArtifact({
    destination,
    approval,
    mode: "write",
  });
  assert.deepEqual(await readFile(destination), before);
  assert.equal((await stat(destination)).mtimeMs, beforeMtime);
  await persistM9FinalPreviewApprovalArtifact({
    destination,
    approval,
    mode: "check",
  });
  await writeFile(destination, Uint8Array.from([...before, 0x20]));
  await assert.rejects(() =>
    persistM9FinalPreviewApprovalArtifact({
      destination,
      approval,
      mode: "check",
    }),
  );
});

test("current approval and final v2 bind the fixed 15 checks", async () => {
  const rawAuthoring = FinalPreviewApprovalInputSchema.parse(
    JSON.parse(await readFile(authoringPath, "utf8")),
  );
  const approval = await checkM9FinalPreviewApproval({rootDir});
  assert.deepEqual(approval, createFinalPreviewApproval(rawAuthoring));
  const report = await runFinalMechanicalCheck({
    rootDir,
    projectId: "product-comic-vertical",
  });
  assert.equal(report.reportVersion, "final-mechanical-check-v2");
  assert.equal(report.aggregateStatus, "pass");
  assert.deepEqual(
    report.checks.map(({checkId}) => checkId),
    FINAL_MECHANICAL_CHECK_V2_IDS,
  );
  assert.equal(report.checks.length, 15);
  assert.ok(report.checks.every(({status}) => status !== "fail"));
  assert.equal(
    report.inputIdentity.finalPreviewApprovalFingerprint,
    approval.approvalFingerprint,
  );
  assert.equal(
    JSON.parse(await readFile(finalReportPath, "utf8")).reportFingerprint,
    report.reportFingerprint,
  );
  assert.deepEqual(
    FinalPreviewApprovalSchema.parse(
      JSON.parse(await readFile(approvalPath, "utf8")),
    ),
    approval,
  );
});

test("top-level check includes current M9 read-only gates", async () => {
  const packageJson = JSON.parse(
    await readFile(join(rootDir, "package.json"), "utf8"),
  );
  assert.equal(
    packageJson.scripts.check,
    "npm run check:static && npm run check:host",
  );
  const check = `${String(packageJson.scripts["check:static"])} ${String(
    packageJson.scripts["check:host"],
  )}`;
  for (const gate of [
    "m9:product:audio -- check",
    "m9:product:scene-evidence",
    "final:assembly -- --project product-comic-vertical --check",
    "m9:product:evidence",
    "m9:product:approval",
    "project:check -- --project product-comic-vertical --level final",
  ]) {
    assert.match(check, new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
  assert.doesNotMatch(check, /m9:product:media/u);
  assert.doesNotMatch(check, /RSP_VOXCPM_PRIVATE_CONFIG=.*m9/u);
});
