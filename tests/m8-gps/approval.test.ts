import assert from "node:assert/strict";
import {readFile, stat} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";

import {FinalPreviewApprovalSchema} from "../../src/contracts";
import {
  M8ApprovalError,
  checkM8FinalPreviewApproval,
  writeM8FinalPreviewApproval,
} from "../../scripts/m8-gps/approval";
import {runFinalMechanicalCheck} from "../../scripts/project-check/final-run";

const rootDir = join(import.meta.dirname, "../..");
const approvalPath = join(
  rootDir,
  "src/projects/gps-relativity/generated/final-preview-approval.generated.json",
);
const v1ReportPath = join(
  rootDir,
  "src/projects/gps-relativity/generated/final-mechanical-check.generated.json",
);

test("missing user approval returns the fixed missing-approval code", async () => {
  await assert.rejects(
    () => checkM8FinalPreviewApproval({rootDir}),
    (error: unknown) =>
      error instanceof M8ApprovalError && error.code === "missing-approval",
  );
  await assert.rejects(() => stat(approvalPath), {code: "ENOENT"});
});

test("Agent review and evidence pass cannot authorize approval writing", async () => {
  for (const authorization of [
    undefined,
    {source: "agent-review", decision: "approved"},
    {source: "evidence", decision: "ready-for-user-approval"},
  ]) {
    await assert.rejects(
      () => writeM8FinalPreviewApproval({rootDir, authorization}),
      (error: unknown) =>
        error instanceof M8ApprovalError &&
        error.code === "approval-write-not-authorized",
    );
  }
  await assert.rejects(() => stat(approvalPath), {code: "ENOENT"});
});

test("empty files and Agent review objects cannot parse as user approval", async () => {
  const review = JSON.parse(
    await readFile(
      join(
        rootDir,
        "src/projects/gps-relativity/reviews/m8-final-assembly-review.json",
      ),
      "utf8",
    ),
  );
  assert.throws(() => FinalPreviewApprovalSchema.parse({}));
  assert.throws(() => FinalPreviewApprovalSchema.parse(review));
  await assert.rejects(() => stat(approvalPath), {code: "ENOENT"});
});

test("final v2 fails only at missing approval and preserves the v1 report", async () => {
  const before = await readFile(v1ReportPath);
  const report = await runFinalMechanicalCheck({
    rootDir,
    projectId: "gps-relativity",
  });
  assert.equal(report.reportVersion, "final-mechanical-check-v2");
  assert.equal(report.aggregateStatus, "fail");
  const m8 = report.checks.slice(-5);
  assert.deepEqual(
    m8.map(({checkId, status}) => [checkId, status]),
    [
      ["global-sound", "pass"],
      ["global-visual", "pass"],
      ["final-assembly", "pass"],
      ["final-preview-evidence", "pass"],
      ["final-preview-approval", "fail"],
    ],
  );
  assert.deepEqual(await readFile(v1ReportPath), before);
  await assert.rejects(() => stat(approvalPath), {code: "ENOENT"});
});
