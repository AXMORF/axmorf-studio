import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { FINAL_MECHANICAL_CHECK_IDS } from "../../src/contracts";
import {
  checkFinalSourceHealth,
  type FinalSceneBranchResult,
} from "../../scripts/project-check/final-run";
import { createProjectCheckTestLocations } from "./locations";

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
  const locations = await createProjectCheckTestLocations(context);
  let includeMediaEvidence: boolean | undefined;
  await checkFinalSourceHealth({
    locations,
    projectId: "alpha-story",
    loadSceneBranch: async (input) => {
      includeMediaEvidence = input.includeMediaEvidence;
      return passingSceneBranch();
    },
  });
  assert.equal(includeMediaEvidence, false);
});

test("final Project verification rebuilds current ScenePackages with local-viewport visual runtime v3", async () => {
  const source = await readFile(
    join(process.cwd(), "scripts/project-check/final-run.ts"),
    "utf8",
  );
  assert.match(source, /visualRuntimeVersion: SCENE_VISUAL_RUNTIME_VERSION/u);
  assert.doesNotMatch(
    source,
    /visualRuntimeVersion: STORY_VISUAL_RUNTIME_VERSION,/u,
  );
});

test("final Project verification binds Project BGM into the unified sound projection", async () => {
  const source = await readFile(
    join(process.cwd(), "scripts/project-check/final-run.ts"),
    "utf8",
  );
  assert.match(source, /ProjectSoundPlanSchema\.parse/u);
  assert.match(source, /projectSoundPlan: projectSound/u);
  assert.match(source, /projectSoundResources: catalog\.entries/u);
  assert.match(source, /descriptor\.mediaRole === "background-music"/u);
});
