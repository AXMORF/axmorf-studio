import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  FINAL_MECHANICAL_CHECK_IDS,
  ResourceCatalogSchema,
} from "../../src/contracts";
import {
  deduplicateCatalogCandidates,
  derivePreFinalSceneCatalog,
  resolveFinalPreviewEvidencePath,
  runFinalMechanicalCheck,
  selectCurrentCatalogByFingerprint,
  selectCurrentSceneResourceCatalog,
  type FinalM8BranchResult,
  type FinalSceneBranchResult,
} from "../../scripts/project-check/final-run";
import { createM4ProjectFixture } from "../fixtures/m4-project";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

test("FinalAssembly Catalog derives the sealed M9 Scene Catalog without final-owned assets", async () => {
  const assemblyCatalog = ResourceCatalogSchema.parse(
    JSON.parse(
      await readFile(
        join(
          process.cwd(),
          "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
        ),
        "utf8",
      ),
    ),
  );
  const sceneCatalog = derivePreFinalSceneCatalog(assemblyCatalog);
  assert.equal(
    sceneCatalog.catalogFingerprint,
    "sha256:2b234ed551f9dbc93633fbe5f2654369f8c03482ec739127dc8cc002feddfdd1",
  );
  assert.ok(
    sceneCatalog.entries.some(
      ({descriptor}) =>
        descriptor.id ===
        "asset.product-comic-vertical.scene.problem-hook.identity-break-pulse",
    ),
  );
  assert.ok(
    sceneCatalog.entries.some(
      ({descriptor}) =>
        descriptor.id ===
        "reference.product-comic-vertical.draw-svg-trace-demo",
    ),
  );
  assert.ok(
    sceneCatalog.entries.every(
      ({descriptor}) =>
        descriptor.kind !== "asset" ||
        !["global-bgm", "cross-scene-ambience", "global-visual"].includes(
          descriptor.mediaRole,
        ),
    ),
  );
  assert.deepEqual(
    deduplicateCatalogCandidates([sceneCatalog, {...sceneCatalog}]),
    [sceneCatalog],
  );
});

test("Scene branch selects the unique Catalog bound by all ready Scene tasks", () => {
  const base = {catalogFingerprint: sha("1"), source: "base"};
  const project = {catalogFingerprint: sha("2"), source: "project"};
  assert.equal(
    selectCurrentSceneResourceCatalog({
      catalogs: [base, project],
      taskCatalogFingerprints: [sha("2"), sha("2")],
    }),
    project,
  );
  assert.equal(
    selectCurrentSceneResourceCatalog({
      catalogs: [base, project],
      taskCatalogFingerprints: [sha("1")],
    }),
    base,
  );
  assert.throws(() =>
    selectCurrentSceneResourceCatalog({
      catalogs: [base, project],
      taskCatalogFingerprints: [sha("1"), sha("2")],
    }),
  );
  assert.throws(() =>
    selectCurrentSceneResourceCatalog({
      catalogs: [base],
      taskCatalogFingerprints: [sha("2")],
    }),
  );
  assert.throws(() =>
    selectCurrentSceneResourceCatalog({
      catalogs: [project, {...project}],
      taskCatalogFingerprints: [sha("2")],
    }),
  );
  assert.equal(
    selectCurrentCatalogByFingerprint({
      catalogs: [base, project],
      fingerprint: sha("1"),
      authority: "VisualStyleSpec",
    }),
    base,
  );
  assert.throws(() =>
    selectCurrentCatalogByFingerprint({
      catalogs: [project, {...project}],
      fingerprint: sha("2"),
      authority: "VisualStyleSpec",
    }),
  );
});

test("final preview evidence path is canonical with GPS-only legacy compatibility", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-final-evidence-path-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const generated = join(rootDir, "src/projects/gps-relativity/generated");
  await mkdir(generated, { recursive: true });
  await writeFile(
    join(generated, "m8-final-preview-evidence.generated.json"),
    "{}\n",
  );
  assert.equal(
    await resolveFinalPreviewEvidencePath(rootDir, "gps-relativity"),
    join(generated, "m8-final-preview-evidence.generated.json"),
  );
  const canonical = join(generated, "final-preview-evidence.generated.json");
  await writeFile(canonical, "{}\n");
  await assert.rejects(() =>
    resolveFinalPreviewEvidencePath(rootDir, "gps-relativity"),
  );

  const productGenerated = join(
    rootDir,
    "src/projects/product-comic-vertical/generated",
  );
  await mkdir(productGenerated, { recursive: true });
  await writeFile(
    join(productGenerated, "m8-final-preview-evidence.generated.json"),
    "{}\n",
  );
  await assert.rejects(() =>
    resolveFinalPreviewEvidencePath(rootDir, "product-comic-vertical"),
  );
  await writeFile(
    join(productGenerated, "final-preview-evidence.generated.json"),
    "{}\n",
  );
  await rm(join(productGenerated, "m8-final-preview-evidence.generated.json"));
  assert.equal(
    await resolveFinalPreviewEvidencePath(rootDir, "product-comic-vertical"),
    join(productGenerated, "final-preview-evidence.generated.json"),
  );
});

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

test("incomplete isolated GPS final fails closed without rewriting current reports", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const narrativeBefore = await readFile(fixture.paths.autoCheck);
  const finalReportPath = join(
    fixture.rootDir,
    "src/projects/gps-relativity/generated/final-mechanical-check.generated.json",
  );
  const finalReportBefore = await readFile(finalReportPath);
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
  assert.deepEqual(await readFile(finalReportPath), finalReportBefore);
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

test("declared M8 project uses v2 and missing approval cannot fall back to v1", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const projectDir = join(fixture.rootDir, "src/projects", fixture.storyId);
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "final-assembly-plan.json"), "{}\n", "utf8");
  const m8: FinalM8BranchResult = {
    globalSoundPlanFingerprint: sha("c"),
    finalSoundProjectionFingerprint: sha("d"),
    globalVisualPlanFingerprint: sha("e"),
    globalVisualProjectionFingerprint: sha("f"),
    finalAssemblyFingerprint: sha("0"),
    finalPreviewEvidenceFingerprint: sha("1"),
    finalPreviewApprovalFingerprint: null,
    checkStatuses: {
      "global-sound": "pass",
      "global-visual": "pass",
      "final-assembly": "pass",
      "final-preview-evidence": "pass",
      "final-preview-approval": "fail",
    },
    checkErrors: {
      "global-sound": null,
      "global-visual": null,
      "final-assembly": null,
      "final-preview-evidence": null,
      "final-preview-approval": new Error("FinalPreviewApproval is missing."),
    },
  };
  const report = await runFinalMechanicalCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
    runM3EvidenceProcess: fixture.runProcess,
    loadSceneBranch: async () => passingSceneBranch(),
    loadM8Branch: async () => m8,
  });
  assert.equal(report.reportVersion, "final-mechanical-check-v2");
  assert.equal(report.aggregateStatus, "fail");
  assert.equal(
    report.checks.find((check) => check.checkId === "final-preview-approval")
      ?.status,
    "fail",
  );
});

test("M8 failures are reduced to fixed safe codes without leaking raw errors", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const projectDir = join(fixture.rootDir, "src/projects", fixture.storyId);
  await writeFile(join(projectDir, "final-assembly-plan.json"), "{}\n", "utf8");
  const report = await runFinalMechanicalCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
    runM3EvidenceProcess: fixture.runProcess,
    loadSceneBranch: async () => passingSceneBranch(),
    loadM8Branch: async () => {
      throw new Error("/data/private token malformed stack");
    },
  });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /\/data\/private|token|stack/);
  assert.match(serialized, /Required final mechanical artifact is malformed/);
});
