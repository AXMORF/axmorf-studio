import assert from "node:assert/strict";
import test from "node:test";

import {
  FinalAssemblyPlanSchema,
  createFinalAssemblyPlan,
} from "../../src/contracts/final-assembly";
import { finalAssemblyInput } from "../fixtures/final-assembly/input";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

test("FinalAssemblyPlan binds every ordered identity and exact runtime version", () => {
  const plan = createFinalAssemblyPlan(finalAssemblyInput());
  assert.doesNotThrow(() => FinalAssemblyPlanSchema.parse(plan));
  assert.notEqual(
    plan.finalAssemblyFingerprint,
    createFinalAssemblyPlan({
      ...finalAssemblyInput(),
      remotionVersion: "4.0.490",
    }).finalAssemblyFingerprint,
  );
  assert.notEqual(
    plan.finalAssemblyFingerprint,
    createFinalAssemblyPlan({ ...finalAssemblyInput(), durationInFrames: 121 })
      .finalAssemblyFingerprint,
  );
});

test("FinalAssemblyPlan rejects duplicates disorder null and unknown fields", () => {
  for (const mutation of [
    { ...finalAssemblyInput(), scenePackageFingerprints: [sha("8"), sha("8")] },
    { ...finalAssemblyInput(), scenePackageFingerprints: [sha("9"), sha("8")] },
    { ...finalAssemblyInput(), narrativeReportFingerprint: null },
    { ...finalAssemblyInput(), dynamicModulePath: "./Composition" },
  ]) {
    assert.throws(() => createFinalAssemblyPlan(mutation));
  }
});
