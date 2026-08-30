import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  FINAL_MECHANICAL_CHECK_IDS,
  FINAL_MECHANICAL_CHECK_V2_IDS,
  createFinalMechanicalCheckReport,
  createFinalMechanicalCheckV2Report,
} from "@axmorf/studio/contracts";
import {
  checkPersistedFinalMechanicalCheck,
  serializeFinalMechanicalCheckReport,
  writeFinalMechanicalCheckIfPassed,
} from "../../scripts/project-check/final-report-files";

const sha = (value: string) => `sha256:${value.repeat(64)}`;
const passReport = () =>
  createFinalMechanicalCheckReport({
    schemaVersion: 1,
    reportVersion: "final-mechanical-check-v1",
    storyId: "synthetic-proof",
    level: "final",
    aggregateStatus: "pass",
    inputIdentity: {
      narrativeReportFingerprint: sha("1"),
      visualStyleFingerprint: sha("2"),
      resourceCatalogFingerprint: sha("3"),
      referenceModes: ["empty"],
      externalSnapshotFingerprints: [],
      fidelityReceiptFingerprints: [],
      sceneCoverageFingerprint: sha("6"),
      scenePackageFingerprints: [sha("7")],
      rendererRegistryFingerprint: sha("8"),
      storyVisualProjectionFingerprint: sha("9"),
      soundDesignProjectionFingerprint: sha("a"),
      compositionAssemblyChecksum: sha("b"),
    },
    checks: FINAL_MECHANICAL_CHECK_IDS.map((checkId) => ({
      checkId,
      status: ["external-references", "reference-fidelity"].includes(checkId)
        ? "not-applicable"
        : "pass",
      failureReasons: [],
    })),
  });

test("final writer is pass-only atomic canonical and mtime stable", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-final-report-"));
  const report = passReport();
  const first = await writeFinalMechanicalCheckIfPassed({ rootDir, report });
  const bytes = await readFile(first.destination, "utf8");
  const mtime = (await stat(first.destination)).mtimeMs;
  assert.equal(bytes, serializeFinalMechanicalCheckReport(report));
  const second = await writeFinalMechanicalCheckIfPassed({ rootDir, report });
  assert.equal(second.written, false);
  assert.equal((await stat(first.destination)).mtimeMs, mtime);
  await checkPersistedFinalMechanicalCheck({ rootDir, expectedReport: report });
});

test("final read-only check rejects malformed and byte drift without repair", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-final-read-"));
  const report = passReport();
  await assert.rejects(() =>
    checkPersistedFinalMechanicalCheck({ rootDir, expectedReport: report }),
  );
  const written = await writeFinalMechanicalCheckIfPassed({ rootDir, report });
  await writeFile(written.destination, "{malformed");
  await assert.rejects(() =>
    checkPersistedFinalMechanicalCheck({ rootDir, expectedReport: report }),
  );
  assert.equal(await readFile(written.destination, "utf8"), "{malformed");
});

test("v2 final writer preserves the same pass-only canonical byte boundary", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-final-v2-report-"));
  const v1 = passReport();
  const report = createFinalMechanicalCheckV2Report({
    schemaVersion: 2,
    reportVersion: "final-mechanical-check-v2",
    storyId: v1.storyId,
    level: "final",
    aggregateStatus: "pass",
    inputIdentity: {
      ...v1.inputIdentity,
      globalVisualPlanFingerprint: sha("e"),
      globalVisualProjectionFingerprint: sha("f"),
      finalAssemblyFingerprint: sha("0"),
    },
    checks: FINAL_MECHANICAL_CHECK_V2_IDS.map((checkId) => ({
      checkId,
      status: ["external-references", "reference-fidelity"].includes(checkId)
        ? "not-applicable"
        : "pass",
      failureReasons: [],
    })),
  });
  const written = await writeFinalMechanicalCheckIfPassed({ rootDir, report });
  await checkPersistedFinalMechanicalCheck({ rootDir, expectedReport: report });
  const before = await readFile(written.destination, "utf8");
  await assert.rejects(() =>
    writeFinalMechanicalCheckIfPassed({
      rootDir,
      report: { ...report, aggregateStatus: "fail" },
    }),
  );
  assert.equal(await readFile(written.destination, "utf8"), before);
});
