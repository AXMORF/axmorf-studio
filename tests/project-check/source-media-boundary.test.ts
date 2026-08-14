import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FINAL_MECHANICAL_CHECK_IDS } from "../../src/contracts";
import {
  checkFinalSourceHealth,
  type FinalSceneBranchResult,
} from "../../scripts/project-check/final-run";

const passingSceneBranch = (): FinalSceneBranchResult => ({
  referenceModes: ["exact-demo-localized"],
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
  checkStatuses: Object.fromEntries(
    FINAL_MECHANICAL_CHECK_IDS.filter((id) => id !== "narrative").map((id) => [
      id,
      "pass",
    ]),
  ) as FinalSceneBranchResult["checkStatuses"],
});

test("final source health disables Scene review media byte verification", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-source-media-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  let includeMediaEvidence: boolean | undefined;
  await checkFinalSourceHealth({
    rootDir,
    projectId: "alpha-story",
    loadSceneBranch: async (input) => {
      includeMediaEvidence = input.includeMediaEvidence;
      return passingSceneBranch();
    },
  });
  assert.equal(includeMediaEvidence, false);
});

test("final Project verification rebuilds current ScenePackages with visual runtime v2", async () => {
  const source = await readFile(
    join(process.cwd(), "scripts/project-check/final-run.ts"),
    "utf8",
  );
  assert.match(source, /visualRuntimeVersion: STORY_VISUAL_RUNTIME_VERSION_V2/u);
  assert.doesNotMatch(
    source,
    /visualRuntimeVersion: STORY_VISUAL_RUNTIME_VERSION,/u,
  );
});
