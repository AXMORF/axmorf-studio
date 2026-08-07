import assert from "node:assert/strict";
import { appendFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { checkFinalSourceHealth } from "../../../../scripts/project-check/final-run";
import {
  checkNarrativeSourceHealth,
  runNarrativeAutoCheck,
} from "../../../../scripts/project-check/run";
import { createM4ProjectFixture } from "./fixtures/m4-project";

const passingSceneBranch = () => ({
  referenceModes: ["empty"] as const,
  visualStyleFingerprint: null,
  resourceCatalogFingerprint: null,
  externalSnapshotFingerprints: [],
  fidelityReceiptFingerprints: [],
  sceneCoverageFingerprint: null,
  scenePackageFingerprints: [],
  rendererRegistryFingerprint: null,
  storyVisualProjectionFingerprint: null,
  soundDesignProjectionFingerprint: null,
  compositionAssemblyChecksum: null,
  checkStatuses: {
    "visual-style": "not-applicable" as const,
    "resource-catalog": "not-applicable" as const,
    "external-references": "not-applicable" as const,
    "reference-fidelity": "not-applicable" as const,
    "scene-coverage": "not-applicable" as const,
    "scene-packages": "not-applicable" as const,
    "renderer-registry": "not-applicable" as const,
    "scene-projections": "not-applicable" as const,
    "composition-assembly": "not-applicable" as const,
  },
});

test("source health ignores deleted media evidence while explicit evidence fails", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  await appendFile(fixture.paths.captionStill, "media-drift");
  await assert.doesNotReject(() =>
    checkNarrativeSourceHealth({
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
    }),
  );
  assert.equal(
    (
      await runNarrativeAutoCheck({
        rootDir: fixture.rootDir,
        projectId: fixture.storyId,
        runM3EvidenceProcess: fixture.runProcess,
      })
    ).checks.find(({ checkId }) => checkId === "m3-evidence")?.status,
    "fail",
  );
  await rm(join(fixture.rootDir, "out"), { recursive: true, force: true });

  await assert.doesNotReject(() =>
    checkNarrativeSourceHealth({
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
    }),
  );
  await assert.doesNotReject(() =>
    checkFinalSourceHealth({
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
      loadSceneBranch: async () => passingSceneBranch(),
    }),
  );
  const evidence = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
    runM3EvidenceProcess: fixture.runProcess,
  });
  assert.equal(evidence.aggregateStatus, "fail");
  assert.equal(
    evidence.checks.find(({ checkId }) => checkId === "m3-evidence")?.status,
    "fail",
  );
});

test("source health remains fail closed for render-critical narration", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  await appendFile(fixture.paths.completeWav, "drift");
  await assert.rejects(
    () =>
      checkNarrativeSourceHealth({
        rootDir: fixture.rootDir,
        projectId: fixture.storyId,
      }),
    /sealed narration/i,
  );
});

test("default host check selects source verification explicitly", async () => {
  const scripts = (
    JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;
  assert.match(scripts["check:host"] ?? "", /--all --scope source/);
  assert.doesNotMatch(scripts["check:host"] ?? "", /project:evidence|approval/);
});
