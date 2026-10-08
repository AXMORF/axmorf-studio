import assert from "node:assert/strict";
import test from "node:test";
import { resolveContinuousProofState } from "../../proofs/continuous-world/motion-state";

test("the shared world keeps one subject and continuous fractional camera progress at its semantic Beat boundary", () => {
  const before = resolveContinuousProofState(79.999, 960, 540);
  const boundary = resolveContinuousProofState(80, 960, 540);
  const after = resolveContinuousProofState(80.001, 960, 540);
  assert.equal(boundary.frame, 60);
  for (const value of [before, after]) {
    assert.ok(
      Math.hypot(
        value.subject[0] - boundary.subject[0],
        value.subject[1] - boundary.subject[1],
      ) < 0.02,
    );
    assert.ok(Math.abs(value.camera.zoom - boundary.camera.zoom) < 0.0001);
  }
  assert.notDeepEqual(
    boundary.subject,
    resolveContinuousProofState(0, 960, 540).subject,
  );
  const target = resolveContinuousProofState(115.5, 960, 540);
  resolveContinuousProofState(5, 960, 540);
  resolveContinuousProofState(149, 960, 540);
  assert.deepEqual(resolveContinuousProofState(115.5, 960, 540), target);
});
