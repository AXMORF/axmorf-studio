import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { FINAL_MECHANICAL_CHECK_IDS } from "../../src/contracts";
import {
  runFinalMechanicalCheck,
  type FinalSceneBranchResult,
} from "../../scripts/project-check/final-run";
import { createM4ProjectFixture } from "../fixtures/m4-project";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const passingSceneBranch = (): FinalSceneBranchResult => ({
  referenceModes: ["exact-demo-localized"],
  visualStyleFingerprint: sha("2"),
  resourceCatalogFingerprint: sha("3"),
  externalSnapshotFingerprints: [sha("4")],
  fidelityReceiptFingerprints: [sha("5")],
  sceneCoverageFingerprint: sha("6"),
  scenePackageFingerprints: [sha("7")],
  rendererRegistryFingerprint: sha("8"),
  storyVisualProjectionFingerprint: sha("9"),
  soundDesignProjectionFingerprint: sha("a"),
  compositionAssemblyChecksum: sha("b"),
  checkStatuses: {
    "visual-style": "pass",
    "resource-catalog": "pass",
    "external-references": "pass",
    "reference-fidelity": "pass",
    "scene-coverage": "pass",
    "scene-packages": "pass",
    "renderer-registry": "pass",
    "scene-projections": "pass",
    "composition-assembly": "pass",
  },
});

test("synthetic current Scene branch aggregates with narrative into final pass", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const report = await runFinalMechanicalCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
    runM3EvidenceProcess: fixture.runProcess,
    loadSceneBranch: async () => passingSceneBranch(),
  });
  assert.equal(report.aggregateStatus, "pass");
  assert.deepEqual(
    report.checks.map((check) => check.checkId),
    FINAL_MECHANICAL_CHECK_IDS,
  );
});

test("GPS final fails closed on missing M7 coverage without writes or narrative drift", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const narrativeBefore = await readFile(fixture.paths.autoCheck);
  const report = await runFinalMechanicalCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
    runM3EvidenceProcess: fixture.runProcess,
  });
  assert.equal(report.aggregateStatus, "fail");
  assert.equal(
    report.checks.find((check) => check.checkId === "scene-coverage")?.status,
    "fail",
  );
  assert.deepEqual(await readFile(fixture.paths.autoCheck), narrativeBefore);
  await assert.rejects(() =>
    access(
      join(
        fixture.rootDir,
        "src/projects/gps-relativity/generated/final-mechanical-check.generated.json",
      ),
    ),
  );
});

test("final runner source has no writer generation provider network Git or repair path", async () => {
  const source = await readFile(
    join(process.cwd(), "scripts/project-check/final-run.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /writeFinal|reference:sync|localizeShot|registry:generate|scene:package|fetch\(|https?:|git\s|provider|RSP_VOXCPM/,
  );
});
