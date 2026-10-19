import assert from "node:assert/strict";
import test from "node:test";

import { CliUsageError } from "../../packages/studio/src/cli/router";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";

test("unclassified failures remain operational errors", () => {
  assert.deepEqual(reportCliFailure(new Error("boom")), {
    failure: { status: "error", code: "command-failed", message: "boom" },
    serialized: '{"status":"error","code":"command-failed","message":"boom"}',
    exitCode: 1,
  });
});

test("coded failures keep their code and exit as usage errors", () => {
  const report = reportCliFailure(new CliUsageError("Expected film <command>."));
  assert.equal(report.exitCode, 2);
  assert.deepEqual(report.failure, {
    status: "error",
    code: "cli-usage-invalid",
    message: "Expected film <command>.",
  });
  assert.deepEqual(JSON.parse(report.serialized), report.failure);
});
