import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
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
  M8ApprovalError,
  checkM8FinalPreviewApproval,
  persistM8FinalPreviewApprovalArtifact,
  validateM8ApprovalAuthoringRecord,
  writeM8FinalPreviewApproval,
} from "../../scripts/m8-gps/approval";
import {runFinalMechanicalCheck} from "../../scripts/project-check/final-run";
import {checkPersistedFinalMechanicalCheck} from "../../scripts/project-check/final-report-files";

const rootDir = join(import.meta.dirname, "../..");
const projectRoot = join(rootDir, "src/projects/gps-relativity");
const approvalPath = join(
  projectRoot,
  "generated/final-preview-approval.generated.json",
);
const authoringPath = join(projectRoot, "reviews/final-preview-approval.json");
const evidencePath = join(
  projectRoot,
  "generated/m8-final-preview-evidence.generated.json",
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

const readApprovalInputs = async () => {
  const [rawAuthoring, rawEvidence, rawAssembly] = await Promise.all([
    readFile(authoringPath, "utf8").then(JSON.parse),
    readFile(evidencePath, "utf8").then(JSON.parse),
    readFile(assemblyPath, "utf8").then(JSON.parse),
  ]);
  return {
    authoring: FinalPreviewApprovalInputSchema.parse(rawAuthoring),
    evidence: FinalPreviewEvidenceSchema.parse(rawEvidence),
    assembly: FinalAssemblyPlanSchema.parse(rawAssembly),
  };
};

test("approval writer fails closed when the explicit user authoring record is missing", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "gps-m8-approval-missing-"));
  context.after(() => rm(fixtureRoot, {recursive: true}));
  await assert.rejects(
    () =>
      writeM8FinalPreviewApproval({
        rootDir: fixtureRoot,
        authorization: {
          source: "explicit-user-current-preview",
          decision: "approved",
        },
      }),
    (error: unknown) =>
      error instanceof M8ApprovalError &&
      error.code === "approval-write-not-authorized",
  );
});

test("current user authoring record and generated approval bind the exact preview", async () => {
  const {authoring} = await readApprovalInputs();
  const approval = await checkM8FinalPreviewApproval({rootDir});
  assert.deepEqual(
    FinalPreviewApprovalSchema.parse(approval),
    createFinalPreviewApproval(authoring),
  );
});

test("Agent review evidence and free-form authorization cannot write approval", async () => {
  const before = await readFile(approvalPath);
  const beforeMtime = (await stat(approvalPath)).mtimeMs;
  for (const authorization of [
    undefined,
    {source: "agent-review", decision: "approved"},
    {source: "evidence", decision: "ready-for-user-approval"},
    {
      source: "explicit-user-current-preview",
      decision: "approved",
      note: "Agent says this is fine.",
    },
  ]) {
    await assert.rejects(
      () => writeM8FinalPreviewApproval({rootDir, authorization}),
      (error: unknown) =>
        error instanceof M8ApprovalError &&
        error.code === "approval-write-not-authorized",
    );
  }
  assert.deepEqual(await readFile(approvalPath), before);
  assert.equal((await stat(approvalPath)).mtimeMs, beforeMtime);
});

test("authoring validation rejects old media evidence assembly revise and free text", async () => {
  const {authoring, evidence, assembly} = await readApprovalInputs();
  assert.doesNotThrow(() =>
    validateM8ApprovalAuthoringRecord({rawAuthoring: authoring, evidence, assembly}),
  );
  for (const rawAuthoring of [
    {...authoring, previewChecksum: sha("a")},
    {...authoring, evidenceFingerprint: sha("b")},
    {...authoring, finalAssemblyFingerprint: sha("c")},
  ]) {
    assert.throws(
      () =>
        validateM8ApprovalAuthoringRecord({
          rawAuthoring,
          evidence,
          assembly,
        }),
      (error: unknown) =>
        error instanceof M8ApprovalError && error.code === "stale-approval",
    );
  }
  for (const rawAuthoring of [
    {...authoring, decision: "revise"},
    {...authoring, approvalReference: "looks-good"},
    {...authoring, note: "free-form approval"},
    {},
  ]) {
    assert.throws(
      () =>
        validateM8ApprovalAuthoringRecord({
          rawAuthoring,
          evidence,
          assembly,
        }),
      (error: unknown) =>
        error instanceof M8ApprovalError &&
        error.code === "approval-write-not-authorized",
    );
  }
});

test("approval artifact writer is pass-only atomic idempotent and checker is byte-exact", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gps-m8-approval-artifact-"));
  context.after(() => rm(temporaryRoot, {recursive: true}));
  const destination = join(temporaryRoot, "approval.json");
  const {authoring} = await readApprovalInputs();
  const approval = createFinalPreviewApproval(authoring);
  await persistM8FinalPreviewApprovalArtifact({
    destination,
    approval,
    mode: "write",
  });
  const before = await readFile(destination);
  const beforeMtime = (await stat(destination)).mtimeMs;
  await persistM8FinalPreviewApprovalArtifact({
    destination,
    approval,
    mode: "write",
  });
  assert.deepEqual(await readFile(destination), before);
  assert.equal((await stat(destination)).mtimeMs, beforeMtime);
  await persistM8FinalPreviewApprovalArtifact({
    destination,
    approval,
    mode: "check",
  });
  await assert.rejects(() =>
    persistM8FinalPreviewApprovalArtifact({
      destination,
      approval: {...approval, previewChecksum: sha("d")},
      mode: "write",
    }),
  );
  assert.deepEqual(await readFile(destination), before);
  await writeFile(destination, Uint8Array.from([...before, 0x20]));
  await assert.rejects(() =>
    persistM8FinalPreviewApprovalArtifact({
      destination,
      approval,
      mode: "check",
    }),
  );
});

test("current final v2 contains the fixed 15 checks and current approval identity", async () => {
  const approval = FinalPreviewApprovalSchema.parse(
    JSON.parse(await readFile(approvalPath, "utf8")),
  );
  const report = await runFinalMechanicalCheck({
    rootDir,
    projectId: "gps-relativity",
  });
  assert.equal(report.reportVersion, "final-mechanical-check-v2");
  assert.equal(report.aggregateStatus, "pass");
  assert.deepEqual(
    report.checks.map(({checkId}) => checkId),
    FINAL_MECHANICAL_CHECK_V2_IDS,
  );
  assert.equal(report.checks.length, 15);
  assert.ok(report.checks.every(({status}) => status !== "fail"));
  assert.ok(report.checks.slice(-5).every(({status}) => status === "pass"));
  assert.equal(
    report.inputIdentity.finalPreviewApprovalFingerprint,
    approval.approvalFingerprint,
  );
  assert.equal(
    JSON.parse(await readFile(finalReportPath, "utf8")).reportFingerprint,
    report.reportFingerprint,
  );
});

test("single-byte persisted v2 drift fails read-only without repair", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gps-m8-final-v2-drift-"));
  context.after(() => rm(temporaryRoot, {recursive: true}));
  const destination = join(
    temporaryRoot,
    "src/projects/gps-relativity/generated/final-mechanical-check.generated.json",
  );
  await mkdir(join(destination, ".."), {recursive: true});
  const report = await runFinalMechanicalCheck({
    rootDir,
    projectId: "gps-relativity",
  });
  const current = await readFile(finalReportPath);
  await writeFile(destination, Uint8Array.from(Array.from(current)));
  await checkPersistedFinalMechanicalCheck({
    rootDir: temporaryRoot,
    expectedReport: report,
  });
  await writeFile(destination, Uint8Array.from([...current, 0x20]));
  const drifted = await readFile(destination);
  await assert.rejects(() =>
    checkPersistedFinalMechanicalCheck({
      rootDir: temporaryRoot,
      expectedReport: report,
    }),
  );
  assert.deepEqual(await readFile(destination), drifted);
});

test("top-level check includes every current M7 and M8 read-only gate", async () => {
  const packageJson = JSON.parse(
    await readFile(join(rootDir, "package.json"), "utf8"),
  );
  const check = String(packageJson.scripts.check);
  for (const gate of [
    "m7:gps:freeze -- check",
    "m7:gps:evidence",
    "m8:gps:audio -- check",
    "m8:gps:freeze -- check",
    "final:assembly -- --project gps-relativity --check",
    "m8:gps:evidence",
    "m8:gps:approval",
    "project:check -- --project gps-relativity --level final",
  ]) {
    assert.match(check, new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});
