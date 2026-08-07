import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  NarrativeAutoCheckReportSchema,
} from "../../../contracts";
import { runNarrativeAutoCheck } from "../../../../scripts/project-check/run";

test("missing project returns a strict fail report with redacted fixed failures", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-check-missing-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const report = await runNarrativeAutoCheck({
    rootDir,
    projectId: "missing-project",
    runM3EvidenceProcess: async () => {
      throw new Error(
        `Bearer secret-token endpoint at ${rootDir}; stack: private trace`,
      );
    },
  });
  assert.equal(report.aggregateStatus, "fail");
  assert.doesNotThrow(() => NarrativeAutoCheckReportSchema.parse(report));
  assert.doesNotMatch(
    JSON.stringify(report),
    new RegExp(
      `${rootDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|Bearer|secret-token|endpoint|stack|cause`,
      "i",
    ),
  );
});

test("project aggregation production source has no writer provider or network dependency", async () => {
  const source = await readFile(
    join(process.cwd(), "scripts/project-check/run.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /RSP_VOXCPM|voxcpm|generate-runner|seal-runner|narration:seal|registry:generate|writeM3Narrative|fetch\(|https?:\/\/|\.narration-work/,
  );
});
