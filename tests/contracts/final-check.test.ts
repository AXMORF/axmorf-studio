import assert from "node:assert/strict";
import test from "node:test";

import {
  FINAL_MECHANICAL_CHECK_IDS,
  FINAL_MECHANICAL_CHECK_V2_IDS,
  FinalMechanicalCheckReportSchema,
  FinalMechanicalCheckV2ReportSchema,
  createFinalMechanicalCheckReport,
  createFinalMechanicalCheckV2Report,
} from "../../src/contracts";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const makePassInput = (
  referenceModes: readonly string[] = ["exact-demo-localized"],
) => ({
  schemaVersion: 1 as const,
  reportVersion: "final-mechanical-check-v1" as const,
  storyId: "synthetic-proof",
  level: "final" as const,
  aggregateStatus: "pass" as const,
  inputIdentity: {
    narrativeReportFingerprint: sha("1"),
    visualStyleFingerprint: sha("2"),
    resourceCatalogFingerprint: sha("3"),
    referenceModes,
    externalSnapshotFingerprints:
      referenceModes[0] === "empty" ? [] : [sha("4")],
    fidelityReceiptFingerprints:
      referenceModes[0] === "exact-demo-localized" ? [sha("5")] : [],
    sceneCoverageFingerprint: sha("6"),
    scenePackageFingerprints: [sha("7")],
    rendererRegistryFingerprint: sha("8"),
    storyVisualProjectionFingerprint: sha("9"),
    soundDesignProjectionFingerprint: sha("a"),
    compositionAssemblyChecksum: sha("b"),
  },
  checks: FINAL_MECHANICAL_CHECK_IDS.map((checkId) => ({
    checkId,
    status:
      (checkId === "external-references" && referenceModes[0] === "empty") ||
      (checkId === "reference-fidelity" &&
        referenceModes[0] !== "exact-demo-localized")
        ? ("not-applicable" as const)
        : ("pass" as const),
    failureReasons: [],
  })),
});

test("final report fixes all ten mechanical checks and exact identities", () => {
  const report = createFinalMechanicalCheckReport(makePassInput());
  assert.deepEqual(
    report.checks.map((check) => check.checkId),
    FINAL_MECHANICAL_CHECK_IDS,
  );
  assert.equal(report.aggregateStatus, "pass");
  assert.doesNotThrow(() => FinalMechanicalCheckReportSchema.parse(report));
});

test("reference empty inspiration and exact states enforce conditional applicability", () => {
  const empty = createFinalMechanicalCheckReport(makePassInput(["empty"]));
  assert.equal(empty.checks[3].status, "not-applicable");
  assert.equal(empty.checks[4].status, "not-applicable");
  const inspiration = createFinalMechanicalCheckReport(
    makePassInput(["inspiration-only"]),
  );
  assert.equal(inspiration.checks[3].status, "pass");
  assert.equal(inspiration.checks[4].status, "not-applicable");
  assert.throws(() =>
    createFinalMechanicalCheckReport({
      ...makePassInput(),
      inputIdentity: {
        ...makePassInput().inputIdentity,
        fidelityReceiptFingerprints: [],
      },
    }),
  );
});

test("final report rejects unknown fields unsafe failures order drift and fake aggregate pass", () => {
  const pass = makePassInput();
  for (const mutation of [
    { ...pass, unknown: true },
    { ...pass, checks: [...pass.checks].reverse() },
    {
      ...pass,
      checks: pass.checks.map((check, index) =>
        index === 0
          ? {
              ...check,
              status: "fail",
              failureReasons: [
                { code: "missing", message: "/home/private token" },
              ],
            }
          : check,
      ),
    },
  ]) {
    assert.throws(() => createFinalMechanicalCheckReport(mutation));
  }
});

test("v2 adds fixed assembly checks without changing v1 parsing", () => {
  const v1 = createFinalMechanicalCheckReport(makePassInput());
  assert.doesNotThrow(() => FinalMechanicalCheckReportSchema.parse(v1));
  const v2 = createFinalMechanicalCheckV2Report({
    ...makePassInput(),
    schemaVersion: 2,
    reportVersion: "final-mechanical-check-v2",
    inputIdentity: {
      ...makePassInput().inputIdentity,
      globalVisualPlanFingerprint: sha("e"),
      globalVisualProjectionFingerprint: sha("f"),
      finalAssemblyFingerprint: sha("0"),
    },
    checks: FINAL_MECHANICAL_CHECK_V2_IDS.map((checkId) => ({
      checkId,
      status: "pass",
      failureReasons: [],
    })),
  });
  assert.deepEqual(
    v2.checks.map((check) => check.checkId),
    FINAL_MECHANICAL_CHECK_V2_IDS,
  );
  assert.doesNotThrow(() => FinalMechanicalCheckV2ReportSchema.parse(v2));
  assert.throws(() => FinalMechanicalCheckReportSchema.parse(v2));
  assert.throws(() => FinalMechanicalCheckV2ReportSchema.parse(v1));
});
